# CLAUDE.md

VancouverLuxuryRentals.com (VLR): a Node/Express 4 + EJS + MongoDB rental site with an admin panel at `/VLR-admin`. Photos live in S3, email goes through Mailgun. Taken over from the previous vendor in October 2026; work is tracked in Linear team **VLR**.

## Commands

```bash
npm ci                                       # install (Node >= 22.9; prod runs 24)
cp .env.example .env                         # then set SESSION_SECRET, or the server exits at startup
npm run dev                                  # nodemon, loads .env, port 3000; needs MongoDB (MONGO_URL or localhost:27017/VLR)
npm test                                     # 41 unit tests, no DB/AWS needed
node --test test/unit/imageProcessing.test.js   # one node:test file
node test/unit/restartPolicy.test.js            # this one has its own runner, not node:test
```

There are no route, SEO or email tests. Tests cover `lib/restartPolicy.js`, `lib/mongooseCompat.js` and `lib/imageProcessing.js`.

## Rules

- **The S3 bucket is live.** Dev and production use the same bucket (`vancouverluxuryrental.com`). With real AWS keys in `.env`, saving property images locally uploads to and deletes from production. Scripts in `Scripts/` hit it too: `optimize_s3_images.js` is a dry run unless given `--apply`; `migrate_team_photos.js` writes unless given `--dry-run`. Run image scripts on the server, not a laptop (the bucket is ~71 GB).
- **Mail is live.** Any `MAILGUN_API_KEY` sends real email. Keep it empty in local `.env`.
- **Secrets come from the environment.** `SESSION_SECRET`, `MAILGUN_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, optional `MONGO_URL`. Locally `.env`, on the server `/etc/vlr/env`. A new required variable goes in `.env.example` and in `REQUIRED_ENV` in `deploy.sh`.
- **Deploy with `deploy.sh` only**, on the server, from the git checkout: `git pull`, then `./deploy.sh [branch]`. It checks `/etc/vlr/env` for every `REQUIRED_ENV` key before stopping anything, then rsyncs to `/opt/vlr/app` and restarts `vlr.service`. `server_restart.sh` restarts without pulling; `git_pull_and_update.sh` just runs `deploy.sh`. The site runs only under systemd (`sudo systemctl status vlr`, `sudo journalctl -u vlr -f`).
- **Mongoose 8 runs old Mongoose 4 code.** Queries use callbacks, made to work by `lib/mongooseCompat.js`. It must be loaded before the first query (`lib/mongo.js` does this; standalone scripts require it themselves). It re-throws errors raised inside callbacks, and nothing catches them, so a throw in a DB callback kills the worker. Report errors through the response instead.
- **config-lite merges command-line flags into the config.** A script flag with the same name as a config key (`--port`, `--bucket`, `--mongodb`) silently overrides it. `config/production.js` is shallow-merged over `config/default.js`, so a partial top-level key there replaces the whole default object.
- **URLs have single sources of truth.** Listing paths come from `lib/urls.js` (shared by the canonical link, JSON-LD, sitemap and the 301 redirect; mismatches cause redirect loops). Search landing pages (`/for-rent/:slug`) come from `lib/forRentPages.js`. The sitemap is generated at `/sitemap.xml`; a `public/sitemap.xml` file would shadow it.
- **Admin auth is per route.** Each admin route lists `AdminController.isAuthenticated` (and usually `isSuperAdmin`) itself. A new admin route needs both written out.

## Where to look

- `ARCHITECTURE.md`: read before changing request flow, search, listing pages, emails, the data model or the image pipeline. Checked against the code 2026-10-20.
- `docs/TAKEOVER.md`: accounts, servers, secrets, backups, open questions. Wins over any other doc.
- `IMAGE_OPTIMIZATION.md`: read before touching images in S3, the upload path or `Scripts/optimize_s3_images.js`. The backfill is paused with properties 3606 and 5810 done (per vendor); don't add an S3 lifecycle rule that expires old versions.
- `docs/vendor/`: the previous vendor's docs, kept for history. Several of their claims are wrong; check the code before trusting one.
- Known security problems and bugs: Linear VLR-18 (unauthenticated upload endpoint), VLR-19 (tenant auth, data exposure), VLR-20 (crash resilience), VLR-21 (correctness bugs).
