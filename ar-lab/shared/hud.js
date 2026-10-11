/* AR Lab — on-screen readout + run recorder shared by every engine page.
   Shows the numbers you need to judge an engine (GPS accuracy, heading source, distance to B, FPS),
   collects them while you walk, and saves a rated run to localStorage for the launcher's results table. */
(function () {
  'use strict';

  function create(cfg) {
    let route = cfg.route || ARLab.route.get();
    let target = (route && route.legs && route.legs[0]) || route;     // the leg being navigated right now
    let lastGps = null;
    let legsDone = 0, legsTotal = (route && route.legs && route.legs.length) || 1;
    const t0 = performance.now();
    const m = { gpsN: 0, accSum: 0, accMax: 0, firstFixMs: null, frames: 0, fpsSum: 0, fpsN: 0, errors: [], headingSrc: '-', minDistToB: Infinity, startDistToB: null };
    let lastFrame = performance.now(), fpsAcc = 0, fpsCount = 0;

    const root = document.createElement('div');
    root.id = 'arlab-hud';
    root.innerHTML =
      '<div class="hud-top">' +
        '<a class="hud-back" href="../index.html" aria-label="Back to AR Lab">&larr;</a>' +
        '<div class="hud-title"><b></b><span></span></div>' +
        '<button type="button" class="hud-toggle" aria-label="Show or hide details">i</button>' +
      '</div>' +
      '<div class="hud-card" hidden>' +
        '<div class="hud-grid">' +
          '<div><i data-k="toLbl">To B</i><b data-k="dist">-</b></div><div><i>Bearing</i><b data-k="brg">-</b></div>' +
          '<div><i>GPS</i><b data-k="gps">-</b></div><div><i>Heading</i><b data-k="head">-</b></div>' +
          '<div><i>FPS</i><b data-k="fps">-</b></div><div><i>Samples</i><b data-k="n">0</b></div>' +
          '<div style="grid-column:1/-1"><i>Stop reached when</i><b data-k="arr" style="font-size:12px">-</b></div>' +
        '</div>' +
        '<div class="hud-actions"></div>' +
      '</div>' +
      '<div class="hud-status" data-k="status" hidden></div>' +
      '<div class="hud-bottom">' +
        '<div class="hud-dist"><b data-k="distBig">-</b><span data-k="toSpan">to B</span></div>' +
        '<button type="button" class="hud-save">Finish &amp; rate</button>' +
      '</div>' +
      '<div class="hud-rate" hidden>' +
        '<div class="hud-rate-box"><h3>How did it behave?</h3>' +
          '<div class="hud-rate-opts">' +
            '<button data-r="5">Locked on the path</button><button data-r="3">Drifted but usable</button>' +
            '<button data-r="1">Wrong / unusable</button></div>' +
          '<textarea placeholder="Notes: where you were, what drifted, phone model..." rows="3"></textarea>' +
          '<div class="hud-rate-row"><button class="hud-cancel" type="button">Keep testing</button></div>' +
        '</div></div>';
    (cfg.parent || document.body).appendChild(root);      // WebXR passes its dom-overlay root here
    const $ =(k) => root.querySelector('[data-k="' + k + '"]');
    root.querySelector('.hud-title b').textContent = cfg.engine;
    root.querySelector('.hud-title span').textContent = cfg.tagline || '';

    const card = root.querySelector('.hud-card');
    root.querySelector('.hud-toggle').addEventListener('click', () => { card.hidden = !card.hidden; });

    const status = $('status');
    function setStatus(text, kind) {
      if (!text) { status.hidden = true; return; }
      status.hidden = false; status.textContent = text; status.className = 'hud-status ' + (kind || '');
    }
    let errTimer = null;
    // an error banner stays up for a few seconds, then clears (GPS hiccups are common and should not cover the view)
    function error(msg) {
      m.errors.push(String(msg).slice(0, 160)); setStatus(msg, 'err');
      clearTimeout(errTimer); errTimer = setTimeout(() => { if (status.textContent === String(msg)) setStatus(''); }, 8000);
    }

    function setGps(fix) {                                   // fix: { lat, lng, acc }
      m.gpsN++; m.accSum += fix.acc || 0; m.accMax = Math.max(m.accMax, fix.acc || 0);
      if (m.firstFixMs === null) m.firstFixMs = Math.round(performance.now() - t0);
      $('gps').textContent = '±' + Math.round(fix.acc || 0) + ' m';
      $('n').textContent = m.gpsN;
      lastGps = fix; showDistance();
    }
    // Distance and bearing to the current target. Called on every GPS reading AND whenever the target changes, so the
    // display never waits for the next reading.
    function showDistance() {
      if (!target || !lastGps) return;
      const fix = lastGps;
      const d = target.tracker && target.tracker.last ? target.tracker.last.remaining : ARLab.route.remaining(target, fix), b = ARLab.geo.bearing(fix, target.b);
      if (m.startDistToB === null) m.startDistToB = d;
      m.minDistToB = Math.min(m.minDistToB, d);
      $('dist').textContent = fmt(d); $('distBig').textContent = fmt(d);
      $('brg').textContent = Math.round(b) + '°';
    }
    // Which leg is being navigated: updates the labels and the distance source. leg = null means the route is finished.
    function setTarget(leg, idx, total) {
      target = leg; legsDone = Math.min(idx, total); legsTotal = total; m.minDistToB = Infinity;
      const name = leg ? leg.label : 'Arrived';
      $('toLbl').textContent = leg ? 'To ' + name : 'Route';
      $('toSpan').textContent = leg ? 'to ' + name + (total > 1 ? '  ·  stop ' + (idx + 1) + ' of ' + total : '') : 'arrived';
      if (!leg) { $('dist').textContent = '0 m'; $('distBig').textContent = '✓'; $('brg').textContent = '-'; } else showDistance();
    }
    // The route can change after the HUD exists (the start point is re-read from GPS when an engine opens).
    function setRoute(r) { route = r; legsTotal = (r.legs && r.legs.length) || 1; target = (r.legs && r.legs[0]) || r; showDistance(); }
    function setArrival(text) { $('arr').textContent = text; }        // what the navigator is waiting for (shown in the i panel)
    function setHeading(deg, src) {
      m.headingSrc = src || m.headingSrc;
      $('head').textContent = (deg === null || deg === undefined) ? '-' : Math.round(deg) + '° ' + (src || '');
    }
    function fmt(d) { return d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m'; }

    function frame() {                                       // call once per rendered frame
      const now = performance.now(); fpsAcc += 1000 / Math.max(1, now - lastFrame); fpsCount++; lastFrame = now; m.frames++;
      if (fpsCount >= 30) {
        const f = fpsAcc / fpsCount; $('fps').textContent = Math.round(f);
        m.fpsSum += f; m.fpsN++; fpsAcc = 0; fpsCount = 0;
      }
    }

    function addAction(label, fn) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', () => { try { fn(b); } catch (e) { error(e.message); } });
      root.querySelector('.hud-actions').appendChild(b); return b;
    }

    // ----- save a rated run
    const rate = root.querySelector('.hud-rate');
    root.querySelector('.hud-save').addEventListener('click', () => { rate.hidden = false; });
    root.querySelector('.hud-cancel').addEventListener('click', () => { rate.hidden = true; });
    rate.querySelectorAll('[data-r]').forEach((btn) => btn.addEventListener('click', () => {
      ARLab.results.add({
        engine: cfg.engine, at: new Date().toISOString(), rating: +btn.dataset.r,
        notes: rate.querySelector('textarea').value.trim(),
        seconds: Math.round((performance.now() - t0) / 1000),
        gpsFixes: m.gpsN, accAvg: m.gpsN ? Math.round(m.accSum / m.gpsN) : null, accMax: Math.round(m.accMax),
        firstFixMs: m.firstFixMs, fps: m.fpsN ? Math.round(m.fpsSum / m.fpsN) : null,
        headingSrc: m.headingSrc, errors: m.errors.length, errorText: m.errors.slice(0, 3).join(' | '),
        routeM: route ? Math.round(route.total || route.length || ARLab.geo.distance(route.a, route.b)) : null,
        stops: legsDone + '/' + legsTotal,
        closestToB: isFinite(m.minDistToB) ? Math.round(m.minDistToB) : null,
        device: (navigator.userAgent.match(/\(([^)]+)\)/) || [, ''])[1].slice(0, 60)
      });
      location.href = '../index.html#results';
    }));

    return { setGps, setHeading, setTarget, setRoute, setArrival, setStatus, error, frame, addAction, root, route };
  }

  window.ARLab = Object.assign(window.ARLab || {}, { hud: { create } });
})();
