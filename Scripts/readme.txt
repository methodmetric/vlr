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
  On a server: load /etc/vlr/env into the environment first (it is the same
               KEY=value format), then run node Scripts/<script>.js from the
               project root.
