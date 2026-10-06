# Lampara: system review and assessment

Reviewed 1 October 2026. Scope: the whole app (public guide, student pages, admin panel, backend, data), checked by automated browser tests, code review, a database audit and a read-through of the AR math. **Not covered:** the AR on a real phone, the live Gemini service (no key installed), and a deployed HTTPS copy.

## 1. Verdict

| Use | Ready? |
|---|---|
| Demo on the admin's laptop, outdoor guide and search | **Yes** |
| Supervised pilot (a few testers, ngrok or a real host over HTTPS) | **Yes, after the 4 items in section 8** |
| Open release to all students | **Not yet.** Needs a real-phone AR trial, a live-database hardening pass and a backup routine |

The software is in good shape. Every automated check passes and no logic errors were found in the routing, calibration or sync code. What stands between the project and a pilot is mostly **setup and real-world verification**, not defects.

## 2. What the system does

A phone-first campus wayfinding app. Students scan or search a room, then get directions by text, a map and an AR guide. Admins register buildings, rooms, floor plans and walkable paths.

- **Outdoor:** GPS plus admin-drawn campus walkways (Dijkstra shortest route, a ground arrow that follows the paths).
- **Indoor:** the admin draws a path on each floor plan, calibrates it (scale and compass direction), and the student's phone counts steps and reads the compass to place an AR arrow along the route.
- **Reading signs:** Gemini reads the room number off a photographed door sign.
- **Offline:** students keep working from a cache; admins queue changes and sync with approval.

Size: about 14,300 lines across 39 PHP files, 12 API endpoints and 16 pages.

## 3. Feature status

"Verified" means an automated browser or code check, on a throwaway database. None of it has run on a real phone.

| Feature | Status | Evidence |
|---|---|---|
| Admin login, session gating of every write | Working | Code review of all 12 endpoints; every write is admin-gated |
| Buildings, rooms, floor plans (register, edit, delete) | Working | Admin suite 48/48, page loads |
| Room numbers with sections (`1101 - A`), duplicate checks | Working | 36/36 including cross-language cases |
| Campus walkway editor: add, drag, connect, entrance | Working | Names/lock suite 33/33, drag 11/11 |
| "Record my walk" and "Drop a point here" | Working | 21/21 with simulated noisy GPS |
| Indoor path editor and floor calibration | Working | Suites above, calibration math re-derived and correct |
| Walk-measured calibration (steps and compass) and GPS option | Working | 18/18 with simulated sensors |
| Named points ("Point A…"), lists, rename | Working | 33/33 |
| Lock (no accidental edits) in all three editors | Working | 33/33 |
| Remove all, Undo (points and connections) | Working | 20/20 and 12/12 |
| Student offline mode, service worker, refresh on reconnect | Working | 29/29 |
| Admin offline queue, sync with approval, conflict handling | Working | 48/48 |
| Outdoor AR ground arrow | Built, **not verified on a device** | Page loads; AR needs camera and compass |
| Indoor AR guide | Built, **not verified on a device**, and off for every floor until it is calibrated | Math checked; gating checked |
| Sign scanning and Test Chat (Gemini) | **Not working: no key installed** | `Backend/secrets.php` missing |

## 4. Test evidence

- **Browser suites:** 228 checks across 9 suites, all passing (admin offline 48, student 29, walk 21, room numbers 36, names/lock 33, undo 20, drag 11, connection undo 12, calibration measure 18).
- **Page smoke test:** all 15 pages opened at desktop and phone width (30 loads), checking script errors, failed requests and sideways overflow. 25 clean; the rest are explained under 5.
- **Static checks:** all 39 PHP files lint clean; no SQL is built from request input.
- **Data audit:** no duplicate room numbers, no duplicate point names, no unnamed points, all floor plan files present, no pins out of range.
- **Isolation:** tests ran against a copy of the data. The real database was only changed where noted in section 9.

## 5. Defects found in this review

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Register Building page scrolled sideways by 9px on a phone (floor-plan row did not wrap) | Low | **Fixed** |
| 2 | Register Room page scrolled sideways by 11px on a phone | Low | **Fixed** |
| 3 | Admin login had no limit on wrong passwords | Medium | **Fixed**: 8 failures, then a 10 minute wait (per visitor) |
| 4 | Scan and Chat could be called without limit, so anyone could run up the Gemini bill | Medium | **Fixed**: 90 requests per minute per visitor |
| 5 | Console error "reading 'dispose'" on the two AR pages at load | Cosmetic | **Not fixed, harmless.** A-Frame upgrades a placeholder scene element before Vue replaces it. The scene is only created when the guide starts, and the original design had the same behaviour |
| 6 | `ar-test.php` overflows on a phone | None | **Ignore.** It is a developer page showing the camera error box; there is no camera in the test browser |
| 7 | Test fixtures were out of date (old floor plan image names) | Test only | **Fixed** |

No incorrect results were found in the routing, the calibration math (the plan rotation and scale conversions were re-derived by hand), the turn detection, or the sync logic.

## 6. Data readiness (the real gaps)

The audit shows **11 items to fix and 10 optional tips**.

| Item | Where | Blocks |
|---|---|---|
| Gemini key missing | Server | Sign scanning, chat |
| All 7 floors uncalibrated | Amafel 1st to 4th; Annex 2nd to 4th | Indoor AR (everywhere) |
| No entrance | Gymnasium | Outdoor path-following to it |
| No plan marker for rooms 2206 and 2211 | Annex 2nd floor | Indoor route for those rooms |

Better than a few days ago: five of six buildings now have connected entrances, the Amafel pins sit on their rooms, and the path points are straight and minimal.

Open notes (not blockers): Amafel 1st floor rooms 1108, 1110 and 1114 do not appear on the re-uploaded plan; Comfort Room #46 has no number; Annex has 3 plans for 4 floors; JEG, Heritage, Gymnasium and Multipurpose have no floor plans or rooms (outdoor and text directions only).

## 7. Risks

**Accuracy (the main product risk).** Indoor AR places the arrow from step counting and the phone compass. Both drift: compasses are often off by 10 to 30 degrees near metal, and step length varies. The floor plans are photographs taken at an angle, so distances on them are approximate. Expect the guide to be roughly right, not exact. It offers manual re-sync, and the first walk will probably need calibration tuning.

**Security and cost.**
- Public scan, chat and flag endpoints are throttled but not authenticated. A school Wi-Fi shares one IP, so limits are generous.
- Cross-origin access is open on all APIs (`*`). Reads are meant to be public, writes need a login, so this is acceptable for now.
- A failed database connection prints details to the page. Turn off error display on the live PHP.
- The only admin account (`practical`) should have a strong, unshared password.

**Operations.**
- Nothing is committed to git (55+ changed files), so there is no rollback point.
- The local database has drifted from the deployed one: the live copy needs every schema change (campus tables, calibration columns, sync tables, point-name columns) plus `php Backend/scripts/name-points.php`.
- Default database login is root with no password; the live server needs `Backend/db.php`.
- No scheduled database backup.
- The camera, compass and GPS require HTTPS.

## 8. Required before a supervised pilot

1. **Install the Gemini key** (`Backend/secrets.php`).
2. **Calibrate the floors you will test** with the walk measurement. Start with the Amafel 3rd floor.
3. **Serve over HTTPS** (ngrok for a test, a real certificate for a deployment).
4. **Walk one outdoor and one indoor route on a real phone** and adjust calibration. This is the one step that proves the AR.

## 9. Recommended next steps

1. Commit the work in sensible chunks for a rollback point.
2. Set the Gymnasium entrance and the two missing Annex markers.
3. Add door paths on the 2nd and 3rd floors and the Annex (done for the Amafel 1st floor).
4. Decide the real numbers for rooms 1108, 1110 and 1114.
5. On the live server: strong admin password, `Backend/db.php`, errors hidden, database backup, schema upgrade.
6. After the first pilot walk, tune calibration and consider a per-user step length for the indoor guide.

## 10. Changes made to real data during this project's review work

Always with a backup taken first, and listed here so they can be undone:
- `name` columns added and the 30 existing points named.
- Amafel floor paths straightened and merged (backups: `backup_before_optimize_plan16.sql`, `backup_before_tidy_all.sql`, `backup_before_proper.sql`).
- Door spurs and pins added on the Amafel 1st floor (`backup_before_doors.sql`), and pins realigned on the 2nd and 3rd floors (`backup_rooms_before_realign.sql`). Backups are in the session scratch folder.

## 11. Tools that now exist

- `php Backend/scripts/setup-audit.php`: read-only checkup of the whole setup (run it before every test session).
- `php Backend/scripts/tidy-paths.php [--apply]`: straighten and merge floor paths.
- `php Backend/scripts/name-points.php`: name existing points.
- `docs/campus-setup-guide.md`: the ordered setup procedure.
