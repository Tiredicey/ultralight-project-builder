#!/usr/bin/env bash
cd "$(dirname "$0")/.."
ls node_modules/playwright >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1
ls ~/.cache/ms-playwright/chromium_headless_shell-1243 >/dev/null 2>&1 || { sudo npx --yes playwright@1.63.0 install-deps chromium >/dev/null 2>&1; npx playwright install chromium >/dev/null 2>&1; }
pm2 delete webapp >/dev/null 2>&1
pm2 delete drv >/dev/null 2>&1
PROBE_USER="${PROBE_USER:?}" PROBE_PASS="${PROBE_PASS:?}" pm2 start src/devdriver.mjs --name drv >/dev/null
sleep 6
curl -s -X POST --data 'return "driver up"' http://127.0.0.1:9333; echo
