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
- Modes: **Assist** (default), **Autopilot**, **Observe** (read-only, canvas input blocked server-side).
- One active run per SAP user, since WebGUI allows one dialog session per logon.

## Routes

| Path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Status, whether an owner exists |
| `POST /api/auth/register` `login` `logout`, `GET /api/auth/me` | none | Sessions (HttpOnly cookie, PBKDF2-SHA256 100k) |
| `GET /api/pack` | none | Task list |
| `GET /api/me/accounts`, `GET /api/me/plan/:sapUser` | approved | Granted accounts, generated plan |
| `GET/POST /api/jobs`, `GET /api/jobs/:id`, `/plan`, `/frame`, `POST /commands`, `GET /evidence/:eid` | approved | Runs, live frame, canvas commands, evidence |
| `/api/admin/*` | owner/admin | Users, grants, accounts, runner tokens, settings, audit |
| `/api/runner/*` | runner token | Claim, state and command sync, frames, evidence |

## Data (D1)

`users`, `sessions`, `sap_accounts`, `grants`, `runners`, `jobs`, `events`, `frames` (one live frame per job), `commands`, `evidence`, `settings`, `audit`. Schema in `migrations/0001_init.sql`.

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

## Not confirmed

- **Tasks 1 and 13 through the runner end-to-end.** Both were already done in SAP (monitor green, invoice visible in the report), so a write run would duplicate data. Task 1 WBS creation and Task 13 FB60 posting still use the original generic steps and hand off to the operator if they miss.
- **Task 2 `extService` recipe.** Written from the verified manual flow (grid `2B257`, service-spec lines 10 and 20, total 5,000.00), but not replayed, because 0045 already exists and the recipe skips it.
- **Tasks 3 and 5 network graph.** The pack keeps `CJ2B` with a manual hand-off. I did not open `CJ2B` on M53.
- **Step 13 on the grading monitor.** The report shows 9,700.00 posted. Whether the monitor turns Step 13 green is only visible to the user.
- **Cloudflare deployment.** Not deployed from this session.

## Stack

Hono 4 on Cloudflare Pages, D1, vanilla ES modules frontend (no framework, Geist type), Playwright 1.63 runner.
