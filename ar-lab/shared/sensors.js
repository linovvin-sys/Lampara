/* AR Lab — GPS, compass and start-gate helpers shared by the engine pages that do not bring their own
   (8th Wall, WebXR and the bare three.js baseline). AR.js and LocAR.js read the sensors themselves,
   which is part of what is being compared. */
(function () {
  'use strict';
  const geo = () => ARLab.geo;

  // ----- iOS asks for motion permission and it must come from a tap.
  async function requestMotion() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        return await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { return 'denied'; }
    return 'granted';
  }

  // ----- GPS: raw high-accuracy watch. cb({ lat, lng, acc, ts }).
  function watchGps(cb, onError) {
    if (!navigator.geolocation) { onError && onError('No Geolocation API in this browser'); return () => {}; }
    const id = navigator.geolocation.watchPosition(
      (p) => cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp }),
      (e) => onError && onError(['', 'Location permission denied', 'Position unavailable', 'GPS timed out'][e.code] || e.message, e.code),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }

  // One good fix, for capturing a spot ("my location") or starting a route.
  //  - Readings the phone took BEFORE we asked (a cached position, timestamp older than the request) are ignored; if nothing
  //    else ever arrives the best old one is returned with stale:true so the caller can warn.
  //  - A lone reading is never trusted: it needs a second fresh one, or 2.5 s to pass, before it is accepted early.
  //  - It stops early once the best fresh reading is within `goodAcc` m; at `ms` it returns the best it has.
  //  - A temporary error ("position unavailable", a timeout) does not end the wait; only a denied permission does.
  // onProgress(best, freshCount) is called on every fresh reading. Resolves with { lat, lng, acc, ts, readings }.
  function bestFix(ms, goodAcc, onProgress) {
    const asked = Date.now();
    return new Promise((resolve, reject) => {
      let best = null, staleBest = null, fresh = 0, firstAt = 0, done = false, lastErr = '';
      const finish = (v, err) => { if (done) return; done = true; stop(); clearTimeout(t); err ? reject(err) : resolve(v); };
      const stop = watchGps((f) => {
        if (f.ts && f.ts < asked - 1500) { if (!staleBest || f.acc < staleBest.acc) staleBest = f; return; }   // stale: taken before we asked (kept only as a last resort)
        fresh++; if (!firstAt) firstAt = Date.now();
        if (!best || f.acc < best.acc) best = f;
        onProgress && onProgress(best, fresh);
        const settled = fresh >= 2 || Date.now() - firstAt >= 2500;
        if (best.acc <= (goodAcc || 8) && settled) finish(Object.assign({}, best, { readings: fresh }));
        else if (best.acc <= (goodAcc || 8)) setTimeout(() => { if (!done && best && best.acc <= (goodAcc || 8)) finish(Object.assign({}, best, { readings: fresh })); }, 2500 - (Date.now() - firstAt));
      }, (m, code) => { lastErr = m; if (code === 1) finish(null, new Error(m)); });
      const t = setTimeout(() => best ? finish(Object.assign({}, best, { readings: fresh }))
        : staleBest ? finish(Object.assign({}, staleBest, { readings: 0, stale: true }))                  // only an old reading ever arrived: better than nothing, but say so
        : finish(null, new Error(lastErr || 'No GPS fix. Go outside or enable precise location.')), ms || 12000);
    });
  }

  // Position filter (a small Kalman filter): every fix is weighed by how accurate it claims to be, against how sure we
  // already are. A +/-4 m fix pulls the estimate hard, a +/-40 m fix barely moves it. Between fixes the uncertainty grows
  // with time (a walker can move, so old information gets less certain), which lets the estimate follow real movement.
  // Returns { lat, lng, acc } where acc is the honest 1-sigma uncertainty of the estimate in metres.
  function gpsFilter(opts) {
    const WALK = (opts && opts.speed) || 2.5;          // m/s the position may wander by between fixes (walking pace plus margin)
    const FLOOR = 3;                                   // phones claim better than this far too often: never trust it
    // It also learns the walking velocity (an alpha-beta tracker) and predicts ahead by it, otherwise a plain filter trails
    // a few metres behind someone who is walking and the path would appear to be drawn too close to them.
    let est = null;                                    // { lat, lng, v (variance, m^2), t (ms), ve, vn (m/s east, north) }
    const out = () => ({ lat: est.lat, lng: est.lng, acc: Math.sqrt(est.v) });
    const M = 111320;
    return function (f) {
      const acc = Math.max(f.acc || 25, FLOOR), t = f.ts || Date.now();
      if (!est) { est = { lat: f.lat, lng: f.lng, v: acc * acc, t, ve: 0, vn: 0 }; return out(); }
      const dt = Math.max(0, Math.min(10, (t - est.t) / 1000));
      est.t = t;
      est.lat += est.vn * dt / M; est.lng += est.ve * dt / (M * Math.cos(est.lat * Math.PI / 180));        // predict
      est.v += dt * WALK * WALK;
      const k = est.v / (est.v + acc * acc);
      const r = geo().enu(est, f);                                                                          // residual, metres
      est.lat += r.n * k / M; est.lng += r.e * k / (M * Math.cos(est.lat * Math.PI / 180));
      if (dt > 0.3) {                                                                                       // learn the velocity
        const beta = k * k / (2 - k);
        est.ve += beta * r.e / dt; est.vn += beta * r.n / dt;
        const sp = Math.hypot(est.ve, est.vn); if (sp > 3) { est.ve *= 3 / sp; est.vn *= 3 / sp; }
        if (sp < 0.4) { est.ve *= 0.5; est.vn *= 0.5; }                                                     // standing still: let it settle
      }
      est.v *= (1 - k);
      return out();
    };
  }

  // ----- Compass. Gives the direction the REAR CAMERA points, tilt-compensated, in degrees clockwise from north.
  //   Android Chrome: 'deviceorientationabsolute' (alpha is referenced to magnetic north).
  //   iOS Safari: alpha is relative, so a yaw offset is learned from webkitCompassHeading while the phone is upright.
  // c.heading is smoothed, c.offset is the yaw correction to apply to a camera built from alpha/beta/gamma.
  function compass() {
    const c = {
      heading: null, raw: null, source: 'none', offset: 0, manual: 0, alpha: null, beta: null, gamma: null, ready: false,
      listeners: []
    };
    const d2r = Math.PI / 180;
    function rearHeading(a, b, g) {                      // heading of the device's rear (-Z) vector
      const x = b * d2r, y = g * d2r, z = a * d2r;
      const cY = Math.cos(y), cZ = Math.cos(z), sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
      const vx = -cZ * sY - sZ * sX * cY, vy = -sZ * sY + cZ * sX * cY;
      return geo().norm360(Math.atan2(vx, vy) / d2r);
    }
    function onOrient(e) {
      if (e.alpha === null || e.alpha === undefined) return;
      const absolute = e.type === 'deviceorientationabsolute' || e.absolute === true;
      if (c.source === 'abs' && e.type !== 'deviceorientationabsolute') return;   // prefer the absolute stream once seen
      c.alpha = e.alpha; c.beta = e.beta; c.gamma = e.gamma;
      const rel = rearHeading(e.alpha, e.beta, e.gamma);
      if (e.type === 'deviceorientationabsolute' || (absolute && c.source !== 'webkit')) {
        c.source = 'abs'; c.offset = 0; c.raw = rel;
      } else if (typeof e.webkitCompassHeading === 'number') {
        c.source = 'webkit';
        if (e.beta > 45 && e.beta < 135) {                // upright: webkitCompassHeading ~ rear camera heading
          const target = geo().norm180(e.webkitCompassHeading - rel);
          c.offset = c.ready ? c.offset + geo().norm180(target - c.offset) * 0.1 : target;
        }
        c.raw = geo().norm360(rel + c.offset);
      } else {
        c.source = c.source === 'none' ? 'rel' : c.source; c.raw = rel;   // relative only: heading is arbitrary
      }
      const h = geo().norm360(c.raw + c.manual);
      c.heading = c.ready ? geo().lerpAngle(c.heading, h, 0.2) : h;
      c.ready = true;
      c.listeners.forEach((fn) => fn(c));
    }
    c.start = function () {
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
    };
    c.stop = function () {
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
    };
    c.on = (fn) => c.listeners.push(fn);
    c.nudge = (deg) => { c.manual += deg; };             // tester correction for a miscalibrated compass
    c.label = () => c.source + (c.manual ? ' ' + (c.manual > 0 ? '+' : '') + c.manual + '°' : '');
    return c;
  }

  // ----- Start gate: nothing touches the camera/GPS/motion until the tester taps.
  function gate(opts) {
    const route = ARLab.route.get();
    const el = document.createElement('div');
    el.className = 'gate';
    const secure = window.isSecureContext;
    el.innerHTML = '<div><h1></h1><p class="lead"></p>' +
      (route ? '' : '<p class="warn">No route yet. Pick point B on the <a href="../index.html">AR Lab start page</a> first.</p>') +
      (secure ? '' : '<p class="warn">This page is not HTTPS, so the camera, GPS and compass will be blocked. Open it through your HTTPS tunnel (for example ngrok).</p>') +
      (opts.warn ? '<p class="warn"></p>' : '') +
      '<button class="big" type="button">Start</button><p class="err" hidden></p>' +
      '<p style="margin-top:14px"><a href="../index.html">&larr; Back to AR Lab</a></p></div>';
    el.querySelector('h1').textContent = opts.title;
    el.querySelector('.lead').textContent = opts.lead || '';
    if (opts.warn) el.querySelectorAll('.warn')[el.querySelectorAll('.warn').length - 1].textContent = opts.warn;
    document.body.appendChild(el);
    const btn = el.querySelector('.big'), err = el.querySelector('.err');
    if (!route) btn.disabled = true;
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Starting...'; err.hidden = true;
      try { await opts.onStart(); el.remove(); }
      catch (e) { err.hidden = false; err.textContent = e && e.message ? e.message : String(e); btn.disabled = false; btn.textContent = 'Try again'; }
    });
    return el;
  }

  // ----- Start point = where the person actually is when the engine opens.
  // The saved A can be stale (they walked on), imprecise (captured indoors), or typed on a desktop and sent as a phone link.
  // So, unless live start is switched off, the route is re-planned from a fresh GPS fix. B and C are unchanged.
  async function rebase(route, fix) {
    // route.b of a resolved route is the first leg's end (the walkway node or the exact captured spot), which is what the planner needs
    const base = { a: { lat: fix.lat, lng: fix.lng }, b: { lat: route.b.lat, lng: route.b.lng }, label: route.label, mode: route.mode, bNode: route.bNode };
    if (route.c) { base.c = route.c; base.cLabel = route.cLabel; base.cNode = route.cNode; }
    return Object.assign(await ARLab.campus.resolve(base), { live: route.live, liveFix: { lat: fix.lat, lng: fix.lng, acc: fix.acc } });
  }
  async function startFromHere(route, hud) {
    if (route.live === false) return route;
    if (hud) hud.setStatus('Finding where you are...');
    try {
      const f = await bestFix(12000, 15, (best) => { if (hud) hud.setStatus('Finding where you are... ±' + Math.round(best.acc) + ' m'); });
      const r = await rebase(route, f);
      if (hud) { hud.setStatus(''); hud.setRoute(r); }
      return r;
    } catch (e) {
      if (hud) hud.error('Could not read your GPS position (' + e.message + '). Using the saved start point.');
      return route;
    }
  }

  window.ARLab = Object.assign(window.ARLab || {}, { sensors: { requestMotion, watchGps, bestFix, gpsFilter, compass, rebase, startFromHere }, gate });
})();
