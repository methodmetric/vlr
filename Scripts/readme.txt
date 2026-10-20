This folder contains some useful scripts that help us build Sitemap

The sitemap is no longer built by hand. It is generated from MongoDB by
lib/sitemap.js and served live at /sitemap.xml (route in routes/index.js).
There is deliberately no public/sitemap.xml on disk: express.static would
shadow the route and serve a stale file.

Scripts read their keys from the environment. Run them with the env file:
  node --env-file=.env Scripts/optimize_s3_images.js            (locally)
  sudo -u vlr bash -c 'set -a; . /etc/vlr/env; node Scripts/...' (on the server)
