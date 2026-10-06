// Indoor navigation maths — no DOM/AR dependencies. Plain <script>; exposes `IndoorNav`.
//
// A route segment is a list of floor-plan points ({x, y}, 0-100 percentages of
// the plan image, y pointing DOWN). A floor's calibration (set on the admin
// Floor Calibration page) gives:
//   meters_per_unit_x / meters_per_unit_y — real meters per 1 plan unit on each axis
//   north_offset — compass bearing (deg clockwise from north) that "up" on the plan points to
//
// With those, a plan point becomes a real-world spot in AR.js's scene frame
// (x = east, y = scene z = -north), which is what the compass-aligned camera
// and the ground ribbon both use. Position along the route is tracked as a
// single number, `s` = meters walked along the path (dead reckoning by steps).

const IndoorNav = (() => {
  const toRad = (d) => d * Math.PI / 180;

  function isCalibrated(plan) {
    return !!plan && plan.north_offset !== null && plan.north_offset !== undefined &&
      plan.meters_per_unit_x > 0 && plan.meters_per_unit_y > 0;
  }

  // Plan-percent points -> local meters, dropping consecutive duplicates (a room
  // pin sitting exactly on the corridor projects onto itself, giving a zero-length
  // first leg that would confuse the turn logic).
  function buildPath(points, cal) {
    const pts = [];
    points.forEach((p) => {
      const m = { x: p.x * cal.meters_per_unit_x, y: p.y * cal.meters_per_unit_y };
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(m.x - last.x, m.y - last.y) > 0.05) pts.push(m);
    });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, cum, total: cum[cum.length - 1] || 0, cal };
  }

  // Local plan meters (x right, y down) -> AR scene coords (x east, y = scene z).
  // Rotating the plan by north_offset: plan-up sits at bearing `north_offset`.
  function toScene(p, cal) {
    const th = toRad(cal.north_offset);
    const r = p.x, u = -p.y;
    const east = r * Math.cos(th) + u * Math.sin(th);
    const north = -r * Math.sin(th) + u * Math.cos(th);
    return { x: east, y: -north };
  }

  // Point at distance s along the path, in local plan meters, plus which leg it's on.
  function pointAt(path, s) {
    // A floor the route only passes through (stairwell in, stairwell out at the
    // same spot) collapses to a single point after de-duplication.
    if (path.pts.length < 2) return { x: path.pts[0].x, y: path.pts[0].y, leg: 0 };
    const d = Math.max(0, Math.min(path.total, s));
    let i = 1;
    while (i < path.pts.length - 1 && path.cum[i] < d) i++;
    const a = path.pts[i - 1], b = path.pts[i];
    const seg = path.cum[i] - path.cum[i - 1];
    const t = seg === 0 ? 0 : (d - path.cum[i - 1]) / seg;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), leg: i - 1 };
  }

  // The stretch of path ahead of `s`, up to `maxLen` meters, in scene coords —
  // first point is where you are now, then each upcoming corner.
  function aheadScene(path, s, maxLen) {
    const out = [];
    const start = pointAt(path, s);
    out.push(toScene(start, path.cal));
    let walked = 0, prev = start;
    for (let i = start.leg + 1; i < path.pts.length; i++) {
      const seg = Math.hypot(path.pts[i].x - prev.x, path.pts[i].y - prev.y);
      if (walked + seg >= maxLen) {
        const t = seg === 0 ? 0 : (maxLen - walked) / seg;
        out.push(toScene({ x: prev.x + t * (path.pts[i].x - prev.x), y: prev.y + t * (path.pts[i].y - prev.y) }, path.cal));
        return out;
      }
      walked += seg;
      out.push(toScene(path.pts[i], path.cal));
      prev = path.pts[i];
    }
    return out;
  }

  // Next real corner ahead of `s`: { dir: 'left'|'right'|null, distance }.
  // dir null = straight to the end of this segment.
  function nextTurn(path, s, minAngle = 35) {
    const bearing = (a, b) => Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI; // plan-up = 0deg, clockwise
    for (let i = 1; i < path.pts.length - 1; i++) {
      if (path.cum[i] <= s + 0.5) continue;
      const delta = ((bearing(path.pts[i], path.pts[i + 1]) - bearing(path.pts[i - 1], path.pts[i]) + 540) % 360) - 180;
      if (Math.abs(delta) >= minAngle) return { dir: delta > 0 ? 'right' : 'left', distance: path.cum[i] - s };
    }
    return { dir: null, distance: Math.max(0, path.total - s) };
  }

  // Cumulative distance of the next corner ahead of `s` (for the "Next corner"
  // re-sync button), or the path end if there are no more corners.
  function nextCornerDistance(path, s) {
    for (let i = 1; i < path.pts.length - 1; i++) if (path.cum[i] > s + 0.5) return path.cum[i];
    return path.total;
  }

  // Counts steps from the accelerometer: the gravity-removed magnitude is
  // low-passed, and each upward crossing of a threshold (debounced) is one
  // step. Rough by nature — the app treats it as an estimate and offers manual
  // re-sync, it does not pretend to be exact.
  class StepDetector {
    constructor(onStep, { threshold = 1.3, minIntervalMs = 300 } = {}) {
      this.onStep = onStep;
      this.threshold = threshold;
      this.minIntervalMs = minIntervalMs;
      this.baseline = 9.8;
      this.filtered = 0;
      this.above = false;
      this.lastStepAt = 0;
      this.handler = (e) => this.handle(e);
    }
    start() { window.addEventListener('devicemotion', this.handler); }
    stop() { window.removeEventListener('devicemotion', this.handler); }
    handle(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null) return;
      const mag = Math.hypot(a.x, a.y, a.z);
      this.baseline = this.baseline * 0.95 + mag * 0.05;
      this.filtered = this.filtered * 0.6 + (mag - this.baseline) * 0.4;
      const now = Date.now();
      if (!this.above && this.filtered > this.threshold && now - this.lastStepAt > this.minIntervalMs) {
        this.above = true;
        this.lastStepAt = now;
        this.onStep();
      } else if (this.above && this.filtered < this.threshold * 0.4) {
        this.above = false;
      }
    }
  }

  return { isCalibrated, buildPath, toScene, pointAt, aheadScene, nextTurn, nextCornerDistance, StepDetector };
})();

if (typeof module !== 'undefined') module.exports = IndoorNav;
