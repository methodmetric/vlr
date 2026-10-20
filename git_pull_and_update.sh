#!/bin/bash
# Deprecated: run ./deploy.sh instead. This name is kept only because it lives
# in shell history and muscle memory.
#
# The old version of this script killed every process matching "server" and
# restarted the site under `forever`. Once the site moved to systemd
# (vlr.service, Restart=always) that became a race: the kill triggered a
# systemd restart while `forever` grabbed port 80 first, so one copy served
# traffic while the systemd copy crash-looped on EADDRINUSE — and
# `systemctl status` still reported "active (running)" the whole time.
# That was the 2026-09-10 dev outage.
exec "$(dirname "$0")/deploy.sh" "$@"
