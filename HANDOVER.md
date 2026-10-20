# VLR Website Handover Document

> **Project**: VancouverLuxuryRentals.com (VLR) — Node.js/Express property rental website
> **Prepared for**: Jessy's team
> **Last updated**: 2026-09-10

---

## 1. Access and Credentials

### Hosting / Server / Control Panel

- **Testing server**: `ssh ubuntu@18.237.239.200` → https://dev.vancouverluxuryrentals.com/
  - Checkout: `~/vlr`
  - MongoDB data: `/var/lib/mongodb` (default)

- **Production server**: `ssh ubuntu@34.217.51.226` → https://vancouverluxuryrentals.com/
  - Checkout: `~/vlr_website`
  - MongoDB data: `/data/db` (configured in `/etc/mongod.conf`)

- Both servers run the site as systemd services (`vlr.service` and `mongod.service`), auto-enabled at boot since 2026-09-05.

### Domain Registrar

**[TO BE PROVIDED BY CURRENT TEAM]** — Domain registrar details (Namecheap, GoDaddy, Route53, etc.), login credentials, DNS settings, and any CNAME/MX record configuration for Mailgun.

### Database Access & Backups

- **Type**: MongoDB (local on each server)
- **Dev connection**: `mongodb://localhost:27017/VLR`
- **Backup location**: `vlr/JSON FILES/production_backup/` (dated JSON exports of properties collection)
- **Last backup date**: 2019-11-22 (legacy) — **recommend establishing regular backup automation**
- **To add properties to DB**: Import JSON backups or use admin panel at `/VLR-admin` (requires admin credentials from current team)

### Third-Party Services

#### AWS S3
- **Bucket**: `vancouverluxuryrental.com`
- **Region**: `us-west-2`
- **Credentials**: Located in `config/aws.json`
- **Purpose**: Stores all property listing images (watermarked upon upload)
- **Access method**: Images uploaded via `/VLR-admin/images` (Fine Uploader)

#### Mailgun (Email Service)
- **Domain**: `mg.vancouverluxuryrentals.com`
- **API Key**: In `lib/mailer.js` (currently hardcoded; **recommendation: move to environment variable**)
- **Email templates**: `views/emailTemplate/`
- **Uses**: Viewing confirmations, property alerts, owner inquiries, availability notifications
- **Sender emails**: `info@vancouverluxuryrealty.com` and `info@vancouverluxuryrentals.com`

#### Google Search / SEO
- Sitemap auto-generated at `/sitemap.xml` (via `lib/sitemap.js`)
- `robots.txt` configured for all search landing pages
- Canonical URLs and Schema.org structured data implemented for all property listings

---

## 2. Documentation

### Site Architecture & Tech Stack Overview

- **Backend**: Node.js (v8+) + Express.js
- **Frontend**: EJS templates + Vue.js (partially used, mostly server-rendered)
- **Database**: MongoDB (Mongoose ODM)
- **Image processing**: `images` package for watermarking; uploaded to S3
- **Process model**: `server.js` uses Node `cluster` to fork one worker per CPU. One worker is the designated "cleaner" (handles upload cleanup + daily availability cron); the rest serve HTTP.
- **Config**: `config-lite` reads `config/default.js` in dev, `config/production.js` when `NODE_ENV=production`. AWS creds loaded directly from `config/aws.json`.
- **Key flow**: Public browse → Property details → Schedule viewing → Admin review → Email notifications

### Routing Tree

All routes are wired through `routes/index.js`, mounted at `/` in `server.js`.

| Prefix | File | Notes |
|---|---|---|
| `/` | `routes/index.js` | Homepage, about, area landing pages, static resource pages |
| `/properties` | `routes/properties.js` | Property search, CRUD API, image management, S3 ops |
| `/for-rent/:slug` | `routes/index.js` | SEO landing pages for search; slug → query map in `lib/forRentPages.js` |
| `/listing/:id` | `routes/listing.js` | Individual property page; slug format: `address-property-id-123` |
| `/owners` | `routes/owners.js` | Owner landing pages + list-property lead form |
| `/tenants` | `routes/tenants.js` | Tenant pages |
| `/user` | `routes/user.js` | Tenant user auth (register/login/favourites) |
| `/VLR-admin` | `routes/admin.js` | Admin panel — protected by `AdminController.isAuthenticated` |
| `/VLR-admin/images` | `routes/images.js` | Fine Uploader endpoint for property images |

### Authentication & Authorization

Two separate auth systems coexist:

- **Admin (Passport.js)**: `passport-local` strategy in `lib/passportLocal.js`. Sessions stored in MongoDB via `connect-mongo`. Middleware at `middlewares/admin.js` — `isAuthenticated` checks `req.user`, `isSuperAdmin` checks `req.user.role === 'SuperAdmin'`. Admins live in the `admins` collection.
- **Tenant users**: Session-based via `req.session.user` (email string). Defined in `models/users.js`.

### Custom Configurations, Plugins & Integrations

| Component | Location | Details |
|-----------|----------|---------|
| **Routes** | `routes/` | All routes wired through `routes/index.js` |
| **Admin Panel** | `routes/admin.js` → `/VLR-admin` | Passport.js local auth; sessions in MongoDB (connect-mongo) |
| **Auth (Tenants)** | `models/users.js` | Session-based, email-stored |
| **Property Model** | `models/properties.js` | ~90 flat fields per document; `propertyId` (numeric, unique); `status` = `Available`/`Rented`/`Not list property`; full-text search via `searchColumn` (JSON.stringify of whole doc) |
| **SEO** | `lib/seoHelpers.js` + `middlewares/seo.js` | Generates meta tags, structured data, canonical URLs per page type. Listing pages built inline via `buildListingSeo()` in `routes/listing.js` |
| **Image Uploads** | `routes/images.js` | Fine Uploader → temp `uploads/` → watermark (`public/img/vlr-logo-watermark.png`) → S3 (`{propertyId}/{filename}`) → cleanup |
| **Email** | `lib/mailer.js` | EJS templates → Mailgun via nodemailer |
| **Search Filters** | `lib/forRentPages.js` | Maps clean URLs (`/for-rent/richmond`) to query params; single source of truth for slugs |
| **Notifications** | `lib/setAvailable.js` | Daily availability check + price-change / available emails on property save |

### Property Search & Filtering

`routes/properties.js` `getProperties` middleware translates query params to a Mongoose query via `api-query-params` (`aqp`):
- `searchBar` → regex on `searchColumn`
- `availableDate<N` (month number) → computed date range filter
- `furnished=Yes/No` → negation filter
- `allowPets=Yes` → `allowPets! = "No"`
- Default: excludes `status = "Not list property"`

### Deployment / Update Process

1. **On dev or prod server**, pull latest and restart:
   ```bash
   cd ~/vlr              # or ~/vlr_website on prod
   ./deploy.sh
   ```

2. **What `deploy.sh` does**:
   - `git checkout main && git pull --ff-only origin main`
   - Verifies `node_modules` exists (Node 8 caveat: cannot `npm install`; copy from a working checkout if missing)
   - Installs/refreshes the systemd unit (`vlr.service`) into `/etc/systemd/system/` and enables it at boot
   - Stops old service (includes legacy `forever` cleanup) and starts `vlr.service`
   - Health-checks `http://localhost/` until it returns HTTP 200

3. **Common server commands**:
   ```bash
   sudo systemctl status vlr           # Check if running
   sudo journalctl -u vlr -f           # Live logs (also in /var/log/syslog tagged "vlr")
   sudo systemctl restart vlr          # Restart without re-pulling
   sudo systemctl stop vlr             # Stop service
   ```

4. **To update team page photos** (prod):
   ```bash
   ssh ubuntu@34.217.51.226
   cd ~/vlr_website
   node Scripts/migrate_team_photos.js --dry-run
   node Scripts/migrate_team_photos.js
   ./deploy.sh
   ```

### Recent Optimization Work Completed

#### Systemd Service Migration (2026-09-05)
- Migrated from hand-managed `forever` + `mongod` to systemd services (`vlr.service`, `mongod.service`)
- Services auto-restart on crash and boot
- Legacy `git_pull_and_update.sh` and `server_restart.sh` on prod start `forever` and **must not be used** — use `./deploy.sh`

#### SEO Improvements
- Added meta descriptions, Open Graph tags, and Schema.org JSON-LD (`RealEstateListing` + `FAQPage`)
- Clean URLs for search-filter landing pages (`/for-rent/richmond`, `-furnished`, `-unfurnished`, `all`)
- 301 redirect for property filters (scoped to `/listing/`); non-www → www redirect
- Sitemap auto-generation (`lib/sitemap.js`)
- 30 unit tests added to verify SEO output (see `TESTING.md`)

#### Image Optimization
- Team photo migration/optimization script at `Scripts/migrate_team_photos.js`
- Watermarking on all property uploads

---

## 3. Additional Items Worth Flagging

### Critical Paths & Dependencies

- **Admin authentication**: Credentials stored in MongoDB `admins` collection; obtain at least one super-admin login for `/VLR-admin` from the current team.
- **Node 8 limitation**: If `node_modules` is deleted on prod, the server cannot run `npm install`. Solution: copy a working `node_modules` from dev or a backup.
- **MongoDB configuration**: Production uses `/data/db` (non-default); dev uses `/var/lib/mongodb`. Both set in `/etc/mongod.conf` and the systemd units.
- **S3 credentials**: Currently in `config/aws.json` (plaintext). **Recommendation**: move to environment variables or an AWS IAM role.
- **Session secret**: Hardcoded in `config/default.js` and `config/production.js`. Consider rotating and moving to env var post-handover.

### Scheduled Tasks (server-side, on the designated "cleaner" worker)

- **Every 10 minutes**: `cleanUpOldFiles` — cleans the `uploads/` temp directory.
- **Daily at 00:10**: `schedule.scheduleJob('0 10 0 * * *', ...)` — availability check. Finds properties with `availableDate <= today` and `status = "Rented"`, then emails users who favourited them.

### Monitoring & Alerts

**[TO BE PROVIDED BY CURRENT TEAM]** — please confirm:
- Any monitoring setup (Datadog, New Relic, CloudWatch, etc.)
- Uptime alerts / on-call rotation
- Error logging aggregation (currently `/var/log/syslog` + express-winston)
- Database backup automation (currently manual JSON exports)

### Known Issues & Considerations

1. **Mailgun API key hardcoded** in `lib/mailer.js` — should be moved to config / env var.
2. **Legacy scripts on prod**: `git_pull_and_update.sh` and `server_restart.sh` still exist — use `./deploy.sh` instead.
3. **Database backups outdated**: last production JSON backup is from Nov 2019; establish automated daily backups.
4. **Semantic UI interactive installer**: bypassed via `.npmrc` (`ignore-scripts=true`) — do not change this.

### Renewal Dates / Expiration

**[TO BE PROVIDED BY CURRENT TEAM]**:
- Domain registrar renewal date
- SSL certificate expiration (if not auto-renewed)
- Mailgun domain validation renewal
- AWS S3 bucket lifecycle/expiration policies
- Any third-party API subscriptions or contracts

---

## 4. Handover Call

We'd be happy to walk Jessy and his team through everything on a short call covering:

- Admin panel walkthrough and account setup
- Deployment process and common troubleshooting
- Database schema and property model
- SEO / metadata workflow
- Image upload and watermarking flow
- Mailgun email configuration
- Systemd service management

**Proposed timing**: [**PROPOSED DATE/TIME**] — roughly 1 hour, with async Q&A available afterward. Let us know if another time works better on your end.

---

## 5. Wrap-up

### Support Through Transition

**[TO BE PROVIDED BY CURRENT TEAM]**:
- Duration of ongoing support (e.g., "we'll continue maintenance as usual until October 15th")
- Emergency escalation contacts during transition
- Handoff of Slack / email notification subscriptions

### Final Billing / Outstanding Items

**[TO BE PROVIDED BY CURRENT TEAM]**:
- Any outstanding invoices or open work
- Transfers of AWS, Mailgun, and domain registrar accounts to Jessy's team
- Billing contact updates

### Access Removal After Handover

**[TO BE PROVIDED BY CURRENT TEAM]**:
- Remove current team's SSH keys from both servers
- Remove current team's AWS IAM access
- Rotate Mailgun API key (and session secret) if needed
- Revoke admin accounts from MongoDB
- Remove current team from any monitoring / alert subscriptions

---

## Quick Reference for the Next Developer

### Getting Started Locally

```bash
git clone https://bitbucket.org/vlr_website/vlr_website.git
npm install                      # Uses --ignore-scripts (see .npmrc)
npm run dev                      # Listens on port 3000
# Requires local MongoDB at mongodb://localhost:27017/VLR
```

### Running Tests

```bash
npm test                         # Unit tests (30 covering SEO & middleware; no DB/AWS needed)
npm run test:watch               # Watch mode during development
npm run test:integration         # Requires running MongoDB + AWS S3 + live server
```

### Key Files to Know

- `server.js` — Entry point; cluster setup & scheduled tasks
- `routes/index.js` — Main router
- `routes/admin.js` — Admin panel routes & auth
- `models/properties.js` — Property schema (~90 fields)
- `lib/mailer.js` — Email sending (Mailgun)
- `lib/seoHelpers.js` / `middlewares/seo.js` — SEO metadata
- `lib/forRentPages.js` — Clean-URL slug map for search
- `config/production.js` — Production config (port, MongoDB, S3 bucket, canonical host)
- `deploy.sh` — Deployment script
- `CLAUDE.md` — Complete architecture reference
- `TESTING.md` — Test documentation

### Ports

- Development: **3000**
- Production: **80**

---

## Recommendations for Jessy's Team

- [ ] Set up automated daily MongoDB backups to S3
- [ ] Move Mailgun API key, AWS credentials, and session secret to environment variables
- [ ] Establish monitoring/alerting (CPU, memory, MongoDB size, HTTP errors)
- [ ] Add a pre-commit hook to run tests before pushing
- [ ] Document the admin-account creation process for new team members
- [ ] Review and update domain registrar, Mailgun, and AWS account permissions
- [ ] Plan a Node.js upgrade path (currently pinned to Node 8, which blocks `npm install` on the server)
