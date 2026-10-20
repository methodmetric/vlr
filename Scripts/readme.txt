This folder contains some useful scripts that help us build Sitemap

The sitemap is no longer built by hand. It is generated from MongoDB by
lib/sitemap.js and served live at /sitemap.xml (route in routes/index.js).
There is deliberately no public/sitemap.xml on disk: express.static would
shadow the route and serve a stale file.
