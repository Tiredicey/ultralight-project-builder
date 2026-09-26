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

## Verified in this build (2026-09-26)

| Check | Result | How |
|---|---|---|
| `m53p.ucc.cloud` reachable | Yes, 141.44.39.20, HTTP 200 | `curl` from sandbox |
| WebGUI login ids | `#sap-user`, `#sap-password`, `LOGON_BUTTON`, client field prefilled 236, system "M53 - Global Bike 4.3", S/4HANA 2023 | Live DOM read with Playwright |
| Owner gate | Pending user gets 403 on jobs and admin until approved | API test |
| Runner claim, frame stream, DOM map | Frame of the real SAP logon page with 6 mapped elements | Local runner |
| Canvas input | Remote click plus typing put `LEARN-626` into the SAP User field; password value not captured | Frame read-back |
| Abort | Job ends `aborted`, summary recorded | API test |

## Not confirmed

- **A full automated run of Tasks 1 to 14 against SAP.** Not executed here. I did not have a confirmed current password for any account and did not want to risk locking a real user. The grid, tab, tree and menu selectors come from the previous session notes (grid ids like `M0:46:1:4:1:2B256:1`, Tab-commit) and generic WebGUI roles. They are not re-verified against this system. Steps that cannot locate their target hand off to the operator instead of guessing.
- **Tasks 3 and 5 network graph.** Earlier notes say the Fiori app was not assigned to automation sessions. The pack uses `CJ2B` with a manual hand-off; that transaction's availability on M53 is not confirmed.
- **Task 13 transaction.** The sheet names the Fiori app "Create Incoming Invoices"; the pack uses `FB60`. Not confirmed that the grading monitor accepts an FB60 posting.
- **Cloudflare deployment.** Not deployed from this session; no Cloudflare token was configured.

## Stack

Hono 4 on Cloudflare Pages, D1, vanilla ES modules frontend (no framework, Geist type), Playwright 1.63 runner.
