# Admin offline mode

The admin panel keeps working with no connection. Changes made offline are saved on the
device and synced later, **only after the admin approves** the popup.

## One-time setup

1. **Database:** run the two `sync_*` tables (already in `Backend/schema.sql`; applied to the local `lampara_db`):
   ```sql
   CREATE TABLE sync_ops (op_id VARCHAR(64) PRIMARY KEY, result_json TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
   CREATE TABLE sync_temp_ids (temp_id VARCHAR(64) PRIMARY KEY, entity VARCHAR(20) NOT NULL, real_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
   ```
   Run the same on the live database (InfinityFree) before uploading the new files.
2. **Upload** the new/changed files (see the list at the bottom). `Frontend/sw.js` must stay at that path.
3. **HTTPS is required** for the service worker (the live site and ngrok both qualify; `localhost` also works).

## Getting a device ready (do this once per phone/laptop, while online)

1. Sign in as admin and open any admin page. The app saves every admin page, its data and the
   floor plan images in the background (about 10 seconds).
2. Open **Campus Paths** and pan/zoom over the campus once. Only map tiles you have looked at are
   saved, so this is what makes the map show up offline.
3. Done. The page shows a small dark chip at the bottom when you are offline or have unsynced changes.

## What works offline

| Page | Offline |
|------|---------|
| Register Building | Create and edit buildings. **Capture My Current Location** works (GPS needs no signal). |
| Campus Paths | **Drop a point here** (one point at your GPS position), **Record my walk** (walk the path and it adds the corners for you), tap the map, drag, connect, delete, set building entrances. |
| Register Room | Create and edit rooms, including the floor-plan marker (plan must have been opened online once). |
| Floor Calibration | Full calibration including the compass reading. |
| Dashboard, Manage Buildings | View (with unsynced items marked). |

**Needs internet:** deleting buildings/rooms, uploading or removing floor plan images, the
walkable-path editor on floor plans, resolving reports, Test Chat. The app says so instead of failing.

## Syncing

- On reconnect the app **asks first**: "Sync N offline changes?" with the list. Choices: **Sync now**,
  **Decide later** (changes stay saved), **Discard all**.
- The chip's **Review & sync** button reopens the same question any time.
- **If someone changed the same thing on the server meanwhile,** you get a conflict dialog showing
  both versions: **Keep my changes** or **Keep the server's version** (or decide later).
- If your admin login expired, it says "Sign in to sync". Nothing is lost.
- Failed changes (for example a room number that is now taken) stay listed with the reason.
- Retrying is safe: every change has a unique id, so a dropped connection can't create duplicates.
- After a sync the offline copies refresh with the latest data automatically.

## Good to know

- Log out warns if changes are unsynced. They stay on the device and are offered again after you sign in.
  Logging out also erases the saved admin pages/data from that device.
- A building created offline can't have floor plans or paths until it has synced.
- Browsers can clear saved data after long inactivity (Safari after ~7 days). Sync soon after working offline.
- Student pages have their own offline mode, described in `student-offline-mode.md`. It shares the same service worker.

## Files

New: `Frontend/sw.js`, `Frontend/Js/Include/admin-offline.js`, `Backend/api/admin-sync.php`, `Backend/api/ping.php`.
Changed: `Backend/schema.sql`, `Frontend/View/Include/admin-nav.php`, `Frontend/Js/Include/admin-nav.js`,
`Frontend/Js/Admin/{campus-paths,register-building,register-room,floor-calibration,manage-buildings,dashboard,login}.js`
and their views.
