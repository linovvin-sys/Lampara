/* AR Lab — automatic compass correction, with no user action at all. Ported from the main app's
   autoAlignHeading() in Frontend/Js/Public/guide-ar.js (same constants, same circular-median logic).

   The idea: a drawn walkway has a KNOWN true bearing. When you walk a few metres along one, your course
   over ground IS that walkway's bearing, so (camera heading - path bearing) is the compass error. No QR,
   no tapping, no standing still — it corrects itself while the person just walks.

   const ah = ARLab.autoHeading.create(graph);
   const off = ah.update(fix, rawHeadingDeg);   // every GPS fix; returns the total offset in degrees when it
                                                // changed, else null. Apply it absolutely: corrected = raw - off.
*/
(function () {
  'use strict';
  const MIN_WALK_M = 6;          // how far you must have moved for the course to mean anything
  const MAX_WINDOW_MS = 25000;   // older track points than this are stale
  const SAMPLES_NEEDED = 3;
  const MAX_SPREAD_DEG = 25;     // samples disagreeing this much = looking around, not walking straight
  const STEP = 0.35;             // fraction of the remaining error corrected per accepted sample
  const DEADBAND_DEG = 2;
  const MAX_SNAP_M = 25;         // further than this from a walkway: no trustworthy bearing reference
  const COURSE_TOL_DEG = 40;     // course must match the walkway (either way along it) within this

  function create(graph) {
    let track = [], samples = [], offset = 0, locked = false;
    const geo = () => ARLab.geo;

    function update(fix, rawHeadingDeg) {
      if (!fix || rawHeadingDeg === null || rawHeadingDeg === undefined) return null;
      if (!graph || !graph.edges || !graph.edges.length) return null;
      const cur = { lat: fix.lat, lng: fix.lng, t: Date.now() };
      track.push(cur);

      // the oldest point still inside the window that we have since walked far enough from
      let ref = null;
      for (let i = track.length - 2; i >= 0; i--) {
        if (cur.t - track[i].t > MAX_WINDOW_MS) break;
        if (geo().distance(track[i], cur) >= MIN_WALK_M) { ref = track[i]; break; }
      }
      if (!ref) return null;
      track = [cur];                                      // each sample comes from fresh movement

      const course = geo().bearing(ref, cur);
      const mid = { lat: (ref.lat + cur.lat) / 2, lng: (ref.lng + cur.lng) / 2 };
      const snap = ARLab.campus.snap(mid, graph);
      if (!snap || snap.dist > MAX_SNAP_M) return null;

      const fwd = geo().bearing(snap.a, snap.b), back = geo().norm360(fwd + 180);
      let pathBearing;
      if (Math.abs(geo().norm180(course - fwd)) <= COURSE_TOL_DEG) pathBearing = fwd;
      else if (Math.abs(geo().norm180(course - back)) <= COURSE_TOL_DEG) pathBearing = back;
      else return null;                                   // cut a corner / wandered off: movement is not the path

      samples = samples.concat(geo().norm180(rawHeadingDeg - pathBearing)).slice(-7);
      if (samples.length < SAMPLES_NEEDED) return null;

      // circular median: everything relative to the first sample, median, then add back
      const base = samples[0];
      const rel = samples.map((v) => geo().norm180(v - base)).sort((a, b) => a - b);
      const med = rel[Math.floor(rel.length / 2)];
      const spread = rel.map((v) => Math.abs(v - med)).sort((a, b) => a - b)[Math.floor(rel.length / 2)];
      if (spread > MAX_SPREAD_DEG) return null;

      const target = geo().norm180(base + med);
      const err = geo().norm180(target - offset);
      if (locked && Math.abs(err) < DEADBAND_DEG) return null;
      offset = geo().norm180(locked ? offset + err * STEP : target);   // ease in, so the world never snaps
      locked = true;
      return offset;
    }

    return { update, get offset() { return offset; }, get locked() { return locked; } };
  }

  window.ARLab = Object.assign(window.ARLab || {}, { autoHeading: { create } });
})();
