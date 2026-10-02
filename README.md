# Ultralight Project Builder

Owner-gated control site plus a Playwright browser subagent for **IT2406 Performance Task 1: Project Management (PS) and Financial Accounting (FI), Development of Ultralight Bike** on SAP WebGUI (`m53p.ucc.cloud`, system M53, client 236).

The site streams the real SAP screen to a live canvas, overlays the captured DOM fields, types the task data, verifies each step against the SAP status bar, and hands control back to a person whenever SAP needs one.

## Architecture

| Part | Where it runs | Role |
|---|---|---|
| Control site (`src/`, `public/`) | Cloudflare Pages + D1 | Accounts, owner approval, SAP allowlist, job queue, frame relay, commands, evidence |
| Task pack (`shared/pack.js`) | Both sides | The 14 tasks as typed steps, generated per `LEARN-###` suffix |
| Runner (`runner/`) | A machine you control | Headless Chromium on SAP WebGUI, streams JPEG frames with a DOM map, executes canvas commands |

Cloudflare Workers cannot run a browser, so the runner must be a PC, VM or CI box with Node 20+ and outbound HTTPS. It only makes outbound calls, so no port forwarding is needed.

## Features

- **Owner gate.** The first account becomes the owner. Everyone else lands in `pending` and sees nothing until the owner approves them **and** grants at least one SAP account. Owner can reject, suspend, promote to admin, close registration. Every decision goes to the audit log.
- **SAP allowlist, client 236.** Only `LEARN-###` accounts the owner added can be driven. Several accounts with different passwords are supported.
- **Passwords.** Either stored only on the runner (`SAP_ACCOUNTS`) or entered per run; per-run passwords are sealed with AES-GCM using `APP_SECRET`, handed to the runner once at claim time, then deleted from D1. Frame DOM capture never records password values.
- **Active canvas.** Click, double-click, scroll, type and special keys (F4, F8, Ctrl+S, Tab, Enter) are relayed to the real page. Hover shows the SAP field title from the DOM capture. The first manual input pauses automation.
- **Step engine.** `txn`, `openProject`, `overview`, `tab`, `grid` (columns located by header text with fallback to column numbers proven in earlier runs, Tab-commit per cell), `fill`, `check`, `menu`, `save` (only succeeds if the status bar matches), `expectText`, `expectField`, `shot`, `manual`.
- **Honest status.** A step shows `done` only after SAP read-back. Operator-completed steps are logged as "Marked done by operator, not verified by automation".
- **Evidence.** Screenshots plus DOM captures (fields, grid cells, status bar) per task, downloadable for the Word report.
- **Project data view.** Every value for `P/2###`, the WBS, 14 activities, 22 relationships with a computed network (ES, EF, float), milestones and the cost bridge.
- Modes: **Assist** (default), **Autopilot**, **Observe** (read-only, canvas input blocked server-side), **Validate** (read-only per-task check, see below).
- **Task sheet** (runner 1.2 / site 2026-09-27). Every value the pack types, per task, with a "how to check it yourself" line. Prints to PDF with a light print stylesheet (9 A4 pages). Also opens as a side drawer on the live canvas, showing the task the run is on.
- **Task PDF.** The owner uploads the official task sheet (up to 20 MB, stored in D1 as 900 KB base64 chunks, `%PDF` header checked). Approved users open it from Task sheet; each task links to its page via a task-to-page map the owner fills in.
- **Validate mode and Readiness.** A validate run logs in and reads SAP: project tree (WBS, 16 activities, PS text, milestones, REL status), all 22 predecessor links, activity 0135 costs and flexible flag, and the cost report (1,750.00 labour, 9,700.00 invoice, 11,450.00 total). Each task is marked done, not done, or "check evidence" for screenshot-only tasks 3, 5, 9. Nothing is saved. The Readiness page combines this with runner status: online, version, host, SAP reachability, which accounts it holds passwords for.
- **`npm run doctor`** on the runner machine: Node, `.env`, token accepted by the site, token scope, version, SAP reachable, Chromium launches. Prints a fix per failure; does not log in to SAP.
- **Oracle Cloud runner.** `deploy/oracle/setup.sh` installs Node 20 and Chromium on Ubuntu or Oracle Linux (x86 or ARM), adds swap on 1 GB shapes, stores `.env` with mode 600, runs doctor, and installs the `ultralight-runner` systemd service (starts on boot, restarts on crash). Runs keep working with your PC off.
- **Demo video** (65 s, royalty-free audio) embedded in the Owner console, served from `/static/demo.mp4`.
- One active run per SAP user, since WebGUI allows one dialog session per logon.

## Routes

| Path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Status, whether an owner exists |
| `POST /api/auth/register` `login` `logout`, `GET /api/auth/me` | none | Sessions (HttpOnly cookie, PBKDF2-SHA256 100k) |
| `GET /api/pack` | none | Task list |
| `GET /api/me/accounts`, `GET /api/me/plan/:sapUser` | approved | Granted accounts, generated plan |
| `GET/POST /api/jobs`, `GET /api/jobs/:id`, `/plan`, `/frame`, `POST /commands`, `GET /evidence/:eid` | approved | Runs, live frame, canvas commands, evidence |
| `GET /api/me/sheet/:sapUser` | approved | Task sheet: values and how-to-check per task |
| `GET /api/me/readiness` | approved | Runners (host details owner-only), accounts, last validate result per task |
| `GET /api/me/docs`, `GET /api/me/docs/:id/:idx` | approved | Uploaded task PDF metadata and chunks |
| `/api/admin/*` | owner/admin | Users, grants, accounts, runner tokens, settings, audit, `GET /admin/usage` (D1 rows today), `POST/PUT/DELETE /admin/docs` |
| `/api/runner/*` | runner token | Hello (self-report), claim, state and command sync, frames, evidence |

## Data (D1)

`users`, `sessions`, `sap_accounts`, `grants`, `runners`, `jobs` (with `watched_at`, added on first request), `events`, `frames` (one live frame per job), `commands`, `evidence`, `settings`, `audit`, `runner_info`, `docs`, `doc_chunks`. Schema in `migrations/0001_init.sql` and `0002_docs_runner_info.sql`. The API also creates the 0002 tables on first request (`CREATE TABLE IF NOT EXISTS`), so a deploy that skipped the migration still works.

## Updating to this version

1. Push to `main`; Cloudflare Pages rebuilds the site. Optionally `npm run db:migrate:prod` (the API creates the new tables on its own).
2. On every runner machine: `git pull && cd runner && npm install`, restart, then `npm run doctor`. Readiness flags runners that still report 1.0 or 1.1.
3. Owner console: upload the task PDF and fill the task-to-page map.

## Setup

**Technical version: [SETUP.md](SETUP.md).** Short form:

```bash
npm install
npx wrangler d1 create ultralight-builder-production
npm run db:migrate:prod
npx wrangler pages secret put APP_SECRET --project-name ultralight-project-builder
npx wrangler pages secret put SETUP_KEY --project-name ultralight-project-builder
npm run deploy
```

Runner:

```bash
cd runner && npm run setup && cp .env.example .env && npm start
```

## Validation

**2026-09-27, runner 1.2.** Live validate run #3 on M53/236, LEARN-626, P/2626: all 11 checkable tasks pass in SAP (1, 2, 4, 6, 7, 8, 10, 11, 12, 13, 14); tasks 3, 5, 9 are screenshot-only. Doctor 10/10. `scripts/e2e-local.sh` 13/13, `scripts/e2e-features.sh` 22/22 (task sheet, validate plan, read-only enforcement, runner hello, readiness, 2.5 MB PDF round trip byte-identical, non-PDF and oversize rejection, user vs owner access). Browser QA: no console errors on Readiness, Task sheet, canvas drawer, Owner console, Setup guide.

Earlier:

Run it yourself against your own account (read-only, changes nothing in SAP):

```bash
cd runner && npm run validate            # all checks
cd runner && npm run validate project    # tree, WBS, milestones, release, 0135
cd runner && npm run validate costs      # cost report only
bash scripts/e2e-local.sh                # control site API against wrangler dev on :3000
```

### Results on 2026-09-27 (M53, client 236, LEARN-626, P/2626)

| Area | Result | Source |
|---|---|---|
| Grading monitor | Steps 1, 2, 4, 6, 7, 10, 11 green, 96 % | User screenshot. Step 13 grading not re-read after the invoice. |
| Live read-back | **38/38** | `runner/validation/results.json` |
| Project tree | 6 WBS, 16 activities (14 + 0045 + 0135), no strays, PS text `PH-626-1`, milestones 00004/00005/00006 | `validate project` |
| Relationships | 22 links read back from each successor's Relationship Overview | `validate rels` |
| Release | System status `REL` | `validate project` |
| Task 10 | 0135 costs `8,000.00`, flexible duration ticked | `validate project` |
| Cost report | Actual 11,450.00 / Commitment 5,000.00 / Total 16,450.00 / Plan 49,433.14. Labor 1,750.00, other operating expenses 9,700.00 actual vs 8,000.00 plan | `validate costs` |
| Control site API | **13/13**: owner gate, pending 403 on jobs and admin, allowlist, bad LEARN id rejected, runner token, one job per SAP user, bad runner token refused, runner claim | `scripts/e2e-local.sh` |
| Runner through the site | Job #1, Task 12 in observe mode: login, report executed, totals parsed, screenshot + DOM evidence stored, live frame (97 mapped elements) | Local run against wrangler dev |

### What changed in runner 1.1 and why

Each change fixes a failure seen live on M53:

| Problem seen live | Fix |
|---|---|
| Ticking **Scs** in the relationship grid did not persist; one wrong link got saved | Relationships are entered from the successor as **predecessors** (Scs unticked), 2 save batches, then read back (`relationsPred`) |
| Grid values vanished on Enter | Every cell is committed with **Tab** before Enter (`putCell`) |
| Tree clicks hit the wrong node after scrolling | Every tree selection is checked against the **header activity number** and retried; far rows get sibling WBS nodes collapsed first (`selectTreeObject`) |
| The old selector matched `[role=treeitem]`, which does not exist in this tree | Rows are read as paired `mrss-cont-left/none-Row-N` tables (`treeRows`) |
| PS text language went into the format column | Language is typed into the `PLTXSPRAS-SPRAS` column reached by Tab; SAPScript format picked in the popup; editor text saved with F3 (`psText`) |
| Milestone flags were a manual step | Milestone node is selected in the tree and the three checkboxes (trend, progress, "Reference for offset") are ticked by title (`milestone`) |
| Field "Amount" does not exist on activity 0135 | Field is "Costs in the activity"; flag is "Indicator: flexible duration" (`activityFields`) |
| CN25 network was a manual step | Network number comes from the project tree; Final and Completed are unticked, dates cleared, 35 h entered, 45 h remaining checked before save (`confirmActivity`) |
| Cost report field labels did not match | Uses the real labels: Project definition, Controlling Area, Version, Fiscal Year ×2, Period Block ×2 (`costReport`) |
| Save flagged "Project P/2626 is being changed" as failure | That is the WebGUI success text after Ctrl+S in CJ20N; a re-read confirms the data |

## Session 2026-09-29 (LEARN-653, P/2653)

| Item | Result | Source |
|---|---|---|
| Live site login as owner | OK, `/api/health` initialized | curl |
| Oracle runner | online, 1.2.0 | `/api/me/readiness` |
| Validate run #5, LEARN-626 | SAP rejected the runner's stored password; aborted to avoid a lock | job 5 events |
| Validate run #6, LEARN-653 | 1 of 11 pass; P/2653 did not exist (`CJ03`: "does not exist") | job 6, `docs/evidence/` |
| Task 1 for P/2653 | Saved. 6 WBS, PE+Acct, CA EU00, cost centres read back | `docs/evidence/t1-wbs-responsibilities.jpg` |
| Task 2 activities 0010-0140 + WBS | Saved, network 4000100, tree read back | `docs/evidence/t2-activity-overview.jpg` |
| Task 2 0045 / 0135, tasks 3-14 | Not done | |
| Bug fix | Validate summary could print negative counts (`-3 of 11`) after an abort | `runner/src/index.mjs` |
| New | `npm run probe` read-only check of which projects a user has | `runner/src/probe.mjs` |

Runner machines must `git pull` to get the summary fix. Word report: `python3 scripts/build_report.py`.

## Session 2026-09-30: Autopilot results, runner 1.3, many accounts

| Item | Result | Source |
|---|---|---|
| Autopilot run #9, LEARN-653, tasks 1-14 | done, 84 steps, 72 verified, 12 skipped as already done, 0 failed, 0 by operator | job 9 events |
| Validate run #11 | 11 of 11 pass | job 11 |
| Observe #12, Assist #13 | done; Observe rejects canvas input | jobs 12, 13 |
| Autopilot run #18, task 9 | CN41N profile popup now filled (the run #9 screenshot still showed the popup) | job 18, `docs/evidence/job18-t9-structure.jpg` |
| SAP state P/2653 | network 4000100, status REL, milestones 255/256/257, FB60 document 1900000063, report actual 11,450.00, commitment 5,000.00, plan 49,433.14 | S_ALR_87013542 read-back |
| Word report | `python3 scripts/build_report.py` builds `IT2406_Performance_Task_1_Ultralight_Bike_LEARN-653.docx` | |

### Many accounts at once

Nothing is tied to one account. Project, supplier and PS text come from the three digits of `LEARN-###` (`P/2###`, `114###`, `PH-###-1`), so any account gets its own objects.

- **One job per SAP account.** The site returns 409 for a second active job on the same user. SAP allows one dialog session, and this also stops two runs from writing to the same project.
- **Different accounts run side by side.** For example, LEARN-653 can be on Task 5 while LEARN-### runs Tasks 1-14. Each job gets its own browser context and SAP session, and they share no state.
- **No double claims.** A claim is an atomic `UPDATE ... WHERE status = 'queued'`. The runner sends the accounts it is already running (`busy`), and the site skips those.
- **Scaling.** Add more runners, or raise `MAX_JOBS` on one runner. `MAX_JOBS` defaults to what memory fits (about 450 MB per job, at most 8).
- **Limits.**
  - A token can be limited to accounts (set when it is created, or later with Owner console > Runners > Save limit, `PUT /api/admin/runners/:id`).
  - A runner can limit itself with `ONLY_ACCOUNTS=LEARN-653`.
  - An empty limit means any account.
- **Allowlist several accounts at once.** Enter `LEARN-101, LEARN-102 LEARN-103`. Each value is checked, and anything that is not `LEARN-` plus three digits is rejected.
- **Queue warning.** If no runner may take the account (limit, `ONLY_ACCOUNTS`, or no password), or none is online, the site says so when the job is queued.
- **Stale jobs.** A claimed job that never starts is re-queued after 2 minutes. A running job whose runner goes silent for 3 minutes is failed, which frees the account.

Tested locally (wrangler + D1):
- 5 accounts (653, 626, two random ones, 777) with 3 tokens (any, only 653, two random) and two processes on the same token.
- Every account was claimed exactly once and every limit held.
- A second job for 653 got 409, and `LEARN-12` was rejected.

On the live site, multi-add, Save limit and the queue warning were checked with curl.


## Export submission (2026-09-30)

The **Export submission** page builds the IT2406 Word file in one click. You no longer need to download screenshots one at a time.

- **What goes in the .docx:**
  - Cover table: student, section, SAP user, system/client, project, supplier, PS text, generation time.
  - Task summary table: all 14 tasks with status, transaction, timestamp and run number.
  - The 9 required screenshots, each captioned with its transaction, what it shows, and when and in which run it was captured.
  - Task data tables: WBS, activities, special activities 0045/0135, 22 relationships, PS text and milestones, postings.
  - Conclusion: a plan-versus-actual table plus four sentences.
- **Where it is built:** in the browser (`public/static/docx.js`, a plain OOXML writer with a stored zip, no dependencies). The server only returns the evidence list (`GET /api/me/submission/:sapUser`), so the Worker CPU limit is never hit.
- **Unsuitable captures are left out:**
  - A screenshot taken in a run that skipped the task because it was already done.
  - A cost report whose read-back actual does not match its task (Task 8 should show no actual, Task 12 should show 1,750.00).
  - A Task 3 graph with more than one earliest-start date (the links already existed).

  Each figure card and the document say why a capture was left out, and **Attach / Replace** puts your own image in its place.
- **Conclusions** (`public/static/conclusions.js`):
  - 42 variants per LEARN-###. Each one is built from four sentence pools (plan change, labour actual, invoice, outlook) of 42 sentences each.
  - All 168 sentences are different, and the four pools are indexed so no two variants share a sentence.
  - The default variant is a hash of the LEARN number. Over LEARN-100 to LEARN-999, every variant is used 14 to 27 times, so classmates start from different text.
  - Previous, Next and Shuffle pick another variant.
  - Project, supplier and LEARN number are filled in for each account.
- **Test on the live site (2026-09-30, LEARN-653):**
  - `runner/dev/exportcheck.mjs` clicked Export and got `IT2406_PT1_LEARN-653_P2653.docx` (1.3 MB) with no page errors.
  - python-docx opened it, and LibreOffice converted it to a 9-page PDF.
  - Attaching the correct Task 8 and Task 12 images from `docs/evidence` worked.
- **Not confirmed:**
  - Opening the file in Microsoft Word itself. It was only checked with python-docx and LibreOffice.
  - Tasks 3 and 11 for LEARN-653 still have no suitable screenshot on the site:
    - Task 11: CN25 was never captured by a run that actually posted it.
    - Task 3: the "before" state no longer exists, because the links are in place.

## Export: clean by default (2026-10-01)

The exported .docx now contains only the screenshots with their captions, the conclusion heading and the conclusion sentences, plus the cover details as plain lines. Everything else is left out unless you switch it on in the **In the document** card on the Export page. The choice is saved in this browser (`localStorage` key `uc_export_parts`).

| Option (off by default) | What it adds back |
|---|---|
| Cover details as a table | Student, section, SAP user and project as a 2-column table instead of plain lines |
| Task summary table | Status, transaction and run for all 14 tasks |
| Task data tables | WBS, activities, special activities, relationships, PS text and milestones, postings |
| Plan versus actual table | Cost element table above the conclusion |
| Conclusion variant line | "Conclusion variant N of 42 for LEARN-###" |
| Missing screenshot notes | The task heading and "Screenshot not captured yet..." for a figure with no usable image |
| Capture check notes | Italic note under a flagged screenshot |

**Include all** turns everything on, **Clean default** turns everything off. The conclusion variant picker on the page still works: it changes the text, and the variant line only goes into the file if you switch that option on.

**Checked (sandbox, LEARN-636 data, Node with stubbed image loading):** default export had 0 tables and none of the variant line, "not captured" or "Note:" text; with all options on it had 9 tables and all three texts. python-docx opened both files.
**Live site (2026-10-01, LEARN-636):** the default export gave `IT2406_PT1_LEARN-636_P2636.docx` (0.9 MB) with 6 screenshots, 0 tables, no variant line and no missing-screenshot notes. With **Include all** it had 9 tables, the variant line and the notes. The setting stayed at 0 of 7 after a page reload. There were 0 script errors after the `extras.js` fix: the Run pack add-on used to write into `#xPick` after you had already left that page.
**Not confirmed:** opening the files in Microsoft Word itself (only checked with python-docx).

## Interface (2026-09-30, final design pass)

The earlier motion pass gave each of the 9 pages its own colour set, animated drawing and outline word, plus gradient headings, pulsing dots, a particle canvas and card tilt. That broke the one-accent rule in `facts.txt` (sections 21.2, 21.5 and 22.A) and competed with the SAP screenshots for attention. This pass keeps every feature and changes only the look.

- **One accent.** Brass `#7a5c26` light / `#c9a86a` dark on off-black `#15171a` and paper `#f4f2ee`. One corner radius (10 px) everywhere. No gradient text, glow, pulsing dot, particle canvas, tilt or shine.
- **Page headers.** Kicker, one `<h1>`, one line of text, status pills, actions. A hairline rule separates the header from the content.
- **Contrast (WCAG 2.x formula).** Before the change, light-mode accent text on the page background was 4.49:1 (fails AA). Now:

  | Pair | Light | Dark |
  |---|---|---|
  | Body text / background | 14.78 | 14.16 |
  | Muted text / card | 5.71 | 6.28 |
  | Accent / background | 5.55 | 7.95 |
  | Button text / accent | 5.94 | 7.91 |
  | Accent / soft-accent tint | 4.92 | 5.60 |

- **Loading and errors.** Every page shows a spinner and a line of text the moment you open it. Before the change, the Owner console stayed blank for the 1.8 s its data took. If a page fails to load, it shows the error and a **Try again** button. An expired session sends you back to sign-in.
- **Theme.** The theme button says which theme it switches to and is also in the phone top bar (it was desktop-only). `theme-color` meta tags match the page background.
- **Phone.** The top nav scrolls sideways on its own and keeps the current page in view. Stacked layouts use `minmax(0, 1fr)`: before the change, the Setup guide code blocks and the top bar widened every page to 1,285 px on a 390 px screen.
- **Login page.** The same brass accent. The background video is dimmed and greyscale. The facts are split by rules instead of glass tiles, and the screenshot strip runs slower and pauses on hover or keyboard focus.
- **Kept:** view transitions (short fades), reveal on scroll, count-up, typed headline. With reduced motion set, these are off and the video stays paused.
- **Keyboard:** task and mode tiles show a focus ring. The Attach buttons on Export show a focus ring when their file input has focus.
- **Checked on 2026-09-30:**
  - `runner/dev/sitecheck.mjs` ran against wrangler dev in 4 modes: dark and light (all 9 pages each), phone 390 px and reduced motion (4 pages each). Result: 0 script errors, no sideways scrolling, one `<h1>` per page, content visible within 120 ms, nothing left hidden.
  - The script now reads `clientWidth`. The old `innerWidth` check missed the phone overflow above, because on a mobile viewport `innerWidth` grows with the page.
  - `scripts/e2e-local.sh` 13/13 and `scripts/e2e-features.sh` 22/22. The runner-version assertion in the second script expected 1.2.0 and failed before this change. It now expects 1.3.0, the version the site reports.
- **Live canvas on a finished run.** The canvas polled the frame every 700 ms and never waited for the previous request. A 175 KB frame takes about 1.6 s, so up to three requests overlapped, and a finished run could sit on "Waiting for the runner" for several seconds. Before this fix, a Playwright probe caught three concurrent `since=-1` requests on the live site. The canvas now sends one request at a time and drops a reply that belongs to a run you have left. A finished run says "Loading the last frame".
- **Not confirmed:** Safari and Firefox. Only Chromium (Playwright 1.63) was used.

## Session 2026-10-01: Step 2.2 on LEARN-636, scroll lock, runner 1.3.1

**What was stuck.** Run #23 (LEARN-636, Autopilot, tasks 1-14) stopped at step 2.2 with `Tree object P/2636 not found`, and stopped the same way again after Retry.

**Cause.** The SAP frame from that run shows a different tree rendering. In this session, CJ20N draws the project tree as `tree#C109#<row>#…` buttons, with the IDs in a `TECH_KEY` column. The runner only knew the `mrss-cont-left/none-Row-N` table rows seen on LEARN-626 and LEARN-653, so it read 0 rows. A later frame also showed SAP's "Session has timed out" popup, left from the time the run waited for a person.

| Fix | Where |
|---|---|
| The tree reader falls back to the `tree#Cnnn` layout. It takes IDs from `TECH_KEY`, the level from the indent, and the node type from the icon title. It adds the network number to activity IDs and skips the Templates tree. Expand uses the tree's "Expand All". | `runner/src/sap.mjs` `treeRows`, `altTreeRows`, `pickTreeRow`, `selectAltRow` |
| Session recovery: if the "Session has timed out" popup appears, the runner clicks Reload and logs in again with the password the run already had. | `recoverSession` |
| A failed tree or screen step is retried once automatically from the task's last `openProject` before it asks you. If SAP reset the screen while the run was paused or waiting, the project is reopened before the run continues. | `runner/src/index.mjs` |
| Error text now lists the tree rows that were read, so the next layout change can be diagnosed from the log alone. | `selectTreeObject` |
| **Hands-free updates.** When the site reports a newer runner and no job is running, the runner runs `git pull --ff-only`. It runs `npm install` only if the lockfile changed. It then exits, and systemd or pm2 restarts it on the new version. Set `AUTO_UPDATE=false` to turn this off. | `selfUpdate` |

**Live canvas: scrolling and pausing.**

| Before | Now |
|---|---|
| Whenever the pointer was over the canvas, the mouse wheel went to SAP, even if you had not clicked the canvas. On a large monitor most of the page is canvas, so the page seemed locked. | The wheel goes to SAP only after you click the canvas. Clicking anywhere else gives the page back its scrolling. The hint under the canvas says which state you are in. |
| Every 1.5 s, the step list was rebuilt and `scrollIntoView` was called on the current step. That pulled the window back to it ("snap"). | The step list is only redrawn when something changes. The window is never scrolled. The list scrolls itself only when the step changes, and not within 6 s of you touching it. |
| The prompt (14 values for step 2.2) was rebuilt every 1.5 s, so a button could move while you clicked it. | The prompt is rebuilt only when it changes. Values are folded (open when there are 4 or fewer). **Retry automation** comes first. |
| Pause and Resume were always enabled. | Each button is enabled only when it applies. |

**Tests (sandbox, 2026-10-01).**
- `runner/dev/treecheck.mjs` runs on a page built from the LEARN-636 frame structure and on the old layout: **10/10**.
- `scripts/e2e-local.sh` **13/13**, `scripts/e2e-features.sh` **22/22**.
- Playwright on the canvas with a waiting 2.2 prompt:
  - The wheel over the unfocused canvas scrolls the page, and it stays there across polls.
  - The prompt element survives polls.
  - The step list keeps your scroll position (500 px) across polls.
  - The focused canvas takes the wheel.
  - A click outside the canvas releases it.
  - 0 console errors.

**Not confirmed.**
- A live LEARN-636 run on runner 1.3.1. The Oracle runner was still on 1.3.0 when this was written, and 1.3.0 cannot update itself.
- Tasks 3 to 14 on the `tree#` layout. Recipes that find tree rows by text work through the same `treeRows`. Grid recipes do not use the tree.

**One manual update to get 1.3.1.** Run this once on the Oracle VM. Later versions install themselves.

```bash
curl -fsSL https://raw.githubusercontent.com/Tiredicey/ultralight-project-builder/main/deploy/oracle/setup.sh | bash
```

After that, start a new run for LEARN-636 (Autopilot, tasks 1-14). Task 1 is skipped because P/2636 already exists.

## Live test 2026-10-01: fresh LEARN-641, Autopilot, tasks 1-14

**Result.** Run #25 finished with **84 of 84 steps verified, 0 failed, 0 skipped**, and all 9 required screenshots were stored.

| Task | Read back from SAP |
|---|---|
| 1 | P/2641 created, profile DE01000. 6 WBS elements with PE, Acct, CA EU00 and cost centres |
| 2 | 14 activities (duration, work, work centre, WBS). 0045 service lines 5,000.00. 0135 10,000 EUR on 6300000. Network 4000110 |
| 3, 5 | Network graph: 16 activities. After the links: 11 distinct earliest-start dates |
| 4 | 22 predecessor links in 2 saves |
| 6 | PS text PH-641-1. Milestones 00004, 00005, 00006 with flags |
| 10 | 0135 costs 8,000.00, flexible duration |
| 11 | CN25 actual 35 h, remaining 45 h |
| 12 | Actual 1,750.00 |
| 13 | FB60 document 1900000068, supplier 114641, 9,700 EUR |
| 14 | Actual 11,450.00, commitment 5,000.00, total 16,450.00, plan 49,433.14 |

**Where the run stopped, and the fix for each.** The Oracle runner was still on **1.3.0**, so I cleared these stops on the live canvas. The code fixes ship in runner 1.3.1 and later.

| Step | What happened on a fresh account | Fix |
|---|---|---|
| 1.2 | CJ20N opens a first-time "Welcome to the Project Builder" dialog, then "User-specific options" (hierarchy levels 2). The Create button was hidden behind them. | `projectBuilderWelcome`: tick "Skip this in future", Set options, set hierarchy levels to 99, Continue. Runs on every CJ20N open. |
| 2.2 (1st) | SAP kept WBS P/2641 on activities 0020-0090 after one pass. | WBS assignment repeats up to 4 passes, pressing Enter every 4 cells, until all 14 rows read back. |
| 2.2 (retry) | The retry re-entered rows in the same session: "0020 already exists". | Read-back and row errors now reopen the project and retry automatically before asking anyone. |

**Not confirmed.**
- The fixes have not yet run on the Oracle runner, which is still on 1.3.0.
- The read-only Validate run for LEARN-641 could not start. The runner holds no password for LEARN-641 (job #26 was aborted while still queued).

**To make the next account fully hands-off:**
1. Update the runner once (`setup.sh`, below). From 1.3.1 on, it updates itself.
2. Add `LEARN-641:<password>` (and any new account) to `SAP_ACCOUNTS` in `runner/.env`.

## Session 2026-10-01 (later): LEARN-636 run #27 stuck at step 2.6, runner 1.3.2

**What happened (job #27 events, Oracle journal, last live frame):**

| Time (UTC) | Event | Source |
|---|---|---|
| 05:47 | 2.2 `Tree object P/2636 not found`. Runner was still 1.3.0 | journal |
| 06:42 | 2.2 marked done by operator | job 27 events |
| 06:42, 06:47 | 2.6 `Tree object undefined not found`, twice | job 27 events |
| 08:27-08:31 | Runner restarted onto 1.3.1, crash-looped 14 times on `EACCES /opt/ultralight/runner/.env`, then started | journal |
| now | Job #27 still shows `waiting` with no runner holding it. The last frame shows SAP "Session has timed out" | `/api/jobs/27`, `/frame` |

**Causes and fixes**

| Problem | Cause | Fix | Where |
|---|---|---|---|
| 2.6 `Tree object undefined` | `extService` looked up `ctx.vars.network || s.network`. The step has no `network` arg, and the P/2636 tree shows no network node (the frame has 7 rows: project definition plus 6 WBS) | One `overviewNode` helper for activities, 0045 and 0135: network if known, else top WBS of the opened project. A network lookup that fails falls back to the top WBS. The task pack now passes `project` to `extService` | `runner/src/recipes.mjs`, `shared/pack.js` |
| Stale network across projects | `vars.network` was kept when a reopened project had no network | `openProject` stores `vars.project` and clears `vars.network` when the tree has none | `runner/src/index.mjs` |
| Header check read grid cells | `headerValues` took every input between 100 and 200 px. On the job #27 frame the header field sits at y=196, 4 px inside the limit, so a taller toolbar would push it out (a preventive change, not the cause of a seen failure) | Range is 100 to 280 px, grid cells (`[r,c]` ids) excluded | `runner/src/sap.mjs` |
| Job left `waiting` forever after a runner restart | The runner kept polling, so the 3-minute silence rule never fired | The runner sends the job ids it holds on every claim. The site closes jobs assigned to that runner which it no longer holds, so the account is freed. Runners older than 1.3.2 do not send the list and are left as before | `src/api.ts` `/runner/claim`, `runner/src/index.mjs` |
| Self-update could not run, service crash-looped | `/opt/ultralight` and `.env` were owned by `ubuntu`; the service runs as `ultralight` | `setup.sh` takes ownership of the checkout, re-applies `600` and owner on an existing `.env`, adds `safe.directory` | `deploy/oracle/setup.sh` |

**Tests (sandbox):** `runner/dev/treecheck.mjs` 13/13 (new case C is built from the job #27 frame: no network row, Activity Overview falls back to the top WBS). `scripts/e2e-local.sh` 13/13, `scripts/e2e-features.sh` 22/22. Claim cleanup checked against wrangler dev: the job is kept while listed, kept for a runner that sends no list, and closed when the list is empty. A new job for the freed account is accepted.

**Live (2026-10-01 09:04 UTC):** Oracle VM ownership fixed, runner pulled and restarted on 1.3.2 (journal: `Runner 1.3.2 ... Waiting for jobs`). The site reports `latest 1.3.2` and runner 1.3.2 online. On its first claim, the site closed orphaned job #27 with "Runner restarted while this job was open", so LEARN-636 is free for a new run. The live login page loaded with 0 console messages.

**Not confirmed:** a live LEARN-636 run on 1.3.2. The runner holds passwords for LEARN-626 and LEARN-653 only (`/api/me/readiness`, `accountsWithPassword`). No LEARN-636 SAP password was supplied, so a new run needs it entered on the Launch page or added to `SAP_ACCOUNTS`.

## Session 2026-10-01: LEARN-636 complete, runner 1.3.4, safe to rerun from any task

**Result on live SAP (M53/236, LEARN-636, P/2636):**

| Run | Mode | Result | Source |
|---|---|---|---|
| Dev driver, tasks 2 to 14 one by one | live writes | Every task passed after the fixes below; FB60 document 1900000076 | sandbox driver log |
| #30 | Autopilot 1-14 through the site | **done, 84/84: 72 verified, 0 by operator, 0 failed, 12 skipped** (tasks 7, 11, 13 already in SAP) | `/api/jobs/30` |
| #32 | Validate 1-14 through the site | **11 of 11 checkable tasks pass**; 3, 5, 9 are screenshot tasks | `/api/jobs/32` |

SAP state read back: 6 WBS, 16 activities (network 4000123), 22 links, PS text PH-636-1, milestones 00004/00005/00006, status `REL NTUP`, 0135 at 8,000.00 and flexible, Labor 1,750.00, invoice 9,700.00, actual 11,450.00, commitment 5,000.00, plan 49,433.14.

**Errors found on LEARN-636 and the fix for each**

| Step | Error | Cause (seen in the live DOM) | Fix |
|---|---|---|---|
| 2.2 (run #28) | `Clicked tree row but header shows nothing` | The reader clicked a 0x0 `tree#C109#2#1-arialabel` span | Only visible `…#i` cells are read as columns |
| 2.7 | `Tree object P/2636 not found (20 rows: Individual Objects…)` | After the service screen, the 0045 grid was read as the tree | The project tree wins whenever it shows a Project Definition or WBS row |
| 4.16, 6.11 | `Tree object 0130 not found` | The tree renders about 24 rows; 0130, 0140 and P/2636-5 only appear after scrolling | `findAltRow` scrolls the tree down and up until the row appears; on a miss it reports every row it saw |
| 7.2 | `menu button not found` | At 1920 px WebGUI shows a menu bar (Project, Edit, …) instead of one Menu button | `clickMenu` falls back to the bar item, then walks the submenu |
| Validate 1, 2, 6, 7, 10 | `Could not open P/2636 in CJ20N` | A double-click in the worklist only opened a preview | Shared `openProject`: worklist first, then the Open dialog |
| Validate 4 | `Tree object 0020 not found` | Same preview | Same |
| Any | One retry only | | Up to 3 automatic retries from the task's `openProject`, plus session recovery |

**Starting at Task 1 when later tasks are already done.** Every task checks SAP before it writes:

| Task | What is checked first | When it is already there |
|---|---|---|
| 1 | Project exists | Creation skipped, WBS kept |
| 2 | Each activity row, 0045 service flag, 0135 cost | Rows left, "already exists", "left unchanged"; save reports "Data not changed" |
| 4 | Predecessors per activity | "(already present)", nothing added |
| 6 | PS text node, milestone usage and flags | Left, only missing flags ticked |
| 7 | System status REL | Task skipped |
| 10 | Field values | Only differing fields typed |
| 11, 13 | Cost report actual on 8000000 / 6300000 | Whole task skipped, no second posting |

Checked live: tasks 2, 4, 6 run a second time changed nothing, and tasks 11 and 13 run a second time skipped on 1,750.00 and 9,700.00 actual.

**Durability**
- The runner updates itself when idle (1.3.2 to 1.3.3 to 1.3.4 happened with no login on the VM).
- A job the runner no longer holds after a restart is closed by the site, so the account is never blocked.
- The Oracle runner holds the LEARN-636 password in `runner/.env` (mode 600), so a run needs no password on the site.

**Tests:** `runner/dev/treecheck.mjs` all pass (new cases D: scrolled virtual tree, E: hidden aria span). `scripts/e2e-local.sh` 13/13, `scripts/e2e-features.sh` 22/22.

**Not confirmed:** a run on a LEARN account that has never had a project (a "fresh" Task 1 create on 1.3.4). LEARN-641 passed that path on 1.3.1 (run #25); P/2636 already existed before this session, so Task 1 creation was not exercised for 636.

## Page add-ons (2026-10-01)

`public/static/extras.js` adds a working tool to every page. It reads the page that is already rendered, so the original features are unchanged. Estimates come from your own finished runs, task status from Validate, and traces from the 22 relationships. Nothing is invented.

| Page | Add-on | What it does |
|---|---|---|
| Everywhere | Command palette | `Ctrl+K` or `/`: pages, all 14 tasks (opens the task sheet at that task), Validate per account, recent runs, theme, sign out |
| Everywhere | Shortcuts | `g` then `l c s r j p e g o` jumps to a page, `t` switches theme, `f` puts the canvas full screen, `?` lists them. Off while typing or while the canvas has focus |
| Sign in | Caps Lock warning | Under the password field while Caps Lock is on |
| Run pack | Before you start | Step count for the ticked tasks, a time estimate from your finished runs (seconds per step), and one click for "only the tasks not verified in SAP" from the last Validate |
| Live canvas | Run bar | Elapsed clock, time left at the current pace, Save frame (JPEG of the current SAP frame), Full screen, Alert me (browser notification when a run waits, finishes or fails while the tab is in the background) |
| Task sheet | Find and tick off | Search all values (for example `6300000`, `CN25`), click a value to copy it, a Done tick per task with a progress bar, saved in the browser |
| Readiness | Auto refresh, diagnostics | Optional 30 s refresh; Copy diagnostics puts every check and task cell on the clipboard as text |
| Runs and evidence | Status chips, viewer | Filter runs by status with counts; screenshots open in a viewer with Previous/Next, arrow keys and Download |
| Project data | Network trace | Hover or tab to an activity: its predecessors and successors stay lit, the rest fade, and a line lists them. Click jumps to the activity row. Tables get a filter and CSV export |
| Export submission | Drop and paste | Drag an image onto a figure, or click a figure and paste a screenshot, to attach it |
| Setup guide | Copy and progress | A Copy button on every command block, a tick per step with a progress bar |
| Owner console | Filter and CSV | Every table gets a filter box and CSV export |


**Check:** `runner/dev/extrascheck.mjs` uses every add-on at desktop 1440 px, phone 390 px and with reduced motion: **80/80** against wrangler dev and **86/86** on the live site (more checks run there because real runs exist: screenshot viewer, canvas run bar), 0 script errors, no sideways scroll. `scripts/e2e-local.sh` 13/13, `scripts/e2e-features.sh` 22/22.

**Not confirmed:** Firefox and Safari (only Chromium was tested). The headless test cannot show a real OS notification, so "Alert me" was checked only up to the permission prompt.

## Security alerts fixed (2026-10-01)

GitHub reported 3 CodeQL alerts and 6 Dependabot alerts on `main`.

| Alert | Plain-language cause | Fix |
|---|---|---|
| CodeQL #3, high: clear-text logging of sensitive information, `runner/src/validate.mjs:20` | `npm run validate` reads the SAP password from `SAP_ACCOUNTS`. The same function that prints results was given values that came from that line, so a login error that echoed the password would have printed it to the screen and into `validation/results.json`. | The password is read only through `localAccounts()` and kept in its own variable. Every printed or saved line passes through `redact()`, which replaces the password with `***`. Checked live on LEARN-636: 0 occurrences in the output and in `results.json`. |
| CodeQL #1, high: incomplete string escaping, `runner/src/recipes.mjs:359` | The code built a search pattern from the project number and only escaped `/`. Characters such as `.` or `+` kept their special pattern meaning, so `P.2636` would also have matched `P/2636`. | No pattern is built any more: the page text is split into words and compared exactly. Tested with 9 inputs (including `P.2636`, `P/2636+` and `.*`), and live Task 1 on LEARN-636 still finds P/2636. |
| CodeQL #2, medium: stack trace exposure, `runner/src/devdriver.mjs:24` | The developer test driver returned the full error trace, with file paths and code lines, to whoever sent the request. | The reply now has the error message only; the full trace goes to the server log. The driver also rejects any caller that is not on the same machine. |
| Dependabot #3, #4, #5, #6, #9, #10 (undici, 1 high, 2 moderate, 3 low) | `undici` is the web-request library inside `wrangler` and `miniflare`, the tools that build and preview the site. Version 7.29.0 had the bugs (for example, skipping TLS certificate checks in one connection mode, and caching one user's cookies for another). They are development tools only: the deployed site and the runner do not include undici. | `npm audit fix` moved wrangler to 4.145.0, miniflare to 5.20260930.0-alpha and undici to 7.29.1. GitHub's advisory data lists 7.29.1 as the first patched version for all six. `npm audit` now finds 0 vulnerabilities in the site and in `runner/`. |

**Regression after the fixes:** `scripts/e2e-local.sh` 13/13, `scripts/e2e-features.sh` 22/22, `npm run check`, `runner/dev/treecheck.mjs` all pass, `runner/dev/extrascheck.mjs` 80/80. Live SAP: Task 1 on LEARN-636 skipped creation correctly, and `npm run validate` logged in.

**Not confirmed:** the alerts closing on GitHub. The sandbox token cannot read the code-scanning or Dependabot APIs (HTTP 403), so I could not watch them close. They close by themselves when CodeQL and Dependabot rescan this commit.

## D1 free-tier write limit: cause, fix, fallback (2026-10-01, runner 1.3.5)

**What happened.** On 2026-10-01 the site answered every sign-in and save with `D1_ERROR: Your account has exceeded D1's free tier daily row write limit`. The Cloudflare dashboard showed 107.36k of 100k rows written for the day (screenshot from the owner). The free plan allows 100,000 rows written and 5,000,000 rows read per day, account-wide, reset at 00:00 UTC (source: developers.cloudflare.com/d1/platform/pricing, read 2026-10-01). Upgrading to Workers Paid ($5/month) lifts the cap to 50 million rows a month (same page).

**Where the writes came from** (read from `src/api.ts` and `runner/src/index.mjs` at 1.3.4, and from the Oracle runner journal):

| Source | Old behaviour | Rows per hour, one job running |
|---|---|---|
| Runner heartbeat (`needRunner`) | `UPDATE runners` on **every** runner request | ~6,000 (sync 1/s + frames up to 2/s + claim) |
| Job state sync | `UPDATE jobs` every second even when nothing changed | ~3,600 |
| Live frame | Upsert every 0.45-1.5 s, even with nobody watching | ~2,400-8,000 |
| Command delivery | `UPDATE commands` per delivered batch | small |
| Runner self-report | Rewritten every 5 min (SAP ping time always differs) | 12 |

An idle runner (no job) still wrote ~1,200 rows/hour from claim polls. Job #33 on LEARN-636 ran from 12:35 UTC and the limit was hit by 14:43 UTC. After that the runner journal shows **4,675** failed `WARN sync` lines today, one or two per second, each retry also counting against the limit.

**What changed.**

| Change | Effect |
|---|---|
| Heartbeat written at most every 30 s, or when the version changes; "online" means seen in the last 75 s | ~6,000 → 120 rows/hour |
| Job row updated only when status, step, prompt or result actually changed | idle sync writes 0 rows |
| Frames stored only while someone has the canvas open (`jobs.watched_at`, refreshed at most every 20 s by the viewer); first and last frame always stored | 0 rows when nobody watches |
| Runner self-report stored only when it changed (SAP ping rounded to 500 ms) or every 6 h | 12 → ~0 rows/hour |
| Commands acknowledged by id (`ack`) in the next sync; redelivered until acknowledged; runner ignores duplicates | no lost or doubled clicks at the limit |
| Schema check reads `sqlite_master` instead of running `CREATE TABLE IF NOT EXISTS` on every cold start | no DDL writes per isolate |

**Fallbacks when the limit is reached anyway.**

- **Sign-in still works.** If the session row cannot be stored, the site issues a 12-hour backup session: an HttpOnly cookie signed with HMAC-SHA256 over the user id, expiry and the stored password hash, using `APP_SECRET`. Changing the password invalidates it. Forged tokens are rejected.
- **Reading still works.** Runs, evidence, live frames, task sheet, project data, Readiness and Owner console load normally (reads have their own 5 million/day allowance).
- **Clear message instead of a raw error.** Every refused write returns HTTP 503 with `code: D1_WRITE_LIMIT`, `retryAt` (next 00:00 UTC) and `Retry-After`. The browser shows a banner with a countdown in local time.
- **Runner 1.3.5 backs off.** It keeps working in SAP, keeps up to 600 unsent log lines (drops `info` lines first), polls every 30 s while idle and every 2.5-6 s during a job, and sends the kept lines as soon as a write is accepted again. Runners still on 1.3.4 get a 503 so they keep their lines too.
- **Usage meter.** Owner console > Database allowance today shows rows written and read against the free limits, from Cloudflare's GraphQL analytics (`d1AnalyticsAdaptiveGroups`). It needs two optional secrets, see SETUP.md "Usage meter".

**Tests (sandbox, wrangler 4 + local D1).** `scripts/e2e-quota.sh` **26/26**. It checks heartbeat throttling, unchanged self-report, zero-write idle sync, frames only while watched, command redelivery and acknowledgement, then restarts the site with a simulated write limit (`--binding SIMULATE_D1_WRITE_LIMIT=1`, honoured only on localhost) and checks backup sign-in, reads, the 503 refusal with `retryAt` at 00:00 UTC, runner 1.3.5 and 1.3.4 behaviour, forged-token rejection and sign-out, then that the backup session survives once writes reopen. Runner buffer logic was run against the same simulated limit: 2/2 lines kept and the pause command applied once at the limit; both lines delivered and backoff cleared after. `scripts/e2e-local.sh` 13/13, `scripts/e2e-features.sh` 22/22, `npm run check` pass.

**Not confirmed.**
- The row-per-hour figures are computed from the code's polling intervals, not measured from Cloudflare analytics. Measuring needs the `CF_ANALYTICS_TOKEN` secret (or the dashboard after a day of use).
- The live site could not be tested at the real limit after the fix: today's allowance was already used up and resets at 00:00 UTC 2026-10-02.
- Whether the other three databases on the account (`gawk-capstone-sti-lipa-db`, `radartrack`, `radar`) used part of today's writes. The dashboard screenshot shows they ran 79, 8 and 0 queries, so `ultralight-builder-production` (289.13k queries) is almost certainly the main source, but per-database write counts were not visible.

## Display fixes (2026-10-02)

| Problem | Cause | Fix | File |
|---|---|---|---|
| Owner console "Database allowance today" rows squashed to a thin line, labels cut off (owner screenshot) | The rows used class `meter`, already defined in `fx.css` as an 8 px bar with `overflow: hidden` | Rows renamed `usage-row` with their own layout; numbers use tabular figures; wraps on phones | `public/static/app.js`, `style.css` |
| Card said "all 2 D1 databases" | Cloudflare analytics only lists databases that ran queries that day | Says "(2 D1 databases used today)" | `app.js` |
| Phone: limit banner filled about a fifth of the screen and stayed pinned | Long text, `position: sticky` | Under 640 px it shows one short line and scrolls away; Hide is remembered for the tab until the reset | `app.js`, `style.css` |
| Phone: top menu showed "pack" instead of "Run pack" | Active tab scrolled into view with `offsetLeft`, which is measured from the page, not the menu | Position measured relative to the menu | `app.js` |

**Checks (sandbox, Chromium 153 via Playwright, wrangler + local D1):** `runner/dev/sitecheck.mjs` dark, light, phone 390 px and reduced motion: 0 script errors, one `<h1>` and no sideways scroll on every page. `runner/dev/extrascheck.mjs` 80/80. Usage card at 1440 px and 390 px with 87,420 rows written: both rows 32 px / 54 px tall, nothing clipped, bar turns amber above 80%. Active phone tab fully visible on all 9 pages. Banner visible and hideable at 390 px dark and 1440 px light. `e2e-quota.sh` 26/26, `e2e-local.sh` 13/13, `e2e-features.sh` 22/22.

**Not confirmed:** Firefox and Safari (only Chromium was run); real phones (only a 390 px emulated viewport).

## Visuals pass (2026-10-02)

Three charts were added. Each one is drawn from data the site already has, so no figure is new or estimated. `public/static/viz.js` makes plain SVG and HTML, with no chart library.

| Where | What you see | Data it comes from |
|---|---|---|
| Live canvas, Steps card | A task ribbon: one tile per task in the run, coloured verified, check, failed, running or not started, with a bar for steps done. Clicking a tile scrolls the step list to that task's first step. Each tile has a label like "Task 6, PS text and milestones: failed, 9 of 12 steps" | The run's plan steps and the level of each step's event (`ok`, `warn`, `error`) |
| Runs and evidence | Every run row shows its mode and how long it took, plus a stacked bar: verified, skipped (already in SAP), by operator, failed. A key sits under the table. The run you opened is highlighted | `jobs.result` (`ok`, `skipped`, `manual`, `failed`), `step_total`, `started_at`, `finished_at`. A run that is still going shows `step_idx` of `step_total` |
| Project data | A schedule chart (Gantt) for all 16 activities in working days. Bars with zero float use the accent colour. A dashed line shows float up to the late finish. 0045 and 0135 have no duration, so they show as diamonds | The same CPM pass (`cpm()`) and 22 finish-to-start links as the network plan above it |

**Design rules followed** (`facts.txt` sections 21.2, 21.5, 23 and COMPANION C4, C5): one accent colour, no new fonts or radii, only background and border colours animate, touch targets at least 44 px, reduced motion turns off the flash, and the charts are hidden when printing.

**Contrast (WCAG 2.x formula) for the new colour pairs:**

| Pair | Light | Dark |
|---|---|---|
| Verified tile text / tile | 5.12 | 6.27 |
| Check tile text / tile | 4.71 | 6.73 |
| Failed tile text / tile | 5.47 | 6.02 |
| Running tile text / accent | 5.94 | 7.91 |
| Chart labels (muted) / striped row | 5.05 | 5.70 |

**Checks (sandbox, Chromium 153 through Playwright 1.63, wrangler dev with local D1, a seeded 84-step Autopilot run):**
- At 1440 px dark and light, 390 px phone, and with reduced motion: 0 script errors, one `<h1>`, and no sideways scrolling on the canvas, runs and project data pages.
- The ribbon shows 14 tiles, all at least 44 px tall. Clicking task 12 put step 12.1 at the top of the list, and it was still there 3.5 s later, after two polls.
- The schedule has 16 rows. Its 11 zero-float bars are the same 11 activities the network header lists. The project is 42 days long.
- `scripts/e2e-local.sh` 13/13, `scripts/e2e-features.sh` 22/22, `scripts/e2e-quota.sh` 26/26 (on a fresh local DB, as that script requires), `runner/dev/extrascheck.mjs` 80/80, `runner/dev/sitecheck.mjs` all 4 modes clean, `npm run check`.

**Follow-up fixes after checking the live site (same day):**

| Problem seen on the live site | Cause | Fix |
|---|---|---|
| Run #30: tasks 7, 11 and 13 showed as grey "not started" tiles, but SAP already had them | The runner skips a task that is already in SAP and logs "Task N: already done in SAP". The ribbon only counted step results | Those tasks get their own tile: green text, dashed border, labelled "already in SAP, skipped" |
| Runs and evidence at 390 px scrolled 96 px sideways | The detail column kept its inline `grid-column: span 2` after the grid dropped to one column, which created a second, 0 px column (`345px 0px`, read from the live page) | Below 1000 px, every `.grid3` child takes one column |

Checked in the sandbox with a seeded 84-step run (task 7 skipped as in SAP) and a run with 3 screenshots, in dark, light, 390 px phone and reduced motion: 0 script errors, 0 px sideways scroll on all three pages, task 7 tile shown as already in SAP. `npm run check`, `e2e-local.sh` 13/13, `e2e-features.sh` 22/22, `extrascheck.mjs` 80/80.

**Not confirmed:**
- Firefox, Safari and real phones. Only Chromium was run, and the phone was a 390 px emulated screen.


## Stack

Hono 4 on Cloudflare Pages, D1, vanilla ES modules frontend (no framework, Geist type), Playwright 1.63 runner.
