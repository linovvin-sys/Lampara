# Moving Lampara from AR.js to ARCore: how buildings get anchored

Report based on the code on this branch (`guide-ar.js`, `indoor-ar.js`, `indoor-nav.js`, `qr-anchors.php`, `schema.sql`). Statements about ARCore come from general knowledge of the SDK, not from testing on your campus. Items marked **verify** need a check before you commit to them.

---

## 1. Short answer

ARCore has no built-in "put this at lat/lng" feature like `gps-new-entity-place`. A building can be anchored in three ways:

| Option | What anchors the building | Works where | Replaces |
|---|---|---|---|
| **A. Geospatial API (VPS)** | Real lat/lng/altitude. The phone localizes itself against Google Street View imagery, then you create an Earth anchor at each building's coordinates. | Outdoors, only where Street View/VPS coverage exists | AR.js GPS + compass |
| **B. Local anchor (marker or Cloud Anchor)** | A fixed physical spot (a marker you place). Everything else is positioned relative to it. | Anywhere, including indoors | Your current QR anchor, made much stronger |
| **C. Hybrid (recommended)** | A outdoors where coverage is good, B at the gate and indoors | Everywhere | Both of your current modes |

Your QR work is not wasted. It carries over as the fallback outdoors and the main method indoors. It needs one upgrade, covered in section 3.

---

## 2. How anchoring works today

**Outdoors (`guide-ar.js`)**
- Each building is an `<a-entity gps-new-entity-place latitude longitude>` (line ~554). AR.js converts lat/lng to scene meters relative to its own origin.
- The scene's orientation comes from the phone **compass** (`deviceorientation`). This is the weak link. Compass drift is what makes everything look slanted.
- Because of that, the code has a manual `rotateWorld()` workaround (line ~899) that asks the user to twist the world by hand.
- The QR anchor (`handleAnchorCode`) only fixes **position**: it calls `setWorldOrigin(lng, lat)` to the scanned node's coordinates. It gives **no heading**, so the compass problem remains after scanning.
- The walkway ribbon is routed over `campus_nodes`/`campus_edges` (lat/lng) in `campus-route.js`, then converted to scene coordinates with `latLonToWorld`.

**Indoors (`indoor-ar.js`, `indoor-nav.js`)**
- There are no world anchors. Position is **dead reckoning** (`StepDetector`, 0.7 m per step) along a precomputed route.
- A floor plan becomes real space using per-floor calibration: `meters_per_unit_x/y` (scale) and `north_offset` (compass bearing of "up" on the plan).
- The QR anchor (`qr_anchors`, one per floor, tied to one `floor_plan_node`) sets the starting point only. Heading again comes from the compass, with a manual "align" button.

**What is stored:** `buildings.lat/lng`, `campus_nodes.lat/lng`, `floor_plan_nodes.x/y` (percent of image), `floor_plans.north_offset/meters_per_unit_*`, `qr_anchors(floor_plan_node_id | campus_node_id, code)`. There is no orientation stored on the QR anchor.

---

## 3. How anchoring would work with ARCore

### Option A: Geospatial API (outdoor buildings)

- ARCore's Geospatial API localizes the phone by matching the camera view to Google's Street View data (VPS) and fuses it with GPS. It returns a camera pose with latitude, longitude, altitude and **heading with a confidence/accuracy value**.
- Each building becomes an **Earth anchor** (`earth.createAnchor(lat, lng, altitude, rotation)`) at `buildings.lat/lng`. Terrain or Rooftop anchors can place things relative to the ground or the roof so you do not have to know altitude.
- The walkway graph works the same way: one Earth/Terrain anchor per `campus_node`, or one anchor per path segment, with the ribbon drawn between them. Your `campus_nodes` lat/lng data is directly reusable.
- Anchors are stable because the phone is continuously re-localized. This is what removes the compass slant and the need for `rotateWorld()`.
- **Conditions:**
  - Needs internet during use (it queries Google). That conflicts with your current offline caching goal.
  - Needs a Google Cloud project and API setup.
  - **Verify** that your campus has Street View coverage. ARCore has a `checkVpsAvailability(lat, lng)` call. Test a few spots (gate, each building entrance) before committing. Interior campuses and private roads often have no coverage.
  - Without VPS, Geospatial falls back to GPS and compass quality, so you gain little over AR.js in that case.

### Option B: Local anchor (QR now, better marker later)

An ARCore session has its own local coordinate frame. To tie that frame to the real campus you need one known physical reference. Your QR code already plays this role, but today it provides only a point.

A full anchor needs **position + orientation**:

- **Augmented Images** (ARCore): register a printed image (or a QR printed as an image target) in an image database. ARCore returns its full 6DoF pose when seen. Position and facing direction are known to you from the pose plus your stored data.
- **Plain QR decoding** (ML Kit / ZXing) gives you the code but no reliable pose. Use it for the lookup (`qr-anchors.php?code=`), and use the Augmented Image for the pose. They can be the same printed sign if the QR sits inside a good image target.
- Once you know the marker's pose, create an ARCore **Anchor** there. Every other point is a fixed offset from it:

```
world_point = marker_pose * R(marker_bearing) * (local_offset_meters)
```

- **Cloud Anchors** let you host a spot once and resolve it later or on other devices. Hosted anchors persist for a limited time (**verify** the current TTL, which has been up to about a year with keyless auth). This could replace re-scanning, but needs internet and a Google API setup, so it is optional.

### What changes in your data model

`qr_anchors` currently links a code to a node. For ARCore it also needs the physical marker's orientation and size:

```sql
ALTER TABLE qr_anchors
  ADD COLUMN marker_bearing DECIMAL(6,2) NULL,   -- compass bearing the marker faces (deg clockwise from north)
  ADD COLUMN marker_width_m DECIMAL(5,3) NULL,   -- printed size, needed by ARCore image tracking
  ADD COLUMN mount_height_m DECIMAL(4,2) NULL;   -- height of marker center above the floor
```

Everything else is reused:
- **Indoors:** `floor_plan_nodes` (x/y %) × `meters_per_unit_*` gives plan meters. `north_offset` rotates them. In ARCore you instead rotate by `marker_bearing` so the plan is aligned to the marker, not to the compass. `north_offset` stays useful as the fallback.
- **Outdoors:** `campus_nodes` lat/lng are converted to local east/north meters around the anchor node, then placed relative to the anchor pose.

### Indoors specifically

- ARCore's visual-inertial tracking measures real movement, so **step counting and the −2 m / +2 m / "at next corner" buttons are no longer needed**. This is the biggest improvement for the indoor feature.
- Anchor once at a marker, then the ribbon follows the true path. Add more markers (for example at corridor junctions or stairs) to correct long-term drift. Your current design of one anchor per floor works as a minimum.
- ARCore does not know about floors. Floor changes need a marker per floor, which `qr_anchors` already supports (one per `floor_plan`).
- Geospatial/VPS does not work inside buildings. Indoors is Option B only.

---

## 4. Recommended design (hybrid)

1. **Gate / outdoor start:** Check VPS availability. If available, localize with Geospatial and place all building and path anchors from lat/lng. If not, require the campus QR/image scan (Option B) and place everything relative to it.
2. **Outdoor heading:** with Geospatial use its heading. With marker mode use the marker's `marker_bearing`. Either way the compass is no longer the source of truth.
3. **Entering a building:** the entrance node ties the outdoor graph to the indoor floor graph (you already have `entrance_node_id`). Scan the floor's marker to start indoor navigation.
4. **Indoors:** marker anchor + ARCore tracking + the existing floor-plan route.

---

## 5. The platform change (important)

This is the largest cost and is separate from anchoring.

- AR.js runs in a mobile browser, which is why Lampara is a PHP + Vue web app/PWA (`manifest.json`).
- **ARCore's Geospatial API and Augmented Images are not available in the browser.** WebXR on Chrome (Android) offers basic AR and hit-test, but not these features (**verify** current status). iOS Safari has no WebXR AR.
- So the student AR guide becomes a **native app**: Android (Kotlin or Unity AR Foundation, Flutter/React Native with a plugin). For iPhones, AR Foundation / ARCore SDK for iOS (which uses ARKit) is needed. Android only is a smaller scope if your users are mostly Android.
- Students must install an app instead of opening a link. Expect lower reach.

**What stays:** the whole PHP backend and APIs, the admin pages (building registration, campus paths, floor calibration), the database, the chat/AI assistant, `campus-route.js` and `floor-route.js` logic (port to the app language).
**What is rewritten:** `guide-ar.js` (A-Frame scene), `indoor-ar.js`, `ar-ribbon.js` (rendering), `indoor-nav.js` step detector. The routing and turn math are language-independent and can be ported.

---

## 6. Risks and open questions

| Risk | Impact | Action |
|---|---|---|
| No Street View/VPS coverage on campus | Option A gives little benefit | Run `checkVpsAvailability` at 10-20 spots before starting |
| Device support | ARCore supports a subset of Android devices | Check target phones against Google's supported-devices list |
| Internet required for Geospatial/Cloud Anchors | Breaks offline mode for outdoor use | Keep marker mode (B) as the offline path |
| Google Cloud setup, quotas, cost | Ongoing dependency | Confirm current pricing/quotas |
| Privacy | Camera features are sent to Google for VPS | Add disclosure; consider data policy |
| Markers get damaged or moved | Anchor error | Print durable markers, record `marker_bearing` carefully, audit periodically |
| Rewrite effort | Student app and rendering rebuilt | Keep backend/admin; migrate behind the same APIs |

---

## 7. Suggested order of work

1. **Feasibility (days):** VPS availability survey of the campus, plus a one-screen ARCore prototype that anchors one building at its lat/lng and a printed marker with a known facing.
2. **Data:** add `marker_bearing`, `marker_width_m`, `mount_height_m` to `qr_anchors` and update the admin Campus Paths / Floor Calibration pages to record them. Update `qr-anchors.php` to return them.
3. **Outdoor:** Geospatial building + path anchors, with marker fallback.
4. **Indoor:** marker-based anchoring with ARCore tracking, then remove step counting.
5. **Retire** AR.js pages once parity is reached; keep `guide.php` and manual search as non-AR fallbacks.

If the VPS survey in step 1 shows poor coverage, the project becomes marker-driven (Option B) and the main value of ARCore is stable tracking and heading, not Geospatial.
