# AR navigation — setup and testing guide

Covers the features added in the AR-navigation session: the **outdoor ground ribbon**
(Campus Paths), the **indoor AR arrow** (Floor Calibration), and **offline caching**.

Do the steps in order. Steps 1–4 are one-time setup; 5–7 are the actual testing.

---

## 1. Update the database (one time)

Open phpMyAdmin → select `lampara_db` → **SQL** tab → run all of this:

```sql
-- Outdoor walkway graph + each building's entrance
CREATE TABLE campus_nodes (id INT AUTO_INCREMENT PRIMARY KEY, lat DECIMAL(10,7) NOT NULL, lng DECIMAL(10,7) NOT NULL, node_type ENUM('junction','gate','entrance') NOT NULL DEFAULT 'junction', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE campus_edges (id INT AUTO_INCREMENT PRIMARY KEY, node_a_id INT NOT NULL, node_b_id INT NOT NULL, FOREIGN KEY (node_a_id) REFERENCES campus_nodes(id) ON DELETE CASCADE, FOREIGN KEY (node_b_id) REFERENCES campus_nodes(id) ON DELETE CASCADE, UNIQUE KEY campus_edge_pair (node_a_id, node_b_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE buildings ADD COLUMN entrance_node_id INT NULL;
ALTER TABLE buildings ADD CONSTRAINT fk_buildings_entrance_node FOREIGN KEY (entrance_node_id) REFERENCES campus_nodes(id) ON DELETE SET NULL;

-- Indoor AR calibration, per floor plan
ALTER TABLE floor_plans ADD COLUMN north_offset DECIMAL(6,2) NULL, ADD COLUMN meters_per_unit_x DECIMAL(8,4) NULL, ADD COLUMN meters_per_unit_y DECIMAL(8,4) NULL;
```

**Do this before opening any page.** The buildings and floor-plans APIs now read the new
columns and will return an error until the SQL has run.

If the site is also live on InfinityFree, run the same SQL there and upload the changed files.

## 2. Make sure the prerequisites already exist

The new features build on data you registered earlier. Indoor AR will not start without:

- Buildings registered with correct GPS (Register Building).
- A **floor plan image** uploaded for each floor that will be used (Register Building → Floor Plans).
- **Walkable paths drawn** on each floor, with stairs/elevator links between floors (Register Building → "Edit walkable paths").
- Each room's **marker placed** on its floor plan (Register Room).

## 3. Serve it over HTTPS on a phone

Camera, GPS, and motion sensors are blocked on plain `http://` (except `localhost`).
Use the same ngrok setup as the README ("Testing on a phone"):

```
ngrok http 80
```

Then open `https://<your-ngrok-id>.ngrok-free.app/Lampara/Frontend/View/...` on the phone.
Admin drawing/calibration pages work best on a laptop for drawing, but calibration's
compass step needs the phone — see step 5.

## 4. Log in as admin

`Frontend/View/Admin/login.php`. The sidebar now has two new items: **Campus Paths** and
**Floor Calibration**.

---

## 5. Set up the OUTDOOR ground ribbon

### 5a. Draw the walkways — Admin → Campus Paths
1. Switch the map to **Satellite** (top-right layer control).
2. Tap the map to drop a point on a walkway. Put points at **corners, forks, gates, and doors** — a long straight path only needs a point at each end.
3. Tap a point, then tap the next one to connect them. The second point stays selected, so keep tapping along the path to chain it.
4. Drag a point to fix its position. Tap a line to delete it. Select a point and use **Delete point** to remove it.
5. Tap empty map while a point is selected = deselect only (so a stray tap won't add a point).

### 5b. Mark each building's entrance
1. Select the point nearest the building's door.
2. In the side panel, set **Entrance of building** to that building.
3. A dashed purple line now joins the building pin to its entrance. The **Buildings** card shows which buildings still have no entrance.

**Rule:** every building you want a ribbon for needs an entrance point, and that point must
connect through drawn paths to the rest of the network (including near where students
will start, e.g. the gate). Unconnected = no ribbon, only the floating arrow.

### 5c. Test it outdoors (on the phone)
1. Open `Frontend/View/Public/guide-ar.php`, tap through the gate screen, allow camera, location and motion.
2. Search and pick a building that has an entrance set.
3. Stand on or near a drawn walkway. You should see the **green chevron ribbon on the ground** leading toward the entrance, plus a **"Turn right in 30 m" banner**.
4. The old floating arrow marker is still there; that is intentional.

What you should see when things are missing:
- No ribbon, no banner → the building has no entrance set, or the walkway graph doesn't connect to where you're standing.
- "Head to the nearest walkway" → you're more than 60 m from any drawn path.
- "You've reached the entrance" → within 8 m of it.

## 6. Set up the INDOOR arrow

Every floor a route touches must be calibrated once. Do this per floor plan.

### 6a. Calibrate — Admin → Floor Calibration
1. Choose the **building** and **floor** (floors already calibrated show a ✓).
2. **Step 1:** tap two points on the plan at the two ends of a **long, straight hallway you can walk**: **A** first (where you'll stand), then **B** (far end).
3. **Step 2:** enter the real distance from A to B in meters. Pace it or use a tape; ±10% is fine.
4. **Step 3:** enter the compass direction from A toward B in degrees (N = 0, E = 90, S = 180, W = 270). To read it from a phone:
   - Open this page **on the phone**, stand at A, hold the phone flat with its top edge pointing toward B.
   - Tap **Read my compass** once (allow the permission), then tap it again to lock in the reading.
5. Check the preview ("plan is about 32 m wide × 20 m tall, up points to 74°") looks sensible, then **Save calibration**.

Tips for good calibration:
- Use the **longest** straight hallway, so a small error matters less.
- Keep the phone away from metal and magnets while reading the compass.
- Recalibrate the floor if you replace its plan image.

### 6b. Test it indoors (on the phone)
1. Open `Frontend/View/Student/scan.php` and scan or type a **room number** (this sets where you are), then pick a destination in the same building.
2. A **Start AR guide** button appears only if every floor on the route is calibrated. If it doesn't appear, calibrate the missing floor(s) (step 6a).
3. Tap it, then **Start AR guide** on the next screen (this asks for camera and motion permission).
4. Stand **at the sign you scanned**, hold the phone up, and walk. Follow the green ribbon and banner.
5. **If your position drifts** (step counting is an estimate), use the buttons at the bottom:
   - **−2 m / +2 m**: nudge your position back or forward.
   - **At next corner**: jump to the next turn once you've actually reached it.
6. **Stairs:** when the banner says "Take the stairs to 2F", go up, then tap **I'm on 2F**. The guide continues on the new floor.
7. The circle at bottom-left is a mini-map that turns as you turn.

Manual entry (from Manual Search) works too: pick your current room as the origin, then the same **Start AR guide** button appears.

## 7. Test offline caching

Offline data is a **snapshot from the last online visit on that device**, so warm it first.

1. **While online**, on the phone, open `guide-ar.php` once and pick a building (caches buildings and the walkway graph). Open `scan.php`, pick a route and open the AR guide once (caches rooms, floor plans, floor graphs).
2. Turn on **airplane mode**, then reload those pages.
3. Expected: the outdoor guide still shows buildings and the ribbon; the scan page and indoor AR still find the route. Map tiles in Campus Paths need internet, but that's admin-only.

If a page is empty offline, that device never loaded it online first.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Buildings list or floor plans error right after updating | Step 1 SQL wasn't run (or wasn't run on the *same* database the site uses). |
| No "Start AR guide" button on the scan screen | A floor on the route isn't calibrated, or the rooms have no markers / the floors have no connected path. |
| Indoor page says "AR directions aren't set up… needs calibrating" | Calibrate the floor(s) it lists. |
| Indoor page says "No connected walking route" | Paths on the floor don't join up, or the stairs link between floors is missing. |
| Ribbon points the wrong way indoors | The compass bearing entered at calibration was off. Recalibrate, holding the phone flat and away from metal. |
| Ribbon drifts away from where you really are | Normal for step counting. Use −2 m / +2 m or **At next corner**. |
| Steps don't count ("Manual steps" chip shown) | Motion permission was denied. Reload, tap Start, and allow. On iPhone: Settings → Safari → Motion & Orientation Access. |
| Ribbon looks too high/low relative to the floor | Tune `GROUND_Y` in `Frontend/Js/Include/ar-ribbon.js`. |
| Camera/location blocked | You're on plain `http://`. Use the ngrok HTTPS URL. |
| Outdoor ribbon jumps around | GPS accuracy outdoors is 3–10 m. Stay near walkways; it snaps to the nearest drawn path. |

## What changed, for reference

| Area | Files |
|---|---|
| Database | `Backend/schema.sql` |
| Outdoor graph API | `Backend/api/campus-graph.php` (new), `Backend/api/buildings.php` |
| Floor calibration API | `Backend/api/floor-plans.php` |
| Admin pages (new) | `Frontend/View/Admin/campus-paths.php`, `floor-calibration.php` + matching `Js/Admin/` and `Css/Admin/` files |
| Outdoor guide | `Frontend/View/Public/guide-ar.php`, `Js/Public/guide-ar.js`, `Js/Public/campus-route.js` (new) |
| Indoor guide (new) | `Frontend/View/Student/indoor-ar.php`, `Js/Student/indoor-ar.js`, `Css/Student/indoor-ar.css`, `Js/Include/indoor-nav.js` |
| Shared | `Js/Include/ar-ribbon.js`, `Js/Include/floor-route.js` (routing moved out of `scan.js`), `Js/Include/offline-cache.js` |
| Entry point | "Start AR guide" button in `Frontend/View/Student/scan.php` / `scan.js` |

## Known limits

- Indoor position is **estimated from steps and compass**, not measured. Expect drift over long routes; the adjust buttons and re-scanning a sign correct it.
- Outdoor accuracy is limited by phone GPS (a few meters).
- Indoor AR works **within one building**. Different buildings still get text directions.
- Offline data is only as fresh as the last online visit on that device.
