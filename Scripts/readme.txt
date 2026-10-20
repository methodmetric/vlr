One-off and maintenance scripts.

  build_sitemap.js       writes a sitemap.xml to the project root from MongoDB.
                         Not needed for the live site: lib/sitemap.js generates
                         /sitemap.xml on request (route in routes/index.js).
                         Never put a sitemap.xml in public/: express.static would
                         shadow the route and serve a stale file.
  optimize_s3_images.js  re-encodes existing property photos in S3. Dry run
                         unless --apply. Run it on the server from the git
                         checkout; see the header of the file and
                         IMAGE_OPTIMIZATION.md.
  migrate_team_photos.js one-time move of team photos from MongoDB to S3 (team/).
                         WRITES BY DEFAULT; pass --dry-run to only report.

Dev and production share one S3 bucket, so the S3 scripts change production
photos wherever they run.

Scripts read their keys from the environment; plain `node` does not load .env.
  Locally:     node --env-file=.env Scripts/<script>.js
               With the placeholder AWS keys from .env.example, S3 calls fail.
               Use real keys only when you mean to change production. (Empty
               keys don't help: the SDK falls back to ~/.aws/credentials.)
  On a server: export the keys the script needs from /etc/vlr/env (a systemd
               env file, readable with sudo), in the same shell (inside
               tmux/screen for long runs), then run from the git checkout,
               not /opt/vlr/app (the running site's copy).
               S3 scripts (optimize_s3_images, migrate_team_photos):
                 export $(sudo grep -E '^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION)=' /etc/vlr/env | xargs)
               Database scripts (migrate_team_photos, build_sitemap) also need
               MONGO_URL, or they silently use localhost:27017/VLR:
                 export $(sudo grep -E '^MONGO_URL=' /etc/vlr/env | xargs)
               then: node Scripts/<script>.js
