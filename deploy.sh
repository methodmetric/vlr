#!/bin/bash
# Pull latest code (main, or the branch given as $1), install dependencies from
# package-lock.json, copy the release to APP_DIR, install/refresh the systemd unit,
# and restart the VLR site.
# Run as ubuntu (needs sudo and npm registry access) from a git checkout of the repo.
# The site itself runs from APP_DIR as the vlr user (see vlr.service).
set -uo pipefail

APP_DIR=/opt/vlr/app   # must match WorkingDirectory in vlr.service
APP_USER=vlr           # must match User/Group in vlr.service
ENV_FILE=${ENV_FILE:-/etc/vlr/env}   # must match EnvironmentFile in vlr.service
# Keys the site reads from ENV_FILE (see .env.example). Checked before anything is stopped.
REQUIRED_ENV="SESSION_SECRET MAILGUN_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION"
BRANCH=${1:-main}

cd "$(dirname "$0")" || { echo "ERROR: cannot cd to script dir"; exit 1; }

echo "==> Pulling latest from origin/$BRANCH..."
git fetch origin "$BRANCH" || { echo "ERROR: git fetch failed"; exit 1; }
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH" || { echo "ERROR: cannot check out $BRANCH"; exit 1; }
git pull --ff-only origin "$BRANCH" || { echo "ERROR: git pull failed"; exit 1; }

echo "==> Installing dependencies from package-lock.json..."
npm ci --omit=dev || { echo "ERROR: npm ci failed"; exit 1; }

echo "==> Checking $ENV_FILE..."
# The code holds no keys; without them the new release can't log anyone in,
# upload images or send email. Abort while the old release is still serving.
missing=""
for var in $REQUIRED_ENV; do
  sudo grep -q "^$var=." "$ENV_FILE" 2>/dev/null || missing="$missing $var"
done
if [ -n "$missing" ]; then
  echo "ERROR: missing or empty in $ENV_FILE:$missing"
  echo "Add them (values: .env.production, or the password manager) and re-run. Nothing was changed."
  exit 1
fi

echo "==> Stopping server..."
# Stop before copying so a re-forked worker never loads a mix of old and new files.
sudo systemctl stop vlr 2>/dev/null
# Make sure no stray manually started copy is still holding port 80.
sudo pkill -f "node .*server.js" 2>/dev/null
sleep 1

echo "==> Copying release to $APP_DIR..."
# uploads/ and log/ belong to the running site: create them if missing, never overwrite or delete them.
sudo install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$APP_DIR/uploads" "$APP_DIR/log" \
  || { echo "ERROR: cannot create $APP_DIR"; exit 1; }
sudo rsync -a --delete --chown="$APP_USER:$APP_USER" --exclude=/.git --exclude=/uploads --exclude=/log ./ "$APP_DIR/" \
  || { echo "ERROR: cannot copy release to $APP_DIR"; exit 1; }

echo "==> Installing systemd unit (vlr.service)..."
sudo install -m 0644 vlr.service /etc/systemd/system/vlr.service || { echo "ERROR: cannot install unit file"; exit 1; }
sudo systemctl daemon-reload
sudo systemctl enable vlr

echo "==> Starting server..."
# A unit that hit StartLimitBurst refuses `start` ("start request repeated too
# quickly") until its failure state is cleared. Deploying is exactly when we
# want that reset, so the operator is never stuck re-running deploy.sh.
sudo systemctl reset-failed vlr 2>/dev/null || true
sudo systemctl start vlr || { echo "ERROR: systemctl start vlr failed. Recent log:"; sudo journalctl -u vlr -n 20 --no-pager; exit 1; }

echo "==> Waiting for site to come up..."
for i in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "==> OK: site is up (HTTP 200)"
    sudo systemctl status vlr --no-pager | head -5
    exit 0
  fi
  sleep 2
done

echo "ERROR: site did not return HTTP 200 in time. Recent log:"
sudo journalctl -u vlr -n 20 --no-pager
exit 1
