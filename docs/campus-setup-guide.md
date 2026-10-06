# Setting up the whole campus (outdoor paths, floor plans, AR)

Do these in order. Each step has a check you can run, and `php Backend/scripts/setup-audit.php`
lists everything still missing (`[FIX]` blocks the AR guide, `[tip]` is polish). Run it after every step.

## 0. Server, once

- XAMPP: Apache and MySQL running. The app lives in `htdocs/Lampara`.
- `Backend/secrets.php` with the Gemini key (sign scanning and the chat need it).
- Database up to date: the `name` columns on `campus_nodes` and `floor_plan_nodes`
  (see the top of `Backend/schema.sql`), then `php Backend/scripts/name-points.php`.
- For a phone: HTTPS (a tunnel such as ngrok or Cloudflare Tunnel). Camera, compass and GPS
  do not work on plain `http://` over Wi-Fi.

## 1. Buildings (Admin > Register Building)

For every building: name, number, floor count, and its **location**. Stand at the building and
use "Get my current location" (it works offline too). The location is what the student's GPS
check (500 m) and the outdoor arrow aim at, so it must be real.

Upload one **floor plan image per floor**. Use a flat, straight-on picture: a plan photographed
at an angle makes every distance slightly wrong. Crop away the margin.

## 2. Outdoor walkways (Admin > Campus Paths)

1. Walk the real paths with **Record my walk** (or tap points on the map). Put a point at every
   junction, gate and building door. Straight stretches do not need extra points.
2. Mark building doors: select the door point, set its type to "Building entrance", and pick the
   building under "Entrance of". **Every building needs an entrance**, or the outdoor arrow
   cannot route to it.
3. Everything must be one connected network. Check: the audit says "one connected network".
4. Lock the map when you are done so a stray tap cannot move a point.

## 3. Indoor paths, per floor (Register Building > Edit walkable paths)

- Put a point at **every junction, turn, dead end, door of the hallway and stairs**. Nothing
  in the middle of a straight hallway: two points plus a line is enough.
- Keep hallways exactly horizontal or vertical where the building is. Drag points into line, or
  run the tidy tool (below).
- **Stairs and elevators**: select the stairs point on each floor, "Connect to another floor",
  pick the matching point upstairs. Without it a route cannot change floors.
- Extend a path to (or very near) the door of every room. A room snaps to the nearest piece of
  path; a room 15 percent of the plan away from any hallway gets a poor last stretch.
- Everything on a floor should be one connected piece.

Tidy tool (straightens nearly-straight hallways, removes pass-through points, never touches
junctions, turns, dead ends, stairs points or room entry points):

```
php Backend/scripts/tidy-paths.php            # shows what it would do
php Backend/scripts/tidy-paths.php --apply    # does it   (back up first)
php Backend/scripts/tidy-paths.php --plan=16  # one floor only
```

Back up before applying: `mysqldump -uroot lampara_db floor_plan_nodes floor_plan_edges rooms > backup.sql`.

## 4. Rooms (Admin > Register Room / Manage Buildings)

For each room: number (a section is fine: `1101 - A`), name, floor, and its **marker on the
floor plan** at the door or centre of the room. If you replace a floor plan image, re-check the
markers: they are positions on the image, so a different image means different positions.

## 5. Calibrate each floor (Admin > Floor Calibration)

Without this the indoor AR stays off for that floor. Per floor, 5 minutes:

1. Pick a long straight hallway. Tap its two ends on the plan (A, B).
2. Measure the real distance A to B with a tape or by counting paces (error under 10 percent is fine).
3. Stand at A, phone flat with its top edge toward B, tap "Read my compass", tap again to freeze.
4. Save. The floor shows a tick.

Use the longest hallway you have; errors shrink with length. Do every floor, each floor on its own.

## 6. Check it

- `php Backend/scripts/setup-audit.php`: no `[FIX]` lines.
- Outdoor: Public guide from the campus gate to each building: the ground arrow follows the paths.
- Indoor: scan a room sign on floor X, choose a room on floor Y, open the AR guide, walk it once
  per floor. If the arrow is rotated wrongly, redo that floor's compass bearing; if distances feel
  off, redo the distance.

## 7. Keep it safe

- Lock each editor when you finish (Campus Paths, path editor, Floor Calibration).
- Remove all, single deletes and connection changes have **Undo** while the page stays open.
- Offline edits wait on the device until you approve the sync.
- The tidy tool and audit are in `Backend/scripts/`; the audit only reads.
