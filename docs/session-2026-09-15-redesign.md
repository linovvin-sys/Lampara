# Lampara — Design & Feature Session Log

**Dates covered:** 2026-09-15 to 2026-09-16
**Scope:** Full visual redesign (white/green design system), admin panel rebuild, guide/scan/manual-search redesigns, one new admin API capability, several bug fixes, and project Q&A.

This log is a record of what changed and why, plus every question asked during the session with the answer/solution given at the time. It's meant to be read later (by any teammate, or future-you) to understand what happened without re-reading the whole chat.

---

## 1. Project reorganization

**Change:** Moved loose root-level files into a `config/` folder.

| Before | After |
|---|---|
| `config.php` | `config/config.php` |
| `secrets.example.php` | `config/secrets.example.php` |
| `schema.sql` | `config/schema.sql` |

- Updated every `require_once` path in `api/*.php` and `create-admin.php` to point at `config/`.
- Updated `.gitignore`: `secrets.php` → `config/secrets.php`.
- Updated `README.md`'s file-structure diagram and setup steps to match.
- `create-admin.php` stayed at the project root (it's a CLI-only setup script, not a web-served file).

**Security note found and fixed:** the tracked `secrets.example.php` had a real-looking Gemini API key pasted into it instead of the placeholder `'paste-your-real-key-here'`. It had **not** yet been committed to git history (caught before any push), so no rotation was needed. Fix: restored the placeholder in the committed example file, and moved the real key into the gitignored `config/secrets.php` instead.

---

## 2. Landing page (`index.php`)

- Full visual redesign: white background, green accent palette (iterated a few times — see §7 "Color iteration history").
- Converted to a single-page app: sticky nav bar with **Home** / **About** links, hash-based routing (`#home` / `#about`), no full page reload, browser back/forward supported.
- Added an **About** view: mission statement, 4-step "How it works," a 3-card "why Lampara" row.
- Added extra content to the **Home** view below the hero: a "Why students reach for Lampara" mini-steps section and a CTA banner linking into the About view.
- Replaced all emoji (🧭🔍💬📍⚡🎓) with inline SVG line-icons, colored via CSS variables instead of relying on emoji rendering.

## 3. Admin login (`admin/login.php`)

- Rebuilt as a split card: left/top half is a gradient panel with a welcome blurb + checklist of admin capabilities; right/bottom half is the actual login form. Stacks on mobile, splits side-by-side on desktop.
- **Bug fixed:** the "← Back to Lampara" link was rendering *behind* the login card (no `z-index` separation, card painted over it). Fixed with `z-index: 20` on the link plus a small white pill background so it stays legible even as content scrolls under it.

## 4. Admin panel — full rebuild

New shared design system instead of per-page copy-pasted styles:
- `assets/css/admin.css` — shared color tokens, buttons, cards, form fields, badges, stat cards, sidebar/drawer styles.
- `admin/_nav.php` — shared nav include, used by every admin page.

**New page:** `admin/dashboard.php` (now the default page after login instead of `manage-buildings.php`):
- Stat cards: buildings, rooms, offices, open outdated-info reports.
- "Recently updated buildings" list.
- "Open outdated-info reports" list with a working **Resolve** button.
- A "Coming soon" section — six *design-only* preview cards for features named in the project proposal (Building Disambiguation, Directory Reconfirmation, Signage Quality Coverage, Gemini API Usage Monitor, Voice Chat, Turn-by-Turn Indoor Guidance). None of these are wired to real logic — they're explicitly previews, each labeled with a status badge (Planned / In Design / Stretch).

**New API capability** (needed for the dashboard's Resolve button — previously didn't exist): `api/flags.php` gained `GET` (list open/resolved flags, admin-only) and `PUT` (mark a flag resolved, admin-only) alongside its original public `POST` (student-facing "report outdated" action).

**Redesigned, all existing functionality preserved:**
- `admin/manage-buildings.php` — building list, search, delete, live Leaflet campus map.
- `admin/register-building.php` — name/lat/lng form, "Capture My Current Location" geolocation button, notes, edit/cancel/delete.
- `admin/register-room.php` — building select, Office/Classroom toggle, room fields, edit/cancel/delete, live room list.

**Navigation redesign (iterative):**
1. First pass: sidebar on desktop, horizontally-scrolling pill nav on mobile.
2. User feedback: the mobile pill nav required swiping to find buttons — not user-friendly.
3. Rebuilt as a hidable off-canvas drawer on mobile: hamburger icon opens a full sidebar (same icons/labels/profile card as desktop) sliding in from the left, with a dark backdrop; closes via an ✕ button, tapping the backdrop, or Esc.
4. Sidebar was also given a more "professional" visual pass: branded header card, uppercase "MENU" section label, icons per nav item, a left-accent active state, and a profile card (avatar + username pulled from `$_SESSION['admin_username']`) above the Logout button.
5. Logout button restyled from a plain text link into a clearly-highlighted red pill (with icon), in both the mobile top bar and desktop sidebar.

**Bugs found and fixed during the nav rebuild:**
- **Sidebar brand icon missing its background.** The green icon box in the sidebar header rendered empty. Cause: the CSS rule that gave it a background/flex-centering was scoped as `.sidebar-brand .brand-mark`, but a *different*, unstyled selector was actually being used in the markup at the time — the color/centering rule simply never matched. Fixed by adding the missing properties directly to `.sidebar-brand .brand-mark`.
- **Hamburger button unresponsive (didn't open the drawer).** Cause: `id="app"` was on the *outer* `.admin-shell` div, which wrapped both the nav (hamburger, drawer, plain `addEventListener`-based toggle script) and the page's Vue-bound content. Vue 3's in-browser compiler recompiles/**recreates** the entire DOM subtree under `#app` on `mount()` when no separate `template` option is given — which silently destroyed the hamburger's manually-attached click listener. Fix: moved `id="app"` down onto just the `<main>` element in all four admin pages, so Vue only owns the content area and the nav/drawer/toggle script are never touched by Vue's mount.

## 5. `guide.php` — outdoor AR guide

- **Color pass:** amber → emerald/green throughout (gate screens, target card, chat panel, "Ask Lampara" button), while keeping the AR overlay's white/dark chip contrast intact per your explicit direction (green as accent only, not dominant, since it needs to stay legible over an unpredictable live camera background). Kept **red** for the genuine error message (camera denied / GPS error) rather than green, and switched the "still calibrating" status dot to plain white rather than reintroducing amber — both semantic exceptions to the "all green" rule, same convention used in the admin panel for destructive/error states.
- **New feature — independent Camera/Location on-off toggles:**
  - The old single "GPS + Compass" status chip is now two separate tappable chips: **Camera** and **Location**.
  - Tapping **Camera** stops the live `MediaStream` tracks and shows a full-screen "Camera is off" placeholder with a reactivate button. Turning it back on just calls `getUserMedia` again — it does **not** re-trigger the browser's permission prompt, since permission itself was never revoked, only the JS-side stream was stopped.
  - Tapping **Location** clears the GPS `watchPosition` watch, stops position updates, and clears the ambient building labels, replacing them with a "Location is off — tap to turn on" prompt. Re-enabling restarts the watch via a shared `startLocationWatch()` method used by both this and the initial `start()`.
  - The original permission gate screen ("Enable Camera & Location") is untouched — this toggle only affects the already-running session, per your request ("without resetting the browser").
  - "Scan signage" / "Ask Lampara" stay available even with location off, since neither strictly needs live GPS once a target building is already selected.

## 6. `student/manual-search.php` and `student/scan.php`

- **`manual-search.php`** — fully rebuilt, self-contained (no longer depends on the old amber-oriented `assets/css/tailwind.css`): new top bar, online/offline status strip, search box, filter pills, card-based room list, offline-limitation notice. The entire Vue `data()`/`computed`/`mounted()`/`methods` block (the real offline-caching logic — localStorage snapshot, online/offline detection, client-side filtering) was left **byte-for-byte unchanged**.
- **`scan.php`** — split per your direction:
  - Stage 1 (camera/AR tap-to-scan view) — kept its exact structure and `tailwind.css` dependency (it needs those utility classes for the live-camera chrome), just recolored amber → green.
  - Stage 2 (result screen, plain white page) — fully rebuilt as a proper card-based screen matching the design system (confirmation badge, AI/manual source tag, notes pill, hours-badge info card, moss-colored "report outdated" action).
  - The Vue script (camera capture, GPS campus-radius gating, scan/lookup/report/reset methods) is untouched.

**Bugs found and fixed:**
- Two Tailwind utility classes used for accents (`border-emerald-500`, `focus:border-emerald-500`) turned out not to exist in the precompiled `tailwind.css` bundle (this environment has no Tailwind CLI to rebuild it, so only classes already compiled in from other pages' past usage actually work). Fixed by adding two small scoped CSS rules (`.scan-ring`, `.scan-input:focus`) instead of shipping an invisible border.
- **"Back to guide" button unclickable.** A full-screen `absolute inset-0` div (the "type it manually" instructions + input, Stage 1) sat at the same z-index as, and after, the back-link in the DOM. Even though it only *visually* shows content in the screen's center, its full-screen invisible bounding box was intercepting clicks everywhere, including over the back button in the empty top-left corner. This bug pre-dated the redesign (same structure existed in the original file). Fixed with `pointer-events-none` on the wrapper and `pointer-events-auto` back on just the `<input>`.

## 7. Color iteration history (across `index.php`, `admin/login.php`, `assets/css/admin.css`)

The palette went through several rounds of feedback:
1. Amber/dark theme (original) → white background + green accents (initial redesign request).
2. Added color variety (teal, lime, amber accents) for visual richness.
3. Reverted to green-only per feedback ("return all design color to green"), introducing a secondary **moss** (yellow-leaning green) shade for warning-type semantics (stale buildings, open flags) so those states stay visually distinct without leaving the green family.
4. Muted the whole palette ("not too bright").
5. Brightened it back up to vivid greens per feedback ("apply bright colors").

Final state: vivid greens (`#22c55e` / `#16a34a` / `#15803d` / `#14532d`) with a vivid moss accent (`#65a30d`) for warnings, red kept only for destructive/error actions as a UX convention independent of brand color.

---

## 8. Questions asked this session, with the answer/solution given

| # | Question | Answer / solution given |
|---|---|---|
| 1 | What other features should be added to the admin sidebar/content, based on the project proposal doc? | Ranked list: (1) unanswered-questions log — surfaces when the AI says "I don't have that information," directly closing the proposal's top Critical gap; (2) multi-admin account management (currently CLI-only); (3) bulk CSV import/export; (4) signage-scan audit log; (5) a *real* version of the reconfirm-workflow placeholder already on the dashboard. **Status: not implemented — user said "leave it for now."** |
| 2 | What other (non-proposal-specific) features would make admin more useful? | (1) Undo/soft-delete for the currently-permanent cascading deletes; (2) a map-picker to set lat/lng by clicking instead of typing/standing there; (3) global quick-search across buildings/rooms; (4) a "duplicate room" button for faster bulk entry; (5) sort/filter on Manage Buildings by staleness/flags/room count. **Status: not implemented — user said "that's good for now."** |
| 3 | Where is the admin/Lampara logo in the top-left of the nav bar? | Pointed to both locations (`.sidebar-brand` in the desktop sidebar, `.admin-brand` in the mobile top bar). Follow-up screenshot showed the icon box was empty — traced to a missing CSS rule (see bug list, §4) and fixed. |
| 4 | In the concept of this project, what is AR and how is it used? | Explained the two distinct AR uses: **outdoor** (`guide.php`) — 2D screen-position math from GPS bearing + compass heading overlaid on the live camera feed, no 3D scene tracking; **indoor** (`scan.php`) — detection/confirmation only, no directional guidance (deliberately, per the proposal, to avoid needing a full indoor spatial graph), just a tap-triggered single-frame AI vision read of existing room signage. |
| 5 | Based on the current system, how can I make it offline? | Explained what already works offline (GPS/compass/camera; `manual-search.php`'s localStorage caching) versus the real gap: `guide.php` never caches the `buildings` list, so if the fetch fails offline, outdoor AR identification — the app's core feature — goes dead, contradicting the proposal's own offline-design claims. Gave a 5-step plan: cache buildings to localStorage the same way rooms are cached, load from cache on mount, detect offline state and skip straight to cache, add the "You're offline" banner, and gate chat/scan behind an online check so they fail gracefully instead of hanging. **Status: proposed only, not yet implemented — awaiting go-ahead.** |
| 6 | Find the AI chatbot's restriction/grounding logic. | Pointed to `api/chat.php` lines 84–123 (`$systemPrompt`): answers only from `$groundingFacts` (building `directory` text + structured room rows), must use the exact refusal phrase "I don't have that information — you may want to confirm with the office directly." when facts don't cover something, and must refuse anything off-topic even if it "knows" the answer. |

---

## 9. Not yet done (explicitly deferred or proposed-only)

- Offline caching for `guide.php`'s building list (see Q5 above) — proposed, not built.
- The six "Coming soon" dashboard cards are visual previews only — no backend, no real data, by design.
- `admin/login.php`'s checklist checkmarks (`&#10003;` HTML entities) were **not** converted to SVG icons when emoji were replaced elsewhere — explicitly out of scope since they're plain text glyphs, not emoji.
- Two feature idea lists (Q1, Q2 above) were discussed and intentionally left unimplemented per user direction.

---

## 10. Files touched this session

```
.gitignore
README.md
config/config.php                 (moved from config.php)
config/schema.sql                 (moved from schema.sql)
config/secrets.example.php        (moved from secrets.example.php)
create-admin.php
index.php                         (new landing page; old index.php renamed to guide.php)
guide.php                         (renamed from index.php, redesigned)
admin/_auth.php
admin/_nav.php                    (new)
admin/dashboard.php               (new)
admin/login.php
admin/manage-buildings.php
admin/register-building.php
admin/register-room.php
api/admin_login.php
api/buildings.php
api/chat.php
api/flags.php                     (GET/PUT added)
api/rooms.php
api/scan.php
assets/css/admin.css              (new)
student/manual-search.php
student/scan.php
```
