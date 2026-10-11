# AR Lab

An isolated test bed for choosing the most reliable web AR engine for Lampara's outdoor guide.
It lives beside `Frontend/` and `Backend/` and **changes nothing in them**. The only contact with the main app is an
optional read-only `GET Backend/api/buildings.php`, used to list buildings as point-B choices. Delete this folder and the
main app is unaffected.

## The test

1. Stand outside. Set **A** (your current location) and **B** (pick a building, tap a walkway dot on the map, or use
   "Other ways to place B"). The map is the admin **Campus Paths** map: same satellite/street layers and the same walkway
   graph (`Backend/api/campus-graph.php`), read-only.
2. By default the route **follows the walkways** (shortest path over the admin's graph, Dijkstra, ending at the building's
   entrance node). If you stand away from a walkway the path starts with a short straight connector to it. "Straight line"
   mode is still there for comparison. Every engine draws the *same* path: a ribbon of yellow chevrons on the ground that
   bends around corners and points the way you walk, with a pulse running toward B, a ring at A and a tall beacon with a
   live distance label at B. The distance shown is what is left to walk along the route.
3. Walk it. Tap **Finish & rate**. Results are saved on the phone and tabulated on the start page.

The path is identical across engines on purpose, so what differs is tracking quality, not looks.

### Capture my location as B or C
Both the B and C panels have a **Capture my location** button: it takes a fresh GPS fix and uses the exact spot you are
standing on as that stop (handy when the place you want is not a building door or a walkway dot). With walkway routing on,
the route follows the walkways to the nearest point and ends with a short straight connector to where you stood. Tip: stand
at B, tap "Capture my location as B", walk to C, tap "Capture my location as C", then walk the route in the other direction.

### Point C (second stop)
Optionally add a **C** after B. While navigating you only ever see the arrow for the **current stop**:

1. The phone shows the ribbon and beacon to B. C is already in the world as a fixed, grey **locked** pillar at its own
   coordinates, but there is **no path to it** yet.
2. When you are **standing on B** the B arrow is removed, B stays pinned in place as a green **reached** pillar, and the
   path to C appears (it is only ever built after B is reached). There is no generous radius: arrival
   means within 3 m of the stop, for 2.5 seconds, with GPS better than +/-10 m, and only after you were clearly away from it
   first (so starting next to a stop, or GPS wandering across it, can not complete it). A weak GPS never arrives by itself and
   never gets a bigger radius: the HUD tells you to tap **Next point** instead. The HUD shows "to C, stop 2 of 2" and the
   phone vibrates.
3. At C the arrow is cleared and the HUD shows "arrived".

Every stop is a stable anchor: its marker is placed at the stop's own latitude/longitude (nav.js passes the other stops to
`ARLab.path.build` as `others`), so it never moves when legs change; only the path ribbon is swapped. Honest limit: on the
GPS engines the anchors are only as steady as the GPS and compass; the SLAM engines re-align on each leg.

The **Next point** button in the HUD skips to the next stop (needed indoors, where GPS is too weak to confirm arrival).
`?arrive=5` changes the arrival distance if 3 m is too strict for your phone's GPS. Leg 2 starts at B's walkway point, so it follows the walkways from there. On the two SLAM engines
(8th Wall, WebXR) each new leg is re-aligned from the GPS fix and compass at the moment it appears.

## The five engines

| # | Page | Engine | Geolocation method | Platforms |
|---|---|---|---|---|
| 1 | `engines/arjs.html` | AR.js 3.x + A-Frame 1.4 (`gps-new-camera`) | GPS + compass every frame | iOS, Android |
| 2 | `engines/locar.html` | LocAR.js 0.2.12 (three.js) | GPS + compass every frame | iOS, Android |
| 3 | `engines/8thwall.html` | 8th Wall engine binary 1.x (SLAM) | One GPS + compass alignment, then SLAM | iOS, Android |
| 4 | `engines/webxr.html` | WebXR immersive-ar + three.js (ARCore) | One GPS + compass alignment, then SLAM | Android Chrome only |
| 5 | `engines/custom.html` | Baseline: bare three.js, no AR library | GPS + compass every frame | iOS, Android |

Considered and left out: MindAR, Zappar (image/face tracking, no geolocation), model-viewer (object viewer),
Wikitude (commercial, native-app SDK), Google ARCore Geospatial API (native only, no web build).

### 8th Wall status
8th Wall's hosted platform closed on 28 Feb 2026. The engine is now a self-hosted binary (`@8thwall/engine-binary`
from jsDelivr, no app key). It is free for commercial and non-commercial use under a **limited-use licence with
attribution rules**. Read it before shipping. VPS/Maps are not included, so it has no GPS of its own.

### SLAM engines vs GPS engines
AR.js, LocAR and the baseline recompute the path from raw GPS and compass on every frame, so they inherit every GPS jump
and compass error. 8th Wall and WebXR track the camera with SLAM (smooth), but have to be told once where north is, so a
bad compass reading at start rotates the whole path. They have **Re-align here** and **Heading +/-5** buttons for that.

## Running it

- Desktop, to see the pages: `http://localhost/Lampara/ar-lab/`
- Phone (needed for camera, GPS and compass): must be **HTTPS**. Use your ngrok tunnel to the same folder, e.g.
  `https://<name>.ngrok-free.app/Lampara/ar-lab/`. Set A and B on the phone itself, or use **Copy phone link** on a desktop.
- Tuning without editing code, add to the engine URL: `?h=1.5` (phone height above ground, m), `?fov=65` (camera long-side
  FOV, deg), `?gap=2` (chevron spacing, m). Same knobs as the main guide.

## What has been verified, and what has not

| Check | Result |
|---|---|
| `shared/selftest.html`: geo math, compass heading, camera maths vs compass over 400 random poses, chevron orientation, polyline sampling, remaining distance, routing over the live walkway graph, two-stop routes and the A to B to C controller | 58/58 pass |
| A to B to C walk (emulated GPS moved to B, then to C) on AR.js, LocAR, baseline and 8th Wall | At B the leg-1 arrow is removed and only the leg-2 arrow is drawn; at C everything clears. WebXR shares the same code but could not run |
| Engines 1, 2, 5 in headless Edge with emulated GPS, orientation and a fake camera, facing the route | Path, beacon, label and HUD render correctly; facing away hides the path |
| Engine 3 (8th Wall) in headless Edge (camera constraints stubbed) | Engine starts, receives video frames, path aligns and renders full-screen. Real SLAM motion **not exercised** |
| Engine 4 (WebXR) | Gate error path verified; the AR session **not exercised** (no WebXR in desktop Edge) |
| Walkway route (Heritage to Amafel, 132 m with 3 turns) on the baseline engine | Chevrons follow the first legs; HUD counts remaining distance along the route |
| Phone, indoors, night (engines 1, 2, 5) | Rendered the path correctly. Tracking quality outdoors **not yet measured** |
| Outdoor walk on a real phone | **Not done for any engine.** That is the actual test |

## How GPS is handled (re-reviewed 9 Oct 2026)
- **Position filter** (`sensors.js`, used by the baseline, WebXR, 8th Wall and for arrival checks): a small Kalman filter.
  Each fix is weighed by its own claimed accuracy against how sure the estimate already is; a velocity estimate removes the
  lag behind a walker. It reports an honest uncertainty. On a simulated 2-minute walk with +/-6 m noise and a bad fix every
  10 seconds: raw GPS 16.8 m RMS (worst 73 m), old filter 7.1 m, current filter 4.2 m (worst 9 m), 1 m lag.
  LocAR.js and AR.js read GPS themselves, so they still feel raw jitter: that is part of what is being compared.
- **Start point is live**: unless "Start from where I am when the engine opens" is switched off (`&live=0`), the route is
  re-planned from a fresh GPS fix when an engine opens, so a stale or desktop-typed A cannot misplace the path. B and C stay.
- **Progress tracker** (`geo.tracker`): remembers how far along each leg you are, so a route that loops back near its own
  start (around a building) cannot make the app think you are already at the end.
- **Arrival** means being at the stop: straight-line distance to the stop within 8 m (or the GPS uncertainty if larger,
  max 25 m), not "distance left along the route".
- **Baseline engine** glides the camera between GPS fixes instead of jumping once per second.

## Why an engine can look like it drifts
Drift comes from the sensors, not the map. The basemap tiles only help you pick coordinates; they are never used to draw or
track the path. What moves the path on screen: GPS error (several metres, much worse indoors or between buildings),
compass error (10 to 30 degrees near metal, worse indoors), and a wrong camera field of view (`?fov=`). Test outdoors and
watch the GPS figure under the **i** button.

## Layout

```
ar-lab/
  index.html          route setup, engine cards, results table
  shared/
    geo.js            distance, bearing, ENU, route sampling, route storage (localStorage + ?a=&b=&mode=&node=)
    campus.js         reads the admin walkway graph (read-only) and routes over it (one leg per stop)
    nav.js            A -> B -> C controller: shows the current leg only, detects arrival, switches legs
    path.js           the chevron ribbon, A ring and B beacon (one build, used by every engine)
    sensors.js        GPS watch, tilt-compensated compass, iOS permission, start gate
    hud.js            on-screen readout, metrics, rate-and-save
    lab.css           launcher + HUD styles
    selftest.html     browser test for the maths
  engines/            one page per engine
  vendor/arjs/        AR.js + threex orientation controls (copied from the main app; the others load from CDN, pinned)
```

## Known gaps
- The route is only as good as the admin's walkway graph. A building with no entrance node (Gymnasium) falls back to a straight line.
- Compass is magnetic, not true north (declination is about 1 degree in Cavite, ignored). Use the heading nudge buttons.
- FOV is a single phone-agnostic guess (67 deg long side); a wrong value looks like drift when you turn.
