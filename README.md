# Lampara — Working Build

Real, working code implementing the finalized design: the amber "lamp glow" visual
system, structured room registration (Office vs. Classroom/Lab), the campus map
preview, manual offline-search fallback, outdated-info flagging, and full CRUD
(add/edit/delete) on both buildings and rooms.

## File structure

```
lampara/
├── index.php              student guide: outdoor AR arrow + grounded AI chat
├── config.php              DB connection
├── secrets.php              your real Gemini key (gitignored — see Setup)
├── secrets.example.php      committed template for secrets.php
├── schema.sql               buildings, rooms, outdated_flags
├── student/
│   ├── scan.php              indoor room lookup + "report outdated info"
│   └── manual-search.php     offline-fallback directory browser
├── admin/
│   ├── register-building.php   add/edit/delete buildings
│   ├── register-room.php       add/edit/delete rooms (Office/Classroom toggle)
│   └── manage-buildings.php    building list + live campus map
└── api/
    ├── buildings.php   GET / POST / PUT / DELETE
    ├── rooms.php       GET / POST / PUT / DELETE
    ├── flags.php       POST (report outdated room info)
    └── chat.php        POST — real Gemini-backed grounded chat
```

## Setup

1. In phpMyAdmin, create the database if you haven't already:
   ```sql
   CREATE DATABASE lampara_db CHARACTER SET utf8mb4;
   ```
2. **Fresh database:** import `schema.sql` as-is — it creates all three tables and
   seeds one building (Amafel) with 5 example rooms.
   **Existing database from the old single-table version:** don't re-run the whole
   file — run just the new `CREATE TABLE` statements (`rooms`, `outdated_flags`) and,
   if wanted, the `INSERT INTO rooms` block (adjust `@amafel_id` to your real building
   id first).
3. Check `config.php` matches your MAMP MySQL port.
4. **Gemini key:** copy `secrets.example.php` to `secrets.php` (same folder) and put
   your real key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   in it. `secrets.php` is gitignored, so it's safe to put a real key there.
5. Visit `admin/manage-buildings.php` first to see the admin flow, or `index.php` on
   an actual phone (via ngrok, see below) for the live guide.

## Why there's a `assets/css/tailwind.css` now

Every page originally loaded Tailwind via `<script src="https://cdn.tailwindcss.com">`
— that's not a stylesheet, it's a JS compiler that re-generates all your CSS live in
the browser on every page load, which is genuinely slow on mobile and is explicitly
not recommended for production by Tailwind's own docs. All 6 pages now link a plain,
precompiled `assets/css/tailwind.css` instead — same classes, way faster.

**No Node.js needed** — this used Tailwind's standalone CLI binary
(`tailwindcss-cli`, gitignored for size, ~80MB), not npm. If you add new utility
classes later and they're missing from the compiled file, redownload the binary and
rebuild:
```bash
curl -sL -o tailwindcss-cli "https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-macos-x64"
chmod +x tailwindcss-cli
./tailwindcss-cli -i assets/css/input.css -o assets/css/tailwind.css --minify
```
(Use `tailwindcss-macos-arm64` instead if you're on Apple Silicon.) Custom fonts
(Outfit, JetBrains Mono) are configured in `assets/css/input.css` via Tailwind v4's
`@theme` block — there's no separate `tailwind.config.js` anymore.

## What's real vs. still a stub

**Fully real and working:** GPS+compass AR arrow, the grounded Gemini chat, structured
room registration with the Office/Classroom hours toggle, the live campus map (computed
from real lat/lng), full add/edit/delete on buildings and rooms, outdated-info flagging,
and localStorage-based offline caching on Manual Search (loads instantly from cache,
falls back to client-side filtering when offline).

**Still a stub, honestly:**
- `scan.php`'s AI signage-reading — takes a manually-typed room number and does a
  **real** lookup, but the actual two-stage AI vision detection (local bounding-box
  pass + AI OCR) isn't wired up yet. See the TODO comment inside `scan.php` for
  exactly where it belongs — this is the one piece flagged as the highest-risk part
  of the whole project, worth tackling with real time budgeted for it.
- Manual Search's offline cache is per-device and only as fresh as the last time that
  device loaded the page online — there's no cross-device sync or service worker, just
  a straightforward localStorage snapshot. Good enough to actually work offline, not a
  full offline-first architecture.

## Still true from before

Since a phone can't reach `localhost` on your laptop, use **ngrok** to tunnel your
local MAMP server over HTTPS — camera/GPS permissions get blocked on non-secure
connections, which is why this specific step still matters.
