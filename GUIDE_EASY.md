# Easy setup guide (no tech background needed)

This guide walks you through everything, one small step at a time. Take it slowly. Each step says **what you do** and **what you should see**.

---

## First, what is this thing?

Think of it like a **remote-control car for SAP**.

- **The website** is the remote control. You and the people you allow open it in a normal web browser, from anywhere.
- **The runner** is the car. It is a small program on a computer (yours) that actually opens SAP and clicks and types for you.
- **You are the owner.** Nobody can use the remote control unless you say "yes" to them first.

The website shows a live picture of the SAP screen. You can watch it fill in the Ultralight Bike project (P/2###) and step in whenever it asks for help.

---

## What you need before starting

Tick each one off:

- [ ] A computer (Windows, Mac or Linux) that stays on while you use it
- [ ] Internet on that computer
- [ ] Your SAP login: user **LEARN-###** and its password (client **236**)
- [ ] A free **GitHub** account (you already have one: Tiredicey)
- [ ] A free **Cloudflare** account (make one at https://dash.cloudflare.com/sign-up)
- [ ] About **45 minutes** the first time

---

## Part A: Install two free tools on your computer

You do this once.

### Step A1: Install Node.js

1. Go to **https://nodejs.org**
2. Click the big button that says **LTS** (it means "stable version").
3. Open the file you downloaded and click **Next** until it says **Finish**. Keep all the default choices.

**Check it worked:**
- Windows: press the **Windows key**, type `cmd`, press **Enter**. A black window opens. This is the "terminal".
- Mac: press **Cmd + Space**, type `Terminal`, press **Enter**.
- In that window type this and press **Enter**:
  ```
  node -v
  ```
- You should see something like `v22.x.x`. Any number 20 or higher is fine.

### Step A2: Install Git

1. Go to **https://git-scm.com/downloads**
2. Download for your system, open it, and click **Next** until **Finish**.

**Check it worked:** in the terminal type `git --version` and press **Enter**. You should see `git version ...`.

> Tip: whenever this guide shows a grey box with text, that text is a command. Copy it, paste it into the terminal, and press **Enter**.

---

## Part B: Download the project

### Step B1: Copy the project to your computer

In the terminal, paste this and press **Enter**:

```
git clone https://github.com/Tiredicey/ultralight-project-builder
```

Then go into the folder:

```
cd ultralight-project-builder
```

### Step B2: Install its parts

```
npm install
```

Wait until it stops scrolling (1 to 3 minutes). Warnings in yellow are normal. Red **ERR!** is not; if you see it, try the command again.

---

## Part C: Put the website on the internet (Cloudflare)

### Step C1: Make a Cloudflare key

A "key" (token) lets your computer talk to your Cloudflare account.

1. Log in at **https://dash.cloudflare.com**
2. Click your profile icon (top right) and choose **My Profile**.
3. Click **API Tokens** on the left, then **Create Token**.
4. Scroll down and pick **Create Custom Token** and click **Get started**.
5. Give it a name, for example `ultralight`.
6. Under **Permissions**, add these two rows:
   - `Account` · `Cloudflare Pages` · `Edit`
   - `Account` · `D1` · `Edit`
7. Click **Continue to summary**, then **Create Token**.
8. **Copy the token** and keep it somewhere safe (a note on your computer). You only see it once.

### Step C2: Tell your terminal the key

Replace `PASTE_TOKEN_HERE` with your token.

- Windows:
  ```
  set CLOUDFLARE_API_TOKEN=PASTE_TOKEN_HERE
  ```
- Mac or Linux:
  ```
  export CLOUDFLARE_API_TOKEN=PASTE_TOKEN_HERE
  ```

> If you close the terminal, you must do Step C2 again next time.

### Step C3: Make the database

The database is where the website remembers users and runs.

```
npx wrangler d1 create ultralight-builder-production
```

You will see some lines, including one like:

```
"database_id": "a1b2c3d4-...."
```

1. Copy the long code inside the quotes.
2. Open the file **wrangler.jsonc** in the project folder with Notepad (Windows) or TextEdit (Mac).
3. Find `00000000-0000-0000-0000-000000000000` and replace it with your code.
4. Save the file.

### Step C4: Set up the database tables

```
npm run db:migrate:prod
```

If it asks **"Ok to proceed?"**, type `y` and press **Enter**. You should see a green tick ✅.

### Step C5: Create the website project

```
npx wrangler pages project create ultralight-project-builder --production-branch main
```

### Step C6: Add two secret passwords for the website

These are **not** your SAP password. You make them up.

1. The **app secret** protects SAP passwords typed into the website. Make up a long random phrase (at least 32 letters and numbers).
   ```
   npx wrangler pages secret put APP_SECRET --project-name ultralight-project-builder
   ```
   Paste your phrase when it asks, press **Enter**.

2. The **setup key** makes sure only **you** can become the owner. Make up another phrase and **write it down**.
   ```
   npx wrangler pages secret put SETUP_KEY --project-name ultralight-project-builder
   ```

### Step C7: Publish the website

```
npm run deploy
```

At the end you will see a web address like:

```
https://ultralight-project-builder.pages.dev
```

🎉 That is your website. Save this address.

---

## Part D: Become the owner

Do this **before** you share the link with anyone.

1. Open your website address in the browser.
2. Click **Request access**. Because nobody has signed up yet, the form will say **Create the owner account**.
3. Fill in your name, email, a password (at least 10 characters), and the **setup key** from Step C6.
4. Click **Create owner**.

You are now the owner. You see a menu on the left with **Owner console**.

---

## Part E: Tell the website which SAP accounts it may use

1. Click **Owner console**.
2. Under **SAP accounts, client 236**, type your SAP user, for example `LEARN-626`, and click **Add**.
3. Do the same for any other LEARN accounts you own. Each one can have a different password; that is fine.

---

## Part F: Start the runner (the "car")

### Step F1: Get a runner key

1. In **Owner console**, find **Runners**.
2. Type a name, for example `my-laptop`, and click **Create token**.
3. A long code starting with `ucr_` appears. Click **Copy**. You will only see it once.

### Step F2: Install the runner

In the terminal (still inside the project folder):

```
cd runner
npm run setup
```

This downloads a small hidden browser. It takes a few minutes. On Linux it may ask for your computer password.

### Step F3: Fill in the runner settings

1. In the `runner` folder, make a copy of the file `.env.example` and name the copy `.env`
   - Windows command: `copy .env.example .env`
   - Mac/Linux command: `cp .env.example .env`
2. Open `.env` with Notepad or TextEdit and change it to look like this:

```
CONTROL_URL=https://ultralight-project-builder.pages.dev
RUNNER_TOKEN=ucr_the_code_you_copied
SAP_ACCOUNTS=LEARN-626:your_sap_password
SAP_HOST=m53p.ucc.cloud
SAP_CLIENT=236
HEADLESS=true
```

- More than one account? Separate them with a comma:
  `SAP_ACCOUNTS=LEARN-626:password1,LEARN-627:password2`
- Don't want to save a password here? Leave it empty after the colon: `LEARN-626:` and you type it in on the website each time instead.
- Want to **see** the browser on your screen? Change `HEADLESS=true` to `HEADLESS=false`.

3. Save the file.

### Step F4: Turn the runner on

```
npm start
```

You should see:

```
Runner 1.0.0 → https://ultralight-project-builder.pages.dev ...
Waiting for jobs
```

Leave this window open. Closing it turns the runner off.

In **Owner console → Runners**, your runner now shows a green **online**.

---

## Part G: Do the SAP tasks

1. Click **Run pack** in the left menu.
2. Pick your **SAP user** (for example LEARN-626). The page shows your project number P/2626, supplier 114626 and PS text PH-626-1.
3. Tick the tasks you want. **All** does Tasks 1 to 14.
4. Choose a **mode**:
   - **Assist** (recommended): it does the work and stops to ask you when needed.
   - **Autopilot**: stops only on problems.
   - **Observe**: only watches; you cannot click.
5. Click **Start run**.

### On the live canvas

- The big picture **is the real SAP screen**.
- **Click** on it to click in SAP. Then just **type** on your keyboard.
- The coloured boxes show fields the runner found. Hover to see the field name.
- When SAP needs you, a **yellow box** appears on the right. It tells you exactly what to enter. The **Copy** button next to each value types it into the SAP field you clicked.
- When you have finished that part, click **Done, continue**.
- Buttons under the picture:
  - **Pause / Resume**: stop and start the robot
  - **Retry step**: try that step again
  - **Skip step**: jump past it
  - **Capture evidence**: take a screenshot for your report
  - **Abort**: stop everything (SAP keeps what was already saved)

### Getting your screenshots

Click **Runs and evidence**. Every screenshot is labelled with its task number. Click **Download** to save them for your Word report.

---

## Part H: Letting other people use it (only if you want)

1. Send them your website address.
2. They click **Request access** and fill in the form.
3. They see **"Waiting for the owner"**. They **cannot** do anything yet.
4. You go to **Owner console → People**:
   - Click **Approve**.
   - Tick which **LEARN** accounts they may use.
5. Now they can run tasks, but only on the accounts you ticked.

To stop someone, click **Suspend**. They are logged out immediately.
When everyone has signed up, set **Registration** (top right of Owner console) to **closed**.

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "No runner online" | The runner window is closed | Go back to Part F4 and run `npm start` |
| "Login rejected" | Wrong or expired SAP password | Fix it in `.env`, or type it on the canvas |
| "already logged on" | SAP is open somewhere else with the same user | On the canvas, choose "Continue without ending other logons" |
| "Waiting for operator" | The robot needs your help | Read the yellow box, do it on the canvas, click **Done, continue** |
| "SAP says nothing changed" | Values were not accepted | Click **Retry step** |
| `npx` or `node` not found | Node.js is not installed | Repeat Part A1, then close and reopen the terminal |
| Cloudflare says "Authentication error" | The key from C1 is missing | Repeat Step C2 in the same terminal window |

---

## Next time (quick start)

1. Open a terminal.
2. `cd ultralight-project-builder/runner`
3. `npm start`
4. Open your website and click **Run pack**.

That's all.

---

## Good to know (honest notes)

- Tasks 3 and 5 (network graph pictures) will likely need you to click by hand. The robot stops and tells you what to do.
- The robot marks a step **done** only when SAP confirms it. If **you** finished a step by hand, it says "done by operator" so you always know which is which.
- Only use `m53p.ucc.cloud`. The old address `m53.ucc.cloud` no longer works.
- Your SAP password in `.env` stays on your computer. It is never sent to the website.
