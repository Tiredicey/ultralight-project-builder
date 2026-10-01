#!/usr/bin/env bash
# One-shot setup of the Ultralight runner on an Oracle Cloud VM (Ubuntu 22.04/24.04 or Oracle Linux 8/9),
# so runs keep working when your own PC is off. Re-running it updates the runner in place.
#
#   curl -fsSL https://raw.githubusercontent.com/Tiredicey/ultralight-project-builder/main/deploy/oracle/setup.sh | bash
#
# The script asks for CONTROL_URL, RUNNER_TOKEN and SAP_ACCOUNTS once and stores them in
# /opt/ultralight/runner/.env (mode 600, owned by the service user). Nothing is sent anywhere else.
set -euo pipefail

REPO=${REPO:-https://github.com/Tiredicey/ultralight-project-builder.git}
DIR=/opt/ultralight
SVC=ultralight-runner
RUN_USER=ultralight
export PLAYWRIGHT_BROWSERS_PATH=$DIR/.browsers

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
need_sudo() { if [ "$(id -u)" -ne 0 ]; then sudo "$@"; else "$@"; fi; }

. /etc/os-release
say "1/7 Packages ($PRETTY_NAME, $(uname -m))"
if command -v apt-get >/dev/null; then
  need_sudo apt-get update -y
  need_sudo apt-get install -y git curl ca-certificates
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | need_sudo bash -
    need_sudo apt-get install -y nodejs
  fi
else
  need_sudo dnf install -y git curl ca-certificates
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
    need_sudo dnf module reset -y nodejs || true
    need_sudo dnf module enable -y nodejs:20 || true
    need_sudo dnf install -y nodejs || { curl -fsSL https://rpm.nodesource.com/setup_20.x | need_sudo bash -; need_sudo dnf install -y nodejs; }
  fi
fi
node -v

say "2/7 Swap (Chromium needs headroom on 1 GB shapes)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3000 ] && ! swapon --show | grep -q /swapfile; then
  need_sudo fallocate -l 2G /swapfile || need_sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  need_sudo chmod 600 /swapfile && need_sudo mkswap /swapfile && need_sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | need_sudo tee -a /etc/fstab >/dev/null
  echo "added 2 GB swap (RAM ${MEM_MB} MB)"
else echo "RAM ${MEM_MB} MB, swap ok"; fi

say "3/7 Service user and code in $DIR"
id "$RUN_USER" >/dev/null 2>&1 || need_sudo useradd --system --create-home --home-dir /home/$RUN_USER --shell /usr/sbin/nologin "$RUN_USER"
need_sudo mkdir -p "$DIR" && need_sudo chown "$RUN_USER":"$RUN_USER" "$DIR"
need_sudo git config --system --add safe.directory "$DIR" 2>/dev/null || true
need_sudo chown -R "$RUN_USER":"$RUN_USER" "$DIR"
if [ -d "$DIR/.git" ]; then need_sudo -u "$RUN_USER" git -C "$DIR" pull --ff-only
else need_sudo -u "$RUN_USER" git clone --depth 1 "$REPO" "$DIR"; fi

say "4/7 Runner dependencies and Chromium"
need_sudo -u "$RUN_USER" bash -c "cd $DIR/runner && npm install --omit=dev --no-audit --no-fund"
if command -v apt-get >/dev/null; then need_sudo bash -c "cd $DIR/runner && npx --yes playwright install-deps chromium"
else need_sudo dnf install -y nss nspr atk at-spi2-atk cups-libs libdrm libxkbcommon libXcomposite libXdamage libXfixes libXrandr mesa-libgbm pango cairo alsa-lib libxshmfence liberation-fonts; fi
need_sudo -u "$RUN_USER" env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" bash -c "cd $DIR/runner && npx playwright install chromium"

say "5/7 Configuration"
ENV=$DIR/runner/.env
if [ -f "$ENV" ] && [ "${RECONFIGURE:-0}" != 1 ]; then need_sudo chown "$RUN_USER":"$RUN_USER" "$ENV" && need_sudo chmod 600 "$ENV"; echo "keeping existing $ENV (RECONFIGURE=1 to change it)"
else
  exec 3</dev/tty
  read -r -u 3 -p "Control site URL [https://ultralight-project-builder.pages.dev]: " CONTROL_URL
  CONTROL_URL=${CONTROL_URL:-https://ultralight-project-builder.pages.dev}
  read -r -u 3 -p "Runner token (Owner console > Runners > Create token): " RUNNER_TOKEN
  read -r -u 3 -s -p "SAP accounts as LEARN-###:password, comma separated (empty = ask per run): " SAP_ACCOUNTS; echo
  umask 077
  printf 'CONTROL_URL=%s\nRUNNER_TOKEN=%s\nSAP_ACCOUNTS=%s\nSAP_HOST=m53p.ucc.cloud\nSAP_CLIENT=236\nHEADLESS=true\n' "$CONTROL_URL" "$RUNNER_TOKEN" "$SAP_ACCOUNTS" | need_sudo tee "$ENV" >/dev/null
  need_sudo chown "$RUN_USER":"$RUN_USER" "$ENV" && need_sudo chmod 600 "$ENV"
fi

say "6/7 Self-check"
need_sudo -u "$RUN_USER" env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" bash -c "cd $DIR/runner && node src/doctor.mjs" || { echo; echo "Fix the FAIL lines above, then re-run this script (RECONFIGURE=1 to re-enter values)."; exit 1; }

say "7/7 systemd service $SVC"
need_sudo install -m 644 "$DIR/deploy/oracle/$SVC.service" /etc/systemd/system/$SVC.service
need_sudo systemctl daemon-reload
need_sudo systemctl enable --now $SVC
need_sudo systemctl restart $SVC
sleep 4
need_sudo systemctl --no-pager --lines 8 status $SVC || true
say "Done. The runner starts on boot and restarts if it crashes. Check Readiness on the site."
echo "Logs:    sudo journalctl -u $SVC -f"
echo "Update:  curl -fsSL https://raw.githubusercontent.com/Tiredicey/ultralight-project-builder/main/deploy/oracle/setup.sh | bash"
