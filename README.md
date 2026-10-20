# README #

This is a repository for VLR website development. Please make sure that your local PC has already installed NodeJS; npm package.

### Current work in progress

**Image optimization** — see **[IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md)**.

Site images were far larger than needed. Partially done and safe to pause. That file
is the single source of truth: what is finished, what is deployed on which server,
measured numbers, how to resume, and what can and cannot be rolled back.

- Batch script: `Scripts/optimize_s3_images.js` (dry-run by default; **do not write a
  new one**)
- Reversibility: bucket versioning keeps every original — but see §9 for the three
  ways that protection gets destroyed by accident
- Note dev and production **share one S3 bucket**, so there is no isolated way to test
  photo changes (§4.1)

### Development tool

- Database: MongoDB
- Middleware: ExpressJS
- Front-end: VueJS(partially)
- Back-end: NodeJS

### Start the Server (local development)

```bash
npm install      # uses --ignore-scripts via .npmrc (semantic-ui installer)
npm run dev      # nodemon server.js, listens on port 3000
```

Requires a local MongoDB running at `mongodb://localhost:27017/VLR`.

### Production deployment (server)

The site runs as a systemd service (`vlr.service`) on port **80**, backed by MongoDB on `localhost:27017`. It starts automatically on boot and restarts itself on crash. To pull the latest `main` and (re)start:

```bash
cd ~/vlr
./deploy.sh
```

`deploy.sh` does the following:

1. `git checkout main` and `git pull --ff-only origin main`
2. Verifies `node_modules` exists (Node 8 cannot `npm install` this repo — copy from a working checkout if missing)
3. Installs/refreshes `vlr.service` into `/etc/systemd/system/` (filling in the checkout dir and `node` path) and enables it at boot
4. Stops any running server (including a legacy `forever` one) and starts `vlr.service`
5. Health-checks `http://localhost/` until it returns HTTP 200

Useful commands on the server:

```bash
sudo systemctl status vlr      # running? since when?
sudo journalctl -u vlr -f      # live app logs (also in /var/log/syslog, tagged "vlr")
sudo systemctl restart vlr     # restart without pulling code
```

### Remote server
 - ssh ubuntu@18.237.239.200  -- testing server: https://dev.vancouverluxuryrentals.com/
 - ssh ubuntu@34.217.51.226    

Both servers run the site as `vlr.service` and MongoDB as `mongod.service`, both enabled at boot (migrated from hand-started `forever` / `mongod` processes on 2026-09-05). Production's checkout is `~/vlr_website` and its Mongo data directory is `/data/db` (`dbPath` in `/etc/mongod.conf`); dev uses `~/vlr` and the default `/var/lib/mongodb`. The old untracked `git_pull_and_update.sh` / `server_restart.sh` on production start `forever` and must not be used — use `./deploy.sh`.



# To update team page photo
ssh ubuntu@34.217.51.226
cd ~/vlr_website
node Scripts/migrate_team_photos.js --dry-run
node Scripts/migrate_team_photos.js
./deploy.sh



# Cloudflare 
administrator@vlr.ca
(password redacted, see the team password manager)