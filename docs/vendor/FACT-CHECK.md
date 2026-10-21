# Vendor docs: fact-check log

What the previous vendor's documentation got wrong, checked against the code on 2026-10-20 for VLR-16.

**Method.** About 270 checkable claims in the eight vendor docs were compared with the code. Then a second, independent round tried to disprove the findings that matter most, reading the code and testing where it could (running the tests, Mongoose pluralisation, Express param decoding); it also found some of the entries below. This log lists the contradictions that matter; trivial ones are left out, and it may not be complete. Evidence is the code unless an entry cites `docs/TAKEOVER.md` (facts about servers and accounts) or "per vendor".

**What counts as the vendor's.** The handover code is commit `f304cbb` (from the vendor's `dedbc40` zip). Three commits of ours follow it: `74a3486` (line endings), `f8fdac4` (adds `docs/TAKEOVER.md`) and `7b0fd42`, which moved secrets to the environment. `7b0fd42` changed vendor code and text: it removed the 10 `config/aws.json` `loadFromPath` calls, replaced the hardcoded session secret and Mailgun key with environment variables and added the `SESSION_SECRET` startup check, added `--env-file-if-exists` to the npm scripts, added the `--env-file` lines to `Scripts/readme.txt`, and rewrote the secrets sentence in `CLAUDE.md`'s Config section. Vendor claims are judged against the handover code; where only our change made one untrue, the verdict is Outdated and says so. Line numbers refer to the vendor docs as of `7b0fd42` (the archived files in this folder, or `git show 7b0fd42:<file>` for the rewritten ones), which match `f304cbb` apart from the edits above; code evidence refers to `7b0fd42`.

**Verdicts.** **Wrong**: contradicted by the code. **Outdated**: was true for the old servers or the handover zip, not for the code now. **Partly**: true with a missing condition that matters. Claims that checked out aren't listed. Statements about live servers and S3 contents can't be checked from the repo and are left out unless the repo contradicts them.

**Summary.** The descriptions of how the app works were mostly right: routing, search filters, listing pages, owner leads, the SEO layer, scheduled jobs. Almost everything about the runtime and operations was wrong or outdated: Node 8, Mongoose 4, the `images` package, `forever`, `.npmrc`, the test suite, the servers, secrets in the code, the deploy steps. `TESTING.md` and `test/README.md` describe a test suite that never existed.

Bugs and security problems found along the way are tracked separately: VLR-18, VLR-19, VLR-20, VLR-21.

---

## CLAUDE.md (vendor version, rewritten in VLR-16)

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 16, 130 | Install needs `--ignore-scripts` for semantic-ui's installer, "already set in `.npmrc`" | Wrong | No `.npmrc` in the repo; semantic-ui is not a dependency (only a leftover `semantic.json`). `npm ci` works | `package.json`, `package-lock.json` |
| 2 | 23 | `npm run prod` = `NODE_ENV=production nodemon server.js` | Partly | Production doesn't use it: systemd runs `/usr/bin/node server.js`, and `nodemon` is a dev dependency `deploy.sh` doesn't install | `vlr.service:25`, `deploy.sh:24` |
| 3 | 29-40 | `npm run test:unit`, `test:watch`, `test:integration`, `test:all`; `npx mocha …` | Wrong | None of these scripts exist and mocha isn't installed. `npm test` runs plain node + `node --test` | `package.json:6-9` |
| 4 | 49 | The cleaner worker is designated "via `process.send`" | Partly | The master calls `worker.send(...)`; the worker listens with `process.on('message')` | `server.js:104, 332` |
| 5 | 53 | config-lite keyed off `__dirname` from `server.js`; dev reads `default.js`, prod reads `production.js` | Partly | Modules that need config call config-lite with their own directory. `production.js` is shallow-merged over `default.js`, and command-line flags and the `CONFIG` (or `NODE_CONFIG`) env var are merged over both | `node_modules/config-lite/index.js:13-46` |
| 6 | 59-70 | Route table | Partly | Also mounted: `/VLR-admin/showRoom` (from `admin.js`), `/sitemap.xml`, `/robots.txt`. `routes/sell.js` and `routes/availability.js` are never mounted | `routes/index.js:224-232`, `routes/admin.js:756` |
| 7 | 68 | `/VLR-admin` "protected by `AdminController.isAuthenticated`" | Wrong | Auth is per route. `/VLR-admin/images` has no auth at all (VLR-18); `/VLR-admin/csv` and `/login` are public | `routes/images.js:24-25`, `routes/admin.js:247` |
| 8 | 87 | `availableDate<N` becomes a date range | Partly | Kept only for old bookmarked URLs | `routes/properties.js:158-177` |
| 9 | 100 | Landing-page slugs are `<city>`, `-furnished`, `-unfurnished`, `all` | Partly | `all-furnished` and `all-unfurnished` exist too: 54 pages | `lib/forRentPages.js:180-186` |
| 10 | 104 | Email types list | Partly | Also `agent` / `sendAgentMail`, which nothing calls | `lib/mailer.js:75` |
| 11 | 109 | Notifications fire on save when status becomes Available or rent changes | Partly | The price-change mail only goes out if the new status is Available; the Available mail needs a previous status that was set and not Available | `routes/properties.js:443-457, 570-572` |
| 12 | 113-115 | Uploads are watermarked "using the `images` package" on upload | Wrong | `sharp` in `lib/imageProcessing.js`, run when the admin saves the image set (`PUT /properties/id/:id/images`), not at upload | `lib/imageProcessing.js:30`, `routes/properties.js:581-627` |
| 13 | 120 | `/resources/:slug` renders from a hardcoded `pages` map in `routes/index.js` | Partly | The map is in `lib/resourcePages.js`, rendered with `ai-content.ejs` | `routes/index.js:11, 152-174` |
| 14 | 130 | Unit tests cover `seoHelpers` and the SEO middleware; integration tests in `test/integration/routes.test.js` | Wrong | The 41 tests cover `restartPolicy`, `mongooseCompat` and `imageProcessing`. No integration tests, no SEO tests | `test/unit/` |
| 15 | 138 | One property (3606) backfilled | Outdated | 3606 and 5810 (per vendor) | `docs/TAKEOVER.md` §7 |
| 16 | 141 | "the server's Node 8 / glibc constraints" | Outdated | True of the old servers. The code can't run on Node 8: `sharp` 0.35 needs Node ≥ 20.9, and Mongoose is 8. Production runs 24.22.0 (per vendor) | `node_modules/sharp/package.json` (`engines`) |

## ARCHITECTURE.md (vendor version, corrected in VLR-16)

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 28-31, 75-83 | Middleware order: logger → canonical → static → robots → redirects → session → passport → router → error | Wrong | Logger → canonical → cookie/body parsers → session → passport → static → robots → redirects → router → `res.locals.user` → error handler. Static, robots and redirects run after session and passport | `server.js:178-321` |
| 2 | 35 | MongoDB on localhost | Partly | `MONGO_URL` overrides the config default | `lib/mongo.js:7`, `server.js:225` |
| 3 | 43, 347 | Runtime pinned to Node 8; servers can't `npm install`, copy `node_modules` | Outdated | True of the old servers. The code needs Node ≥ 20.9 (`sharp` 0.35) and runs Mongoose 8; `deploy.sh` runs `npm ci --omit=dev` | `node_modules/sharp/package.json` (`engines`), `deploy.sh:24` |
| 4 | 46 | Mongoose 4 | Wrong | Mongoose 8, with `lib/mongooseCompat.js` restoring the Mongoose 4 callback API | `package.json` (`^8.24.5`), `lib/mongo.js:2` |
| 5 | 50 | `images` package for resize/watermark | Wrong | `sharp` | `lib/imageProcessing.js:30` |
| 6 | 55, 75 | Logging: log4js + express-winston | Wrong | No winston. log4js `connectLogger` for HTTP; the cluster master logs via `console` to journald; in cluster mode only the master writes the log files | `server.js:57-89, 178` |
| 7 | 62 | Dead workers are re-forked | Partly | Unless 5 in a row die within 30 s of starting; then the master exits | `lib/restartPolicy.js`, `server.js:120-130` |
| 8 | 91 | All routes composed in `routes/index.js` | Partly | `/VLR-admin/showRoom` is mounted from `admin.js`; two routers are never mounted; `/unsubscribe`, `/email`, `/property-management/…` and the `/for-rent` → `/for-rent/all` redirect were missing | `routes/index.js:44-50, 205-222`, `routes/admin.js:756` |
| 9 | 109 | `/VLR-admin/images/*` is admin-only | Wrong | No auth middleware; mounted before the admin router (VLR-18) | `routes/images.js:24-25`, `routes/index.js:228` |
| 10 | 110 | `GET *` 404 fallback | Partly | Renders `404.ejs` with status 200 | `routes/index.js:232-234` |
| 11 | 148 | Unless `status` is Available/Rented, unlisted properties are excluded | Partly | Only in the non-date branch; with an availability filter any `status` passes through | `routes/properties.js:176-192` |
| 12 | 156 | `buildPropertiesSeo()` canonicalises both URL forms to the clean path | Partly | Not with `furnished=Yes/No`: it reads `req.query` after `getProperties` rewrote it, so the canonical becomes `?furnished!=…` (VLR-21) | `routes/properties.js:56, 204-208, 275` |
| 13 | 157 | Sitemap advertises the clean URLs | Partly | Only `all`, `all-furnished`, `all-unfurnished` and the base page of cities with stock; also lists `/properties?…` URLs for Rented facets | `lib/sitemap.js:140-163, 211` |
| 14 | 170 | `/properties/rented` = rented count + 500 | Partly | Counts `status != "Available"`, which includes unlisted properties | `routes/properties.js:1023-1036` |
| 15 | 175 | `/properties/attributes` admin | Partly | SuperAdmin | `routes/properties.js:812-816` |
| 16 | 178 | `PUT /properties/id/:id` updates the property | Partly | It also creates it if missing, writes `maxId`, and resets `createdAt` on every edit (VLR-21) | `routes/properties.js:430-468, 556-562` |
| 17 | 188-199 | Signed URL, then host rewritten to the public endpoint; two URL strategies | Wrong | The `.replace()` looks for the website domain, not the bucket, so it never matches: pages serve signed URLs that expire after 15 min. There are three strategies, plus an https-on-website-endpoint URL in `showRoom.js` | `routes/properties.js:286-291`, `routes/showRoom.js:486-490`, `lib/teamPhotos.js:28` |
| 18 | 207 | Only the trailing `-property-id-N` is parsed | Partly | Everything after the *first* `-property-id-` is taken as the id (`indexOf`) | `routes/listing.js:223-226` |
| 19 | 237, 285 | Owner leads in the `ownerleads` collection | Wrong | Model `'Leads'` → collection `leads` | `models/ownerLeads.js:39` |
| 20 | 265, 268 | `POST /user/newfavorite` and `DELETE /user/favorite` require a session | Wrong | Neither reads the session; both trust `req.body.user` (VLR-19) | `routes/user.js:265-309, 358-397` |
| 21 | 270 | `DELETE /user/id/:id` | Partly | `:id` is matched against `email` | `routes/user.js:48-67` |
| 22 | 272 | Both sides of favourites updated with `$addToSet` / `$pull` | Partly | Only the `propertyFavorite` side; the user side is a plain array edit + `save()` | `routes/user.js:275, 281-293, 368` |
| 23 | 286 | showRoom categories | Partly | Also `uploadForms`; the field is `value` | `routes/tenants.js:14-16`, `models/showRoom.js:6` |
| 24 | 304 | Fine Uploader posts to `/VLR-admin/images` | Wrong | `/VLR-admin/images/uploads` | `routes/images.js:24` |
| 25 | 311 | S3 used from `properties.js`, `images.js`, `listing.js` | Wrong | API calls are in `properties.js`, `showRoom.js`, `admin.js`, `lib/teamPhotos.js`. `images.js` builds a `createBucket` request that is never sent; `listing.js` only builds URLs. (`admin.js`'s one call, `listObjects`, sits in a branch that can't be reached) | `routes/images.js:20-22`, `routes/admin.js:411-421` |
| 26 | 321-324 | Mailer functions `sendAvailableForProperty`, `setPriceChangeForProperty`; renewal "—" | Wrong | Those two live in `lib/setAvailable.js`; the mailer functions are `sendAvailableMail` and `sendPriceChangeMail`. Renewal is `sendRenewalMail`, fired from `POST /VLR-admin/mail/renewal/:id` | `lib/mailer.js:108, 230, 272`, `routes/admin.js:667` |
| 27 | 322 | `sendOwnerLeadMail` → VLR admin | Partly | Hard-coded to `info@`, so the admin's "forward lead to agent" never reaches the agent (VLR-21) | `lib/mailer.js:215`, `routes/admin.js:636-657` |
| 28 | 334 | SEO middleware covers `homepage`, `owners`, `area`, `property`, `blog` | Partly | Only the first three are wired up; `structuredData` is always `[]` | `lib/seoHelpers.js`, `routes/index.js:22, 94-144` |
| 29 | 348 | Secrets committed in `config/aws.json`, `lib/mailer.js`, `config/*.js` | Outdated | True of the zip; since `7b0fd42` they come from the environment | `lib/mailer.js:12`, `config/default.js:4` |
| 30 | 367 | Config files include `config/aws.json`, `.npmrc` | Partly | `.npmrc` doesn't exist. `config/aws.json` was read (10 `loadFromPath` calls) until our `7b0fd42` moved the keys to the environment | `git grep loadFromPath f304cbb` |

## IMAGE_OPTIMIZATION.md (vendor version, corrected in VLR-16)

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 5, 40, 67, 89, 110, 397, 465 | Commits `b2deba0`, `dcea73d`, `2ae093d`, `2561bee`, `bc2c0e4`, `e21da85`, `10cedf7`, `7d7bc3c`; "`git revert b2deba0`" | Outdated | None exist here: our history starts at the handover baseline. The revert can't be done | `git log --all` |
| 2 | 11-12, 254-256, 545-547 | "`rm -rf ~/vlr/node_modules/sharp` … sharp is not in `package.json`, so this is safe" | **Wrong, harmful** | `sharp` is a dependency, and `routes/properties.js` loads `lib/imageProcessing.js` at startup: deleting it stops the site booting | `package.json:43`, `routes/properties.js:8` |
| 3 | 55-57 | The homepage hero was "a dice roll between a 129 KB banner and a 1.4 MB one" | Partly | A three-way pick; the third image is 209 KB | `public/libs/js/main.js:37` |
| 4 | 89-106 | Upload quality set at `routes/properties.js:636` via the `images` package | Wrong | `JPEG_QUALITY = 82` in `lib/imageProcessing.js`, with `sharp` | `lib/imageProcessing.js:38-48` |
| 5 | 96-97 | Uploads were written at quality 100 by the `images` package until the vendor's fix | Partly | The last `images`-based code already passed `quality: 82`; 100 applies to older uploads | `lib/imageProcessing.js:6-11` |
| 6 | 108, 117 vs 10, 513 | §2.4 "one property done" | Partly | The same doc's §10 says two (3606, 5810) | — |
| 7 | 113 | The script "follows the `--dry-run`-by-default convention of `migrate_team_photos.js`" | Wrong | Opposite: `migrate_team_photos.js` writes by default and needs `--dry-run` | `Scripts/migrate_team_photos.js:21` |
| 8 | 114 | The script's header "is long and current" | Wrong | It said sharp is not in `package.json`, production runs Node 8.9.4, and its usage lines used `scripts/` (wrong case on Linux) | `Scripts/optimize_s3_images.js` at `7b0fd42` |
| 9 | 135 | Credentials in `config/aws.json` | Outdated | Environment variables since `7b0fd42` | `.env.example` |
| 10 | 150-152 | Savings "reproduced by the script's own dry-run" on a spread sample | Partly | `--limit N` takes the first N keys in S3's lexicographic order (`10/` before `2/`), not a spread | `Scripts/optimize_s3_images.js` |
| 11 | 217-280, 510-581 | Node 16 + `sharp@0.32.6` in `~/imgopt` via `NODE_PATH`; `vlr.service` uses `/usr/local/bin/node` | Outdated | Those servers no longer serve the site. sharp is a normal dependency; the unit runs `/usr/bin/node` in `/opt/vlr/app` | `vlr.service:21, 25` |
| 12 | 268-273, 325-328 | The full run takes 1–3 hours; use `--concurrency 4` | Partly | Never measured; the new server is a 2-vCPU burstable t3.large that also runs MongoDB | `docs/TAKEOVER.md` §4 |
| 13 | 287-291 | The `images` package crashes on Windows | Outdated | The package is gone | `package.json` |
| 14 | 331-333 | Add a lifecycle rule expiring noncurrent versions after the run | Partly | Unconditional here; the doc's own §9 and §10-D (589-591) and `docs/TAKEOVER.md` say not before the client signs off, because it permanently deletes the originals | — |
| 15 | 342-343 | URL construction in ~9 places (6 in `properties.js`) | Partly | 5 `getSignedUrl` calls in `properties.js`, 2 in `user.js`, 1 in `listing.js`, plus `showRoom.js`, `teamPhotos.js`, `seoHelpers.js` | — |
| 16 | 349 | `/properties` builds URLs with `getSignedUrl` at `routes/properties.js:289` | Partly | The call is at 286; the `.replace()` after it never matches, so the signed URLs are served as-is and expire after 15 min | `routes/properties.js:286-291` |
| 17 | 356-360 | The agent portrait PNGs are mobile backgrounds on a ~6 MB team page | Wrong | The `-pic` CSS classes that reference them aren't used by any view or script, so no page downloads them | `public/libs/css/content.css:498-532` |
| 18 | 366-367 | `--include-png` "only re-compresses them as PNG" | Wrong | It writes 8-bit palette PNGs (`palette: true`): lossy on photographs | `Scripts/optimize_s3_images.js` (`png({ … palette: true })`) |
| 19 | 371-374 | Dead-file list | Partly | Incomplete: more unreferenced `4362-…` photos and 36 AppleDouble `__*` files | `git ls-files public/new-img` |
| 20 | 405-406 | Per-file failures are logged to `Scripts/.optimize_s3_failures.json` | Partly | The file is written only when a run finishes with failures; an interrupted run records none | `Scripts/optimize_s3_images.js` (end of run) |
| 21 | 409-412 | `npm test` = `node test/unit/restartPolicy.test.js` | Wrong | It also runs the two `node --test` files, already in the handover code | `package.json:7` |
| 22 | 413-417, 488-489 | Re-run a property with a fresh `--progress` file; re-running at a new quality re-encodes the compressed copy | Wrong | Objects tagged `vlr-optimized` are always skipped; no flag overrides it, so neither happens. (The doc's 491-493 gets this right) | `Scripts/optimize_s3_images.js:253-257` |
| 23 | 442, 595-597 | Deploy = `git pull` + `systemctl restart` on `~/vlr_website` | Outdated | `deploy.sh` (env check, `npm ci`, rsync to `/opt/vlr/app`) | `deploy.sh` |
| 24 | 454-455 | Objects replaced "with a smaller JPEG of the same dimensions" | Wrong | Wider than 1920 px is scaled down, and `.rotate()` applies EXIF orientation (can swap width and height). The "dimension-check" only checks they're non-zero | `Scripts/optimize_s3_images.js:274-283` |

## HANDOVER.md

| # | Line | Vendor said | Verdict | What the code says | Evidence |
|---|---|---|---|---|---|
| 1 | 13-19 | The two old servers and their checkouts (`~/vlr`, `~/vlr_website`) | Outdated | No longer serve the site (pending termination). Production is `vlr-prod-2026`, app in `/opt/vlr/app` | `vlr.service:21`, `docs/TAKEOVER.md` §4 |
| 2 | 30 | DB is `mongodb://localhost:27017/VLR` | Partly | `MONGO_URL` overrides it; set in `/etc/vlr/env` on the server | `lib/mongo.js:7` |
| 3 | 40, 67, 175 | AWS credentials in `config/aws.json` | Outdated | Environment variables since `7b0fd42` | — |
| 4 | 41-42, 102 | Images uploaded via `/VLR-admin/images`, watermarked, sent to S3 | Partly | `images.js` only stores the temp upload; watermark + S3 happen on property image save | `routes/properties.js:581-627` |
| 5 | 46, 193 | Mailgun API key hardcoded in `lib/mailer.js` | Outdated | `process.env.MAILGUN_API_KEY` | `lib/mailer.js:12` |
| 6 | 49 | Mail sent from both `info@vancouverluxuryrealty.com` and `info@vancouverluxuryrentals.com` | Partly | Only the first appears; the renewal mail uses the agent email the admin page posts | `lib/mailer.js:26, 128` |
| 7 | 53 | `robots.txt` configured for all landing pages | Partly | Served from code: `Allow: /` plus the sitemap line. The repo-root `robots.txt` isn't served | `server.js:248-253` |
| 8 | 62, 126, 173, 300 | Node v8+ | Outdated | True of the old servers. The code needs Node ≥ 20.9 (`sharp` 0.35) and runs Mongoose 8 | `node_modules/sharp/package.json` (`engines`) |
| 9 | 65 | `images` package for watermarking | Wrong | `sharp` | `lib/imageProcessing.js` |
| 10 | 124-125 | `deploy.sh` pulls `main` | Partly | Takes the branch as `$1`, defaulting to `main` | `deploy.sh:14` |
| 11 | 126, 173 | `deploy.sh` can't `npm install`; copy `node_modules` | Wrong | Runs `npm ci --omit=dev` | `deploy.sh:24` |
| 12 | 128 | Deploy cleans up `forever` | Partly | Stops the unit and `pkill`s `node .*server.js`; nothing refers to `forever` | `deploy.sh:41-43` |
| 13 | 139-146 | Team photo update via SSH to old prod + `migrate_team_photos.js` | Outdated | Edited in the admin at `/VLR-admin/showRoom/meetTeam`; the script is a one-time migration and needs the env loaded | `routes/showRoom.js`, `Scripts/readme.txt` |
| 14 | 160, 266 | 30 SEO unit tests; see `TESTING.md` | Wrong | 41 tests, none for SEO | `package.json:7`, `test/unit/` |
| 15 | 176 | Session secret hardcoded in config | Outdated | `SESSION_SECRET`; startup exits without it | `config/default.js:4`, `server.js:24-27` |
| 16 | 181 | Daily job emails users who favourited a property | Partly | It also flips Rented → Available, but only for properties with a `propertyFavorite` doc (VLR-21) | `lib/setAvailable.js:56-96` |
| 17 | 188 | Errors logged via syslog + express-winston | Wrong | log4js files plus `console` to journald; no winston | `server.js:57-89` |
| 18 | 196, 258 | `.npmrc` with `ignore-scripts=true` | Wrong | Doesn't exist | — |
| 19 | 257 | Clone from Bitbucket | Outdated | Shut down (per vendor) | `docs/TAKEOVER.md` §3 |
| 20 | 267-268 | `npm run test:watch` / `test:integration` | Wrong | Don't exist | `package.json` |

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
| 2 | 40-51 | Deploy steps: `cd ~/vlr; ./deploy.sh`; checks `node_modules` (Node 8 can't install); fills in the unit's paths | Wrong | `deploy.sh` runs `npm ci --omit=dev`, checks `/etc/vlr/env`, rsyncs to `/opt/vlr/app`, copies the unit as-is | `deploy.sh:24-56` |
| 3 | 62-65 | The two old servers | Outdated | No longer serve the site, pending termination | `docs/TAKEOVER.md` §4 |
| 4 | 69-74 | Team photos: SSH to old prod, run the migration, `./deploy.sh` | Outdated | Admin UI at `/VLR-admin/showRoom/meetTeam`; no deploy needed for data | `routes/showRoom.js` |

## Scripts/readme.txt (corrected in VLR-16)

| # | Line | Vendor said | Verdict | What the code says |
|---|---|---|---|---|
| 1 | 1 | The folder holds scripts that help build the sitemap | Partly | Only `build_sitemap.js` does; the others re-encode S3 photos and migrate team photos |
