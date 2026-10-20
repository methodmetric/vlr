# Vendor docs: fact-check log

What the previous vendor's documentation got wrong, checked against the code on 2026-10-20 for VLR-16.

**Method.** Every checkable claim in the eight vendor docs was compared with the source at commit `7b0fd42` (the handover code `dedbc40` plus our LF and secrets commits): about 270 claims. Then a second, independent round tried to disprove the findings that matter most, reading the code and testing where it could (running the tests, Mongoose pluralisation, Express param decoding). Only findings that survived both rounds are listed. Line numbers refer to the vendor versions (the archived files in this folder, or for the rewritten docs `git show 7b0fd42:<file>`), and code evidence to the code at `7b0fd42`.

**Verdicts.** **Wrong**: contradicted by the code. **Outdated**: was true for the old servers or the handover zip, not for the code now. **Partly**: true with a missing condition that matters. Claims that checked out aren't listed. Statements about live servers and S3 contents can't be checked from the repo and are left out unless the repo contradicts them.

**Summary.** The descriptions of how the app works were mostly right: routing, search filters, listing pages, owner leads, the SEO layer, scheduled jobs. Almost everything about the runtime and operations was wrong or outdated: Node 8, Mongoose 4, the `images` package, `forever`, `.npmrc`, the test suite, the servers, secrets in the code, the deploy steps. `TESTING.md` and `test/README.md` describe a test suite that never existed.

Bugs and security problems found along the way are tracked separately: VLR-18, VLR-19, VLR-20, VLR-21.

---

## CLAUDE.md (vendor version, rewritten in VLR-16)

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 16, 130 | Install needs `--ignore-scripts` for semantic-ui's installer, "already set in `.npmrc`" | Wrong | No `.npmrc` in the repo; semantic-ui is not a dependency (only a leftover `semantic.json`). `npm ci` works | `package.json`, `package-lock.json` |
| 2 | 23 | `npm run prod` = `NODE_ENV=production nodemon server.js` | Partly | The script also loads `.env`. Production doesn't use it: systemd runs `/usr/bin/node server.js`, and `nodemon` is a dev dependency `deploy.sh` doesn't install | `package.json:9`, `vlr.service:25`, `deploy.sh:24` |
| 3 | 26 | `node server` starts without nodemon | Partly | It doesn't load `.env`, so it exits at once unless `SESSION_SECRET` is already exported | `server.js:24-27` |
| 4 | 29-40 | `npm run test:unit`, `test:watch`, `test:integration`, `test:all`; `npx mocha …` | Wrong | None of these scripts exist and mocha isn't installed. `npm test` runs plain node + `node --test` | `package.json:6-9` |
| 5 | 130 | Unit tests cover `seoHelpers` and the SEO middleware; integration tests in `test/integration/routes.test.js` | Wrong | The 41 tests cover `restartPolicy`, `mongooseCompat` and `imageProcessing`. No integration tests, no SEO tests | `test/unit/` |
| 6 | 49 | The cleaner worker is designated "via `process.send`" | Partly | The master calls `worker.send(...)`; the worker listens with `process.on('message')` | `server.js:104, 332` |
| 7 | 53 | config-lite keyed off `__dirname` from `server.js`; dev reads `default.js`, prod reads `production.js` | Partly | Every module calls config-lite with its own directory. `production.js` is shallow-merged over `default.js`, and command-line flags and `NODE_CONFIG` are merged over both | `node_modules/config-lite/index.js:13-46` |
| 8 | 59-70 | Route table | Partly | Also mounted: `/VLR-admin/showRoom` (from `admin.js`), `/sitemap.xml`, `/robots.txt`. `routes/sell.js` and `routes/availability.js` are never mounted | `routes/index.js:224-232`, `routes/admin.js:756` |
| 9 | 68 | `/VLR-admin` "protected by `AdminController.isAuthenticated`" | Wrong | Auth is per route. `/VLR-admin/images` has no auth at all (VLR-18); `/VLR-admin/csv` and `/login` are public | `routes/images.js:24-25`, `routes/admin.js:247` |
| 10 | 87 | `availableDate<N` becomes a date range | Partly | Kept only for old bookmarked URLs | `routes/properties.js:158-177` |
| 11 | 100 | Landing-page slugs are `<city>`, `-furnished`, `-unfurnished`, `all` | Partly | `all-furnished` and `all-unfurnished` exist too: 54 pages | `lib/forRentPages.js:180-186` |
| 12 | 104 | Email types list | Partly | Also `agent` / `sendAgentMail`, which nothing calls | `lib/mailer.js:75` |
| 13 | 109 | Notifications fire on save when status becomes Available or rent changes | Partly | The price-change mail only goes out if the new status is Available; the Available mail needs a previous status that was set and not Available | `routes/properties.js:443-457` |
| 14 | 113-115 | Uploads are watermarked "using the `images` package" on upload | Wrong | `sharp` in `lib/imageProcessing.js`, run when the admin saves the image set (`PUT /properties/id/:id/images`), not at upload | `lib/imageProcessing.js:30`, `routes/properties.js:581-627` |
| 15 | 120 | `/resources/:slug` renders from a hardcoded `pages` map in `routes/index.js` | Partly | The map is in `lib/resourcePages.js`, rendered with `ai-content.ejs` | `routes/index.js:11, 152-174` |
| 16 | 138 | One property (3606) backfilled | Outdated | 3606 and 5810 (per vendor) | `docs/TAKEOVER.md` §7 |
| 17 | 141 | "the server's Node 8 / glibc constraints" | Wrong | `sharp` 0.35 needs Node ≥ 20.9 and the npm scripts' `--env-file-if-exists` needs ≥ 22.9. Production runs 24.22.0 (per vendor) | `package-lock.json` (sharp `engines`), `package.json:8` |

## ARCHITECTURE.md (vendor version, corrected in VLR-16)

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 43, 347 | Runtime pinned to Node 8; servers can't `npm install`, copy `node_modules` | Wrong | Needs Node ≥ 22.9; `deploy.sh` runs `npm ci --omit=dev` | `package.json:8`, `deploy.sh:24` |
| 2 | 46 | Mongoose 4 | Wrong | Mongoose 8, with `lib/mongooseCompat.js` restoring the Mongoose 4 callback API | `package.json` (`^8.24.5`), `lib/mongo.js:2` |
| 3 | 50 | `images` package for resize/watermark | Wrong | `sharp` | `lib/imageProcessing.js:30` |
| 4 | 55, 75 | Logging: log4js + express-winston | Wrong | No winston. log4js `connectLogger` for HTTP; the cluster master logs via `console` to journald; in cluster mode only the master writes the log files | `server.js:57-89, 178` |
| 5 | 35 | MongoDB on localhost | Partly | `MONGO_URL` overrides the config default | `lib/mongo.js:7`, `server.js:225` |
| 6 | 62 | Dead workers are re-forked | Partly | Unless 5 in a row die within 30 s of starting; then the master exits | `lib/restartPolicy.js`, `server.js:120-130` |
| 7 | 28-31, 75-83 | Middleware order: logger → canonical → static → robots → redirects → session → passport → router → error | Wrong | Logger → canonical → cookie/body parsers → session → passport → static → robots → redirects → router → `res.locals.user` → error handler. Static, robots and redirects run after session and passport | `server.js:178-321` |
| 8 | 76 | Canonical redirect "deliberately excludes localhost and `dev.*`" | Partly | There's no exclusion logic: it's an allow-list containing only the bare `vancouverluxuryrentals.com`, registered only when the production config sets it | `server.js:194-203`, `config/production.js:13-14` |
| 9 | 91 | All routes composed in `routes/index.js` | Partly | `/VLR-admin/showRoom` is mounted from `admin.js`; two routers are never mounted; `/unsubscribe`, `/email`, `/property-management/…` and the `/for-rent` → `/for-rent/all` redirect were missing | `routes/index.js:44-50, 205-222`, `routes/admin.js:756` |
| 10 | 109 | `/VLR-admin/images/*` is admin-only | Wrong | No auth middleware; mounted before the admin router (VLR-18) | `routes/images.js:24-25`, `routes/index.js:228` |
| 11 | 110 | `GET *` 404 fallback | Partly | Renders `404.ejs` with status 200 | `routes/index.js:232-234` |
| 12 | 148 | Unless `status` is Available/Rented, unlisted properties are excluded | Partly | Only in the non-date branch; with an availability filter any `status` passes through | `routes/properties.js:176-192` |
| 13 | 156 | `buildPropertiesSeo()` canonicalises both URL forms to the clean path | Partly | Not with `furnished=Yes/No`: it reads `req.query` after `getProperties` rewrote it, so the canonical becomes `?furnished!=…` (VLR-21) | `routes/properties.js:56, 204-208, 275` |
| 14 | 157 | Sitemap advertises the clean URLs | Partly | Only `all`, `all-furnished`, `all-unfurnished` and the base page of cities with stock; also lists `/properties?…` URLs for Rented facets | `lib/sitemap.js:140-163, 211` |
| 15 | 170 | `/properties/rented` = rented count + 500 | Partly | Counts `status != "Available"`, which includes unlisted properties | `routes/properties.js:1023-1036` |
| 16 | 175 | `/properties/attributes` admin | Partly | SuperAdmin | `routes/properties.js:812-816` |
| 17 | 178 | `PUT /properties/id/:id` updates the property | Partly | It also creates it if missing, writes `maxId`, and resets `createdAt` on every edit (VLR-21) | `routes/properties.js:430-468, 556-562` |
| 18 | 188-199 | Signed URL, then host rewritten to the public endpoint; two URL strategies | Wrong | The `.replace()` looks for the website domain, not the bucket, so it never matches: pages serve signed URLs that expire after 15 min. There are three strategies, plus an https-on-website-endpoint URL in `showRoom.js` | `routes/properties.js:286-291`, `routes/showRoom.js:486-490`, `lib/teamPhotos.js:28` |
| 19 | 237, 285 | Owner leads in the `ownerleads` collection | Wrong | Model `'Leads'` → collection `leads` | `models/ownerLeads.js:39` |
| 20 | 265, 268 | `POST /user/newfavorite` and `DELETE /user/favorite` require a session | Wrong | Neither reads the session; both trust `req.body.user` (VLR-19) | `routes/user.js:265-309, 358-397` |
| 21 | 270 | `DELETE /user/id/:id` | Partly | `:id` is matched against `email` | `routes/user.js:48-67` |
| 22 | 272 | Both sides of favourites updated with `$addToSet` / `$pull` | Partly | Only the `propertyFavorite` side; the user side is a plain array edit + `save()` | `routes/user.js:275, 281-293, 368` |
| 23 | 286 | showRoom categories | Partly | Also `uploadForms`; the field is `value` | `routes/tenants.js:14-16`, `models/showRoom.js:5` |
| 24 | 304 | Fine Uploader posts to `/VLR-admin/images` | Wrong | `/VLR-admin/images/uploads` | `routes/images.js:24` |
| 25 | 311 | S3 used from `properties.js`, `images.js`, `listing.js` | Wrong | API calls are in `properties.js`, `showRoom.js`, `admin.js`, `lib/teamPhotos.js`. `images.js` builds a `createBucket` request that is never sent; `listing.js` only builds URLs | `routes/images.js:20-22` |
| 26 | 321-324 | Mailer functions `sendAvailableForProperty`, `setPriceChangeForProperty`; renewal "—" | Wrong | Those two live in `lib/setAvailable.js`; the mailer functions are `sendAvailableMail` and `sendPriceChangeMail`. Renewal is `sendRenewalMail`, fired from `POST /VLR-admin/mail/renewal/:id` | `lib/mailer.js:108, 230, 272`, `routes/admin.js:667` |
| 27 | 321 | `sendOwnerLeadMail` → VLR admin | Partly | Hard-coded to `info@`, so the admin's "forward lead to agent" never reaches the agent (VLR-21) | `lib/mailer.js:215`, `routes/admin.js:636-657` |
| 28 | 334 | SEO middleware covers `homepage`, `owners`, `area`, `property`, `blog` | Partly | Only the first three are wired up; `structuredData` is always `[]` | `lib/seoHelpers.js`, `routes/index.js:22, 94-144` |
| 29 | 348 | Secrets committed in `config/aws.json`, `lib/mailer.js`, `config/*.js` | Outdated | True of the zip; since `7b0fd42` they come from the environment | `lib/mailer.js:12`, `config/default.js:4` |
| 30 | 367 | Config files include `config/aws.json`, `.npmrc` | Wrong | `aws.json` is not read by any code; `.npmrc` doesn't exist | — |

## IMAGE_OPTIMIZATION.md (vendor version, corrected in VLR-16)

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 5, 40, 67, 89, 110, 397, 465 | Commits `b2deba0`, `dcea73d`, `2ae093d`, `2561bee`, `bc2c0e4`, `e21da85`, `10cedf7`, `7d7bc3c`; "`git revert b2deba0`" | Outdated | None exist here: our history starts at the handover baseline. The revert can't be done | `git log --all` |
| 2 | 11-12, 254-256, 545-547 | "`rm -rf ~/vlr/node_modules/sharp` … sharp is not in `package.json`, so this is safe" | **Wrong, harmful** | `sharp` is a dependency, and `routes/properties.js` loads `lib/imageProcessing.js` at startup: deleting it stops the site booting | `package.json:43`, `routes/properties.js:8` |
| 3 | 89-106 | Upload quality set at `routes/properties.js:636` via the `images` package | Wrong | `JPEG_QUALITY = 82` in `lib/imageProcessing.js`, with `sharp` | `lib/imageProcessing.js:38-48` |
| 4 | 113 | The script "follows the `--dry-run`-by-default convention of `migrate_team_photos.js`" | Wrong | Opposite: `migrate_team_photos.js` writes by default and needs `--dry-run` | `Scripts/migrate_team_photos.js:21` |
| 5 | 114 | The script's header "is long and current" | Wrong | It said sharp is not in `package.json`, production runs Node 8.9.4, and its usage lines used `scripts/` (wrong case on Linux) | `Scripts/optimize_s3_images.js` at `7b0fd42` |
| 6 | 107, 117 vs 10, 513 | §2.4 "one property done" | Partly | The same doc's §10 says two (3606, 5810) | — |
| 7 | 135 | Credentials in `config/aws.json` | Outdated | Environment variables since `7b0fd42` | `.env.example` |
| 8 | 217-280, 510-581 | Node 16 + `sharp@0.32.6` in `~/imgopt` via `NODE_PATH`; `vlr.service` uses `/usr/local/bin/node` | Outdated | Those servers no longer serve the site. sharp is a normal dependency; the unit runs `/usr/bin/node` in `/opt/vlr/app` | `vlr.service:21, 25` |
| 9 | 287-291 | The `images` package crashes on Windows | Outdated | The package is gone | `package.json` |
| 10 | 331-333, 589-591 | Add a lifecycle rule expiring noncurrent versions after the run | Partly | The doc's own §9 and `docs/TAKEOVER.md` say not before the client signs off: it permanently deletes the originals | — |
| 11 | 342-343 | URL construction in ~9 places (6 in `properties.js`) | Partly | 5 `getSignedUrl` calls in `properties.js`, 2 in `user.js`, 1 in `listing.js`, plus `showRoom.js`, `teamPhotos.js`, `seoHelpers.js` | — |
| 12 | 371-374 | Dead files listed under `public/img`-style paths | Partly | They're in `public/new-img/`, and the list is incomplete (more `4362-…` photos, 36 AppleDouble `__*` files) | `git ls-files public/new-img` |
| 13 | 409-412 | `npm test` = `node test/unit/restartPolicy.test.js` | Outdated | It also runs the two `node --test` files | `package.json:7` |
| 14 | 413-417, 491-493 | Re-run a property with a fresh `--progress` file | Wrong | Objects tagged `vlr-optimized` are always skipped; no flag overrides it | `Scripts/optimize_s3_images.js:253-257` |
| 15 | 442, 595-597 | Deploy = `git pull` + `systemctl restart` on `~/vlr_website` | Outdated | `deploy.sh` (env check, `npm ci`, rsync to `/opt/vlr/app`) | `deploy.sh` |
| 16 | 454-455 | Objects replaced "with a smaller JPEG of the same dimensions" | Wrong | Wider than 1920 px is scaled down, and `.rotate()` applies EXIF orientation (can swap width and height). The "dimension-check" only checks they're non-zero | `Scripts/optimize_s3_images.js:274-283` |
| 17 | 55-57 | The homepage hero was "a dice roll between a 129 KB banner and a 1.4 MB one" | Partly | A three-way pick; the third image is 209 KB | `public/libs/js/main.js:37` |
| 18 | 96-97 | Uploads were written at quality 100 by the `images` package until the vendor's fix | Partly | The last `images`-based code already passed `quality: 82`; 100 applies to older uploads | `lib/imageProcessing.js:6-11` |
| 19 | 150-152 | Savings "reproduced by the script's own dry-run" on a spread sample | Partly | `--limit N` takes the first N keys in listing order (lowest property ids), not a spread | `Scripts/optimize_s3_images.js` |
| 20 | 268-273, 325-328 | The full run takes 1–3 hours; use `--concurrency 4` | Partly | Never measured; the new server is a 2-vCPU burstable t3.large that also runs MongoDB | `docs/TAKEOVER.md` §4 |
| 21 | 331-333 | Storage roughly doubles until old versions expire | Wrong | ~71 GB originals + ~16 GB new copies: about +25% | — |
| 22 | 356-360 | The agent portrait PNGs are mobile backgrounds on a ~6 MB team page | Wrong | The `-pic` CSS classes that reference them aren't used by any view or script, so no page downloads them | `public/libs/css/content.css:496-537` |
| 23 | 366-367 | `--include-png` "only re-compresses them as PNG" | Wrong | It writes 8-bit palette PNGs (`palette: true`): lossy on photographs | `Scripts/optimize_s3_images.js` (`png({ … palette: true })`) |

## HANDOVER.md

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 13-19 | Servers `18.237.239.200` (`~/vlr`) and `34.217.51.226` (`~/vlr_website`) | Outdated | No longer serve the site (pending termination). Production is `vlr-prod-2026`, app in `/opt/vlr/app` | `vlr.service:21`, `docs/TAKEOVER.md` §4 |
| 2 | 30 | DB is `mongodb://localhost:27017/VLR` | Partly | `MONGO_URL` overrides it; set in `/etc/vlr/env` on the server | `lib/mongo.js:7` |
| 3 | 40, 67, 175 | AWS credentials in `config/aws.json` | Outdated | Environment variables since `7b0fd42` | — |
| 4 | 41-42, 102 | Images uploaded via `/VLR-admin/images`, watermarked, sent to S3 | Partly | `images.js` only stores the temp upload; watermark + S3 happen on property image save | `routes/properties.js:581-627` |
| 5 | 46, 193 | Mailgun API key hardcoded in `lib/mailer.js` | Outdated | `process.env.MAILGUN_API_KEY` | `lib/mailer.js:12` |
| 6 | 49 | Mail sent from both `info@vancouverluxuryrealty.com` and `info@vancouverluxuryrentals.com` | Partly | Only the first appears; the renewal mail uses the agent email the admin page posts | `lib/mailer.js:26, 128` |
| 7 | 53 | `robots.txt` configured for all landing pages | Partly | Served from code: `Allow: /` plus the sitemap line. The repo-root `robots.txt` isn't served | `server.js:248-253` |
| 8 | 62, 126, 173, 300 | Node v8+ | Wrong | Node ≥ 22.9 | `package.json:8` |
| 9 | 65 | `images` package for watermarking | Wrong | `sharp` | `lib/imageProcessing.js` |
| 10 | 124-125 | `deploy.sh` pulls `main` | Partly | Takes the branch as `$1`, defaulting to `main` | `deploy.sh:14` |
| 11 | 126, 173 | `deploy.sh` can't `npm install`; copy `node_modules` | Wrong | Runs `npm ci --omit=dev` | `deploy.sh:24` |
| 12 | 128 | Deploy cleans up `forever` | Partly | Stops the unit and `pkill`s `node .*server.js`; nothing refers to `forever` | `deploy.sh:41-43` |
| 13 | 139-146 | Team photo update via SSH to old prod + `migrate_team_photos.js` | Outdated | Edited in the admin at `/VLR-admin/showRoom/meetTeam`; the script is a one-time migration and needs the env loaded | `routes/showRoom.js`, `Scripts/readme.txt` |
| 14 | 153, 194 | `git_pull_and_update.sh` / `server_restart.sh` start `forever`; never use them | Outdated | Now safe wrappers: the first runs `deploy.sh`, the second restarts the unit | `git_pull_and_update.sh:12`, `server_restart.sh:15-23` |
| 15 | 160, 266 | 30 SEO unit tests; see `TESTING.md` | Wrong | 41 tests, none for SEO | `package.json:7`, `test/unit/` |
| 16 | 267-268 | `npm run test:watch` / `test:integration` | Wrong | Don't exist | `package.json` |
| 17 | 174 | MongoDB paths set in the systemd units | Wrong | Not in `vlr.service` | `vlr.service` |
| 18 | 176 | Session secret hardcoded in config | Outdated | `SESSION_SECRET`; startup exits without it | `config/default.js:4`, `server.js:24-27` |
| 19 | 181 | Daily job emails users who favourited a property | Partly | It also flips Rented → Available, but only for properties with a `propertyFavorite` doc (VLR-21) | `lib/setAvailable.js:56-96` |
| 20 | 188 | Errors logged via syslog + express-winston | Wrong | log4js files plus `console` to journald; no winston | `server.js:57-89` |
| 21 | 196, 258 | `.npmrc` with `ignore-scripts=true` | Wrong | Doesn't exist | — |
| 22 | 257 | Clone from Bitbucket | Outdated | Shut down (per vendor) | `docs/TAKEOVER.md` §3 |

## TESTING.md

The whole document describes a mocha/chai/supertest SEO test suite that was never added.

| # | Line | Vendor said | Verdict | What the code says |
|---|---|---|---|---|
| 1 | 7-13, 196-205 | `npm install` brings in Mocha, Chai, Supertest; `.npmrc` handles semantic-ui | Wrong | Dev dependencies are only `nodemon`; no `.npmrc`; no semantic-ui |
| 2 | 21-35, 63, 234 | 30 tests, all passing, with mocha output | Wrong | 41 tests, plain node + `node:test` output |
| 3 | 39-61, 108-134 | Tests for SEO meta, slugs, sanitisation, SEO middleware; files `seoHelpers.test.js`, `seoMiddleware.test.js`, `integration/routes.test.js` | Wrong | Tests are `restartPolicy`, `mongooseCompat`, `imageProcessing`; no `test/integration/` |
| 4 | 73-93, 174 | Scripts `test:unit`, `test:watch`, `test:integration`, `test:all` | Wrong | Only `test`, `dev`, `prod` |
| 5 | 85-89, 223-229 | Integration tests exist but are disabled | Wrong | There are none |
| 6 | 146-155, 209-220 | Chai examples; "Cannot find module 'chai'"; mocha timeout in `package.json` | Wrong | Tests use `node:assert`; no mocha config |

## test/README.md

Same fictional suite as `TESTING.md`: the tree with `seoHelpers` / `seoMiddleware` / `integration/routes` tests, mocha/chai/supertest installs, `npm run test:watch`, `npx mocha` single-file runs, "45 passing", chai examples, a mocha timeout, and integration tests "using mocked routes". Only `npm test` as the command to run everything is right. Replaced by a new `test/README.md` describing the real tests.

## README.md (vendor's working notes)

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 30 | `npm install` uses `--ignore-scripts` via `.npmrc` | Wrong | No `.npmrc` | — |
| 2 | 31 | `npm run dev` runs nodemon on port 3000 | Partly | Also needs `.env` with `SESSION_SECRET`, or the server exits | `server.js:24-27` |
| 3 | 40-51 | Deploy steps: `cd ~/vlr; ./deploy.sh`; checks `node_modules` (Node 8 can't install); fills in the unit's paths | Wrong | `deploy.sh` runs `npm ci --omit=dev`, checks `/etc/vlr/env`, rsyncs to `/opt/vlr/app`, copies the unit as-is | `deploy.sh:24-56` |
| 4 | 62-65 | Servers `18.237.239.200` and `34.217.51.226` | Outdated | No longer serve the site, pending termination (`docs/TAKEOVER.md` §4) | — |
| 5 | 65 | Legacy scripts are untracked, start `forever`, must not be used | Outdated | Tracked, rewritten as safe wrappers | `git_pull_and_update.sh`, `server_restart.sh` |
| 6 | 69-74 | Team photos: SSH to old prod, run the migration, `./deploy.sh` | Outdated | Admin UI at `/VLR-admin/showRoom/meetTeam`; no deploy needed for data | `routes/showRoom.js` |

## Scripts/readme.txt (corrected in VLR-16)

| # | Line | Vendor said | Verdict | What the code says |
|---|---|---|---|---|
| 1 | 1 | The folder holds scripts that help build the sitemap | Partly | Only `build_sitemap.js` does; the others re-encode S3 photos and migrate team photos |
| 2 | 9 | Run `optimize_s3_images.js` locally with `--env-file` | Partly | Works, but the script itself says to run on the server (~71 GB egress from a laptop), and locally it still writes to the production bucket |
| 3 | 10 | Server command `sudo -u vlr bash -c '… node Scripts/...'` | Partly | Needs to run from the project root; from `/opt/vlr/app` the script's progress files are wiped by the next deploy |
