# Room numbers with a section, and recording paths where you stand

## Room numbers like "1101 - A"

A room number is digits, optionally followed by a section: `1101` or `1101 - A`.

- **Any way of typing it works.** `1101-a`, `1101 A`, `1101A` and `1101 - A` are all saved as `1101 - A`
  (upper case, spaces around the dash). The Register Room form shows "Will be saved as 1101 - A" whenever
  saving would change what you typed.
- **Section:** 1 to 4 letters/digits after the dash (`A`, `B2`, `AB12`).
- **Building/floor prefix check** uses the digits before the section, as before (Amafel floor 1 → must start with `11`).
- **Duplicates are caught however they're typed.** `1101 - A` and `1101a` are the same room, so the second is refused
  (in the form, in the API, and when an offline change syncs). `1101` and `1101 - A` are different rooms.
- **Students can type it any way too.** Scan page, Manual Search and the AI sign reader all match
  ignoring case, spaces and dashes: typing `1101a` finds `1101 - A`. The AI reader is told to include a section
  letter when a sign shows one.
- **Existing rooms are unchanged.** Every current room number is plain digits and stays as it is.

Code: `Backend/room_number.php` (server) and `Frontend/Js/Include/room-number.js` (browser) implement the same rules;
keep them in step.

## Recording paths where you stand (Admin → Campus Paths)

- **Drop a point here:** adds one point at your GPS position. If you're within 6 m of an existing point it joins that one
  instead of stacking a duplicate. If a point is selected, the new point is connected to it and becomes the selected one.
- **Record my walk:** tap it, walk the path, tap **Stop recording**. Only the corners are kept (a reading more than 5 m
  off the straight line makes a corner), plus one point every 30 m on a long straight, so a walk becomes a handful of points.
  - Start from a **selected point** to branch off it; otherwise it starts where you stand (joining an existing point within 6 m).
  - Ending or passing within 6 m of an existing point joins it (that's how loops and junctions close).
  - GPS readings worse than ±20 m are ignored while recording; the screen stays on while recording.
  - Works with no signal: the points wait on the device and you're asked before they sync.
- Tips: hold the phone steady, walk at a normal pace, pause briefly at corners, and check the result on the satellite map.
  Drag any point that looks off.
