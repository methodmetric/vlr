# VLR Website — Architecture & API Flow Reference

> **Project**: VancouverLuxuryRentals.com (VLR)
> **Purpose**: Deep-dive reference for developers — system architecture, data model, and upstream/downstream API flows.
> **Companion docs**: [CLAUDE.md](CLAUDE.md) (commands, rules, quick map), [docs/TAKEOVER.md](docs/TAKEOVER.md) (accounts, servers, secrets), [IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md).
> **Last checked against the code**: 2026-10-20 (VLR-16). Originally written by the previous vendor; their other docs are archived in [docs/vendor/](docs/vendor/).

---

## 1. System Overview

VLR is a server-rendered Node.js/Express monolith backed by MongoDB, with images stored in AWS S3 and transactional email sent through Mailgun. There is no separate SPA — pages are rendered with EJS templates, and some interactivity (search, favourites, the admin panel) is layered on with jQuery and Vue scripts that call JSON endpoints on the same server.

```
                          ┌─────────────────────────────────────────────┐
                          │                   Clients                     │
                          │   Public browsers · Admin agents · Crawlers   │
                          └───────────────────────┬───────────────────────┘
                                                  │  HTTPS (Cloudflare) → HTTP :80
                          ┌───────────────────────▼───────────────────────┐
                          │        Node.js / Express (this app)            │
                          │                                                │
   ┌──────────────┐       │  cluster master ── forks N workers (1/CPU)     │
   │  systemd      │──────▶│    • 1 worker = "cleaner" (cron + uploads)    │
   │  vlr.service  │       │    • others  = HTTP only                      │
   └──────────────┘       │                                                │
                          │  Middleware chain: see §2                      │
                          └───┬──────────────┬───────────────┬────────────┘
                              │              │               │
                  ┌───────────▼───┐  ┌───────▼──────┐  ┌─────▼────────┐
                  │   MongoDB     │  │   AWS S3     │  │   Mailgun    │
                  │ (MONGO_URL)   │  │ (image store)│  │ (email send) │
                  └───────────────┘  └──────────────┘  └──────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js. The floor is set by `sharp` 0.35 (Node ≥ 20.9) and the `--env-file-if-exists` flag in the npm scripts (Node ≥ 22.9). Production runs 24.22.0 (per vendor, see TAKEOVER §4). No `engines` field or `.nvmrc`. |
| Web framework | Express 4 |
| View engine | EJS (server-rendered); jQuery and Vue on some pages and the admin panel |
| Data store | MongoDB via Mongoose 8, with `lib/mongooseCompat.js` letting the old Mongoose 4-style callback code run unchanged |
| Sessions | `express-session` + `connect-mongo` (sessions persisted in Mongo) |
| Admin auth | Passport.js (`passport-local`, `usernameField: email`) |
| Image storage | AWS S3 (bucket `vancouverluxuryrental.com`, region `us-west-2`) via `aws-sdk` v2 |
| Image processing | `sharp` via `lib/imageProcessing.js` (resize + watermark) |
| Email | Mailgun via `nodemailer` + `nodemailer-mailgun-transport` |
| Query parsing | `api-query-params` (aqp) |
| Scheduling | `node-schedule` (cron) + `setInterval` |
| Config | `config-lite` (see §2.2) + environment variables |
| Process mgmt | systemd (`vlr.service`) |
| Logging | log4js (file appenders + `connectLogger` for HTTP); `console` for the cluster master |

---

## 2. Process Model (`server.js`)

- At startup `server.js` exits with code 1 if `config.session.secret` (from `SESSION_SECRET`) is empty. This runs before the cluster fork, so the master itself exits.
- The **master process** forks **one worker per CPU core** (`os.cpus().length`). When a worker dies it is re-forked, unless `lib/restartPolicy.js` decides the cluster is crash-looping: 5 consecutive workers that die within 30 s of coming online make the master exit (code 1). systemd then restarts the unit, and `StartLimitBurst=5` in 600 s latches it as `failed` (`deploy.sh` and `server_restart.sh` run `systemctl reset-failed` first).
- The **first worker to come online is designated the "cleaner"** (the master sends it `{chat: "You are the cleaner."}`). Only that worker runs the background jobs. If the cleaner dies, the next worker to come online is promoted.
- Every other worker only serves HTTP.

**Background jobs (cleaner worker only):**

| Job | Trigger | What it does |
|---|---|---|
| `cleanUpOldFiles` | `setInterval`, every 10 min (600000 ms) | Deletes entries in `uploads/` whose `ctime` is more than 30 min old (temp image staging) |
| Availability check | `node-schedule` cron `0 10 0 * * *` (daily 00:10, **server-local time** — `vlr.service` sets no `TZ`) | Calls `checkAvailable()` — see §6.2. The `== -1` retry next to it never fires: `checkAvailable()` returns `undefined` |

### 2.1 Express middleware order (per worker)

In registration order in `server.js`:

1. **log4js `connectLogger`** — HTTP access logging.
2. **Canonical host redirect** — registered only when `config.canonicalHost` and `config.redirectHosts` are set (production config only). For GET/HEAD requests whose `Host` (port stripped) is in the allow-list — today just the bare `vancouverluxuryrentals.com` — it 301s to `https://www.vancouverluxuryrentals.com` + original URL. Every other host (localhost for the deploy health check, IPs, anything else) passes through.
3. **`cookieParser`, `bodyParser.json()` (default 100 kb limit), `bodyParser.urlencoded` (`limit: '3mb'`)**.
4. **Session** — `express-session` with a `connect-mongo` store; cookie name `VLR`, `maxAge` ≈ 3 years.
5. **Passport** — `initialize()` + `session()`; serializes admin `user.id`, deserializes from the `admins` collection.
6. **`express.static('public')`** — serves static assets. The repo-root `robots.txt` is not under `public/` and is not served.
7. **`/robots.txt`** — inline handler: `Allow: /` plus the sitemap URL.
8. **DB-driven redirect rules** — active rules from the `redirects` collection, cached per worker for **60 s**. Compares `req.path` (query string ignored, trailing slash normalised, case-sensitive) and 301s on a match. Can never match a path `express.static` already served. Managed in the admin at `/VLR-admin/redirects`.
9. **Main router** (`routes/index.js`) mounted at `/`.
10. A middleware that sets `res.locals.user`. Only reached by non-GET/HEAD requests that no route answered (GET/HEAD are caught by the router's `GET *`); they then get Express's default 404.
11. **Error handler** — logs the error and redirects to `/`.

> ⚠️ **Error handling**: only errors passed to `next(err)` or thrown synchronously reach the handler, and it answers every one with a redirect to `/`. Errors thrown inside async callbacks (DB, S3, fs) are not caught: `lib/mongooseCompat.js` re-throws callback exceptions, and there is no `uncaughtException` handler, so they kill the worker. Some error paths also return without responding, leaving the socket open until the 120 s server timeout. Tracked in VLR-20.

### 2.2 Configuration

- `config-lite` loads `config/<NODE_ENV>.js` (if `NODE_ENV` is set) and **shallow-merges** it over `config/default.js` with `_.assign`, so a partial top-level key in `production.js` would replace the whole object from `default.js`. Every module calls `require('config-lite')(__dirname)` itself.
- It also merges `NODE_CONFIG`/`CONFIG` JSON env vars and **all command-line flags** (via `optimist`) over the result. A script run with `--limit 200` gets `config.limit = 200`; a `--port` or `--bucket` flag would change those settings.
- `default.js` and `production.js` differ only in `port` (3000 / 80), `canonicalHost` and `redirectHosts`. Both name the same S3 bucket.
- Secrets come from the environment: `SESSION_SECRET`, `MAILGUN_API_KEY`, and the AWS SDK's own credential chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` first, then `~/.aws/credentials` or an EC2 instance role). `MONGO_URL` overrides `config.mongodb`. Locally they come from `.env` (loaded by `npm run dev`); in production from `/etc/vlr/env` (loaded by `vlr.service`, and it also sets `NODE_ENV=production`, which is what selects port 80).

---

## 3. Routing Map

All routes are composed in `routes/index.js` and mounted at `/`, except `/robots.txt` (`server.js`) and `/VLR-admin/showRoom` (mounted from `routes/admin.js`). `routes/availability.js` and `routes/sell.js` exist but are never mounted.

Auth is per route, not per prefix: each admin route lists its own `AdminController.isAuthenticated` / `isSuperAdmin` middleware.

| Prefix / Path | File | Auth | Type | Purpose |
|---|---|---|---|---|
| `GET /` | `index.js` | public | HTML | Homepage |
| `GET /sitemap.xml` | `index.js` | public | XML | Generated sitemap (`lib/sitemap.js`) |
| `GET /robots.txt` | `server.js` | public | text | Points crawlers at the sitemap |
| `GET /about`, `/about/*`, `/contact`, `/terms`, `/unsubscribe`, `/email` | `index.js` | public | HTML | Content pages |
| `GET /about/team` | `index.js` | public | HTML | Team page (reads `meetteams`, excludes the legacy `profile` field) |
| `GET /property-management-*`, `/*-property-management` | `index.js` | public | HTML | Six city area landing pages (SEO) |
| `GET /property-management/`, `/property-management/thank-you` | `index.js` | public | HTML | Property-management landing + thank-you |
| `GET /resources/:slug` | `index.js` | public | HTML | Content pages from `lib/resourcePages.js`, rendered with `ai-content.ejs` |
| `GET /for-rent` | `index.js` | public | — | 301 to `/for-rent/all` |
| `GET /for-rent/:slug` | `index.js` → `properties.js` | public | HTML | Clean-URL search landing pages (§4.2) |
| `/properties/*` | `properties.js` | mixed | HTML+JSON | Search, CRUD, images (§4) |
| `/listing/*` | `listing.js` | public | HTML | Property page + viewing scheduler (§5) |
| `/owners/*` | `owners.js` | public | HTML+JSON | Owner pages + list-property lead form (§6.1) |
| `/tenants/*` | `tenants.js` | public | HTML | Tenant info pages |
| `/user/*` | `user.js` | mixed | JSON | Tenant sign-in + favourites (§7) |
| `/VLR-admin/images/*` | `images.js` | ⚠️ **none** | JSON | Fine Uploader temp-upload endpoint (§4.4). Mounted before `/VLR-admin` and has no auth middleware — VLR-18 |
| `/VLR-admin/*` | `admin.js` | admin, mostly SuperAdmin | HTML+JSON | Admin panel: properties, admins, CSV import/export/drop, schedules and lead forwarding, renewal mail, redirect rules, log viewer. `GET /VLR-admin/csv` and `/login` are public |
| `/VLR-admin/showRoom/*` | `showRoom.js` | SuperAdmin | HTML+JSON | Featured / banner / recently-rented lists, upload forms, team members |
| `GET *` | `index.js` | public | HTML | Renders `404.ejs` **with status 200** |

---

## 4. Property Domain (`routes/properties.js`)

The core of the app. Mounted at `/properties`.

### 4.1 Search Pipeline

`getProperties` is an exported middleware reused by both `/properties` and the `/for-rent/:slug` landing pages. Flow:

```
req.query
   │
   ├─ extract & strip pagination: limit (default 12), offset, page
   ├─ normalizeAvailabilityMonthQueryParam()  ─ decode availableDate<=N
   ├─ availability filter branch:
   │     • month-based (legacy bookmarks) → compute moment date range;
   │       any explicit status is passed through as-is
   │     • else → strip date keys, apply status default
   ├─ searchBar   → regex on searchColumn  ("/.*<term>.*/i", lowercased, not escaped)
   ├─ allowPets=Yes → allowPets! = "No"
   ├─ furnished=Yes/No → negation filter (furnished!)
   ├─ bedrooms "8 " → expands to 8,9,10,11,12
   │
   ▼
aqp(req.query)  ─ api-query-params builds the Mongoose filter
   │              (any "/…/" value on any field becomes a RegExp)
   ├─ force filter.address exists  (skip incomplete records)
   ▼
PropertyModel.find(filter)
   .select("-searchColumn")   ← never ship the giant search blob
   .limit(_limit).skip(_offset)
   .sort("status").sort("availableDate").sort("_id")
   ▼
req._properties  →  next()
```

Default status behaviour (non-date branch): unless `status` is explicitly `Available` or `Rented`, the query excludes `status = "Not list property"`.

On any query error — including a cast error from input like `?rent=abc` — the handler returns without responding (VLR-20).

### 4.2 Clean URL ↔ Query Duality

`lib/forRentPages.js` is the **single source of truth** mapping SEO slugs to query objects:
- `/for-rent/richmond` ⇔ `/properties?city=Richmond&status=Available`
- Slug forms: `<city>`, `<city>-furnished`, `<city>-unfurnished`, plus `all`, `all-furnished`, `all-unfurnished` — 17 cities + `all`, × 3 = 54 pages.
- `routes/index.js` resolves the slug into `req.query`, then runs the **same** `getProperties` + `renderPropertiesPage`.
- `routes/properties.js` `buildPropertiesSeo()` sets the canonical `<link>` to the clean path when the query form maps to a landing page. It is a canonical tag, not a redirect. Known gap: it reads `req.query` *after* `getProperties` has rewritten `furnished`, so the query form with `furnished=Yes/No` canonicalises to a `?furnished!=…` URL instead of the landing page (VLR-21).
- `lib/sitemap.js` advertises `/for-rent/all`, `all-furnished`, `all-unfurnished`, and the base page of each city that has Available stock; city furnished/unfurnished pages are not listed. It also lists `/properties?…` query URLs for Rented facets.
- Filters with no landing page (keyword, bedrooms, price, rented facets) keep their `?query=` URL.

### 4.3 Endpoints

| Method | Path | Auth | Returns | Notes |
|---|---|---|---|---|
| GET | `/properties/` | public | HTML | Search results page |
| GET | `/properties/count` | public | JSON `{count}` | Result count; duplicates the pipeline logic |
| GET | `/properties/random` | public | JSON | 3 random listings (+ favourites if logged in) |
| GET | `/properties/featured` | public | JSON | From the `showRoom` `featuredProperties` category |
| GET | `/properties/recentlyRented` | public | JSON | From `recentlyRentedProperties` |
| GET | `/properties/banner` | public | JSON | From `bannerProperties` |
| GET | `/properties/rented` | public | JSON `{count}` | Count of `status != "Available"` (includes unlisted) + 500 |
| GET | `/properties/forRent` | public | JSON `{count}` | Available count |
| GET | `/properties/api/all` | public | JSON | ⚠️ Every property, every status (incl. "Not list property"), all fields except `searchColumn` — VLR-19 |
| GET | `/properties/id/:id` | public | JSON | ⚠️ Full document by `propertyId`, incl. `searchColumn` — VLR-19 |
| GET | `/properties/agent/:name` | public | JSON | Agent name/email/phone from `admins` |
| GET | `/properties/attributes` | SuperAdmin | JSON | Attribute reference list |
| GET | `/properties/debug-search` | public | JSON | ⚠️ Leftover diagnostic endpoint — VLR-19 |
| POST | `/properties/new` | SuperAdmin | JSON `{id}` | Create property (`body.property` is a JSON string) |
| PUT | `/properties/id/:id` | SuperAdmin | JSON | Update property (~90 fields); creates it if missing; may fire availability/price-change emails (§6.2) |
| PUT | `/properties/id/:id/images` | SuperAdmin | JSON | Reconcile image set → resize + watermark + S3 upload/delete (§4.4) |
| GET | `/properties/id/:id/imglist` | SuperAdmin | JSON | List S3 objects for a property |
| GET | `/properties/image/:id/:filename` | SuperAdmin | JSON | Fetch one image from S3 |
| DELETE | `/properties/id/:id` | SuperAdmin | JSON `{id}` | Delete property |

`PUT /properties/id/:id` also rebuilds `searchColumn` (JSON.stringify of the document) and, for a new property, writes its id to the `dbstatuses` `maxId` counter. Known bug: it sets `createdAt` from a field the admin form never sends, so every edit resets `createdAt` (and the sitemap `<lastmod>`) to now (VLR-21).

### 4.4 Image Upload Pipeline

1. **Upload to temp.** Fine Uploader in the admin posts each file to `POST /VLR-admin/images/uploads` (`routes/images.js`, 5 MB limit). It lands in `uploads/<qquuid>/<qqfilename>`; `DELETE /VLR-admin/images/uploads/:uuid` removes it. Nothing goes to S3 here. ⚠️ This router has no auth and builds paths from request input — VLR-18.
2. **Process on save.** When the admin saves the image set, `PUT /properties/id/:id/images` diffs it against `imgs[]`. Each new photo goes through `lib/imageProcessing.js` (`sharp`): resized to 1920 px wide (smaller photos are enlarged), watermarked with `public/img/vlr-logo-watermark.png`, JPEG re-encoded at quality 82 (PNG and GIF keep their format; other types are rejected). It is then uploaded to S3 as `{propertyId}/{filename}`; removed photos are deleted from S3.
3. **Cleanup.** The temp folders are removed after the response, and the cleaner worker sweeps `uploads/` every 10 min. The S3 upload (`uploadToS3`) is fire-and-forget: the response doesn't wait for it.

### 4.5 Image URL Construction

Three different strategies coexist for the same images:

| Where | URL produced |
|---|---|
| `routes/properties.js` (5 places: search page, `/random`, featured/recentlyRented/banner) | `s3.getSignedUrl('getObject', …)` → presigned `https://s3.us-west-2.amazonaws.com/vancouverluxuryrental.com/…` URL that **expires after 15 min**. The `.replace("https://vancouverluxuryrentals.com/", …)` after it never matches (it names the website domain, not the bucket), so it does nothing (VLR-21). |
| `routes/listing.js`, `routes/user.js` (2) | `http://<bucket>.s3-website-us-west-2.amazonaws.com/<propertyId>/<file>` (spaces → `+`). On the listing page, client JS rewrites these to the REST endpoint; the server-rendered `og:image` and JSON-LD `image` keep the website URL (VLR-21). |
| `routes/showRoom.js` (upload forms) | `https://` on the website endpoint, which S3 doesn't serve over HTTPS (VLR-21). |
| `lib/teamPhotos.js`, `lib/seoHelpers.js` | `https://s3.us-west-2.amazonaws.com/<bucket>/<key>` (path-style) |

The bucket name is also hardcoded in some views (see TAKEOVER §5).

---

## 5. Listing Page & Viewing Scheduler (`routes/listing.js`)

### 5.1 URL & Canonicalization

- Slug format: `address-property-id-123`. Only the trailing `-property-id-N` is parsed; the address portion is decorative.
- `getListing` extracts `N`, looks up the property (excluding `Not list property`), and attaches `req.property` + image `req.urls`. A missing property goes to the error handler (302 to `/`), not a 404.
- `redirectToCanonical()` 301s any non-canonical spelling (GET only) to the canonical path built by `lib/urls.buildListingPath` — the same function used by JSON-LD and the sitemap. They must stay in sync or it loops. (`lib/seoHelpers.js` has its own unused `toSlug`; don't wire it in without checking this.)
- Per-property SEO overrides (`seoTitle`, `seoDescription`, `seoCanonical`, `seoRobots`) from the admin panel take precedence over generated values.
- A logged-in tenant's view increments that user's `visitCount`.

### 5.2 Viewing Schedule Submission — Downstream Flow

```
POST /listing/scheduler/new   (from listing page form)
   │  body: formString (JSON) + property
   ▼
new ScheduleModel(...).save()          → MongoDB `schedules` collection
   │
   ├─▶ mailer.sendScheduleMail()        → Mailgun → tenant (confirmation-style ack)
   │
   └─▶ AdminModel.findOne({name: agent})
          └─▶ mailer.sendTenantEnquiriesMail()  → Mailgun → assigned agent
                (skipped if no admin matches the agent name)
```

---

## 6. Owner Leads & Automated Notifications

### 6.1 List-Property Lead — Downstream Flow (`routes/owners.js`)

```
POST /owners/list-properties/new
   │  body: formString (JSON) — captures UTM/lead source fields
   ▼
new LeadsModel(...).save()             → MongoDB `leads` collection (model 'Leads')
   │
   ├─▶ mailer.sendListPropertyMail()    → Mailgun → owner (thank-you ack)
   └─▶ mailer.sendOwnerLeadMail()       → Mailgun → info@vancouverluxuryrealty.com
```

The lead form captures marketing attribution: `formSource`, `leadSource`, `utmSource`, `utmMedium`, `utmCampaign`.

The admin's "forward lead to agent" (`POST /VLR-admin/mail/ownerLeads/:id`) also calls `sendOwnerLeadMail`, which always sends to `info@`, so forwarded owner leads never reach the agent even though the lead is marked forwarded (VLR-21). Forwarding a viewing request (`POST /VLR-admin/mail/schedule/:id`) does reach the agent.

### 6.2 Availability & Price-Change Notifications (`lib/setAvailable.js`)

- **`checkAvailable()`** — runs daily (00:10 server time). Finds properties where `availableDate <= now` AND `status = "Rented"` and calls `sendAvailableForProperty` for each.
- **`sendAvailableForProperty()`** — for each `propertyFavorite` doc of the property, emails its users and sets the property to `Available`. Known bug: the status flip happens inside that loop, so a property that has never had a `propertyFavorite` doc stays `Rented` forever (VLR-21). Also called from `PUT /properties/id/:id` when an existing property's status changes from a non-empty, non-Available value to `Available`.
- **`setPriceChangeForProperty()`** — called from `PUT /properties/id/:id` when an existing property had a rent, the rent changes, and the new status is `Available`. Emails favouriters.

---

## 7. Tenant Users & Favourites (`routes/user.js`)

Tenant identity is **an email address with no password or verification**: `POST /user/new` or `POST /user/myfavorites` with any email signs that browser in as that user (`req.session.user` = the email). Contrast with admin Passport auth. Several favourites endpoints don't even read the session and trust `req.body.user` instead (VLR-19).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/user/new` | none | Sign in or auto-create user by email; sets session |
| GET | `/user/signout` | public | Destroy session |
| GET | `/user/myfavorites` | session | Render favourites page |
| POST | `/user/myfavorites` | none | Sign in by email + render favourites |
| POST | `/user/newfavorite` | ⚠️ none (trusts `body.user`) | Add a property to a user's favourites |
| POST | `/user/newfavoriteform` | none | Add favourite + capture name/phone (upserts the user) |
| POST | `/user/checkFavorites/:id` | session | Is this property favourited? (no response without a session — VLR-20) |
| DELETE | `/user/favorite` | ⚠️ none (trusts `body.user`) | Remove favourite; also used by the email unsubscribe page |
| GET | `/user/api/all` | SuperAdmin | List all users (admin view) |
| DELETE | `/user/id/:id` | SuperAdmin | Delete a user (`:id` is matched against `email`) |

**Favourites are stored on both sides**: a user's `favorites[]` holds property ObjectIds (plain array edit + `save()`), and each `propertyFavorite` doc, keyed by the property's `_id`, holds a `users[]` array (`$addToSet` / `$pull` with upsert). The availability job finds favouriters through the `propertyFavorite` side.

---

## 8. Data Model (MongoDB collections)

Collection names are Mongoose's pluralisation of the model name (no model sets `collection:` explicitly).

| Collection | Model file | Key fields / role |
|---|---|---|
| `properties` | `models/properties.js` | ~90 flat fields. `propertyId` (numeric, unique), `status` (free string; the app uses `Available`/`Rented`/`Not list property`), `imgs[]`, `coverImg`, `rent`, `availableDate`, `agent`, geo, amenities, `searchColumn` (JSON.stringify of the whole doc, for regex search), SEO overrides. Pre-save hook sets `createdAt` if empty |
| `admins` | `models/admins.js` | Agents & SuperAdmins. Passport-authenticated. `role`, `name`, `email`, `phone`. Passwords: single-round HMAC-SHA1 with a per-user salt (VLR-19) |
| `users` | `models/users.js` | Tenants (email-only identity). `favorites[]` (property refs), `visitCount` |
| `propertyfavorites` | `models/propertyFavorite.js` | Property `_id` + `users[]`. Powers availability alerts |
| `schedules` | `models/schedule.js` | Viewing requests submitted from listing pages |
| `leads` | `models/ownerLeads.js` | List-property lead submissions (+ UTM attribution) |
| `showrooms` | `models/showRoom.js` | Curated lists by `category` (`featuredProperties`, `bannerProperties`, `recentlyRentedProperties`, `uploadForms`), stored in `value` |
| `attributes` | `models/attributes.js` | Reference lists for the admin property form |
| `meetteams` | `models/meetTeam.js` | Team page members. Photo is an S3 key in `profileImage` (under `team/`, resolved by `lib/teamPhotos.js`). The legacy `profile` Buffer field is still in the schema and must be excluded from queries |
| `redirects` | `models/redirect.js` | Admin-editable 301 rules (`active: true` ones are applied), cached 60 s per worker |
| `dbstatuses` | `models/dbStatus.js` | Counters, e.g. `maxId` for property ID allocation |
| `sessions` | (connect-mongo) | Express sessions |

---

## 9. Upstream & Downstream Integrations (summary)

### Upstream (inbound to the app)

| Source | Enters via | Notes |
|---|---|---|
| Public browsers | HTTP GET (HTML pages, JSON search endpoints) | Server-rendered EJS + client fetch |
| Admin agents | `/VLR-admin` (Passport login) | Property/image/user/lead management |
| Search engine crawlers | `/robots.txt` → `/sitemap.xml` → listing/landing pages | SEO layer, canonical URLs, JSON-LD |
| Fine Uploader (browser) | `POST /VLR-admin/images/uploads` | Multipart image upload to temp `uploads/` |

### Downstream (outbound from the app)

| Target | Called from | Trigger | Payload |
|---|---|---|---|
| **MongoDB** | everywhere (Mongoose) | all reads/writes | domain data + sessions |
| **AWS S3** | `routes/properties.js`, `routes/showRoom.js`, `routes/admin.js`, `lib/teamPhotos.js` | image upload / delete / list / signed-URL read, upload forms, team photos | property images under `{propertyId}/{filename}`, team photos under `team/`, forms under `uploadForms/` |
| **Mailgun** | `lib/mailer.js` | scheduler, owner lead, availability, price change, renewal | templated EJS emails |

`routes/images.js` and `routes/listing.js` make no S3 API calls (images.js builds a `createBucket` request that is never sent; listing.js only builds URLs).

### Mailgun email types (`lib/mailer.js`)

| Function | Template | Recipient | Fired by |
|---|---|---|---|
| `sendScheduleMail` | `schedule` | tenant | viewing request |
| `sendTenantEnquiriesMail` | `tenantEnquiries` | assigned agent | viewing request; admin schedule forward |
| `sendListPropertyMail` | `listYourProperty` | owner | list-property form |
| `sendOwnerLeadMail` | `ownerLead` | `info@vancouverluxuryrealty.com` (hard-coded) | list-property form; admin owner-lead forward |
| `sendAvailableMail` | `available` | favouriters | `sendAvailableForProperty` in `lib/setAvailable.js` |
| `sendPriceChangeMail` | `priceChange` | favouriters | `setPriceChangeForProperty` in `lib/setAvailable.js` |
| `sendRenewalMail` | `renewal` | tenant | `POST /VLR-admin/mail/renewal/:id` (SuperAdmin; `:id` is the propertyId; also sets the property's `agent` and `forwarded`) |
| `sendAgentMail` | `agent` | — | never called |

Sender: `info@vancouverluxuryrealty.com`, except the renewal mail, which is sent `from` the `agentEmail` the admin page posts. Mailgun domain: `mg.vancouverluxuryrentals.com`. With `MAILGUN_API_KEY` set, mail is really sent — leave it empty locally.

---

## 10. SEO Layer

Two patterns coexist:

1. **Middleware factory** (`middlewares/seo.js` + `lib/seoHelpers.js`) — pure functions produce `{seoTitle, seoDescription, canonicalUrl, ogImage, structuredData}` and attach them to `res.locals` for EJS. Only the `homepage`, `owners` and `area` page types are wired up; the `property` and `blog` generators are unused, and `structuredData` is always `[]`.
2. **Inline builders** — the pages with real JSON-LD build it themselves: search pages via `buildPropertiesSeo()` in `properties.js` (`CollectionPage`), listing pages via `buildListingSeo()` in `listing.js` (`RealEstateListing` + `FAQPage`), plus inline blocks in `routes/index.js`, `routes/owners.js` and `routes/tenants.js`.

Supporting pieces:
- `lib/urls.js` — canonical URL/path builders, shared by the listing canonical `<link>`, JSON-LD, sitemap, `forRentPages` and the listing 301 redirect. Changing its normalisation can cause redirect loops.
- `lib/sitemap.js` — generates `/sitemap.xml` from the DB, cached 1 h per worker; serves the stale copy if a rebuild fails. Its `invalidateCache()` has no caller. There must be no `public/sitemap.xml`: `express.static` would shadow the route.
- `lib/forRentPages.js` — clean-URL search landing pages (§4.2).
- DB `redirects` collection — editable 301 rules, 60 s cache (§2.1).

---

## 11. Known Architectural Risks & Future Work

Bugs and security problems found while checking this document are tracked in Linear: **VLR-18** (unauthenticated upload endpoint), **VLR-19** (tenant auth and data exposure), **VLR-20** (crash resilience), **VLR-21** (correctness bugs). Structural risks:

1. **Error handling** — async callback errors crash workers, and enough of them in a row can latch the systemd unit as `failed` (§2). Some paths never respond.
2. **Three image-URL strategies** (§4.5), some HTTP-only and some expiring. Consolidate, ideally behind CloudFront/HTTPS.
3. **`searchColumn` full-doc regex** — every property stores a JSON.stringify of itself for regex search; heavy and unindexed. Consider a real text index.
4. **Tenant identity** is an unverified email string. Don't extend it to anything sensitive without real auth.
5. **Dependencies** — AWS SDK v2 is end-of-support; `npm audit` reports many vulnerable packages (TAKEOVER §5).
6. **No automated DB backups** found in the code (TAKEOVER §7).

---

## 12. Quick File Index

| Area | Files |
|---|---|
| Entry / process | `server.js`, `lib/restartPolicy.js` |
| Routing | `routes/index.js`, `routes/properties.js`, `routes/listing.js`, `routes/owners.js`, `routes/user.js`, `routes/admin.js`, `routes/showRoom.js`, `routes/images.js`, `routes/tenants.js` (unmounted: `routes/availability.js`, `routes/sell.js`) |
| Models | `models/*.js` (see §8) |
| Business logic | `lib/setAvailable.js` (notifications), `lib/mailer.js` (email), `lib/imageProcessing.js` (sharp), `lib/urls.js` (canonical URLs), `lib/forRentPages.js` (SEO slugs), `lib/sitemap.js`, `lib/seoHelpers.js`, `lib/teamPhotos.js`, `lib/resourcePages.js` |
| Data layer | `lib/mongo.js`, `lib/mongooseCompat.js` (must load before the first query) |
| Middleware | `middlewares/admin.js` (auth), `middlewares/seo.js` |
| Config | `config/default.js`, `config/production.js`, `.env.example` |
| Views | `views/*.ejs`, `views/emailTemplate/*.ejs` |
| Scripts | `Scripts/build_sitemap.js`, `Scripts/optimize_s3_images.js`, `Scripts/migrate_team_photos.js` (see `Scripts/readme.txt`) |
| Deploy | `deploy.sh`, `vlr.service`, `server_restart.sh`, `git_pull_and_update.sh` (wrapper for `deploy.sh`) |
| Tests | `test/unit/*.test.js`, `test/fixtures/` |
