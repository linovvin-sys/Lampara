# Student offline mode

Visitors can open Lampara and navigate with **no signal**: the pages load, the directory data is
there, routes are drawn, and both AR guides work (GPS, compass and camera don't need internet).
When the phone gets a connection back, the saved data refreshes by itself.

## What happens, step by step

1. **First visit (online).** The app registers a service worker (`Frontend/sw.js`) and, in the
   background, saves: the student pages and the libraries they use; every building, room, floor
   plan (plus its image), walkable graph and the outdoor walkway graph.
2. **Every later visit.** Pages load from the network when it's there (always fresh) and from the
   saved copy when it isn't. Saved data is refreshed at most hourly on page loads.
3. **Offline.** A thin dark strip at the top says "Offline · using saved campus info from N min ago".
4. **Back online.** The app notices within about 30 seconds (or instantly on the browser's
   "online" event), downloads what changed, and shows a small toast: "Updated: the latest campus info
   is saved for offline use." The strip disappears.

## What works offline

| Feature | Offline |
|---------|---------|
| Landing page, stable guide, Manual Search | Yes |
| Scan page: typed room number, destination search, floor-plan route (same floor and multi-floor) | Yes |
| Indoor AR guide (needs the floors calibrated in Admin, same as online) | Yes |
| Outdoor AR guide: building search, floating arrow, ground ribbon and turn banner | Yes (uses GPS; needs the campus paths drawn and entrances set) |
| Camera view | Yes (needs the page over HTTPS, as always) |

## What still needs internet

- **Ask Lampara (AI chat)** and **AI sign reading**. They say so. Typing the room number instead still works.
- The very first visit (nothing is saved yet). A page never opened online shows a short "You're offline" page.
- The live text box on the scan camera (Tesseract downloads its language data at runtime). The scan itself still works by typing.

## For admins and testers

- **Get a device ready:** open the app once while online and wait ~10 seconds. On iPhone/Safari, open it again once so the
  worker takes control of the page.
- **Data location:** buildings, rooms, plans and graphs live in the browser's localStorage; page files, libraries and
  floor-plan images live in the service worker's caches (no 5 MB limit, so images no longer fill localStorage).
- **Logging out an admin does not wipe student data.** Admin pages/reports are cleared on logout; public student
  pages and directory data are kept.
- **After a deploy:** new pages/scripts are picked up on the next online visit (files are fetched network-first).
  To force every device to rebuild its saved copies, bump `VERSION` at the top of `Frontend/sw.js`.
- **Storage can be cleared by the browser** after long inactivity (Safari: about 7 days). One online visit brings it back.
- **Nothing to migrate:** this needs no database change. `Backend/api/ping.php` (new) is the "is the server there?" check.

## Files

New: `Frontend/Js/Include/student-offline.js`. Changed: `Frontend/sw.js`, `Frontend/Js/Include/offline-cache.js`,
`Backend/api/ping.php`, the six student pages (`View/Public/{index,guide,guide-ar}.php`,
`View/Student/{scan,manual-search,indoor-ar}.php`), `Js/Public/guide.js`, `Js/Student/{scan,indoor-ar}.js`.
