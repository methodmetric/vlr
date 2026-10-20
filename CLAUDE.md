# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**VancouverLuxuryRentals.com (VLR)** — a Node.js/Express property rental website serving both public tenants and an internal admin panel for agents. Key flows:

- Public users browse/filter rental properties, schedule viewings, and favourite listings
- Property owners submit their properties via lead forms
- Admins (agents and super admins) manage all properties, images, schedules, and owner leads via `/VLR-admin`

## Commands

```bash
# Install (must use --ignore-scripts due to semantic-ui interactive installer, already set in .npmrc)
npm install

# Development (auto-restart on file changes)
npm run dev

# Production
npm run prod        # NODE_ENV=production nodemon server.js

# Start without nodemon
node server

# Run unit tests (no DB or AWS needed)
npm test
npm run test:unit

# Run a single test file
npx mocha "test/unit/seoHelpers.test.js" --timeout 5000

# Watch mode during development
npm run test:watch

# Integration tests (requires running MongoDB + AWS S3 + live server)
npm run test:integration
npm run test:all
```

Server listens on port **3000** in dev, port **80** in production.

## Architecture

### Entry Point & Process Model

`server.js` uses Node.js `cluster` to fork one worker per CPU. The **master process** handles logging and worker lifecycle. One worker is designated as the "cleaner" (via `process.send`) responsible for the periodic upload cleanup (every 10 min) and the daily availability check cron job (00:10 daily). All other workers just serve HTTP.

### Config

Uses `config-lite` keyed off `__dirname` from `server.js`. Reads `config/default.js` in development, `config/production.js` when `NODE_ENV=production`. AWS credentials live in `config/aws.json` (loaded directly with `AWS.config.loadFromPath`).

### Routing Tree

All routes are wired through `routes/index.js`, which is the single router mounted at `/` in `server.js`:

| Prefix | File | Notes |
|---|---|---|
| `/` | `routes/index.js` | Homepage, about, area landing pages, static resource pages |
| `/properties` | `routes/properties.js` | Property search, CRUD API, image management, S3 ops |
| `/for-rent/:slug` | `routes/index.js` | SEO landing pages for the search (`/for-rent/richmond`, `/for-rent/north-vancouver-furnished`); slug → query map in `lib/forRentPages.js` |
| `/listing/:id` | `routes/listing.js` | Individual property page; URL slug format: `address-property-id-123` |
| `/owners` | `routes/owners.js` | Owner landing pages + list-property lead form |
| `/tenants` | `routes/tenants.js` | Tenant pages |
| `/user` | `routes/user.js` | Tenant user auth (register/login/favourites) |
| `/VLR-admin` | `routes/admin.js` | Admin panel — protected by `AdminController.isAuthenticated` |
| `/VLR-admin/images` | `routes/images.js` | Fine Uploader endpoint for property images |
| `/listing` (POST scheduler) | `routes/listing.js` | Viewing schedule submission |

### Authentication & Authorization

Two separate auth systems coexist:

- **Admin (Passport.js)**: `passport-local` strategy defined in `lib/passportLocal.js`. Sessions stored in MongoDB via `connect-mongo`. Middleware at `middlewares/admin.js` — `isAuthenticated` checks `req.user`, `isSuperAdmin` checks `req.user.role === 'SuperAdmin'`. Admins are in the `admins` collection.
- **Tenant users**: Session-based via `req.session.user` (email string). Defined in `models/users.js`.

### Property Model

`models/properties.js` — ~90 fields, all flat on one document. Key fields: `propertyId` (numeric, unique), `status` (`"Available"` / `"Rented"` / `"Not list property"`), `imgs[]` (filenames), `coverImg` (filename), `searchColumn` (JSON.stringify of the whole document for full-text regex search). Images are stored in AWS S3 bucket `vancouverluxuryrental.com` under key `{propertyId}/{filename}`.

### Property Search & Filtering

`routes/properties.js` `router.getProperties` middleware translates query params to a Mongoose query using `api-query-params` (`aqp`). Key transformations:
- `searchBar` → regex on `searchColumn`
- `availableDate<N` (month number) → computed date range filter
- `furnished=Yes/No` → negation filter (`furnished!`)
- `allowPets=Yes` → `allowPets! = "No"`
- Default: exclude `status = "Not list property"`

### SEO Layer

Added recently. Two-file pattern:
- `lib/seoHelpers.js` — pure functions generating `{ seoTitle, seoDescription, canonicalUrl, ogImage, structuredData }` per page type (`homepage`, `owners`, `area`, `property`, `blog`)
- `middlewares/seo.js` — Express middleware factory; calls `generateSeoMetadata` and attaches results to `res.locals` so EJS templates can render them

For listing pages specifically, SEO is built inline in `routes/listing.js` via `buildListingSeo()` (which also generates `RealEstateListing` and `FAQPage` schema.org JSON-LD).

**Search landing pages (`lib/forRentPages.js`)**: every indexable search filter has a clean URL as well as its query URL — `/for-rent/richmond` alongside `/properties?city=Richmond&status=Available`. The slug map is the single source of truth: `routes/index.js` serves `/for-rent/:slug` by translating the slug into `req.query` and running the same `getProperties` + `renderPropertiesPage` as `/properties`, `routes/properties.js` canonicalises the query form onto the clean URL, and `lib/sitemap.js` advertises the clean URL. Filters with no landing page (keyword, bedrooms, price, rented facets) keep their query URL. Slugs are `<city>`, `<city>-furnished`, `<city>-unfurnished`, plus `all`.

### Email (Mailgun)

`lib/mailer.js` — all email sending. Uses `nodemailer` + `nodemailer-mailgun-transport`. Email templates are EJS files in `views/emailTemplate/`. Each mail function reads the EJS template, renders it, then sends. Types: `schedule`, `listYourProperty`, `tenantEnquiries`, `ownerLead`, `renewal`, `available`, `priceChange`.

### Automated Notifications (`lib/setAvailable.js`)

- `checkAvailable()` — runs daily; finds properties where `availableDate <= today` and `status = "Rented"`, then calls `sendAvailableForProperty` to email all users who favourited that property
- `sendAvailableForProperty()` / `setPriceChangeForProperty()` — triggered on property save (in `routes/properties.js` PUT) when status transitions to Available or rent changes

### Image Uploads

Images are uploaded via the Fine Uploader library to `/VLR-admin/images` (`routes/images.js`). Uploaded to a temp `uploads/` directory, then:
1. Watermarked using the `images` package (`public/img/vlr-logo-watermark.png`)
2. Uploaded to S3 via `uploadToS3()`
3. Temp files cleaned up periodically (every 10 min) and on save

### Views

EJS templates in `views/`. Admin views are prefixed `admin*`. The `/resources/:slug` route in `routes/index.js` renders static SEO content pages from a hardcoded `pages` map (no DB).

### Scheduled Tasks (Server-side)

Configured in `server.js` on the designated cleaner worker:
- `setInterval(cleanUpOldFiles, 600000)` — cleans `uploads/` every 10 min
- `schedule.scheduleJob('0 10 0 * * *', ...)` — daily availability check at 00:10

### Tests

Located in `test/unit/` and `test/integration/`. Unit tests cover `lib/seoHelpers.js` and `middlewares/seo.js` only (no DB/AWS). Integration tests in `test/integration/routes.test.js` require a live server. The `.npmrc` sets `ignore-scripts=true` to bypass semantic-ui's interactive post-install script.

## Work In Progress

**Image optimization** — see [IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md). Partially
complete and safe to pause. Static banners and the listing page's placeholder PNGs are
re-encoded (committed, **not yet deployed**); the upload path now writes JPEG at quality
82 instead of 100 (forward-only); and `Scripts/optimize_s3_images.js` backfills the
~68,000 existing photos in S3, of which one property (3606) has been done as a test.

Read that document before touching anything image-related — it records measured numbers,
the server's Node 8 / glibc constraints, and which things were already tried and ruled out.
