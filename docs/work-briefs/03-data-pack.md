# Brief 3: data pack and room import (branch `data-pack`)

**Goal:** an admin can export a whole school as one file and import it into another install, and can bulk-load rooms from a spreadsheet. This is what makes onboarding a second school cheap. Mostly new files.

## Start prompt

> Read `docs/work-briefs/README.md` and `docs/work-briefs/03-data-pack.md`. Do the tasks in order on branch `data-pack`. Test imports only against a copy database, never the live one. Commit after each task.

## Design (fixed)

**Format:** a ZIP (`ZipArchive` is available on this PHP) containing `data.json` and `images/` (floor plans only; photos are optional and skipped in v1). If `ZipArchive` is missing, fall back to JSON only without images and say so in the UI.

**`data.json`** (`"version": 1`) uses **array positions as keys**, never database ids; the importer remaps them:
- `institution` (only if the `institution` table exists: another branch adds it, so check with `SHOW TABLES`)
- `buildings[]`: name, lat, lng, floor_count, entrance_floor, is_open, building_number, directory, `entrance_node` (index into `campus_nodes` or null)
- `campus_nodes[]`: lat, lng, node_type, name; `campus_edges[]`: pairs of indices
- `floor_plans[]`: `building` (index), floor, `image` (file name inside the zip), north_offset, meters_per_unit_x/y (carry as is)
- `plan_nodes[]`: `plan` (index), x, y, name; `plan_edges[]`: pairs of indices
- `rooms[]`: `building` (index), room_number, room_name, subtitle, floor, room_type, category, hours, notes, map_x, map_y, `path_node` (index or null)
- `doors[]`: `building`, kind (`entry`/`exit`), `node` (index into `plan_nodes`)
- `enrollment_steps` (the saved JSON list or null)

**Never export:** admins, password hashes, TOTP secrets, audit log, hazard reports, change log, sessions, API keys.

**Endpoint:** `Backend/api/data-pack.php`, admin role only (not PSMO; leave it off the PSMO allow list in `Backend/session_boot.php`). `GET ?action=export` streams the zip. `POST ?action=preview` (file upload) returns counts and problems without writing. `POST ?action=import` (file upload + `mode=replace`) runs inside one transaction after taking an automatic backup, deletes existing content tables in foreign-key order, inserts in dependency order with id remapping, then commits (rollback on any error). Validate: version, file size cap (25 MB), image type and size using the checks in `Backend/photo_upload.php`, text lengths, numeric ranges. Rate-limit with `Backend/rate_limit.php`; write an `audit_log` entry.

## Tasks

### 1. Export (60 min)
Implement `?action=export`. Check: the zip opens, `data.json` is valid, no secrets appear (`grep -i hash` on it), counts match the database (9 buildings, 124 rooms, 13 plans on the current data).

### 2. Preview and import (90 min)
Implement `preview` and `import`. **Test on a copy:** create `lampara_db_test` (`mysqldump` the live database into it), point a temporary local `Backend/db.php` override at it (do not commit db.php), import the pack exported from live, compare counts and spot-check one building's floor plan, doors and 5 rooms. Also test that a corrupt zip and a wrong version are refused with a clear message and leave the data untouched.

### 3. Admin page (60 min)
`Frontend/View/Admin/data-pack.php` + `Js/Admin/data-pack.js`, nav entry "Data" under "Tools" for admins only (`Frontend/View/Include/admin-nav.php`). Export button; import: choose file, show the preview (counts, warnings), then a confirm step that requires typing `REPLACE` because import deletes current content. Match the existing admin look.

### 4. Room CSV import (60 min)
`POST ?action=csv-preview` and `csv-import` on the same endpoint. Columns: `building_name, floor, room_number, room_name, category, hours, notes`. Match buildings by exact name (case-insensitive); report unknown buildings, duplicate room numbers (the database requires `room_number` unique), bad categories, per-row. Preview shows valid and invalid rows; import adds only valid rows. Provide `Frontend/assets/templates/rooms-template.csv` and a link on the Data page. Respect the room-number rules in `Backend/room_number.php`.

### 5. Push the branch.

## Not in this brief
Photos in the pack, merge-style import (replace only in v1), per-building CSV for buildings, any config work (brief 2), deleting indoor AR (brief 1).

## Done when
Round trip on the copy database reproduces the counts; refusals leave data unchanged; CSV preview reports row-level errors; branch pushed; "Result" filled in below.

## Result
Done on branch `data-pack` (built on `institution-config`).

- **Files:** `Backend/data_pack.php` (collect, zip, read, check, import, CSV helpers), `Backend/api/data-pack.php`, admin page `data-pack.php` (nav: Tools > Data, admins only, not PSMO), `Js/Admin/data-pack.js`, `Css/Admin/data-pack.css`, `Frontend/assets/templates/rooms-template.csv`.
- **The pack:** a zip with `data.json` (version 1, array positions as keys, never database ids) and `images/` (floor plans). It carries school settings, buildings (with open-type flag, entrance floor, entrance point), campus walkway points and links, floor plans with calibration values, path points and links, rooms, doors, campus-map pins, building-outline links, and the saved enrollment steps. It never carries staff accounts, hashes, two-step secrets, logs, visitor reports or photos (a grep of the exported JSON for password, hash, totp, secret found nothing).
- **Import (replace only):** needs the typed word `REPLACE`; saves a safety copy to `backups/pre-import-<time>.zip` first; runs in one transaction (tables are created before it starts, because creating one would end it); a failure rolls back and removes the pictures it wrote. Old pictures are deleted after the commit unless a floor plan still uses the file. Rejects wrong version, corrupt zip, bad references, duplicate room numbers in a building, duplicate floors, bad types, oversize files.
- **Spreadsheet import:** `csv-preview` and `csv-import` (columns `building_name, floor, room_number, room_name, category, hours, notes`). Buildings match by name; rooms already there are never changed; each bad row gets its own message (unknown building, duplicate number in the file or in the building, bad category, empty name); valid rows are added in one transaction.
- **Tested:** export from the live data: 9 buildings, 124 rooms, 13 plans, 224 path points, 225 links, 32 campus points, 8 doors, 8 pins, all matching the database. Import tested **only on a copy database** (`lampara_db_test`, since dropped): the copy had 112 rooms, the import restored 124, and an export taken afterwards had identical content for every list. A wrong version, a pack with a bad reference, a pack with a duplicate room number and an unconfirmed import were all refused and changed nothing. Spreadsheet: 5 test rows gave 2 valid and 3 skipped with correct messages; the 2 added rooms had the right type and hours; they were then deleted. The temporary pointing of the site at the copy database was automatically reversed, and the floor plan pictures the test deleted from disk were restored; the live data and the pictures are as they were.
- **Left out of the pack on purpose:** photos, QR anchors, hazard reports, campus-outline shapes themselves (only their building links), the campus map pictures. After an import the preview warns that reports on current rooms and photo links are removed.
- **Found on the way:** room numbers are already unique per building in the live database; `schema.sql` still showed the old whole-database key as a comment (now marked superseded), and the evaluation document was corrected.
- **Limits:** replace only (no merge); packs over 25 MB are refused; PHP's own upload limit here is 48 MB. Not done: buildings CSV, photos in the pack.
