# Lampara — feature checklist (setup + verification)

Tick each box as you go. **Setup** = what you must prepare first. **Check** = what to test and what "working" looks like.
Step-by-step instructions for the AR features are in `ar-navigation-setup.md`.

---

## 0. One-time prerequisites

- [ ] **Setup:** database migration applied (`campus_nodes`, `campus_edges`, `buildings.entrance_node_id`, `floor_plans` calibration columns). *Already applied to the local `lampara_db`; repeat on InfinityFree if the live site is used.*
- [ ] **Setup:** phone reaches the site over **HTTPS** (ngrok) — camera, GPS and motion need it.
- [ ] **Setup:** logged in as admin (`Admin/login.php`).
- [ ] **Check:** admin login → show-password eye toggles the field; sign-in still works.

## 1. Existing features (regression — code was refactored)

| # | Feature | Check — working looks like |
|---|---------|----------------------------|
| 1.1 | Scan page, typed room number | Room details appear; "report outdated" works |
| 1.2 | Scan page, same-floor route | Floor plan shows both pins and the green route line |
| 1.3 | Scan page, different-floor route | Pages per floor with Previous/Next floor; stairs link used |
| 1.4 | Manual Search → scan | Opens in planning mode; asks for your current room |
| 1.5 | Outdoor guide (`guide-ar.php`) | Building search works; floating arrow, label, distance and "turn left/right" hint show |
| 1.6 | Ask Lampara chat | Answers only from registered directory info |
| 1.7 | Manage Buildings / Register Building | Lists load; map sits *under* the mobile menu |

## 2. Outdoor ground ribbon

| # | Item | Type | Detail |
|---|------|------|--------|
| 2.1 | Draw campus walkways | Setup | Admin → Campus Paths; points at corners, forks, gates, doors; connect them |
| 2.2 | Set every building's entrance | Setup | Select the door point → "Entrance of building". Buildings card shows none missing |
| 2.3 | Paths connect gate → every entrance | Setup | No isolated islands |
| 2.4 | Points persist | Check | Reload Campus Paths — same points, lines and entrances |
| 2.5 | Ribbon appears | Check | On/near a path with a building picked: green chevron path on the ground |
| 2.6 | Ribbon follows walkways | Check | Goes around buildings, never straight through them |
| 2.7 | Turn banner | Check | "Turn left/right in N m" and "N m to the entrance" update as you walk |
| 2.8 | Arrival | Check | Within 8 m: "You've reached the entrance" |
| 2.9 | Off-path | Check | 60 m+ from any path: "Head to the nearest walkway" |
| 2.10 | Floating arrow still there | Check | Original marker unchanged |

## 3. Indoor AR arrow

| # | Item | Type | Detail |
|---|------|------|--------|
| 3.1 | Floor plan image uploaded per floor | Setup | Register Building → Floor Plans |
| 3.2 | Walkable paths drawn + stairs links | Setup | "Edit walkable paths" on each floor; cross-floor links between floors |
| 3.3 | Every room has a marker | Setup | Register Room |
| 3.4 | **Calibrate each floor** | Setup | Admin → Floor Calibration: 2 hallway points, real distance (m), compass bearing. *All three Amafel floors are still uncalibrated.* |
| 3.5 | Calibration persists | Check | Reload — floor shows ✓ and the same numbers |
| 3.6 | Start button gating | Check | "Start AR guide" appears only when every floor on the route is calibrated |
| 3.7 | Ribbon direction | Check | Ribbon runs the same way as the real hallway (wrong = re-do the bearing) |
| 3.8 | Steps advance you | Check | Chip says "Counting steps"; ribbon and banner progress as you walk |
| 3.9 | Manual adjust | Check | −2 m / +2 m / "At next corner" fix drift |
| 3.10 | Stairs | Check | One prompt "Take the stairs to <floor>", then "I'm on <floor>" continues |
| 3.11 | Arrival | Check | "You've arrived" with room name |
| 3.12 | Mini-map | Check | Circle turns with you; route drawn on the plan |
| 3.13 | Clear errors | Check | Uncalibrated / no route / different building each show a plain message, not a blank screen |

## 4. Offline caching

| # | Item | Type | Detail |
|---|------|------|--------|
| 4.1 | Warm the cache while online | Setup | Open `guide-ar.php`, then a scan route, then the indoor guide once |
| 4.2 | Outdoor guide offline | Check | Airplane mode + reload: buildings and ribbon still work |
| 4.3 | Scan / indoor offline | Check | Route and floor plans still load |
| 4.4 | Never-visited page offline | Check | Empty but no crash (expected) |

## 5. Field accuracy (only a phone can answer these)

- [ ] Compass alignment holds in several hallways (metal can throw it off)
- [ ] Drift after ~20 m is small enough to live with; adjust buttons recover it
- [ ] Ribbon height looks right — tune `GROUND_Y` in `Js/Include/ar-ribbon.js` if not
- [ ] Outdoor ribbon is stable despite 3–10 m GPS jitter
- [ ] Stride length (0.7 m) matches your walking — tune `STEP_LENGTH` in `Js/Student/indoor-ar.js`

## 6. Release

- [ ] Work committed (nothing from the AR session is committed yet)
- [ ] Migration run on the live database, then files uploaded
- [ ] Live-site smoke test over HTTPS on a real phone
