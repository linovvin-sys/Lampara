# Brief 2: institution config (branch `institution-config`)

**Goal:** everything specific to one school (name, logo, theme, tagline, AI persona, contacts, campus boundary, map centre, feature switches) lives in one database record that an admin edits on a Settings page. Defaults equal today's NCST values, so **nothing visibly changes until someone edits settings**.

Do not build a plugin system, a rules engine or multi-tenancy. One record, one endpoint, one page, a few switches.

## Start prompt

> Read `docs/work-briefs/README.md` and `docs/work-briefs/02-institution-config.md`. Do the tasks in order on branch `institution-config`, committing after each. Stop after task 3 and tell me to check the Settings page before you start task 4.

## Design (fixed, do not redesign)

**Table `institution`** (one row, `id = 1`), created on first use with the same helper pattern as `Backend/api/enrollment-steps.php` (`*_run` function that creates the table when error 1146 occurs):

| Column | Type | Default (today's value) |
|---|---|---|
| `name` | VARCHAR(120) | `National College of Science and Technology` |
| `short_name` | VARCHAR(30) | `NCST` |
| `tagline` | VARCHAR(160) | `Find your way around campus.` |
| `logo_path` | VARCHAR(255) NULL | NULL (keeps `assets/logo.svg`) |
| `theme` | VARCHAR(20) | the current theme key from `Css/theme-vars.css` |
| `persona` | TEXT | the current NCST sentence from `Backend/chat_lib.php` line ~154 |
| `contact_email`, `contact_phone` | VARCHAR(120) NULL | NULL |
| `center_lat`, `center_lng` | DOUBLE | `14.3283`, `120.9408` (`guide-ar.js` lines 63-64) |
| `bounds` | JSON text | `[[14.32685,120.93987],[14.32880,120.94248]]` (`campus-bounds.js` line 13) |
| `features` | JSON text | `{"enrollment":true,"game":true,"hazards":true,"chat":true}` |

**Helper** `Backend/institution.php`: `institution_get(mysqli $conn): array` (row merged over the defaults above, decoded JSON), cached per request.

**Endpoint** `Backend/api/institution.php`: `GET` public (cacheable, short `max-age`); `POST` admin only and **not** allowed for the PSMO role (check `lampara_psmo_allows` in `Backend/session_boot.php`, leave it off). Validate lengths, numeric ranges, the bounds shape, and that `theme` is one of the known keys. Write an `audit_log` entry on save.

**Delivery to the browser:** views are PHP, so strings are rendered server-side (`htmlspecialchars`). JavaScript that needs values (boundary, centre) reads `window.LAMPARA_CONFIG`, printed by a new include `Frontend/View/Include/config-script.php` placed **before** `campus-bounds.js`. Pages that load `campus-bounds.js` today: `Student/report.php`, `Student/scan.php`, `Public/guide-ar.php`, `Public/map.php`, `Admin/building-outlines.php`, `Admin/campus-paths.php`, `Include/buildings-head.php`. `campus-bounds.js` falls back to its current constant when the config is missing.

## Tasks

### 1. Backend (45 min)
Table helper, `Backend/institution.php`, `Backend/api/institution.php`, schema note in `Backend/schema.sql`. Test with `curl` (GET returns the defaults; POST without a session returns 401).

### 2. Settings page (60 min)
`Frontend/View/Admin/settings.php` + `Js/Admin/settings.js` + `Css/Admin/settings.css`, nav entry "School settings" in `Frontend/View/Include/admin-nav.php` under "Your account" for admins only (hide for PSMO). Follow the look of `account.php` and the existing admin pages (light shell, `admin-v2.css`). Fields: the columns above; bounds as two corner pairs with a "Use the current map view" button on a small Leaflet map; feature switches as toggles; theme as a picker of the existing palettes. Save shows a toast; nothing else on the page.

### 3. Pause here
Open the page, change the short name, save, reload. Tell the user to check it.

### 4. Replace hard-coded values (2 h)
Make each of these read the config (server-side `<?= ... ?>` for views, `LAMPARA_CONFIG` for scripts):

| File | Line (approx.) | Replace |
|---|---|---|
| `Frontend/View/Public/index.php` | 13, 65, 73, 267 | "NCST", "Enrolling at NCST?", description, tagline |
| `Frontend/View/Public/ask.php` | 12 | meta description |
| `Frontend/View/Public/map.php` | 46 | "NCST campus" caption |
| `Frontend/View/Student/enrollment.php` | 44 | the "Amafel Building (Main), 1st Floor" sentence: drop it (steps already carry their place) |
| `Frontend/View/Admin/building-edit.php` | 53, 106 | placeholder "Amafel Building (NCST)" → generic example |
| `Backend/chat_lib.php` | 154 | persona sentence → `institution_get()['persona']` with `{short_name}` substituted |
| `Frontend/Js/Include/campus-bounds.js` | 13 | `BOUNDS` from config |
| `Frontend/Js/Public/guide-ar.js` | 63-64 | default centre from config |
| `Frontend/Js/Admin/building-outlines.js`, `campus-paths.js`, `manage-buildings.js` | 10, 385, 29 | map default centre from config |
| `Frontend/Js/Include/building-doors.js` | 14 | delete the `KNOWN` map (building ids and point names baked into the client); doors already come from the database |
| `Frontend/Js/Include/enrollment-steps.js`, `Js/Student/enrollment.js`, `Js/Student/journey.js` (~170), `Js/Admin/enrollment-steps.js` (169, 210) | various | built-in "NCST steps" and "Houses of Hero": keep as the fallback only when `features.enrollment` is on **and** no saved steps exist; remove the `/amafel/` regex and pick the building by name from data |

Logo: where `assets/logo.svg` is used in student and admin headers, use `logo_path` if set.

### 5. Feature switches (45 min)
- `enrollment` off: hide the home banner, the floating Enrollment button (`Js/Include/enroll-fab.js`), the nav item, and make `Student/enrollment.php` redirect to home.
- `game` off: hide the points/streak/quests bar on `index.php`, `guide-ar.php`, `manual-search.php`.
- `hazards` off: hide report links and the admin Reports nav item.
- `chat` off: hide Ask links.
Bump `VERSION` in `Frontend/sw.js` so phones drop old caches.

### 6. Check and push
Compare the home page and the Ask page before and after with default settings (should be identical). Then set short name "TEST", turn two switches off, confirm the pages change, set defaults back. Push the branch.

## Not in this brief
Multi-tenant, translation of strings, room-number rules, deleting indoor AR (brief 1), data pack (brief 3).

## Done when
Defaults reproduce today's UI; every row in the task 4 table reads config; switches work; branch pushed; "Result" filled in below.

## Result
Done on branch `institution-config` (built on `cleanup`).

- **Backend:** `Backend/institution.php` (defaults = today's NCST values, `inst()`, `inst_h()`, `inst_feature()`, `inst_persona()`, validation), `Backend/api/institution.php` (public read incl. `?format=js`, admin-only write and logo upload, PSMO refused, audit entry on save). The `institution` table is created on first use. With no row, everything reads the defaults, so a fresh install looks exactly as before.
- **Settings page:** Admin > School settings (`settings.php`, admin only, not in the PSMO menu): name, short name, headline, logo upload, default theme, assistant introduction (`{short_name}` placeholder), contact, campus area (map + "use the current map view"), four feature switches.
- **Replaced hard-coded values:** home, Ask and Map wording, the logo on the home page, headline, `campus-bounds.js` boundary, `guide-ar.js` centre, the building-outlines map centre, the default theme in `theme.js`, the AI persona sentence in `chat_lib.php`, and the building-id door map (`KNOWN`) in `building-doors.js` (doors come from the database). Placeholders in the admin (building name, map names) are generic.
- **Enrollment:** the built-in NCST steps now apply only while the short name is `NCST` and no steps are saved; any other school starts with none and the page says so. The "seven steps" sentence is counted from the steps in use (this also fixes the seven-versus-nine mismatch). "Houses of Hero" labels became "Houses"; the house names themselves are still an NCST sample in `enrollment-steps.js`.
- **Feature switches:** enrollment, game, hazards, chat. Switched-off features hide their links and widgets everywhere (classes on `<html>` set by `theme.js`, rules at the end of `theme.css`), the pages `enrollment.php`, `report.php`, `ask.php` redirect home, and the admin menu drops Reports, Enrollment steps and Try the chat. The APIs stay available; this hides the UI, it is not a security boundary.
- **Checked:** with defaults, the home page looks identical to before; changing the short name and headline changed the home page, the enrollment banner and the chat persona; bad bounds are refused; all four switches off then on again; 10 student pages and 6 admin pages load without console errors (only the old OCR CDN error on `scan.php`). Test settings were deleted afterwards, so the install is back on defaults.
- **Service worker** bumped to `lampara-sw-v38`.
- **Not done:** the room-number rule is still fixed (building digit + floor digit); no translation; the first-visit page for a non-NCST school with no steps is only a message.
