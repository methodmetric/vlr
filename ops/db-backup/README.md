# Database backup

Daily `mongodump` of the VLR database to `s3://vlr-backup/mongodump/vlr-prod-2026/`. Status, bucket settings and history are in `docs/TAKEOVER.md` §7.

| File | Installed on vlr-prod-2026 as |
|---|---|
| `vlr-db-backup` | `/usr/local/sbin/vlr-db-backup` (root, 0755) |
| `vlr-db-backup.service` | `/etc/systemd/system/vlr-db-backup.service` |
| `vlr-db-backup.timer` | `/etc/systemd/system/vlr-db-backup.timer` (enabled; daily 10:30 UTC) |
| `restore-test.sh` | Not installed. Run from your machine when needed (below). |

**`deploy.sh` does not install these.** They're copied by hand, so a change merged here does nothing on the server until you install it. Check that the server matches the repo:

```bash
ssh -i ~/.ssh/vlr_prod ubuntu@<server> 'sha256sum /usr/local/sbin/vlr-db-backup; systemctl cat vlr-db-backup.service vlr-db-backup.timer'
shasum -a 256 ops/db-backup/vlr-db-backup
```

The script reads `MONGO_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` from `/etc/vlr/env` (the unit's `EnvironmentFile`), and exits if any is missing.

## Install a changed script

```bash
ssh -i ~/.ssh/vlr_prod ubuntu@<server> 'sudo cp -p /usr/local/sbin/vlr-db-backup /usr/local/sbin/vlr-db-backup.bak-$(date -u +%Y%m%dT%H%M%SZ) && sudo install -m 0755 -o root -g root /dev/stdin /usr/local/sbin/vlr-db-backup' < ops/db-backup/vlr-db-backup
ssh -i ~/.ssh/vlr_prod ubuntu@<server> 'sudo systemctl start vlr-db-backup && sudo journalctl -u vlr-db-backup -n 5 --no-pager -o cat'
```

The last command runs a backup now; it should print `backup ok: s3://…`. For a unit change, copy the file to `/etc/systemd/system/` and run `sudo systemctl daemon-reload`.

## Test a restore

```bash
ssh -i ~/.ssh/vlr_prod ubuntu@<server> 'sudo bash -s' < ops/db-backup/restore-test.sh
```

It restores the newest dump into a throwaway `mongod` on 127.0.0.1:27099 (temp data directory, 0.25 GB cache) and compares per-collection document counts with the live database, which it only reads. Everything it creates is deleted on exit, and no data leaves the server. The live side is usually a few records ahead, because it has kept changing since the dump. A collection flagged `MISSING` is a real problem. Last run: 2026-10-26, all collections restored.
