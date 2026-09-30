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
| `/api/admin/*` | owner/admin | Users, grants, accounts, runner tokens, settings, audit, `POST/PUT/DELETE /admin/docs` |
| `/api/runner/*` | runner token | Hello (self-report), claim, state and command sync, frames, evidence |

## Data (D1)

`users`, `sessions`, `sap_accounts`, `grants`, `runners`, `jobs`, `events`, `frames` (one live frame per job), `commands`, `evidence`, `settings`, `audit`, `runner_info`, `docs`, `doc_chunks`. Schema in `migrations/0001_init.sql` and `0002_docs_runner_info.sql`. The API also creates the 0002 tables on first request (`CREATE TABLE IF NOT EXISTS`), so a deploy that skipped the migration still works.

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

## Stack

Hono 4 on Cloudflare Pages, D1, vanilla ES modules frontend (no framework, Geist type), Playwright 1.63 runner.
