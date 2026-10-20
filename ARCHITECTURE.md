# VLR Website — Architecture & API Flow Reference

> **Project**: VancouverLuxuryRentals.com (VLR)
> **Purpose**: Deep-dive reference for developers — system architecture, data model, and upstream/downstream API flows.
> **Companion docs**: [HANDOVER.md](HANDOVER.md) (credentials/ops), [CLAUDE.md](CLAUDE.md) (quick architecture summary), [TESTING.md](TESTING.md).
> **Last updated**: 2026-09-10

---

## 1. System Overview

VLR is a server-rendered Node.js/Express monolith backed by MongoDB, with images stored in AWS S3 and transactional email sent through Mailgun. There is no separate SPA — pages are rendered with EJS templates, and some interactivity (search, favourites) is layered on with jQuery/Vue-style client scripts that call JSON endpoints on the same server.

```
                          ┌─────────────────────────────────────────────┐
                          │                   Clients                     │
                          │   Public browsers · Admin agents · Crawlers   │
                          └───────────────────────┬───────────────────────┘
                                                  │  HTTPS
                          ┌───────────────────────▼───────────────────────┐
                          │        Node.js / Express (this app)            │
                          │                                                │
   ┌──────────────┐       │  cluster master ── forks N workers (1/CPU)     │
   │  systemd      │──────▶│    • 1 worker = "cleaner" (cron + uploads)    │
   │  vlr.service  │       │    • others  = HTTP only                      │
   └──────────────┘       │                                                │
                          │  Middleware chain:                             │
                          │   canonical-host redirect → static → robots →  │
                          │   DB redirect rules → session (Mongo) →        │
                          │   passport → router → error handler            │
                          └───┬──────────────┬───────────────┬────────────┘
                              │              │               │
                  ┌───────────▼───┐  ┌───────▼──────┐  ┌─────▼────────┐
                  │   MongoDB     │  │   AWS S3     │  │   Mailgun    │
                  │  (localhost)  │  │ (image store)│  │ (email send) │
                  └───────────────┘  └──────────────┘  └──────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (pinned to **v8** on servers — see caveat below) |
| Web framework | Express 4 |
| View engine | EJS (server-rendered); partial Vue.js on some pages |
| Data store | MongoDB via Mongoose 4 |
| Sessions | `express-session` + `connect-mongo` (sessions persisted in Mongo) |
| Admin auth | Passport.js (`passport-local`) |
| Image storage | AWS S3 (bucket `vancouverluxuryrental.com`, region `us-west-2`) |
| Image processing | `images` npm package (resize + watermark) |
| Email | Mailgun via `nodemailer` + `nodemailer-mailgun-transport` |
| Query parsing | `api-query-params` (aqp) |
| Scheduling | `node-schedule` (cron) + `setInterval` |
| Process mgmt | systemd (`vlr.service`), formerly `forever` |
| Logging | log4js (file appenders) + express-winston (HTTP access) |

---

## 2. Process Model (`server.js`)

- On boot, the **master process** uses Node's `cluster` to fork **one worker per CPU core**.
- The master configures log4js file appenders (`log/app.log`, `log/error.log`) and manages worker lifecycle. If a worker dies, it is re-forked.
- The **first worker to come online is designated the "cleaner"** (via `worker.send({chat: ...})`). Only that worker runs the background jobs. If the cleaner dies, the next worker to spawn is promoted.
- Every other worker only serves HTTP.

**Background jobs (cleaner worker only):**

| Job | Trigger | What it does |
|---|---|---|
| `cleanUpOldFiles` | `setInterval`, every 10 min (600000 ms) | Deletes files/folders in `uploads/` older than 30 min (temp image staging) |
| Availability check | `node-schedule` cron `0 10 0 * * *` (daily 00:10) | Calls `checkAvailable()` — see §6.2 |

### Express middleware order (per worker)

1. **express-winston / log4js connect logger** — HTTP access logging.
2. **Canonical host redirect** — 301s `vancouverluxuryrentals.com` → `www.vancouverluxuryrentals.com`. Allow-list only (`config.redirectHosts`), GET/HEAD only, matches on `Host` header. Deliberately excludes `localhost` (deploy health check) and `dev.*`.
3. **`express.static('public')`** — serves static assets.
4. **`/robots.txt`** — inline handler; advertises the sitemap URL.
5. **DB-driven redirect rules** — reads active rules from the `redirects` collection, cached in-memory with a **60-second TTL**. Applies 301 redirects for matching paths.
6. **Session** — `express-session` with `connect-mongo` store (sessions live in Mongo).
7. **Passport** — `initialize()` + `session()`; serializes admin `user.id`, deserializes from `admins` collection.
8. **Main router** (`routes/index.js`) mounted at `/`.
9. **Error handler** — logs the error and redirects to `/` (no stack trace leaked; no error page rendered).

> ⚠️ **Note on error handling**: the global error handler `res.redirect('/')` on *any* uncaught error. Several route handlers also `throw err` inside async callbacks (e.g. S3 operations), which under Node's cluster can crash the worker — the master re-forks it. Worth hardening in future work.

---

## 3. Routing Map

All routes are composed in `routes/index.js` and mounted at `/`. Sub-routers are mounted by prefix.

| Prefix / Path | File | Auth | Type | Purpose |
|---|---|---|---|---|
| `GET /` | `index.js` | public | HTML | Homepage |
| `GET /sitemap.xml` | `index.js` | public | XML | Dynamically generated sitemap (`lib/sitemap.js`) |
| `GET /robots.txt` | `server.js` | public | text | Points crawlers at sitemap |
| `GET /about`, `/about/*`, `/contact`, `/terms` | `index.js` | public | HTML | Static content pages |
| `GET /about/team` | `index.js` | public | HTML | Team page (reads `meetTeam` collection) |
| `GET /property-management-*`, `/*-property-management` | `index.js` | public | HTML | City area landing pages (SEO) |
| `GET /resources/:slug` | `index.js` | public | HTML | Static SEO content pages from `lib/resourcePages.js` |
| `GET /for-rent/:slug` | `index.js` → `properties.js` | public | HTML | Clean-URL search landing pages (§4.2) |
| `/properties/*` | `properties.js` | mixed | HTML+JSON | Search, CRUD, images (§4) |
| `/listing/:id` | `listing.js` | public | HTML | Individual property page + viewing scheduler (§5) |
| `/owners/*` | `owners.js` | public | HTML+JSON | Owner pages + list-property lead form (§6.1) |
| `/tenants/*` | `tenants.js` | public | HTML | Tenant info pages |
| `/user/*` | `user.js` | mixed | JSON | Tenant auth + favourites (§7) |
| `/VLR-admin/*` | `admin.js` | **admin** | HTML+JSON | Admin panel |
| `/VLR-admin/images/*` | `images.js` | **admin** | JSON | Fine Uploader image endpoint |
| `GET *` | `index.js` | public | HTML | 404 fallback |

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
   │     • month-based (legacy bookmarks) → compute moment date range
   │     • else → strip date keys, apply status default
   ├─ searchBar   → regex on searchColumn  ("/.*<term>.*/i")
   ├─ allowPets=Yes → allowPets! = "No"
   ├─ furnished=Yes/No → negation filter (furnished!)
   ├─ bedrooms "8 " → expands to 8,9,10,11,12
   │
   ▼
aqp(req.query)  ─ api-query-params builds Mongoose filter
   │
   ├─ force filter.address exists  (skip incomplete records)
   ▼
PropertyModel.find(filter)
   .select("-searchColumn")   ← never ship the giant search blob
   .limit(_limit).skip(_offset)
   .sort("status").sort("availableDate")
   ▼
req._properties  →  next()
```

Default status behaviour: unless `status` is explicitly `Available` or `Rented`, the query excludes `status = "Not list property"`.

### 4.2 Clean URL ↔ Query Duality

`lib/forRentPages.js` is the **single source of truth** mapping SEO slugs to query objects:
- `/for-rent/richmond` ⇔ `/properties?city=Richmond&status=Available`
- Slug forms: `<city>`, `<city>-furnished`, `<city>-unfurnished`, `all`.
- `routes/index.js` resolves the slug into `req.query`, then runs the **same** `getProperties` + `renderPropertiesPage`.
- `routes/properties.js` `buildPropertiesSeo()` sets the **canonical URL to the clean path** for both forms, so Google indexes one URL.
- `lib/sitemap.js` advertises the clean URLs.
- Filters with no landing page (keyword, bedrooms, price) keep their `?query=` URL.

### 4.3 Endpoints

| Method | Path | Auth | Returns | Notes |
|---|---|---|---|---|
| GET | `/properties/` | public | HTML | Search results page |
| GET | `/properties/count` | public | JSON `{count}` | Result count for current filters |
| GET | `/properties/random` | public | JSON | 3 random listings (+ favourites if logged in) |
| GET | `/properties/featured` | public | JSON | From `showRoom` doc `featuredProperties` |
| GET | `/properties/recentlyRented` | public | JSON | From `showRoom` doc `recentlyRentedProperties` |
| GET | `/properties/banner` | public | JSON | From `showRoom` doc `bannerProperties` |
| GET | `/properties/rented` | public | JSON `{count}` | Rented count (+500 vanity offset) |
| GET | `/properties/forRent` | public | JSON `{count}` | Available count |
| GET | `/properties/api/all` | public | JSON | All properties (no searchColumn) |
| GET | `/properties/id/:id` | public | JSON | Single property by `propertyId` |
| GET | `/properties/agent/:name` | public | JSON | Agent name/email/phone from `admins` |
| GET | `/properties/attributes` | **admin** | JSON | Attribute reference list |
| GET | `/properties/debug-search` | public | JSON | ⚠️ Debug endpoint (see cleanup note) |
| POST | `/properties/new` | **super admin** | JSON `{id}` | Create property |
| PUT | `/properties/id/:id` | **super admin** | JSON | Update property (~90 fields); fires availability/price-change emails |
| PUT | `/properties/id/:id/images` | **super admin** | JSON | Reconcile image set → watermark + S3 up/delete |
| GET | `/properties/id/:id/imglist` | **super admin** | JSON | List S3 objects for a property |
| GET | `/properties/image/:id/:filename` | **super admin** | JSON | Fetch one image from S3 |
| DELETE | `/properties/id/:id` | **super admin** | JSON `{id}` | Delete property |

> ⚠️ **Cleanup candidates**: `/properties/debug-search` is a temporary diagnostic endpoint left in the code, and the `/properties/rented` count adds a hard-coded `+500` vanity offset. Both are flagged for the next developer.

### 4.4 Image Cover URL Construction

Cover images for search/listing JSON are built by generating an S3 **signed URL** and then string-rewriting the host to the public S3 website endpoint:

```js
url = s3.getSignedUrl('getObject', {Bucket, Key: `${propertyId}/${coverImg}`});
url = url.replace("https://vancouverluxuryrentals.com/",
                  "http://s3-us-west-2.amazonaws.com/vancouverluxuryrental.com/");
```

The `/listing` page (`listing.js`) instead builds direct S3 website URLs:
`http://<bucket>.s3-website-us-west-2.amazonaws.com/<propertyId>/<file>` (spaces → `+`).

> ⚠️ Two different URL strategies coexist for the same images. Consolidating them (and moving to HTTPS/CloudFront) is a recommended future improvement.

---

## 5. Listing Page & Viewing Scheduler (`routes/listing.js`)

### 5.1 URL & Canonicalization

- Slug format: `address-property-id-123`. Only the trailing `-property-id-N` is parsed; the address portion is decorative.
- `getListing` extracts `N`, looks up the property (excluding `Not list property`), and attaches `req.property` + image `req.urls`.
- `redirectToCanonical()` 301s any non-canonical spelling to the canonical path (built by `lib/urls.buildListingPath`, the same function used by JSON-LD and the sitemap — they must stay in sync or it loops).
- Per-property SEO overrides (`seoTitle`, `seoDescription`, `seoCanonical`, `seoRobots`) from the admin panel take precedence over generated values.
- Logged-in tenant view increments that user's `visitCount`.

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
```

---

## 6. Owner Leads & Automated Notifications

### 6.1 List-Property Lead — Downstream Flow (`routes/owners.js`)

```
POST /owners/list-properties/new
   │  body: formString (JSON) — captures UTM/lead source fields
   ▼
new LeadsModel(...).save()             → MongoDB `ownerleads` collection
   │
   ├─▶ mailer.sendListPropertyMail()    → Mailgun → owner (thank-you ack)
   └─▶ mailer.sendOwnerLeadMail()       → Mailgun → VLR Admin (internal lead alert)
```

The lead form captures marketing attribution: `formSource`, `leadSource`, `utmSource`, `utmMedium`, `utmCampaign`.

### 6.2 Availability & Price-Change Notifications (`lib/setAvailable.js`)

- **`checkAvailable()`** — runs daily (00:10 cron). Finds properties where `availableDate <= today` AND `status = "Rented"`, then for each calls `sendAvailableForProperty` to email **all users who favourited that property**.
- **`sendAvailableForProperty()`** — triggered on property PUT when status transitions to `Available`. Emails favouriters.
- **`setPriceChangeForProperty()`** — triggered on property PUT when `rent` changes and status is `Available`. Emails favouriters.

These are the **event-driven downstream email flows** hanging off the property update endpoint (`PUT /properties/id/:id`).

---

## 7. Tenant Users & Favourites (`routes/user.js`)

Tenant auth is **passwordless/lightweight**: identity is just an email string stored in `req.session.user`. There is no password for tenants (contrast with admin Passport auth).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/user/new` | public | Sign in or auto-create user by email; sets session |
| GET | `/user/signout` | public | Destroy session |
| GET | `/user/myfavorites` | session | Render favourites page |
| POST | `/user/myfavorites` | public | Sign in + render favourites |
| POST | `/user/newfavorite` | session | Add a property to favourites |
| POST | `/user/newfavoriteform` | public | Add favourite + capture name/phone (upsert user) |
| POST | `/user/checkFavorites/:id` | session | Is this property favourited? |
| DELETE | `/user/favorite` | session | Remove favourite |
| GET | `/user/api/all` | **super admin** | List all users (admin view) |
| DELETE | `/user/id/:id` | **super admin** | Delete a user |

**Favourites are bidirectional**: a user's `favorites[]` holds property ObjectIds, and each `propertyFavorite` doc holds a `users[]` array. Both sides are updated together (`$addToSet` / `$pull`) so the availability-notification job can find favouriters by property.

---

## 8. Data Model (MongoDB collections)

| Collection | Model file | Key fields / role |
|---|---|---|
| `properties` | `models/properties.js` | ~90 flat fields. `propertyId` (numeric, unique), `status` (`Available`/`Rented`/`Not list property`), `imgs[]`, `coverImg`, `rent`, `availableDate`, `agent`, geo, amenities, `searchColumn` (JSON.stringify of whole doc for regex search), SEO overrides |
| `admins` | `models/admins.js` | Agents & super admins. Passport-authenticated. `role`, `name`, `email`, `phone` |
| `users` | `models/users.js` | Tenants (email-only identity). `favorites[]` (property refs), `visitCount` |
| `propertyfavorites` | `models/propertyFavorite.js` | Join: `propertyId` + `users[]`. Powers availability alerts |
| `schedules` | `models/schedule.js` | Viewing requests submitted from listing pages |
| `ownerleads` | `models/ownerLeads.js` | List-property lead submissions (+ UTM attribution) |
| `showrooms` | `models/showRoom.js` | Curated ID lists by `category`: `featuredProperties`, `bannerProperties`, `recentlyRentedProperties` |
| `attributes` | `models/attributes.js` | Reference lists for the admin property form |
| `meetteams` | `models/meetTeam.js` | Team page members. ⚠️ legacy `profile` Buffer field must be excluded from queries (bloated the page to 4.3 MB) |
| `redirects` | `models/redirect.js` | Active 301 redirect rules, cached 60 s in `server.js` |
| `dbstatuses` | `models/dbStatus.js` | Counters, e.g. `maxId` for property ID allocation |
| — (sessions) | (connect-mongo) | Express sessions persisted by `connect-mongo` |

---

## 9. Upstream & Downstream Integrations (summary)

### Upstream (inbound to the app)

| Source | Enters via | Notes |
|---|---|---|
| Public browsers | HTTP GET (HTML pages, JSON search endpoints) | Server-rendered EJS + client fetch |
| Admin agents | `/VLR-admin` (Passport login) | Property/image/user/lead management |
| Search engine crawlers | `/robots.txt` → `/sitemap.xml` → listing/landing pages | SEO layer, canonical URLs, JSON-LD |
| Fine Uploader (browser) | `POST /VLR-admin/images` | Multipart image upload to temp `uploads/` |

### Downstream (outbound from the app)

| Target | Called from | Trigger | Payload |
|---|---|---|---|
| **MongoDB** | everywhere (Mongoose) | all reads/writes | domain data + sessions |
| **AWS S3** | `properties.js`, `images.js`, `listing.js` | image upload / delete / list / signed-URL read | property images under `{propertyId}/{filename}` |
| **Mailgun** | `lib/mailer.js` | scheduler, owner lead, availability, price-change | templated EJS emails |

### Mailgun email types (`lib/mailer.js`)

| Function | Template | Recipient | Fired by |
|---|---|---|---|
| `sendScheduleMail` | `schedule` | tenant | viewing request |
| `sendTenantEnquiriesMail` | `tenantEnquiries` | assigned agent | viewing request |
| `sendListPropertyMail` | `listYourProperty` | owner | list-property form |
| `sendOwnerLeadMail` | `ownerLead` | VLR admin | list-property form |
| `sendAvailableForProperty` | `available` | favouriters | status → Available / daily cron |
| `setPriceChangeForProperty` | `priceChange` | favouriters | rent change on Available |
| (renewal) | `renewal` | — | (renewal flow) |

Sender: `info@vancouverluxuryrealty.com`; Mailgun domain: `mg.vancouverluxuryrentals.com`.

---

## 10. SEO Layer

Two patterns coexist:

1. **Middleware factory** (`middlewares/seo.js` + `lib/seoHelpers.js`) — pure functions produce `{seoTitle, seoDescription, canonicalUrl, ogImage, structuredData}` per page type (`homepage`, `owners`, `area`, `property`, `blog`) and attach to `res.locals` for EJS.
2. **Inline builders** — search pages use `buildPropertiesSeo()` in `properties.js` (emits `CollectionPage` JSON-LD); listing pages use `buildListingSeo()` in `listing.js` (emits `RealEstateListing` + `FAQPage` JSON-LD).

Supporting pieces:
- `lib/urls.js` — canonical URL/path builders. **Single source of truth** shared by the canonical `<link>`, JSON-LD, sitemap, and the listing 301 redirect. Changing its normalization can cause redirect loops.
- `lib/sitemap.js` — generates `/sitemap.xml` on demand (DB-driven, cached).
- `lib/forRentPages.js` — clean-URL search landing pages (§4.2).
- DB `redirects` collection — editable 301 rules, 60 s cache.

---

## 11. Known Architectural Risks & Future Work

1. **Node 8 pin** — the servers cannot `npm install` (semantic-ui + old deps). `node_modules` must be copied from a working checkout. Plan a Node upgrade + dependency audit.
2. **Secrets in repo** — AWS keys (`config/aws.json`), Mailgun API key (`lib/mailer.js`), and the session secret (`config/*.js`) are committed in plaintext. Move to env vars / IAM and rotate.
3. **Error handling** — global handler redirects to `/`; some async callbacks `throw`, which can crash a worker (auto-refork masks it). Harden async error paths.
4. **Two image-URL strategies** — signed-URL-then-rewrite vs. direct S3 website URLs; also HTTP (not HTTPS). Consolidate, ideally behind CloudFront/HTTPS.
5. **Debug/vanity artifacts** — remove `/properties/debug-search`; reconsider the `+500` offset on `/properties/rented`.
6. **`searchColumn` full-doc regex** — every property stores a JSON.stringify of itself for regex search; this is heavy and unindexed. Consider a real text index.
7. **Passwordless tenant auth** — tenant identity is an unverified email string. Fine for favourites, but do not extend it to anything sensitive without real auth.
8. **No automated DB backups** — last JSON export is from 2019 (see HANDOVER.md). Establish scheduled backups.

---

## 12. Quick File Index

| Area | Files |
|---|---|
| Entry / process | `server.js` |
| Routing | `routes/index.js`, `routes/properties.js`, `routes/listing.js`, `routes/owners.js`, `routes/user.js`, `routes/admin.js`, `routes/images.js`, `routes/tenants.js` |
| Models | `models/*.js` (see §8) |
| Business logic | `lib/setAvailable.js` (notifications), `lib/mailer.js` (email), `lib/urls.js` (canonical URLs), `lib/forRentPages.js` (SEO slugs), `lib/sitemap.js`, `lib/seoHelpers.js`, `lib/teamPhotos.js`, `lib/resourcePages.js` |
| Middleware | `middlewares/admin.js` (auth), `middlewares/seo.js` |
| Config | `config/default.js`, `config/production.js`, `config/aws.json`, `.npmrc` |
| Views | `views/*.ejs`, `views/emailTemplate/*.ejs` |
| Deploy | `deploy.sh`, `vlr.service` |
