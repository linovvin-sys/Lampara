# Brief 1: cleanup (branch `cleanup`)

**Goal:** the repository matches the product. Remove the indoor-AR leftovers, close one security gap, and make the two biggest API reads cheaper. No new features.

## Start prompt

> Read `docs/work-briefs/README.md` and `docs/work-briefs/01-cleanup.md`. Do the tasks in order on branch `cleanup`, committing after each one. Keep verification to one browser look per task.

## Tasks

### 1. Safety (5 min)
Back up the database (`Backend/scripts/backup.php`). Create the branch.

### 2. Remove indoor AR (about 45 min)
Delete these files (confirm each has no other reader with `grep -rn` first):
- `Frontend/View/Student/indoor-ar.php`
- `Frontend/Js/Student/indoor-ar.js`, `Frontend/Js/Student/locar-indoor.js`
- `Frontend/Js/Include/indoor-nav.js`, `Frontend/Js/Include/ar-ribbon.js` (no page loads it)
- `Frontend/Css/Student/indoor-ar.css`
- `Frontend/View/Student/ar-test.php`, `Frontend/Js/Student/ar-test.js`, `Frontend/Css/Student/ar-test.css`
- `Frontend/assets/vendor/aframe/` (only `ar-test.php` uses it; `three-0.181.0` and `locar-0.2.12` are still used by the outdoor guide, keep them)

Then fix the references:
- `Frontend/View/Student/scan.php` (about line 430): remove the "Use my camera inside" link.
- `Frontend/Js/Student/scan.js` (about lines 218-233): remove `arGuideUrl` and its `calibrated` helper; remove any template/computed use of it.
- `Frontend/Js/Include/student-offline.js` (line ~20): remove `'../Student/indoor-ar.php'` from the precache list.
- `Frontend/sw.js`: bump `VERSION` so phones drop old caches; remove any `indoor-ar` entry if present.
- `Frontend/Js/Student/journey.js` (line ~138): fix the comment that mentions the camera version.
- Calibration plumbing, **keep the database columns** (`north_offset`, `meters_per_unit_x/y`; `journey.js` still reads meters-per-unit to estimate distances), but remove: the `?action=calibrate` handler in `Backend/api/floor-plans.php` (about line 75), the `calibration.set` case in `Backend/api/admin-sync.php` (about lines 338-352) and its two uses in `Frontend/Js/Include/admin-offline.js` (about lines 151 and 238), and the calibration lines in `Backend/scripts/setup-audit.php` (about lines 221-226).
- Docs that still describe indoor AR (`docs/ar-navigation-setup.md`, `README.md` mentions): add a one-line "indoor AR was removed" note, do not rewrite them.

Check: `grep -rniE "indoor-ar|IndoorNav|ar-test|aframe|calibration\.set" Frontend Backend` returns nothing outside vendor folders and docs. Open `Public/index.php`, `Student/where.php`, `Student/scan.php`, `Student/manual-search.php` in the browser: no console errors.

### 3. Directory listing off (5 min)
Add `Options -Indexes` to `.htaccess`. Check `http://localhost:8888/lampara/Backend/api/` and `/Frontend/Js/Admin/` now return 403.

### 4. ETag on the two big reads (30 min)
In `Backend/api/rooms.php` and `Backend/api/buildings.php` GET: build the JSON string, set `ETag: "<md5>"`, and if `If-None-Match` matches send `304` with no body. Keep existing headers. Check with `curl -i` twice (second with the ETag returns 304) and that the student directory page still loads.

### 5. Commit and push the branch.

## Not in this brief
Dropping the calibration columns, per-building room-number uniqueness (needs a migration plus changes in `rooms.php` and `register-room.js`; leave for later), any config work.

## Done when
Tasks 2 to 4 verified as above; branch pushed; "Result" filled in below.

## Result
_(fill in)_
