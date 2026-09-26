# Setup guide

Three parts: the control site on Cloudflare, one runner that can reach SAP, and your approval for each user. Nobody can use the site until you approve them.

## 1. Control site on Cloudflare Pages

Requirements: Node 20+, a Cloudflare account, an API token with **Pages: Edit** and **D1: Edit**.

```bash
git clone https://github.com/Tiredicey/ultralight-project-builder
cd ultralight-project-builder
npm install
export CLOUDFLARE_API_TOKEN=...

npx wrangler d1 create ultralight-builder-production
```

Paste the printed `database_id` into `wrangler.jsonc` in place of the zeros, then:

```bash
npm run db:migrate:prod
npx wrangler pages project create ultralight-project-builder --production-branch main
npx wrangler pages secret put APP_SECRET --project-name ultralight-project-builder
npx wrangler pages secret put SETUP_KEY  --project-name ultralight-project-builder
npm run deploy
```

- `APP_SECRET`: 32+ random characters. It seals per-run SAP passwords. Changing it invalidates queued passwords only.
- `SETUP_KEY`: required to create the first (owner) account. Without it, whoever registers first becomes the owner, so set it **before** sharing the URL.

Open `https://ultralight-project-builder.pages.dev`, choose **Request access**, and register with the setup key. You are now the owner.

## 2. Owner console

1. **SAP accounts**: add each `LEARN-###` you own in client 236. The suffix drives every generated value (`P/2###`, supplier `114###`, `PH-###-1`).
2. **Runners**: create a token. It is shown once. Optionally limit it to specific accounts.
3. **Registration**: close it once your users have requested access.
4. **People**: approve a request, then tick the SAP accounts that person may drive. Suspend removes their sessions immediately.

## 3. Runner

On any machine with outbound HTTPS to your Pages URL and to `m53p.ucc.cloud`:

```bash
cd ultralight-project-builder/runner
npm run setup
cp .env.example .env
```

Edit `.env`:

```
CONTROL_URL=https://ultralight-project-builder.pages.dev
RUNNER_TOKEN=ucr_...
SAP_ACCOUNTS=LEARN-626:firstpassword,LEARN-627:otherpassword
```

Passwords in `SAP_ACCOUNTS` never leave this machine. Leave the password empty (`LEARN-626:`) to require it per run, or to log in by hand on the canvas.

```bash
npm start
```

To keep it running: `npx pm2 start "npm start" --name ultralight-runner && npx pm2 save`. Set `HEADLESS=false` to watch the browser locally.

## 4. Running

1. **Run pack**: choose account, tasks, mode. Assist is the safe default.
2. **Live canvas**: the real WebGUI page. Click to focus, then type. Copy buttons in the prompt type the exact value into the focused SAP field.
3. After each save the runner reads the status bar. If SAP reports "no changes" the step fails instead of being marked done.
4. **Runs and evidence**: screenshots and DOM captures per task for the report.

## Local development

```bash
npm install
npx wrangler d1 migrations apply ultralight-builder-production --local
npm run build
npx wrangler pages dev dist --local --port 3000
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "No runner online" | Runner stopped or token revoked | Start runner, check token |
| Login rejected | Wrong or expired password | Enter it on the canvas, or reset in SU01 |
| "already logged on" | Another session for the same user | Choose "Continue without ending other logons" on the canvas |
| Grid step fails with "Columns not located" | Screen layout differs | Finish the step on the canvas, press Done |
| Save says nothing changed | Cell values not committed | Retry the grid step; values are Tab-committed per cell |
| Host not found | Old hostname `m53.ucc.cloud` | Use `m53p.ucc.cloud` (default) |
