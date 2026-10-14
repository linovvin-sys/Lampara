# Work briefs: make Lampara reusable

Three independent jobs, one per Claude account. Each brief is self-contained: paste its "Start prompt" into a fresh session.

| # | Brief | Branch | Size | Merge |
|---|---|---|---|---|
| 1 | `01-cleanup.md`: remove indoor-AR leftovers, quick safety and scale wins | `cleanup` | small | first |
| 2 | `02-institution-config.md`: one settings record replaces ~30 hard-coded NCST references | `institution-config` | biggest (2 short sessions) | second |
| 3 | `03-data-pack.md`: export/import a whole school as one file, plus CSV room import | `data-pack` | medium | third |

Why this order: brief 1 deletes files that brief 2 would otherwise edit pointlessly, and both touch `scan.js`, so merge 1 before 2. Brief 3 only adds new files.

## Rules for every session

- Work on the branch named in the brief. Start with `git checkout main && git pull && git checkout -b <branch>`.
- **Commit after each numbered task**, with a short message and this trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. If the usage limit hits mid-job, the next window resumes from the last commit.
- **Back up the database first**: `php Backend/scripts/backup.php` (on MAMP use `/Applications/MAMP/bin/php/<version>/bin/php`). Never test destructive steps on the live local database; use a copy.
- Local site: `http://localhost:8888/lampara/`. Database settings are in `Backend/db.php` (not committed). PHP is not on PATH; use the MAMP binary and `php -l <file>` after PHP edits, `node --check <file>` after JS edits.
- **Keep checking cheap:** one browser look per task is enough. Do not run the whole test folder. Do not re-read the whole repo; read only the files named in the brief.
- Do not touch another brief's files. If you find something outside your scope, add a line to `docs/work-briefs/NOTES.md` and move on.
- Do not push to `main`. Push your branch (`git push -u origin <branch>`; if it fails with HTTP 400 use `git -c http.postBuffer=524288000 push ...`).
- When all tasks are done, write the result into the bottom of your brief under "Result" (what changed, what to check, anything left).

## Context (read once)

Lampara is a campus navigation PWA (PHP + MySQL + Vue/vanilla JS, no build step) for NCST. Student pages live in `Frontend/View/Public` and `Frontend/View/Student`; admin pages in `Frontend/View/Admin`; JSON APIs in `Backend/api`. Indoor AR is **no longer part of the product**. The goal of these briefs is to make the rest reusable by other schools: school-specific facts move out of code into data.
