# Lampara: complete system evaluation

Evaluated 14 October 2026 by Claude (AI), for the Lampara thesis team.
Builds on `system-review-2026-10-08.md` and `system-assessment.md`; where those are now out of date, this file says so.

**Scope (revised at the team's request):** the system as shipped, **without** the `ar-lab/` and `indoor-lab/` experiment folders and **without** `tests/`. **Indoor AR is not part of the product**: the evaluation judges outdoor AR guidance, indoor floor-plan routing, the directory, the assistant and the admin tools. Indoor-AR code that is still in the repository is treated as leftover and listed in 2.4.

---

## 0. Scope, method, and what this evaluation cannot tell you

**Done (everything below is backed by something I ran or read today):**

| Activity | What |
|---|---|
| Code read | Backend (53 files, ~5.8k lines), Frontend JS (71 files, ~16.5k), CSS (~5.2k), views (~5.5k), schema, service worker, Gemini integration |
| Live probes | Black-box requests against the running site: file exposure, unauthenticated writes, headers, directory listing, payload sizes |
| Student walk-through | All 14 public/student pages opened at phone size (390 px) with a simulated on-campus GPS and fake camera; screenshots, load weight, console errors |
| Accessibility scan | axe-core 4.10 run on every one of those pages |
| Data audit | `Backend/scripts/setup-audit.php` and row counts on the live local database |
| Excluded by request | `ar-lab/`, `indoor-lab/`, `tests/`, and indoor AR as a feature |
| Admin side | Used and rebuilt the admin UI in this same session; two of its bugs were caused by me and are listed in 2.7 |

**Not done, and it matters:**

- **No real-phone AR trial.** Outdoor camera guidance (GPS, compass, path overlay) was not tested on an actual Android/iPhone. This is the product's biggest unknown (see 5.3).
- **No user study.** Every "student / parent / professor" judgement below is an expert walk-through, not data from real people.
- **No load or performance test**, no HTTPS deployment check, no live Gemini call.
- **Not a full penetration test.** It is a black-box probe plus code review. No OWASP ZAP/Burp run, no authenticated fuzzing.

Treat the ratings as informed expert opinion. For the thesis, the missing pieces above are exactly what your evaluation chapter has to produce (section 6).

---

## 1. Verdict in one page

**Lampara is a strong thesis candidate and a promising, not-yet-sellable product.**

| Question | Answer |
|---|---|
| Worth submitting as a thesis? | **Yes.** It combines browser-based AR navigation, floor-plan indoor routing without beacons, an offline-first PWA and a record-grounded AI assistant, on real campus data, with an admin toolchain. That is more than most capstones. |
| What could sink it at defense? | Unproven outdoor AR accuracy, no measured user results, and leftover indoor-AR code that contradicts the stated scope. All fixable. |
| Sellable today? | **No.** It is single-campus by construction (section 7). It becomes sellable after a configuration layer and basic operations are added. |
| Safe to pilot on campus? | **Yes, supervised, after the "Before pilot" list in section 8.** Security basics are in good shape; operations are not. |

### Scorecard (1 = poor, 5 = excellent)

| Dimension | Score | One-line reason |
|---|---|---|
| Concept & novelty | 4.5 | No-install AR + indoor plan routing + grounded AI, offline-capable |
| Student UI/UX | 4.0 | Distinctive, clear primary actions; a few real dead ends and overlaps |
| Admin UI/UX | 3.5 | Much better after today's rebuild; still heavy authoring work per floor |
| Frontend engineering | 3.0 | Works and is consistent, but global-script architecture and very large files |
| Backend engineering | 3.5 | Safe SQL and sound auth; schema changes at runtime and no migrations |
| Security | 3.5 | Most of the 8 Oct findings are fixed; new smaller ones found (2.6) |
| Accessibility | 3.0 | Big improvement (zero axe violations on 5 of 13 pages); the AR camera guide blocks zoom |
| Quality assurance | 2.5 | Tests excluded from scope; manual checks found 9 data-setup problems and 2 admin regressions caused during this session |
| Scalability | 2.5 | Fine for one campus; authoring effort and single-tenant design are the limits |
| Flexibility / reuse | 2.5 | Many things are admin-editable, but ~30 hard-coded NCST references remain |
| Data accuracy today | 3.0 | 9 setup problems, 11 rooms without numbers, 13 without plan markers |
| Code hygiene | 2.5 | About 1,200 lines of indoor-AR code, an unused test page and calibration plumbing remain |
| Educational value | 4.0 | Orientation, enrollment guide, accessibility potential; no inclusive routing yet |
| Operations & delivery | 2.0 | 121 uncommitted changes, no CI, no migrations, no monitoring |

---

## 2. Professional reviews

### 2.1 Frontend developer

**Strengths**
- One shared theme (`theme.css`, five switchable palettes in `theme-vars.css`), consistent components, skeleton loading, an offline status strip, and a thoughtful service worker (network-first, saved copy when offline, CDN libraries now vendored under `assets/vendor`).
- 359 ARIA/role attributes across student views and 235 across admin views; a big jump since the 8 Oct review.
- Pages open without script errors on 13 of 14 student pages (the exception is the OCR worker, below).

**Findings**

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | **No module system.** Plain `<script>` tags and global names (`AdminOffline`, `BuildingDoors`, `LamparaEnroll`…). Load order bugs are easy to introduce; I hit one today when an embedded page lost `AdminOffline` because a shared include was skipped. | `Js/Include/*` | Medium |
| F2 | **Very large files.** `guide-ar.js` 1,323 lines, `campus-paths.js` 988, `register-building.js` 906, `map.js` 845, `scan.js` 807. Hard to test or change safely. | `wc -l` | Medium |
| F3 | **Inline styles and `!important`.** 167 `style="…"` attributes in views and 143 `!important` in CSS (mostly rebrand overrides). | grep | Low |
| F4 | **Page weight is high on the entry pages.** Landing page: 168 requests, ~885 KB. Campus map: 118 requests, ~3.1 MB. Outdoor camera guide: ~0.8 to 1.7 MB. Matters on campus Wi-Fi and 4G. | Playwright response log | Medium |
| F5 | **Sign-reading OCR depends on a CDN.** On the scan page the Tesseract worker's `importScripts` from `cdn.jsdelivr.net` failed in my run, so sign scanning may fall back silently. | console error, e2e smoke | Medium |
| F6 | **CSP allows `unsafe-inline` and `unsafe-eval`.** Needed today because of inline handlers/Vue templates, but it weakens the policy. | response header | Low |
| F7 | **Two overlap bugs on student pages.** The floating "Enrollment" button covers list content on the landing page and room search. | screenshots | Low |
| F9 | **Leftover indoor-AR code and a public test page.** See 2.4 for the list. `ar-test.php` is reachable by URL and is the only user of the 1.3 MB A-Frame library. | file search | Low-Medium |
| F8 | **Documentation drift.** README still describes the "amber lamp glow" system and the old file layout. | `README.md` | Low |

**Top fixes:** vendor the OCR worker and language data; lazy-load the 3D/AR libraries so the landing page stays under ~300 KB; move the biggest files into modules (even native ES modules, no build step needed).

### 2.2 Backend developer

**Strengths**
- Every value from a request reaches SQL through a bound parameter. The only interpolated queries use integer-cast id lists or constants (`campus-graph.php`, `floor-plan-graph.php`).
- Sensible schema: InnoDB, foreign keys with correct cascades, unique keys on edges and floors.
- Good operational touches: audit log, change log with Undo, rate limiting, EXIF stripping and AI moderation on uploaded photos, public/private cache split.
- No third-party PHP dependencies, so a small supply-chain surface.

**Findings**

| # | Finding | Evidence | Severity |
|---|---|---|---|
| B1 | **Schema changes happen inside web requests.** `ALTER TABLE … ADD COLUMN` runs from `hazards.php:81`, `admin_roles.php:22` and (as of today) `building_open.php`. It forces the web DB user to hold `ALTER` rights, can race under concurrent first requests, and hides schema history. | grep | Medium |
| B2 | **No migrations.** `schema.sql` still carries upgrade statements as comments (lines 10-30). Local and live databases will drift. | `schema.sql` | Medium |
| B3 | **A fragile helper bit me today.** `column_exists()` caches "missing" for the rest of the request, so adding then checking a column in the same request silently failed. I had to bypass it. | `change_log.php:9` | Low |
| B4 | **Everything is returned, always.** `rooms.php` returns all rooms every time (53 KB for 124 rooms, about 430 bytes per room). No pagination, no `ETag`/`If-Modified-Since`. | curl | Medium at scale |
| B5 | **Inconsistent API conventions.** Mixed status codes for the same situation (400 vs 401 vs 403), no versioning, ad-hoc `success` flags. | probes | Low |
| B6 | **Door and path edits are not audited.** The audit log records logins and a few actions; changing a building's entrance/exit leaves no trace, so I could not tell who set Heritage's doors. | `audit_log` | Low |
| B7 | **Account management is command-line only.** There is no admin UI to create staff, reset a password, or disable a user. | `Backend/scripts/` | Medium for a real deployment |
| B8 | **`die()` on database failure** returns a generic message (good) but gives nothing to monitor. No error logging, health endpoint or uptime signal. | `config.php` | Low |

**Top fixes:** a numbered migration runner (one idempotent `migrate.php` is enough for a thesis), `ETag` on `rooms.php`/`buildings.php`, audit entries for door and path writes.

### 2.3 UI and UX designer

**Strengths**
- The student app has a recognisable identity (pixel lamp mascot "Lumi", night-sky scenes, chunky yellow call-to-action). It feels designed, not templated.
- Primary actions are unmistakable: "Start navigating", "Enrolling at NCST?", "Show me the way".
- Honest empty/error states ("Answers only from campus records", "Outside route only").

**Findings**

| # | Finding | Severity |
|---|---|---|
| U1 | **The game layer competes with the task.** Points, streaks and "Quests 0/3" sit above the building list on the home and guide screens, and copy such as "your quest begins!" reads oddly to a parent or professor. Make it optional or tuck it behind a profile. | Medium |
| U2 | **Pixel display font reduces legibility** for headings and chips (e.g. "Find a room", filter chips). Body text is fine. Keep it for the logo and mascot moments, not for functional labels. | Medium |
| U3 | **Dead ends.** The off-campus gate ("You are not on the campus… about 30.5 km away") offers only "Check again", with no link to the map or the room directory, which stay open. The journey page with no route shows "We couldn't find that room" and a blank screen below. | Medium |
| U4 | **Floating Enrollment button** overlaps content on at least two pages. | Low |
| U5 | **Copy contradicts data.** The enrollment page says "Seven steps" while the progress panel says "0 of 9 stops". The step list is admin-editable, so static numbers in copy will always drift. | Medium (accuracy) |
| U6 | **Two design languages.** The playful student app and the quiet, light admin are far apart. That is defensible (different jobs) but should be a deliberate, documented choice. | Low |
| U7 | **Admin, after today's rebuild:** clearer navigation (Buildings workspace with Details / Rooms / Entrance & exit), tap-to-set doors on the floor plan, a guided enrollment builder. Remaining weight: drawing walkable paths per floor is still slow and expert-only. | Medium |

### 2.4 Full-stack developer

**What is well integrated:** one source of truth (database → JSON API → offline-cached PWA) feeds the map, the AR guide, the chat and the directory. Offline admin edits queue and sync with conflict detection (`base_updated_at`). That is a mature pattern for a student project.

**What limits it end to end**
1. **The real bottleneck is data authoring, not code.** To make one building navigable an admin must pin it, upload each floor plan, trace walkable paths, link stairs, set doors, add rooms with numbers and place their markers, and (for indoor AR) calibrate each floor. The current database shows the cost: 13 floor plans needed 224 hand-placed path points and 225 connections. Multiply by a second campus.
2. **Indoor AR is out of the product but still in the code.** Because the feature was dropped, these are now dead weight that makes the system harder to read, test and explain at a defense:
   - pages and scripts: `View/Student/indoor-ar.php`, `Js/Student/indoor-ar.js` (524 lines), `locar-indoor.js` (200), `Js/Include/indoor-nav.js` (156), `ar-ribbon.js` (151, not loaded by any page);
   - a "Use my camera inside" button and its calibration gate in `scan.php` / `scan.js` (`arGuideUrl`), and a camera-route comment in `journey.js`;
   - calibration plumbing: `floor-plans.php?action=calibrate`, the `calibration.set` sync operation in `admin-sync.php` and `admin-offline.js`, the `north_offset` and `meters_per_unit_*` columns, calibration lines in `setup-audit.php`;
   - the test page `ar-test.php` (+ `ar-test.js`, `ar-test.css`) and the 1.3 MB `assets/vendor/aframe/` it alone needs;
   - cache entries for `indoor-ar.php` in the service worker and `student-offline.js`.
   About 1,200 lines of script and markup in total, plus the plumbing. Removing it is low risk and sharpens the thesis scope; see the roadmap.
3. **The admin pipeline is the real cost of adding a building,** not rendering: see 1.
4. **Repository hygiene:** the last commit was today at 12:25 and there are now **121 uncommitted paths** (75 modified, 41 new, 5 deleted), including the whole admin redesign. One bad day away from losing work.

### 2.5 User tester (expert walk-through)

Ranked usability issues, with the page they appear on:

| Sev | Issue | Where |
|---|---|---|
| High | A visitor off campus hits a dead end with no way forward | AR guide gate |
| Low | A dormant "Use my camera inside" button and "needs calibrating" messages remain in the code for a feature that is no longer part of the product | Find a room result |
| Med | Three permission prompts in a row (location, camera, motion/compass) before anything useful happens | AR start |
| Med | "Seven steps" vs "nine stops" | Enrollment guide |
| Med | Points/streak/quests dominate the first screen | Home, guide |
| Med | Stairs, comfort rooms and other rooms with no number appear as "No number" in search | Find a room |
| Low | Floating Enrollment button hides list rows | Home, Find a room |
| Low | "Gymnasium · Outside route only" is correct but unexplained | Building picker |
| Low | Map labels clip at the screen edge ("Felix Amada building(Annex) – Entrance") | Campus map |

### 2.6 Penetration tester (black-box probe plus code review)

**Held up under test**
- Unauthenticated writes to 13 admin endpoints (buildings, rooms, floor plans, graph, static maps, enrollment steps, fence, sync, doors, QR anchors, photos, changes) all returned 401.
- Project internals are not downloadable: `Backend/config.php`, `secrets.php`, `db.php`, `schema.sql`, `Backend/scripts/*`, `backups/`, `tests/`, `tools/`, `.git/`, `docs/`, `README.md` all return 404; `.htaccess` returns 403.
- Cross-site login and cross-site admin writes are refused (origin check).
- Session cookie is `HttpOnly` and `SameSite=Lax` (`Secure` on HTTPS). A script dropped into the photos folder does not execute.
- CSP, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` are present. No open CORS header on API responses.
- Login lockout after repeated failures; optional TOTP two-step sign-in exists. SQL injection: none found.
- The leaked-key problem from 8 Oct (a `config/secrets.php` that git would commit) no longer exists on disk; rotating the key is still prudent.

**Findings**

| # | Finding | Severity | Fix |
|---|---|---|---|
| P1 | **Directory listing is on** for `/Backend/api/` and `/Frontend/Js/Admin/` (HTTP 200 with a file index). It maps the whole API surface for an attacker. | Medium | `Options -Indexes` in `.htaccess` |
| P2 | **CSP `unsafe-inline` + `unsafe-eval`** weakens XSS containment. | Low-Med | Move inline handlers out; Vue's compiled build avoids `eval` |
| P3 | **Rate limits keyed on a client-controlled cookie** (`lampara_dev`) can be dodged by rotating the cookie; the IP-keyed limits remain. | Low | Key on IP (trusted proxy header) plus username |
| P4 | **Login lockout can be abused as denial of service** against a known username (8 failures lock the account 10 minutes). | Low | Lock by username+IP; add CAPTCHA/backoff |
| P5 | **Web DB user needs `ALTER`** because of runtime schema changes (B1). Least privilege is violated. | Low | Migrations run by a separate DB user |
| P6 | **Defaults are laptop-grade:** `root` with no password fallback, `display_errors` depends on PHP config, `X-Powered-By: PHP` header leaks the version. | Low (ops) | Production checklist (section 8) |
| P7 | **Two staff accounts, neither with two-step sign-in on.** I also created a `psmo` account today with a generated password shared in chat. | Low | Change that password now; turn on 2FA for admins |
| P8 | **Third-party data flow:** visitor chat text and report photos go to Google's Gemini API. The privacy page names it, but a retention/consent statement and a data-processing note are needed for the Data Privacy Act (RA 10173), especially for minors. | Medium (compliance) | Privacy impact assessment; consent text |
| P9 | **Unverified:** chat endpoint limits the history (8 turns x 600 chars) and request rate (90/min), but I did not confirm a length cap on the newest message itself. | Check | Cap at ~500 chars |

Not covered: full OWASP ZAP scan, authenticated IDOR testing across roles beyond the PSMO restriction check, upload fuzzing, DoS.

### 2.7 Quality assurance

The `tests/` folder was excluded from this review at the team's request, so nothing below rates automated test coverage. What QA can say from the running system:

**Defects found by hand**
- **Two admin regressions were introduced during this review session and were found by the owner, not by any check:** the door markers vanished (a code comment swallowed the line that loads saved doors) and a popover could not be closed (a CSS rule overrode the `hidden` attribute). Both were fixed. They show that admin-UI behaviour has no safety net outside the tests that were set aside.
- The enrollment page says "Seven steps" while listing nine stops.
- The scan page's OCR worker failed to load from its CDN.

**Data quality (it is also QA):** the setup audit currently reports 9 items to fix and 91 tips; 11 rooms have no room number, 13 have no plan marker, 58 have no path node, and one floor has two disconnected path pieces.

**Accessibility:** axe-core found zero violations on 5 of 13 student pages, one critical issue (zoom blocked) on the outdoor camera guide, one serious issue (unnamed progress bar) on the enrollment page, and otherwise moderate landmark notes.

**What a defense will expect (to be produced outside this review):** automated regression checks for the admin screens, unit tests for routing and room-number logic, and a manual device matrix (Android Chrome, iPhone Safari) for the outdoor AR guide.

### 2.8 User-flow tester

| Flow | Steps | Verdict |
|---|---|---|
| **A. Outdoor navigation** (home → pick building → Start → allow location, camera, motion → follow path → arrive) | 5-7 taps plus 3 permission prompts | Good concept; permissions are the friction; needs a text-only fallback that is easy to find |
| **B. Find a room** (Find a room → type → "Find inside") | 3 taps | Fast, works offline once synced; best flow in the app |
| **C. Enrollment** (banner → numbered steps → "Show me the way" at each stop → "I am done here") | ~2 taps per stop; 9 stops | Strongest flow for new students; fix the "seven vs nine" copy |
| **D. Report a problem** (Report → camera → details → send) | 4 screens | Thoughtful (faces warning, AI check, admin approval); needs an easy text-only path when a camera is not allowed |
| **E. Ask the assistant** | 1 tap on a suggestion | Clear and safe ("answers only from campus records") |
| **F. Admin: register a building** (pin → floors → plans → paths → doors → rooms) | 6 guided steps, each with a "next" button | Much clearer after the workspace rebuild; the path-drawing step is the slow one |
| **G. Off-campus visitor** | Gate screen | **Dead end** (see U3) |

---

## 3. Personas: how each audience experiences it

| Persona | What they need | What works | What gets in the way | Top change |
|---|---|---|---|---|
| **Returning student** | Reach a room fast | Room search, offline directory, assistant | Game layer as noise | Make points/streaks optional; keep search the first thing on screen |
| **New student** | Complete enrollment | The enrollment guide is the standout; numbered steps, "You are here", progress | Copy says "seven steps" for nine stops; first-use permission prompts | Derive all counts from data; add a one-line "why we ask for location" before the prompt |
| **Parent** | Know where to go, office hours, where to wait | Public map and directory stay open off campus | The guide gate is a dead end; no contact/hours/visitor-parking page; no Filipino/other-language option | Add "Browse the directory/map" to the gate; add a Visitors page |
| **Staff (registrar, PSMO)** | Keep data current without a developer | PSMO role limited to buildings and rooms; setup progress; undo; offline edits | Account management is command-line only; no bulk import for rooms; floor-plan path drawing needs training; no audit of door/path edits | CSV import for rooms, a user-management screen, audit every write |
| **Professor** | Find a classroom or lab quickly, on a laptop or phone | Search by number or name; works offline | Phone-first layout on desktop; no schedule link; "Houses of Hero" and quest language are student-culture, not faculty-neutral | Desktop room finder view; link a room to a class schedule feed if the school has one |
| **Visitor** | Reach an office with no prior knowledge | No sign-up needed; plain-language directions; enrollment banner for applicants | Three permission prompts; location requirement blocks pre-visit planning; English only | Pre-visit mode (map and directory without location); a guest tour |

**Overall user flow and UI:** the student journey is short and mostly obvious, and the visual identity is a real asset. The main risks are not layout polish but (1) dead ends for people who are not standing on campus, (2) leftover indoor-AR code and screens that no longer match the product's scope, and (3) copy that hard-codes facts the admin can change.

---

## 4. Cross-cutting qualities

### 4.1 Scalability
- **Runtime:** fine for one campus. Measured: `rooms.php` 9 ms and 53 KB for 124 rooms; routing runs in the browser (Dijkstra over ~224 nodes). Extrapolating (not tested): ~430 KB at 1,000 rooms, ~2 MB at 5,000, so add pagination or `ETag` before a large campus.
- **Infrastructure:** single PHP + MySQL node; file-based sessions and rate-limit counters (not shared across servers); photos on local disk (use object storage); Gemini is a per-request cost with no daily ceiling in code.
- **People:** the real limit is authoring effort per floor (2.4), not CPU.
- **Not tested:** concurrent users, AI quota exhaustion, cache behaviour behind a CDN.

### 4.2 Flexibility
Already admin-editable: enrollment steps, doors, open-type buildings, campus-only switch, colour themes, hazard approval. Hard to change without code: the campus boundary, the room-numbering rule, the AI persona text, brand, and anything in section 7's inventory.

### 4.3 Accuracy
- **Outdoor navigation accuracy is unmeasured.** GPS error and phone compass drift (10-30° near metal) decide how well the camera arrow lines up; nothing here has been run on a device. Indoor floor-plan routing is a 2D drawing, so its accuracy depends on how carefully paths were traced, not on sensors.
- **Data accuracy:** see the gaps in 2.7. The assistant is deliberately constrained to registered records, which turns data gaps into "I don't know" instead of invented answers; that is the right trade-off.
- **Copy accuracy:** hard-coded "seven steps", "Amafel Building (Main), 1st Floor" in `enrollment.php:44`.

### 4.4 Consistency
Strong within each app (student, admin). Inconsistencies: vocabulary (quest/step/stop), the two design languages, API status codes, and docs and code comments that still describe indoor AR and the amber design.

### 4.5 Educational use
Good fit for: freshman orientation, enrollment week, event days, reducing office-hour interruptions, and as a campus-digital-twin teaching example (GIS, AR, offline web, applied AI).
Gaps for real educational deployment: accessibility routing (ramps, elevators, accessible restrooms) is not modelled, no multilingual option, no minors' data-protection workflow, no analytics for the school (most-searched rooms, congestion), no integration with class schedules.

---

## 5. Is it worth a thesis, or a product?

### 5.1 As a thesis: yes, with the right framing
**Why it qualifies:** a defined problem (campus wayfinding, especially for newcomers), a non-trivial technical solution, real data from a real campus, and engineering depth (offline sync with conflict resolution, AI grounding and guardrails, geofence, role-based admin, hazard reporting with moderation).

**What a panel will push on, and the answer you should be ready with**

| Panel question | Current answer | What closes the gap |
|---|---|---|
| "How accurate is the AR guidance?" | Unknown | Measure outdoor arrow and route error against surveyed markers on 2-3 devices; report mean and 95th percentile |
| "Is it better than a paper map or Google Maps?" | Untested | Task-completion time and error count, with and without Lampara, n >= 30 |
| "Do users like it?" | Untested | SUS or UEQ questionnaire; separate new students from returning |
| "Is the AI reliable and safe?" | Designed to refuse beyond records | Test set of 100 questions; report correct, refused, and wrong rates |
| "Is it compliant?" | Privacy page exists | Short privacy impact assessment under RA 10173; consent wording; data retention |
| "What is new?" | Combination, not any single technique | State the contribution plainly: low-cost, no-install outdoor AR guidance plus indoor floor-plan routing for schools, no beacons |
| "Does it generalise?" | Single campus | Show the configuration layer in section 7 working for a second site (even a mock one) |

**Recommended evaluation design:** ISO/IEC 25010 quality characteristics for the software; SUS (usability) with 30+ respondents across the six personas above; a controlled wayfinding task with a map-only control group; AR positional error in metres; WCAG 2.2 AA audit (you already have axe results to start from); cost per AI query; limitations section covering GPS/compass drift and the one-calibrated-floor reality.

**Scope advice:** present the delivered system as outdoor AR guidance + indoor floor-plan routing + directory + grounded assistant + admin toolchain. Do not mention indoor AR except as future work, and remove its leftover code first so the repository matches what you claim.

### 5.2 As a product: not yet
| Needed to sell | Today |
|---|---|
| Multi-institution support (7) | Single campus, hard-coded in ~30 places |
| Self-serve onboarding | Command-line account creation; expert path authoring |
| Operations (monitoring, backups, SLA, support) | None; 121 uncommitted changes |
| Legal (privacy, terms, data processor agreements) | Privacy and terms pages exist; no DPA, no retention policy |
| Pricing/competitive position | Competes with Mappedin, Pointr, Google/Apple indoor maps; the differentiator is low cost and no beacons, not feature depth |

**Realistic product path:** pilot with 2-3 schools using the thesis system, then productise the configuration layer. As a thesis spin-off or open-source campus kit this is credible; as a standalone commercial SaaS it is a longer road.

### 5.3 The one unknown that decides everything
The outdoor AR guidance has never run on a real device in any test I can see. Do a one-day field trial before the defense: two Android phones and one iPhone, five outdoor routes, record success, failure and error. Everything else in this report is secondary to that result.

---

## 6. Thesis-readiness checklist

- [ ] Problem statement, objectives, scope and delimitations written
- [ ] Related systems compared (Google/Apple indoor maps, Mappedin, campus apps, AR.js/WebXR research)
- [ ] Architecture and data-model diagrams (use `schema.sql`)
- [ ] Field-trial outdoor AR accuracy data (5.3)
- [ ] SUS/UEQ results, n >= 30, across personas
- [ ] Wayfinding task comparison with a control group
- [ ] AI question-set results (correct / refused / wrong)
- [ ] Accessibility audit result (axe baseline in 2.1, plus manual screen-reader pass)
- [ ] Security assessment summary (section 2.6 is a starting point)
- [ ] Privacy impact assessment and consent text (RA 10173)
- [ ] Software testing evidence (unit and end-to-end) with a repeatable run
- [ ] Limitations and future work (section 8, long term)

---

## 7. Can other institutions use it? What to change

### 7.1 Where it is tied to NCST today (inventory)

| Area | Where (file:line) | What |
|---|---|---|
| Brand and copy | `index.php:65,73,267`, `ask.php:12`, `map.php:46`, `enrollment.php:44`, `building-edit.php:53` | "NCST Campus", "Enrolling at NCST?", "Amafel Building (Main), 1st Floor" |
| AI persona | `Backend/chat_lib.php:154` | "friendly campus guide of NCST" |
| Campus boundary | `Js/Include/campus-bounds.js:13` | One hard-coded rectangle (`[[14.32685,120.93987],[14.32880,120.94248]]`) drives the geofence for every visitor |
| Map defaults | `guide-ar.js:63-64`, `building-outlines.js:10`, `campus-paths.js:385`, `manage-buildings.js:29` | Default latitude/longitude and "Amafel as default centre" |
| Database ids in code | `Js/Include/building-doors.js:14` | `KNOWN = {1: …'Point AG', 3: …'Point T'}`: building **ids** and point **names** baked into the client |
| Enrollment content | `Js/Include/enrollment-steps.js`, `Js/Student/enrollment.js`, `Js/Student/journey.js:170` | NCST's steps, "Houses of Hero", Amafel room numbers as built-in defaults |
| Domain rules | `Js/Admin/register-room.js`, `room_number.php` | Room number = building digit + floor digit; "section" suffix |
| Data model | `schema.sql` | No institution/campus table; there is no institution table beyond the new settings record; `rooms.room_number` is unique **per building** in the live database (checked 14 Oct), but `schema.sql` still shows the old whole-database key as a comment, so a fresh install built from it would differ; `app_settings`, `admins`, static maps and the enrollment list are global |
| Language | All views | English only |

### 7.2 What good already exists for reuse
Editable enrollment steps, doors, themes, campus-only switch, open-type buildings, per-building setup progress, role-based admin, audit log, offline sync, and a vendored (no-CDN) front end.

### 7.3 Recommended path
**Phase 1: configurable single-tenant ("one install per school"), roughly 2-3 weeks of work (my estimate, not measured).**
1. Add an `institution` settings record (table or `institution.json`) with: name and short name, tagline, logo and mascot, theme, campus polygon (not just a rectangle) and default centre, timezone, language strings, AI persona text, room-number rule, feature switches (indoor AR, enrollment, points/quests, hazard reports), contact details.
2. Serve it from one endpoint; replace the ~30 hard-coded strings and the three coordinate constants with reads from it.
3. Move built-in enrollment steps and `KNOWN` door defaults out of code (doors already come from the database).
4. Add a setup wizard: create admin, upload logo, draw campus boundary, choose theme, load a sample dataset.
5. Bring `schema.sql` in line with the live database (room numbers are already unique per building there).

**Phase 2: true multi-tenant (one install, many schools), roughly 4-6 more weeks.** `institution_id` on buildings, campus nodes, static maps, settings, admins, reports and enrollment steps; subdomain routing; per-tenant storage and AI quota; tenant-aware rate limits and audit log.

**Make onboarding cheap, because authoring is the real cost:** CSV import for buildings and rooms; auto-suggest walkable paths from a floor-plan image; "record a path by walking it" (a design note already exists in `docs/room-numbers-and-path-recording.md`); templates for common room-numbering schemes.

**Where else it could fit:** other schools and universities, hospitals, malls, convention halls, government centres. For hospitals and malls, drop the enrollment and game layers (feature switches) and add accessibility routing.

---

## 8. Prioritised improvement roadmap

**Today (under an hour)**
1. Turn off directory listing (`Options -Indexes`).
2. Commit the work in logical chunks and push; add `.gitattributes`. Back up the database outside the project.
3. Change the `psmo` password and enable two-step sign-in for admins.
4. Fix the enrollment copy so counts come from the data.

**Before a supervised pilot**
5. Field-test the outdoor AR guide on real phones (5.3).
6. HTTPS, `display_errors=Off`, non-root DB user, hide `X-Powered-By`.
7. Gate dead end: add "Browse the map and directory" to the off-campus screen.
8. Vendor the OCR worker; trim landing-page weight; fix the Enrollment button overlap.
9. Audit door and path writes; remove the leftover indoor-AR code and the `ar-test` page (see 2.4).
10. Rate limits keyed on trusted IP + username; message length cap on chat.

**Before the thesis defense**
11. Add repeatable automated checks (admin screens, pathfinding, room-number rules) and run them on every push.
12. Execute the evaluation plan in 5.1 and write results.
13. Privacy impact assessment and consent wording.
14. Allow pinch-zoom outside the camera view and name the enrollment progress bar for screen readers.

**Toward a product**
15. Phase 1 configuration layer (7.3), migrations, user-management screen, CSV import.
16. Pagination and `ETag` on large endpoints; object storage for photos; AI daily cap.
17. Accessibility routing (ramps, elevators); a second language; a faculty/desktop view.
18. Phase 2 multi-tenant; analytics for school staff.

---

## Appendix A: measured facts

| Item | Value |
|---|---|
| Buildings / rooms / floor plans | 9 / 124 / 13 |
| Floor-plan path points / connections / campus path points | 224 / 225 / 32 |
| API endpoints | 23 (plus one shared include) |
| Staff accounts | 2 (1 admin, 1 PSMO) |
| Rooms without number / without plan marker / without path node | 11 / 13 / 58 |
| Setup audit | 9 to fix, 91 tips |
| Indoor-AR leftovers | About 1,200 lines (`indoor-ar.php`, `indoor-ar.js`, `locar-indoor.js`, `indoor-nav.js`, `ar-ribbon.js`) plus calibration plumbing and the `ar-test` page |
| `rooms.php` | 53,221 bytes, ~9 ms |
| axe violations | 0 on map, find-room, report, privacy, terms; 1 critical (viewport zoom) on the outdoor camera guide; 1 serious (unnamed progress bar) on enrollment; remaining are moderate landmark notes |
| Page weight (phone, first load) | Home ~885 KB / 168 requests; Map ~3.1 MB / 118; Outdoor camera guide ~0.8 to 1.7 MB; Ask ~212 KB; Find a room ~171 KB |
| Repository | 54 commits; 121 uncommitted paths on 14 Oct |

## Appendix B: status of the 8 October findings

| 8 Oct finding | Status today |
|---|---|
| S1 secret key in an un-ignored file | `config/` folder no longer exists; rotate the key anyway |
| S2 shared-proxy rate limits | `rate_limit.php` now reads a forwarded address; confirm it only trusts your own proxy |
| S3 flag flooding | Fixed: 20 per 10 minutes, note capped at 255 characters |
| S4 chat input bounds | History capped; newest message cap unverified |
| S5 cookie hardening and CSRF | Fixed: HttpOnly, SameSite=Lax, origin check |
| Test/debug UI public on the AR page | Not re-checked in depth; page title and gate still say "AR guide" |
| Accessibility gaps | Much improved (359 ARIA attributes in student views); the outdoor camera guide still blocks zoom |
| CDN runtime dependencies | Mostly vendored; OCR worker still uses a CDN |
| Nothing committed | Worse in volume: 121 uncommitted paths |
