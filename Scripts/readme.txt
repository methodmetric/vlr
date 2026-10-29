One-off and maintenance scripts.

  build_sitemap.js       writes a sitemap.xml to the project root from MongoDB.
                         Not needed for the live site: lib/sitemap.js generates
                         /sitemap.xml on request (route in routes/index.js).
                         Never put a sitemap.xml in public/: express.static would
                         shadow the route and serve a stale file.
  optimize_s3_images.js  re-encodes existing property photos in S3. Dry run
                         unless --apply. Run it on the server from the git
                         checkout; follow IMAGE_OPTIMIZATION.md (the file's
                         own header comment is stale).
  restore_s3_originals.js rollback for optimize_s3_images.js: copies each
                         re-encoded photo's original (its previous S3 version)
                         back on top. Dry run unless --apply; --apply needs
                         --listing, --prefix or --all. Deletes nothing.
  migrate_team_photos.js one-time move of team photos from MongoDB to S3 (team/).
                         WRITES BY DEFAULT; pass --dry-run to only report.

Dev and production share one S3 bucket, so the S3 scripts change production
photos wherever they run.

Scripts read their keys from the environment; plain `node` does not load .env.
  Locally:     node --env-file=.env Scripts/<script>.js
               Use real AWS keys only when you mean to change production.
               Empty keys don't stop it: the SDK falls back to
               ~/.aws/credentials, AWS_PROFILE or an instance role. Set
               both keys to a placeholder (e.g. local-disabled) instead.
               Variables already exported in your shell override .env.
  On a server: export the keys the script needs from /etc/vlr/env (a systemd
               env file, readable with sudo), in the same shell (inside
               tmux/screen for long runs), then run from the git checkout,
               not /opt/vlr/app (the running site's copy).
               S3 scripts (optimize_s3_images, migrate_team_photos), in bash
               or zsh (each line is exported as-is; values must be unquoted,
               Unix line endings):
                 unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION;
                 while IFS= read -r l; do export "$l"; done < <(sudo grep -E '^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION)=' /etc/vlr/env)
                 : "${AWS_ACCESS_KEY_ID:?not set}" "${AWS_SECRET_ACCESS_KEY:?not set}" "${AWS_REGION:?not set}"
               The last line prints an error if a key didn't load: if it
               does, don't run the script, or the SDK will find other
               credentials. Database scripts (migrate_team_photos,
               build_sitemap) also need MONGO_URL, or they silently use
               localhost:27017/VLR:
                 while IFS= read -r l; do export "$l"; done < <(sudo grep -E '^MONGO_URL=' /etc/vlr/env)
                 : "${MONGO_URL:?not set}"
               then: node Scripts/<script>.js
