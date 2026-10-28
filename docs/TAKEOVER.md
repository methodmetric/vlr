# VLR Takeover Notes

Everything our team knows about VancouverLuxuryRentals.com (VLR) after taking it over from the previous vendor. Last updated 2026-10-20.

The previous vendor's contract has ended and they will not answer further questions. This document is the source of truth from here on. The vendor's own documents are archived in `docs/vendor/` (plus the untracked `docs/VLR website handover - final.md`) and describe the old Node 8 servers in places. `CLAUDE.md`, `ARCHITECTURE.md` and `IMAGE_OPTIMIZATION.md` were checked against the code and corrected on 2026-10-20 (VLR-16). Where any doc disagrees with this file, this file wins.

**How facts are marked**
- **verified**: we checked it ourselves (the code, the live site, DNS/whois, or read-only AWS and Mailgun API calls on 2026-10-19 and 10-20).
- **per vendor**: stated in the vendor's final emails of 2026-10-20 and not yet checked by us.

No passwords or keys are written here. See [Secrets](#6-secrets) for where they live.

---

## 1. Status at a glance

| Area | State |
|---|---|
| Code | We hold the full source as `vlr-upgrade-new-vm.zip` (commit `dedbc40`). Installs cleanly, 41/41 tests pass on Node 24 and 26, boots locally. **verified** |
| Git history | None. The vendor deployed from their own private GitHub repo, which is not part of the handover. Bitbucket is shut down. **per vendor** |
| Production | Runs on EC2 `vlr-prod-2026`. We have shell access with our own SSH key since 2026-10-22 (§4). |
| Accounts | AWS, Mailgun, GoDaddy and Google all belong to VLR. **per vendor** |
| Database | Lives on `vlr-prod-2026`. A daily `mongodump` goes to the private S3 bucket `vlr-backup`, and AWS snapshots its data disk too. A test restore passed on 2026-10-26. See [section 7](#7-data-and-backups). |
| Security | Several passwords and keys are known to the vendor and were written in the code they handed over (our repo now reads keys from the environment; the `vlr-web` AWS key was rotated 2026-10-27, the Mailgun key and session secret still need rotating). AWS root has two-factor again since 2026-10-22. See [section 8](#8-security-and-access-checklist). |
| Monitoring | None. |

---

## 2. People

| Who | Role |
|---|---|
| Shahram | Client contact at VLR. Has SuperAdmin on `/VLR-admin`. |
| Annie, Lisa, Sadhbh | VLR staff with SuperAdmin on `/VLR-admin`. **per vendor** |
| Sean / Annie | Contact on the AWS account (Vancouver Luxury Realty office number). **per vendor** |
| jesse@methodandmetric.com | Has SuperAdmin on `/VLR-admin`. Unknown who this is. **Ask Shahram.** |
| Edward (Ed), Oscar | Previous vendor. Contract ended 2026-10-20. |
| Aman, Jose | Our team. |

---

## 3. Accounts and services

| Service | Owner | Login | Notes |
|---|---|---|---|
| AWS | VLR, paid with VLR's card (**per vendor**) | Root: `webadmin@vlr.ca` | Region `us-west-2`. Vendor removed their MFA device; since 2026-10-22 root has a new password and MFA on Jose's phone (VLR-2). The root access key the vendor created 2026-10-06 is deactivated; deleting it is VLR-24. Only IAM user is `vlr-web` (used by the site; full EC2 and S3 access, see §6). |
| Google (`webadmin@vlr.ca`) | VLR | MM, with 2FA on one of their phones (VLR-1) | Owns Tag Manager `GTM-K2XTMZ6S`, Google Ads `AW-947376741` and Search Console. Also the AWS root email and the Mailgun login, so whoever controls this mailbox controls all of those. GA4 unknown; if it exists it's set up in Tag Manager. |
| Google Workspace (`vlr.ca`) | VLR | Admin **unknown** | Hosts email for all three main domains. The Workspace admin can reset `webadmin@` and `administrator@`. **Ask Shahram who it is.** |
| Mailgun | VLR (**per vendor**) | `webadmin@vlr.ca` (reset password from that mailbox) | Sending domain `mg.vancouverluxuryrentals.com`. Account also holds `onepromisesolution.com` (vendor's 2018 test domain, delete) and two unverified `ec2-…amazonaws.com` domains (delete). `mg.vancouverluxuryrental.com` (singular) is a parked domain for sale, not VLR's. **verified** |
| Cloudflare | VLR | `administrator@vlr.ca` | DNS, proxy and HTTPS for all five domains. Our team can log in. **verified** |
| GoDaddy | VLR's own account (**per vendor**) | Unknown; vendor never had access | All five domains. Who pays auto-renew is unknown. **Ask Shahram.** |
| `/VLR-admin` | VLR | Per-person accounts | Vendor deleted their own admin accounts. Ask any SuperAdmin to create ours (`/VLR-admin` → New Admin → SuperAdmin). |
| GitHub (vendor) | Vendor | n/a | Private repo the server used to pull from. Not handed over; deploy key removed. **per vendor** |
| Bitbucket `vlr_website/vlr_website` | n/a | n/a | Shut down. The URL in `package.json` is a leftover. **per vendor**; our key was refused (**verified**). |

### Domains (all at GoDaddy, DNS on Cloudflare) **verified**

| Domain | What it does | Expires |
|---|---|---|
| vancouverluxuryrentals.com | The main site (this codebase). `blog.` subdomain → WordPress blog. | 2030-02-09 |
| vancouverluxuryrealty.com | Email domain; site sends from `info@vancouverluxuryrealty.com`. | 2030-11-21 |
| vlr.ca | Google Workspace domain for `webadmin@` and `administrator@`. | 2031-05-06 |
| burnabyluxuryrentals.com | Redirects to the main site's Burnaby page. Its email (MX) goes to GoDaddy's mail service, not Google Workspace like the other domains. | **2027-05-21** |
| easyrent.ca | Separate EasyRent WordPress site hosted on Google Cloud (35.215.69.32). Not managed by the vendor; hosting and WordPress logins unknown. | **2027-05-10** |

---

## 4. Servers (AWS EC2, us-west-2)

| Instance | State (2026-10-20) | What it is | Plan |
|---|---|---|---|
| **vlr-prod-2026** | running | **Production.** t3.large, launched 2026-10-16. Public IP in the EC2 console. | Keep. |
| vlr-prod | running (website stopped) | Old production. Kept by the vendor as a rollback. Nothing written to its database after the move. | Final snapshot, then terminate once the move is confirmed. |
| vlr-staging | stopped 2026-10-17 | Old dev server (`dev.` DNS removed). | Terminate once the move is confirmed. |
| wordpress-bitami | running | `blog.vancouverluxuryrentals.com`, WordPress 6.5.13 on a Bitnami image running **Debian 10, which stopped getting security updates in 2024**. Ports 22, 80 and 443 are open to the internet. Last post Aug 2024, not linked from the main site. | Decide soon: rebuild on a supported OS, or retire it. |
| easyrent-prod | stopped 2026-10-20 | Backend of the old EasyRent admin/beta. Final snapshot taken 2026-10-20 ("final archive before termination"). | Terminate. Delete `admin.easyrent.ca` and `beta.easyrent.ca` DNS records. |
| easyrent-dev, easyrent-back, easy_rent_dev_old | stopped since 2020–2022 | Not VLR, unused. | Terminate. |

State and snapshots **verified**; descriptions **per vendor**.

### Production server: vlr-prod-2026

| | |
|---|---|
| Access | SSH as `ubuntu` with our key `~/.ssh/vlr_prod` (passphrase-protected), installed 2026-10-22 through **EC2 Instance Connect** (AWS console → EC2 → vlr-prod-2026 → Connect), which still works as a fallback. **verified** |
| OS | Probably Ubuntu 24.04 (the unit file mentions systemd 255). Unconfirmed. |
| Node | 24.22.0 LTS (supported to April 2028). **per vendor** (an earlier vendor email said 26; this is the correction) |
| App | `/opt/vlr/app`, run by `vlr.service` as user `vlr`, binds port 80 directly. **verified from the zip** |
| Config | `/etc/vlr/env` sets `NODE_ENV` and `MONGO_URL` (**verified from the zip**), and since 2026-10-27 also `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` (the `vlr-web` key, for the database backup). Mode 640, `root:vlr`. Since commit `7b0fd42` it must also hold `SESSION_SECRET`, `MAILGUN_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`; `deploy.sh` refuses to deploy until it does. Not in the repo. |
| Database | MongoDB on the same machine (8.x per the code comments). Moved here 2026-10-17 00:13 UTC. **per vendor** |
| Disks | 200 GiB root + 20 GiB second disk, both encrypted. Daily AWS snapshots of the 20 GiB disk only. **verified** |
| Network | Behind Cloudflare. Port 80 and 22 are open to the internet; 443 is closed (Cloudflare handles HTTPS). **verified** |
| EC2 key pair | `vlr-production` (also on old vlr-prod). Removed from the `ubuntu` and `root` `authorized_keys` on 2026-10-22, so only our key is left (VLR-4). Old vlr-prod still has it (VLR-23). **verified** |

### Deploying

`deploy.sh` in the zip is the current script for this server (not Node 8, despite what the docs say). It:
1. pulls the branch from git (`origin`), runs `npm ci --omit=dev`
2. stops `vlr.service` and copies the code to `/opt/vlr/app` with `rsync --delete`, keeping only `uploads/` and `log/`. Anything else there that isn't in the repo is deleted, including the gitignored `config/aws.json`, which the vendor's code now running reads. The repo's code and the database backup (§7) read `/etc/vlr/env` instead
3. installs `vlr.service`, starts it, and waits for `http://localhost/` to return 200

It must run from a git checkout on the server. Our repo is `github.com/seta-workshop/vlr`; the server doesn't have a checkout of it yet (see [section 8](#8-security-and-access-checklist)). The vendor warns: don't deploy any older copy of the code.

---

## 5. The code

The zip is commit `dedbc40`, which the vendor says is exactly what's running. Folder-by-folder guide: https://claude.ai/artifact/3ouYCEkfiwtpZHjGKemt4v

- **Stack:** Node/Express 4, EJS templates, MongoDB via Mongoose 8, sharp for image watermarking, AWS SDK v2 for S3, nodemailer + Mailgun.
- **Upgrade layer:** `lib/mongooseCompat.js` lets the old Mongoose 4 callback code run on Mongoose 8. `lib/imageProcessing.js` replaced the old `images` package. `lib/restartPolicy.js` stops crash loops. All three have tests.
- **Run locally:** `npm ci`, copy `.env.example` to `.env`, set `SESSION_SECRET` (the server exits without it) and set both AWS keys to a placeholder such as `local-disabled` (empty keys let the AWS SDK fall back to your own AWS credentials and write to the production bucket), then `npm run dev` (port 3000). Needs MongoDB at `mongodb://localhost:27017/VLR` or `MONGO_URL`. There is no `.npmrc` despite what the vendor docs say.
- **Tests:** `npm test` runs 43 unit tests (28 on Node's built-in runner, 15 with their own small runner). No tests for routes, SEO or email.
- **S3 bucket name** `vancouverluxuryrental.com` is in `config/` and hardcoded in several more places, including `lib/seoHelpers.js`, `views/listing.ejs`, `views/myFavorites.ejs` ×2, `views/tenant-forms.ejs` and the `.replace()` strings in `routes/properties.js`.

### Known issues **verified**

Security problems and bugs found while checking the docs (VLR-16) are tracked in Linear: VLR-18 (the image upload endpoint has no auth and allows arbitrary file write/delete — urgent), VLR-19 (tenant auth and data exposure), VLR-20 (crash resilience), VLR-21 (correctness bugs).

- `/properties/debug-search` is public and returns property data (and `/properties/api/all` returns every property, unlisted ones included).
- `/VLR-admin/maintenance` and `/VLR-admin/inspection` render views that don't exist; the admin menu links to Maintenance.
- `routes/sell.js` and `routes/availability.js` are unused.
- `og:image` URLs use the S3 website endpoint, which doesn't serve images, so shared links have no preview image.
- Missing pages return HTTP 200 instead of 404.
- `https://vancouverluxuryrentals.com/` (the bare-domain homepage) redirects to `http://www.vancouverluxuryrentals.com`, not `https://`, so visitors take one extra hop to reach HTTPS. **verified** This redirect is a **Cloudflare rule**, not the site's code: the response comes from Cloudflare with no `X-Powered-By: Express`, while other bare-domain paths (e.g. `/for-rent/richmond`) are redirected correctly to `https://www.…` by `server.js`. Fix: in Cloudflare → Rules (Redirect Rules or Page Rules), change the target to `https://`.
- Views still include two Universal Analytics IDs, which Google has shut down.
- `npm audit`: 33 vulnerable dependencies (10 critical), mostly via `nodemailer`, `nodemailer-mailgun-transport`, `config-lite`, `ejs`.
- AWS SDK v2 is end-of-support.
- The zip's text files have Windows (CRLF) line endings. Harmless for the app; run `dos2unix *.sh vlr.service` if copying scripts straight to Linux.

---

## 6. Secrets

All committed in plain text in the zip. In our repo they were redacted at the baseline commit, and since `7b0fd42` the code reads the keys from the environment (see Config in §4). The `vlr-web` AWS key was rotated on 2026-10-27 and the passwords have been changed (see below the table); the Mailgun key and the session secret are unchanged and still need rotating:

| Where (in the zip) | What | Action |
|---|---|---|
| `config/aws.json` | Access key for IAM user `vlr-web`, which has `AmazonEC2FullAccess` and `AmazonS3FullAccess` (attached directly and through the group `web`), although the code only uses S3 | **Rotated 2026-10-27.** The new key (ending `T3YU`) is in `/etc/vlr/env`, which the database backup (§7) and the repo's code read, and in `/opt/vlr/app/config/aws.json`, which the running app reads until the first deploy from our repo. The old key (ending `FPDQ`, the one in the zip) is deactivated; delete it after 2026-11-03 (VLR-27). |
| `lib/mailer.js` | Mailgun API key, repeated 8 times | Rotate after taking over Mailgun; put the new key in `/etc/vlr/env`. |
| `config/default.js`, `config/production.js` | Session secret | Rotate (logs everyone out); put the new value in `/etc/vlr/env`. |
| `README.md` (bottom; now `docs/vendor/README-notes.md`) | Cloudflare login and password | Change the password. Already redacted in our repo. |
| `docs/VLR website handover - final.md` (bottom) | AWS root and Cloudflare logins | Same password as above. Remove from the file. **Don't commit this file with passwords in it.** |

The AWS root, Cloudflare and README passwords were **the same password**, and the vendor knows it, plus the `webadmin@vlr.ca` password. The Cloudflare password was changed 2026-10-20 (VLR-3) and the AWS root password 2026-10-22 (VLR-2); MM now owns `webadmin@vlr.ca`, with 2FA on one of their phones (VLR-1).

**Unresolved:** the vendor's final email says to "fill in the real keys first (see SECRETS-TO-FILL.md)" and that placeholders would break "photo uploads, email and the daily backup". Our zip has no `SECRETS-TO-FILL.md` and contains the real keys (not placeholders). The daily backup does exist, but on the server, not in the code (§7). Until 2026-10-27 it read `config/aws.json`, which explains the warning. Whether a later package with `SECRETS-TO-FILL.md` exists is still open. **Resolve by comparing `/opt/vlr/app` on the server with the zip.**

---

## 7. Data and backups

- **Database:** only on vlr-prod-2026. Holds listings, admin logins, tenants (names, emails, phones), owner leads, viewing requests, redirects. Tenant data is covered by BC's PIPA.
- **AWS snapshots:** a scheduled policy (`policy-03fe8bd0aa0dcdae0`) snapshots the 20 GiB disk daily. Retention unknown. The 200 GiB root disk isn't snapshotted. Restoring from a snapshot has never been tested. **verified**
- **Old vlr-prod:** monthly snapshots on the 7th (last 2026-10-07). **verified**
- **Daily database backup (the vendor's "daily backup"):** a systemd timer on vlr-prod-2026, not a cron job. **verified 2026-10-26** Copies of the script and units are in `ops/db-backup/` (see its README); `deploy.sh` doesn't install them.
  - `vlr-db-backup.timer` runs daily at 10:30 UTC (up to 5 minutes late) and starts `vlr-db-backup.service`, which runs `/usr/local/sbin/vlr-db-backup`. The vendor installed it on Oct 17. Logs: `sudo journalctl -u vlr-db-backup`.
  - The script runs `mongodump --archive --gzip` with `MONGO_URL` from `/etc/vlr/env`, checks the archive, uploads it to `s3://vlr-backup/mongodump/vlr-prod-2026/VLR-<UTC stamp>.archive.gz` (about 6 MB) and checks that the uploaded size matches.
  - It takes the AWS key (`vlr-web`) from `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` in `/etc/vlr/env`, and exits with an error if any of them is missing. Until 2026-10-27 the vendor's version read `/opt/vlr/app/config/aws.json`, which `deploy.sh` deletes. It was changed and tested that day, and the vendor's script was kept as `vlr-db-backup.bak-20261027T015456Z`.
  - Bucket `vlr-backup` (us-west-2, VLR's account): SSE-S3 encryption, no bucket policy. Public-access block and versioning turned on 2026-10-26; neither was set before. Retention (lifecycle rule `expire-mongodumps`, added 2026-10-26): each dump under `mongodump/` expires after 90 days and is permanently deleted 30 days after that (about 120 days in all). The `vlr-web` key can also delete backups, versions included.
  - A failed run shows up only in the journal; nothing alerts.
  - **Test restore passed 2026-10-26, and again 2026-10-27** on the first dump from the changed script. `ops/db-backup/restore-test.sh` restores the latest dump into a temporary `mongod` on the server (a separate port and data directory) and compares each collection's count with the live database. Every collection matched, apart from records added since the dump.
- **Photos:** S3 bucket `vancouverluxuryrental.com`, ~68,000 objects / ~71 GB. Versioning on, no lifecycle rule, so every original is recoverable. **verified**

### Image optimization (paused)
`Scripts/optimize_s3_images.js` compresses existing photos (JPEG quality 82, about −80%). Only properties 3606 and 5810 are done. No job is running or scheduled (**per vendor**). Instructions in `IMAGE_OPTIMIZATION.md`, corrected 2026-10-20: the vendor's version had steps for the retired Node 8 servers, including one (deleting `node_modules/sharp`) that would now stop the site booting. **Do not add an S3 lifecycle rule that expires old versions until the client approves the quality**: that permanently deletes the originals.

---

## 8. Security and access checklist

### Today
- [x] AWS root: sign in, add our own MFA device, change the password (2026-10-22, VLR-2)
- [ ] AWS root: delete the root access key created 2026-10-06 (Security credentials). Deactivated 2026-10-22; delete by 2026-11-05 (VLR-24)
- [ ] AWS: update the account contact details if needed (Account → Contact information)
- [x] `webadmin@vlr.ca`: MM took it over, with 2FA on one of their phones (VLR-1)
- [x] Cloudflare: change the password, add 2FA, review Members (VLR-3)
- [x] EC2: delete key pair `vlr-blog2` (vendor holds its private key) (2026-10-22, VLR-4)

### This week
- [x] Get onto vlr-prod-2026 via EC2 Instance Connect; add our SSH key (2026-10-22, VLR-7)
- [x] Take our own `mongodump` and store it somewhere we control (the daily dumps go to `vlr-backup`, in VLR's account; test restore passed 2026-10-26)
- [ ] Compare `/opt/vlr/app` with the zip (resolves the SECRETS-TO-FILL question)
- [ ] Copy `/etc/vlr/env` and `/etc/mongod.conf` into our own records (not the repo)
- [ ] Check `authorized_keys` on vlr-prod-2026 and wordpress-bitami for leftover vendor keys. vlr-prod-2026 done 2026-10-22 (VLR-4); vlr-prod and wordpress-bitami are VLR-23
- [x] Look for the vendor's "daily backup" (crontab, systemd timers): it's `vlr-db-backup.timer` (§7)
- [ ] Take over Mailgun via `webadmin@`; create a new API key
- [x] Set up our own git repo from the zip (`github.com/seta-workshop/vlr`)
- [ ] Clone it on vlr-prod-2026 for `deploy.sh`
- [ ] Set up uptime monitoring, and an alert when the daily database backup fails (the backup itself exists, §7)

### Cleanup, after the move is confirmed
- [ ] Final snapshot of vlr-prod, then terminate it
- [ ] Terminate vlr-staging, easyrent-prod, easyrent-dev, easyrent-back, easy_rent_dev_old
- [ ] Delete `admin.easyrent.ca` and `beta.easyrent.ca` DNS records
- [ ] Delete `onepromisesolution.com` and the two `ec2-…` domains from Mailgun
- [x] Rotate the `vlr-web` AWS key (2026-10-27; delete the deactivated old key after 2026-11-03, VLR-27)
- [ ] Rotate the Mailgun key and the session secret (already out of the code since `7b0fd42`)
- [ ] Decide on the blog: its server runs Debian 10 (no security updates since 2024), so rebuild it on a supported OS or retire wordpress-bitami
- [ ] Ask Shahram whether anyone uses email at burnabyluxuryrentals.com (it goes to GoDaddy mail); if not, remove the MX record

---

## 9. Open items

### Ask Shahram
- Who administers Google Workspace for `vlr.ca`?
- Can someone create SuperAdmin accounts on `/VLR-admin` for our team?
- Whose card pays for GoDaddy auto-renew, and who has that login?
- Who is `jesse@methodandmetric.com`, and should they keep SuperAdmin?
- Is EasyRent (`easyrent.ca`) part of our scope? If so, who has its hosting and WordPress logins?
- Are the compressed photos on properties 3606 and 5810 approved?

### Still unknown
- Whether a newer code package with `SECRETS-TO-FILL.md` exists.
- The snapshot retention period.
- Whether a GA4 property exists.

---

## 10. Timeline

| Date | Event |
|---|---|
| 2026-09-05 | Vendor moved the old servers from `forever` to systemd. |
| 2026-09-10 | Dev outage caused by a legacy deploy script (led to `lib/restartPolicy.js`). |
| 2026-09-20 to 09-29 | Image optimization run on properties 3606 and 5810. |
| 2026-10-06 | Vendor created a root access key for the migration. |
| 2026-10-16 | `vlr-prod-2026` launched; code package `vlr-upgrade-new-vm.zip` exported (`dedbc40`). |
| 2026-10-17 00:13 UTC | Database moved to `vlr-prod-2026`; vlr-staging stopped. |
| 2026-10-19 | We audited the package and the live setup. |
| 2026-10-20 | Our questions answered by Oscar and Edward; vendor contract ended. easyrent-prod stopped with a final snapshot. |
