# Lampara — Working Build

Real, working code implementing the finalized design: the amber "lamp glow" visual
system, structured room registration (Office vs. Classroom/Lab), the campus map
preview, manual offline-search fallback, outdated-info flagging, and full CRUD
(add/edit/delete) on both buildings and rooms.

## File structure

Split the same way as SIAdrafts: `Frontend/` (View/Css/Js) is presentation only,
`Backend/` is PHP business logic and the database. Every page's `<style>`/`<script>`
lives in its own `.css`/`.js` file instead of inline — the PHP view files are markup only.

```
lampara/
├── Frontend/
│   ├── View/
│   │   ├── Public/
│   │   │   ├── index.php          landing page: what Lampara is + Start Navigating / Admin Login
│   │   │   ├── guide.php          student guide: outdoor AR arrow + grounded AI chat
│   │   │   ├── guide-ar.php       AR.js-based guide (in testing — see "What's real" below)
│   │   │   └── manifest.json      PWA manifest (Add to Home Screen)
│   │   ├── Student/
│   │   │   ├── scan.php               indoor room lookup + destination search + "report outdated info"
│   │   │   ├── manual-search.php      offline-fallback directory browser
│   │   │   └── ar-test.php            isolated AR.js camera/GPS diagnostic scratch page
│   │   ├── Admin/
│   │   │   ├── login.php, logout.php
│   │   │   ├── dashboard.php          stats, recent buildings, open outdated-info reports
│   │   │   ├── register-building.php  add/edit/delete buildings (floors, building number)
│   │   │   ├── register-room.php      add/edit/delete rooms (Office/Classroom toggle)
│   │   │   ├── manage-buildings.php   building list + live campus map
│   │   │   └── test-chat.php          test the grounded chat as an admin
│   │   └── Include/
│   │       └── admin-nav.php          shared sidebar/top-bar nav include
│   ├── Css/            per-page stylesheets, mirrors the View/ folder structure
│   ├── Js/              per-page Vue app scripts, mirrors the View/ folder structure
│   └── assets/          favicon, PWA icons, precompiled tailwind.css, vendor/aframe-ar.js
└── Backend/
    ├── config.php, db.php, secrets.php, schema.sql   (db.php/secrets.php gitignored — see Setup)
    ├── _auth.php        session gate included at the top of every admin page
    ├── scripts/
    │   └── create-admin.php   CLI script: create/reset an admin login
    └── api/
        ├── buildings.php   GET / POST / PUT / DELETE
        ├── rooms.php       GET / POST / PUT / DELETE
        ├── flags.php       GET (admin) / POST (report) / PUT (admin, resolve)
        ├── chat.php        POST — real Gemini-backed grounded chat
        ├── scan.php        POST — Gemini vision signage OCR
        └── admin_login.php POST — admin session login
```

## Setup

1. In phpMyAdmin, create the database if you haven't already:
   ```sql
   CREATE DATABASE lampara_db CHARACTER SET utf8mb4;
   ```
2. **Fresh database:** import `Backend/schema.sql` as-is — it creates all tables
   and seeds one building (Amafel) with example rooms.
   **Existing database from before `floor_count`/`building_number` existed:** don't
   re-run the whole file — run just the `ALTER TABLE` lines noted at the top of
   `Backend/schema.sql`.
3. **Database settings:** copy `Backend/db.example.php` to `Backend/db.php` and fill in
   your own local server's host/port/username/password (MAMP defaults: port `8889`,
   password `root`; XAMPP defaults: port `3306`, no password). `Backend/db.php` is
   gitignored — this is what lets teammates on different local stacks (MAMP, XAMPP,
   Mac, Windows) each keep their own DB settings without ever overwriting each
   other's when pulling. If `Backend/db.php` doesn't exist, `Backend/config.php` falls
   back to XAMPP's defaults.
4. **Gemini key:** copy `Backend/secrets.example.php` to `Backend/secrets.php` and put
   your real key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   in it. `Backend/secrets.php` is gitignored, so it's safe to put a real key there.
5. Visit `Frontend/View/Admin/login.php` first to see the admin flow (lands on
   `dashboard.php`), or `Frontend/View/Public/guide.php` on an actual phone (via ngrok,
   see below) for the live guide. `Frontend/View/Public/index.php` is the landing page
   visitors see first — it links to both.

## Why there's a precompiled `tailwind.css` now

Every page originally loaded Tailwind via `<script src="https://cdn.tailwindcss.com">`
— that's not a stylesheet, it's a JS compiler that re-generates all your CSS live in
the browser on every page load, which is genuinely slow on mobile and is explicitly
not recommended for production by Tailwind's own docs. Pages now link a plain,
precompiled `Frontend/assets/css/tailwind.css` instead — same classes, way faster.

**No Node.js needed** — this uses Tailwind's standalone CLI binary, not npm. The binary
itself is gitignored (~80MB, and it's OS-specific — a Mac binary won't run on Windows and
vice versa), so **each teammate downloads their own copy once.** If you add new utility
classes later and they're missing from the compiled file, rebuild with the same command.

**macOS:**
```bash
curl -sL -o tailwindcss-cli "https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-macos-x64"
chmod +x tailwindcss-cli
./tailwindcss-cli -i Frontend/assets/css/input.css -o Frontend/assets/css/tailwind.css --minify
```
(Use `tailwindcss-macos-arm64` instead if you're on Apple Silicon.)

**Windows (PowerShell or cmd):**
```powershell
curl.exe -sL -o tailwindcss-cli.exe "https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-windows-x64.exe"
.\tailwindcss-cli.exe -i Frontend/assets/css/input.css -o Frontend/assets/css/tailwind.css --minify
```

Custom fonts (Outfit, JetBrains Mono) are configured in `Frontend/assets/css/input.css`
via Tailwind v4's `@theme` block — there's no separate `tailwind.config.js` anymore.

## What's real vs. still a stub

**Fully real and working:** GPS+compass AR arrow, the grounded Gemini chat, structured
room registration with the Office/Classroom hours toggle, the live campus map (computed
from real lat/lng), full add/edit/delete on buildings and rooms, outdated-info flagging,
localStorage-based offline caching on Manual Search (loads instantly from cache, falls
back to client-side filtering when offline), and `scan.php`'s two-stage signage reading
(a live Tesseract.js bounding box while aiming, then a real Gemini vision OCR read on
tap) with a destination search that shows relative directions to any other room.

**Still a stub, honestly:**
- `guide-ar.php` — the AR.js-based outdoor guide is real code, but not yet confirmed
  working outdoors (needs a GPS fix accurate to ≤100m, which AR.js's own internal
  watch requires before it'll anchor anything). `guide.php` is the stable, already-
  proven outdoor guide; `guide-ar.php` stays a parallel test page until that's verified.
- Manual Search's offline cache is per-device and only as fresh as the last time that
  device loaded the page online — there's no cross-device sync or service worker, just
  a straightforward localStorage snapshot. Good enough to actually work offline, not a
  full offline-first architecture.

## Still true from before

Since a phone can't reach `localhost` on your laptop, use **ngrok** to tunnel your
local MAMP server over HTTPS — camera/GPS permissions get blocked on non-secure
connections, which is why this specific step still matters.
