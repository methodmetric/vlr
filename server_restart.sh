#!/bin/bash
# Deprecated wrapper, kept because this name lives in shell history on the
# production box. It restarts the site with the code ALREADY checked out --
# it never pulled, and it must not start pulling now. Use ./deploy.sh when you
# actually want to ship new code.
#
# The old version killed every process matching "server" and restarted under
# `forever`. Once the site moved to systemd (vlr.service, Restart=always) that
# became a race: the kill triggered a systemd restart while `forever` grabbed
# port 80 first, so one copy served traffic while the systemd copy crash-looped
# on EADDRINUSE -- and `systemctl status` still reported "active (running)" the
# whole time. That was the 2026-09-10 dev outage.
set -uo pipefail

echo "==> Restarting vlr.service..."
# Clears a latched start limit; without this a unit that hit StartLimitBurst
# refuses to start at all ("start request repeated too quickly").
sudo systemctl reset-failed vlr 2>/dev/null || true
sudo systemctl restart vlr || {
  echo "ERROR: systemctl restart vlr failed. Recent log:"
  sudo journalctl -u vlr -n 20 --no-pager
  exit 1
}

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
