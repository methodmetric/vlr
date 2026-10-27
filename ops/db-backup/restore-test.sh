#!/bin/bash
# Test-restore the latest vlr-backup dump on vlr-prod-2026 WITHOUT touching the live database.
# Restores into a throwaway mongod (127.0.0.1:27099, data in a temp dir, small cache),
# then compares per-collection document counts with the live DB. Everything is deleted on exit.
# Run from the repo root:  ssh -i ~/.ssh/vlr_prod ubuntu@<server> 'sudo bash -s' < ops/db-backup/restore-test.sh
set -euo pipefail

TEST_PORT=27099
BUCKET=vlr-backup
PREFIX=mongodump/vlr-prod-2026/
A=/snap/bin/aws

for b in mongod mongorestore mongosh "$A"; do command -v "$b" >/dev/null || { echo "missing: $b" >&2; exit 1; }; done
if ss -ltn | grep -q ":$TEST_PORT "; then echo "port $TEST_PORT already in use, aborting" >&2; exit 1; fi

W=$(mktemp -d /var/tmp/vlr-restore-test.XXXXXX)
cleanup() {
  [ -f "$W/mongod.pid" ] && kill "$(cat "$W/mongod.pid")" 2>/dev/null && sleep 2
  rm -rf "$W"
  echo "cleaned up $W"
}
trap cleanup EXIT

# Read one KEY=value from /etc/vlr/env without sourcing it (an unquoted & in MONGO_URL would break `source`).
envval() { grep -m1 "^$1=" /etc/vlr/env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

# Same credentials as /usr/local/sbin/vlr-db-backup.
AWS_ACCESS_KEY_ID=$(envval AWS_ACCESS_KEY_ID)
AWS_SECRET_ACCESS_KEY=$(envval AWS_SECRET_ACCESS_KEY)
AWS_DEFAULT_REGION=$(envval AWS_REGION)
for v in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION; do
  [ -n "${!v}" ] || { echo "$v missing from /etc/vlr/env" >&2; exit 1; }
done
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION

KEY=$("$A" s3 ls "s3://$BUCKET/$PREFIX" | awk '{print $4}' | sort | tail -1)
[ -n "$KEY" ] || { echo "no dumps found" >&2; exit 1; }
echo "== latest dump: s3://$BUCKET/$PREFIX$KEY"
"$A" s3 cp "s3://$BUCKET/$PREFIX$KEY" "$W/dump.archive.gz" --only-show-errors
gzip -t "$W/dump.archive.gz" && echo "gzip ok, $(stat -c %s "$W/dump.archive.gz") bytes"

echo "== starting throwaway mongod on 127.0.0.1:$TEST_PORT"
mkdir "$W/db"
chown -R mongodb:mongodb "$W"
runuser -u mongodb -- mongod --dbpath "$W/db" --port "$TEST_PORT" --bind_ip 127.0.0.1 \
  --wiredTigerCacheSizeGB 0.25 --fork --logpath "$W/mongod.log" --pidfilepath "$W/mongod.pid" >/dev/null

echo "== restoring"
mongorestore --uri "mongodb://127.0.0.1:$TEST_PORT" --archive="$W/dump.archive.gz" --gzip --quiet
echo "restore ok"

MONGO_URL=$(envval MONGO_URL)
export MONGO_URL TEST_PORT

echo "== document counts (live now vs restored dump; live may be slightly ahead since the dump)"
mongosh --nodb --quiet --eval '
  const live = connect(process.env.MONGO_URL);
  const name = live.getName();
  const rest = connect("mongodb://127.0.0.1:" + process.env.TEST_PORT + "/" + name);
  const cols = [...new Set([...live.getCollectionNames(), ...rest.getCollectionNames()])].sort();
  let bad = 0;
  print("db: " + name);
  for (const c of cols) {
    const l = live.getCollection(c).countDocuments({});
    const r = rest.getCollection(c).countDocuments({});
    const flag = l === r ? "" : (r === 0 && l > 0 ? "  <-- MISSING" : "  (diff " + (l - r) + ")");
    if (r === 0 && l > 0) bad++;
    print(c.padEnd(40) + String(l).padStart(9) + String(r).padStart(9) + flag);
  }
  print(bad ? "\nRESULT: " + bad + " collection(s) empty in the restore" : "\nRESULT: every collection restored");
'
