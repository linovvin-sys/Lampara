# Bug and testing log

Fill in the date and the tester for each row. Add your own findings.

| # | Problem found | How it was found | Fix | Date | Tester |
|---|---|---|---|---|---|
| 1 | The outdoor guide said "Bear left now" while still far away | Phone screenshot from a real walk | Wording depends on distance and GPS accuracy | | |
| 2 | Voice repeated "turn left" about twice a second | Real-phone test | Speech is rate limited and only speaks when the instruction changes | | |
| 3 | Saved door markers vanished on the doors page | Admin noticed after a change | Corrected the order of the load statements | | |
| 4 | "Is open" building type did not save on first create | Manual test | Column check reads the database directly instead of a cached "missing" | | |
| 5 | Importing a data pack deleted the live floor-plan images | Import test | Images restored; import only removes old images no longer referenced | | |
| 6 | Back buttons always went to a fixed page | Navigation review | Back returns to the page you came from | | |
| 7 | "Leave site?" prompt after saving a building | Manual test | The form is marked saved right after a successful save | | |
| 8 | Maps drew over the top bar and bottom tabs in Admin | Screenshot | Maps are isolated under the floating bars | | |
| 9 | Map went blank after unlocking edit mode on walking paths | Reproduced with a browser test | A Vue :class binding erased the map's own classes; styling applied by hand | | |
| 10 | Same room number blocked across buildings 1-A and 1-B | Admin could not register room 1101 | Room numbers are unique per building | | |
| 11 | Automated checks out of date (15 of 71) | Ran tests/e2e/run.py twice | Campus-only checks pass (7 of 7) with the setting on; the others to update | | |
