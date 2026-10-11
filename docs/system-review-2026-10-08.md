# Lampara: full system review

Reviewed 8 October 2026. Supersedes the "Verdict" and "Risks" sections of `system-assessment.md` (1 October), which are partly out of date (see 9).

**Method.** Read the shared theme, all key views, every API endpoint's auth/validation/upload path, the schema, the service worker and the Gemini integration. Ran `php -l` on every PHP file and `Backend/scripts/setup-audit.php` against the live local database. **Not done:** no browser run, no real-phone AR trial, no call to the live Gemini service, no load test, no deployed-HTTPS check. The test suites quoted in the 1 October assessment are not in the repository, so they could not be re-run here.

## 1. Verdict

| Use | Ready? |
|---|---|
| Demo on the admin's laptop | **Yes** |
| Supervised pilot over HTTPS | **Yes, after the "Before pilot" list in section 8** |
| Open release to all students | **No.** Needs a real-phone AR trial, the security fixes in 3, a commit/backup routine, and data calibration |

The code is well structured and the write paths are properly gated. The risks are mostly **operational** (nothing committed, a secret that is one `git add .` from being published, no backups, no tests in the repo) and **unverified** (AR accuracy on a real device), with a handful of moderate security gaps that are cheap to close.

## 2. Scorecard

| Area | Rating | One-line reason |
|---|---|---|
| Architecture / structure | Good | Clean View/Css/Js/Backend split, one API file per resource, shared theme |
| Data model | Good | InnoDB, foreign keys with sensible cascades, unique keys on rooms and edges |
| Authentication | Fair | Bcrypt + session regeneration + login throttle, but the throttle is global behind a proxy and cookies are not hardened |
| Authorization | Good | Every POST/PUT/DELETE endpoint checks the admin session |
| Input handling | Good / Fair | Prepared statements throughout; uploads and SVG handled, but some size and content gaps |
| Secrets management | **Poor** | Live key in an un-ignored, untracked file; key also in a second location |
| Frontend quality | Fair | Consistent design system, but unfinished rebrand, heavy inline styles, weak accessibility |
| Accessibility | **Poor** on student/AR pages | No ARIA on four pages, 9-11px text, low-opacity text, zoom disabled |
| Offline / PWA | Good | Thoughtful service worker, public/private cache split, wipe on logout |
| Reliability / ops | **Poor** | 82 uncommitted changes, no backups, schema changes only as SQL comments, no tests in repo |
| Performance | Fair | Small payloads; many render-blocking CDN scripts and fonts |
| Documentation | Good | 9 docs; some now stale |

## 3. Security findings

No SQL injection found: every request value reaches the database through a bound parameter. The only raw `query()` calls interpolate integer-cast id lists or constants (`campus-graph.php:52-60`, `floor-plan-graph.php:50-58`, `:234`).

### High

**S1. A live Gemini key sits in a file that git would commit.**
`config/secrets.php` contains a real-looking key. `.gitignore` only lists `Backend/secrets.php` and `Backend/db.php`, and `git ls-files config` is empty, so the file is untracked *and* not ignored. The next `git add .` publishes it. It is also a stray duplicate: the code only reads `Backend/secrets.php`.
*Fix:* delete `config/` (or add it to `.gitignore`), and treat the key as exposed: rotate it at https://aistudio.google.com/apikey. (This review's own terminal output echoed that key, so rotate it regardless.)

### Medium

**S2. The login lockout and the rate limits key on `REMOTE_ADDR`.** The plan is to serve through ngrok or a reverse proxy; behind one, every visitor shares the proxy's address. Consequences: eight wrong passwords from *anyone* lock the real admin out for 10 minutes (a trivial denial of service), and the 90-per-minute chat/scan bucket is shared by the whole campus. The counter files are also never cleaned from the temp folder.
*Fix:* read the client address from a trusted `X-Forwarded-For` only when the request comes from your own proxy; key the login limit on username **and** address; prune old `lampara_rl_*` files.

**S3. Public flag submission is unauthenticated, unthrottled and unbounded** (`flags.php` POST). `note` has no length cap and there is no rate limit, so the admin dashboard's "open reports" list can be flooded.
*Fix:* `rate_limit_or_die('flag', 10, 60)`, cap `note` at ~500 characters, cast and verify `room_id`.

**S4. Chat input is unbounded** (`chat.php`). `message` and each `history` entry have no length limit, so one request can send a very large prompt; the 90/min limit then bounds count but not cost. A client can also forge `model` turns in `history`.
*Fix:* cap message length (~500 chars), cap history entries and total size, ignore client `model` turns or accept only the last few.

**S5. No CSRF defence on admin writes.** Endpoints read `php://input` without checking `Content-Type`, session cookies are not set `SameSite`/`HttpOnly`/`Secure` anywhere (`grep session_set_cookie` finds nothing), and CORS is `*` on every API. Chrome's default `Lax` limits the exposure, other browsers do not.
*Fix:* call `session_set_cookie_params(['httponly'=>true,'samesite'=>'Lax','secure'=>true])` before `session_start()`, and require `Content-Type: application/json` on writes.

### Low

- **S6. SVG sanitiser is a blacklist** (`static-maps.php:57-80`). It strips scripts, `foreignObject` and `javascript:` hrefs, but not `<style>` with `@import`, `<animate>/<set>` attribute tricks, or external `<use>`. The file is served from its own URL. Admin-only upload, so it needs a compromised admin; prefer an allow-list or serve uploads with `Content-Security-Policy: sandbox` / `Content-Disposition`.
- **S7. Floor-plan upload checks only the data-URL prefix** (`floor-plans.php:105-115`); the bytes are not verified. `static-maps.php` already does this with `getimagesizefromstring`; reuse it.
- **S8. `die()` on database failure prints the driver message** (`Backend/config.php`). Log it, show a generic message, and set `display_errors=Off` on the live PHP.
- **S9. Wide-open CORS (`*`) on every endpoint**, including the admin ones. Harmless without credentials, but scope the admin endpoints to your own origin.
- **S10. The Gemini key travels in the request URL** (`chat.php`, `scan.php`). Fine server-side, but a logged URL would leak it; Google also accepts an `x-goog-api-key` header.
- **S11. Default database login is `root` with no password** (`config.php` fallback). Fine on XAMPP, never on a live host.
- **S12. Chat output is rendered with `v-html`**, but `formatMessage` HTML-escapes first (`guide-ar.js:1715`), so this is safe. Keep it that way; add a comment so nobody "simplifies" it.

## 4. Backend and data

- **Schema changes live in comments.** `schema.sql` lines 10-30 are `ALTER`/`CREATE` statements to be pasted by hand. There is no migration table, so the local and live databases will drift (the 1 October assessment already records this happening). *Fix:* a `schema_version` table and numbered migration files, or at least one idempotent `Backend/scripts/migrate.php`.
- **`sync_ops` / `sync_temp_ids` grow forever.** Add a cleanup of rows older than ~30 days.
- **Cascades are sound** (deleting a building removes rooms, plans, nodes; entrances `SET NULL`). One thing to confirm: deleting a floor plan or building unlinks the image file (`floor-plans.php:197-199`), but a failed DB write after the file is gone would orphan the row. Order the operations or tolerate a missing file on read.
- **Room numbers are `UNIQUE` across the whole campus**, not per building. If two buildings ever reuse "101" this blocks registration. Confirm that is intended.
- **Gemini model is `gemini-flash-lite-latest`.** The floating alias is convenient but changes behaviour without a deploy; pin a version once you have tested.
- **No AI cost ceiling.** Rate limits help; add a daily cap (a counter file or table) so a bug cannot exhaust the quota.
- **`ping.php`** is a sound design (no session started for anonymous visitors).

## 5. Frontend and UX

(Full detail in the earlier UI review; the items that matter for the verdict.)

1. **Test/debug UI is public.** `guide-ar.php` is titled "AR Guide (test)", the gate says "Start Lampara (AR test)", there is an "AR debug" button and a build label, and it is the landing page's main call to action.
2. **Accessibility.** No `aria-` on `scan`, `indoor-ar`, `guide`, `ar-test`, `test-chat`; icon-only buttons lack names; inputs rely on placeholders; 24 font-size rules at 9-11px; many `text-white/30-50` and `#9a9ab0` text colours below 4.5:1; zoom disabled on three pages.
3. **Rebrand unfinished.** Tailwind `emerald` classes are remapped with `!important` in `brand-ar.css`; `--green-*` / `--moss-*` tokens now hold blue/yellow; stale `#22c55e` and old-blue glow values remain; `manifest.json` `theme_color` is `#3965a7`, not the brand `#2e3192`; README still describes the "amber" system.
4. **Maintainability.** `buildings.php` is 1,140 lines with 126 inline styles; `scan.php` has 60; `map.css` has 47 raw hex values.
5. **Runtime dependencies from CDNs** (Vue, SweetAlert2, Tesseract, jsQR, A-Frame, three.js, fonts). The service worker caches them after first load, but a first visit with a weak signal fails, which is the case the product exists for. Vendor them.
6. **Strengths worth keeping:** shared theme tokens, data-driven admin nav, skeleton loading, offline status strip, the landing page hero, `100dvh` handling on camera pages.

## 6. Reliability and operations

| Item | State | Risk |
|---|---|---|
| Version control | 41 commits, last is `a830bbe`. **82 uncommitted changes** (47 modified, 7 deleted, 35 untracked, ~1,400 lines changed) including the whole rebrand and new endpoints | One disk failure loses weeks of work; no rollback point |
| Backups | None scheduled. Earlier backups are in a temp scratch folder | Data loss |
| Tests | **None in the repository.** The 228-check suites cited on 1 October are not committed | Cannot re-verify; regressions will go unnoticed |
| PHP syntax | All files pass `php -l` | OK |
| Monitoring | None; AR errors surface only in the user's console | Pilot problems will be invisible |
| HTTPS | Not set up; camera, compass and GPS require it | Blocks the AR on any real phone |
| Line endings | Git warns LF→CRLF on ~28 files | Noisy diffs; add a `.gitattributes` |

## 7. AR and data readiness

Re-ran the read-only audit just now: **13 items to fix, 8 tips** (1 October: 11 and 10).

- **Gemini key:** now present in `Backend/secrets.php` (audit passes). The live call was not exercised here.
- **Indoor AR is off for every floor except Amafel 1st**: the others are not calibrated (Amafel 2nd/3rd/4th, Annex 2nd/3rd/4th, plus the Annex 1st plan).
- **Annex 1st floor (plan 32):** no walkable path and no stairs link.
- **Gymnasium:** no entrance, so outdoor routing to it fails.
- **Annex rooms 2206, 2211:** no plan marker.
- **JEG, Heritage, Gymnasium, Multipurpose:** no floor plans (text directions only).
- **Accuracy is the main product risk.** Step counting and phone compass drift (10-30° near metal); floor-plan photos are skewed. Nothing here has run on a device. This is the single most important unknown.
- **Tips:** four straight-hallway points can be removed on Amafel 1st; three connections are slightly off-axis; the Comfort Room has no number, so sign scanning cannot find it.

## 8. Prioritised action list

**Do today (30 minutes)**
1. Rotate the Gemini key; delete `config/secrets.php` or ignore `config/`.
2. Commit the work in logical chunks (rebrand, indoor/AR, backend) and push. Add `.gitattributes`.
3. Take a database dump and store it outside the project folder.

**Before pilot**
4. Serve over HTTPS and fix proxy-aware client IPs (S2).
5. Add the flag rate limit and length caps (S3, S4); cookie hardening and JSON content-type check (S5).
6. Remove "test" / "AR debug" / build label from the student AR page (or show only to an admin session).
7. Calibrate the floors you will test, then walk one outdoor and one indoor route on a real phone.
8. Set `display_errors=Off`, create a strong admin password, and use a non-root DB user on the live host.

**Before open release**
9. Move the browser test suites into the repo (`tests/`) and run them in CI.
10. Add a migration script and a schema version table; retire the SQL-in-comments approach.
11. Accessibility pass: names for icon buttons, labels for inputs, minimum 12px text, contrast, allow zoom on non-camera overlays.
12. Finish the rebrand (rename `emerald`/`green` classes and tokens, manifest colour, README).
13. Vendor CDN libraries and precache them; split `buildings.php` into components.
14. Daily AI quota guard, simple error logging for AR failures.

## 9. Corrections to the 1 October assessment

- "Gemini key missing" is no longer true locally; `Backend/secrets.php` exists.
- "Nothing is committed (55+ changed files)" is now 82 changed files since the last commit.
- Its test counts cannot be reproduced from this repository.
- Its note that "all 7 floors are uncalibrated" is now 6 of 8 plans with a path (Amafel 1st is calibrated; the Annex 1st plan has no path yet).
