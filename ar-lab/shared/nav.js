/* AR Lab — turn-by-turn controller for a route with more than one stop (A -> B -> C).

   The person only ever sees the arrow for the CURRENT leg. When they get to the end of that leg, its arrow is removed
   and the next leg's arrow appears. After the last stop everything is cleared.

   Each engine page supplies two hooks, because each engine adds things to its own scene differently:
     show(leg, index, total, others)   build and add this leg's chevrons + beacon, plus a fixed marker for each other stop
                               (others = [{ lat, lng, label, state: 'reached' | 'locked' }]; pass it to ARLab.path.build as { others })
     clear()                   remove and dispose whatever show() added

   Usage:  const nav = ARLab.nav.create({ route, hud, show, clear });
           nav.begin();            // once the engine is ready to place things
           nav.update(fix);        // on every GPS reading { lat, lng, acc } (use the filtered fix)
           nav.remaining()         // metres left on the current leg, from the last update (for the distance label)

   ARRIVAL means standing ON the stop. There is no generous radius: the arrival distance is a small fixed 3 m (change it
   with ?arrive=), and it never grows when the GPS gets worse. A stop counts as reached only when ALL of these hold:
     1. the GPS can actually tell: its uncertainty is 10 m or better. Otherwise nothing is auto-detected and the person is
        asked to tap "Next point" (it does NOT get easier to arrive as the GPS gets worse);
     2. the person was clearly away from the stop earlier in this leg (more than the arrival distance + 6 m), so merely
        starting next to a stop, or a GPS wander across it, can not complete it;
     3. they are within the arrival distance of the stop;
     4. and they stay there for 2.5 seconds.
   Honest limit: phones are only accurate to about 3-5 m outdoors, so "on the stop" means "GPS says within 3 m", which can
   take a few seconds of standing still; it can not be exact. */
(function () {
  'use strict';
  // above this uncertainty, never auto-detect arrival (it could not tell us we are ON the stop). Indoors in a corridor the
  // phone often reports 15-40 m, so ?weak=30 lets a test there keep auto-advancing (arrival is still only ever within ?arrive=).
  const WEAK_GPS_M = (() => { try { const v = parseFloat(new URLSearchParams(location.search).get('weak')); if (v >= 5 && v <= 100) return v; } catch (e) { /* default */ } return 10; })();
  const ARM_EXTRA_M = 6;        // how far beyond the arrival distance you must have been to "arm" the stop

  function create(o) {
    const legs = o.route.legs && o.route.legs.length ? o.route.legs : [{ a: o.route.a, b: o.route.b, label: o.route.label, points: o.route.points || [o.route.a, o.route.b], length: o.route.length }];
    legs.forEach((l) => { l.tracker = ARLab.geo.tracker(l.points); l.armed = false; l.insideSince = null; l.weakShown = false; });
    const total = legs.length;
    let idx = -1, finished = false, lastAdvance = -Infinity, lastFix = null;
    const guardMs = o.guardMs === undefined ? 3000 : o.guardMs;       // one stop at a time: ignore readings for a moment after switching
    const confirmMs = o.confirmMs === undefined ? 2500 : o.confirmMs; // how long they must stay inside the arrival distance

    const arrive = () => ARLab.cfg.arrive;
    const say = (t) => { if (o.hud && o.hud.setArrival) o.hud.setArrival(t); };
    function leg() { return idx >= 0 && idx < total ? legs[idx] : null; }

    function present() {
      const l = legs[idx];
      l.armed = false; l.insideSince = null; l.weakShown = false;
      // every other stop stays pinned in the scene: passed ones as 'reached', later ones as 'locked' (no path to them yet)
      const others = legs.map((x, j) => ({ lat: x.b.lat, lng: x.b.lng, label: x.label, state: j < idx ? 'reached' : 'locked', j })).filter((x) => x.j !== idx);
      o.show(l, idx, total, others);
      if (lastFix) {
        l.tracker.update(lastFix);                                     // a new leg starts with the position we already have
        const d = ARLab.geo.distance(lastFix, l.b);
        if (d > arrive() + ARM_EXTRA_M) l.armed = true;
        else if (o.hud) o.hud.setStatus('You are already within ' + Math.round(d) + ' m of ' + l.label + '. Walk away and come back, or tap Next point.', 'ok');
      }
      if (o.hud) o.hud.setTarget(l, idx, total);
    }

    function begin() { if (idx !== -1) return; idx = 0; present(); }

    function advance(manual) {
      if (finished || idx < 0) return;
      const done = legs[idx];
      lastAdvance = performance.now();
      o.clear();
      if (navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) { /* not allowed */ } }
      if (idx + 1 >= total) {
        finished = true; idx = total;
        if (o.hud) { o.hud.setTarget(null, total, total); o.hud.setStatus('You have arrived at ' + done.label + '.', 'ok'); }
        say('done');
        return;
      }
      idx++;
      present();
      if (o.hud) o.hud.setStatus((manual ? 'Skipped to ' : 'Reached ' + done.label + '. Now heading to ') + legs[idx].label + '.', 'ok');
    }

    function update(fix) {
      if (!fix) return;
      lastFix = fix;                                                // remembered even before begin(), so a leg can start informed
      const l = leg(); if (!l) return;
      l.tracker.update(fix);                                        // progress along the leg (for the distance label)
      const d = ARLab.geo.distance(fix, l.b), acc = fix.acc || 0, a = arrive();
      if (d > a + ARM_EXTRA_M) l.armed = true;                      // been clearly away from this stop
      if (performance.now() - lastAdvance < guardMs) return;

      if (acc > WEAK_GPS_M) {                                       // cannot tell where we are well enough to say we arrived
        l.insideSince = null; say('GPS weak ±' + Math.round(acc) + ' m');
        if (!l.weakShown && o.hud) { l.weakShown = true; o.hud.setStatus('GPS is weak (±' + Math.round(acc) + ' m), so arrival can not be confirmed. Tap Next point when you get to ' + l.label + '.', 'err'); }
        return;
      }
      const radius = a;                                             // fixed: you must be on the stop, GPS error never widens it
      if (d > radius * 1.5) { l.insideSince = null; say(Math.round(radius) + ' m, ' + Math.round(d) + ' m away'); return; }
      if (d > radius) { say(Math.round(radius) + ' m, ' + Math.round(d) + ' m away'); return; }
      if (!l.armed) { say('walk away first'); return; }              // started here, or GPS wandered over the stop
      const now = performance.now();
      if (l.insideSince === null) l.insideSince = now;
      say('inside ' + Math.round(radius) + ' m, hold on...');
      if (now - l.insideSince >= confirmMs) advance(false);
    }

    function remaining(fix) {
      const l = leg(); if (!l) return 0;
      if (l.tracker.last) return l.tracker.last.remaining;
      return fix ? ARLab.geo.remaining(l.points, fix).remaining : l.length || 0;
    }

    return {
      begin, update, remaining, legs, total,
      next: () => advance(true),
      get index() { return idx; }, get leg() { return leg(); }, get finished() { return finished; }
    };
  }

  window.ARLab = Object.assign(window.ARLab || {}, { nav: { create } });
})();
