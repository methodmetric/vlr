/**
 * Writes sitemap.xml from the live database.
 *
 * Run it on the server (where MongoDB is), from the project root:
 *
 *     node Scripts/build_sitemap.js              # writes ./sitemap.xml
 *     node Scripts/build_sitemap.js /tmp/out.xml # or an explicit path
 *
 * This replaces the old Scripts/sitemap_generator.js, a jQuery snippet that was
 * pasted into a browser console and which emitted an unevaluated template string
 * as the listing URL — which is why no property page was ever listed.
 *
 * Note: the app also serves a live /sitemap.xml built from the same code
 * (lib/sitemap.js), so once this deploy is out you do not need to run this
 * script or upload a file again.
 */

var fs = require('fs');
var path = require('path');
var mongoose = require('../lib/mongooseCompat');
var config = require('config-lite')(path.join(__dirname, '..'));

var outputPath = process.argv[2] || path.join(__dirname, '..', 'sitemap.xml');

mongoose.connect(process.env.MONGO_URL || config.mongodb).catch(function () {
    // reported by the 'error' listener below
});

var sitemap = require('../lib/sitemap');

mongoose.connection.on('error', function (err) {
    console.error('Could not connect to MongoDB at ' + config.mongodb);
    console.error(err.message);
    process.exit(1);
});

mongoose.connection.once('open', function () {
    sitemap.buildSitemap(function (err, result) {
        if (err) {
            console.error('Sitemap build failed:', err.message);
            mongoose.connection.close();
            process.exit(1);
        }

        fs.writeFileSync(outputPath, result.xml, 'utf8');
        console.log('Wrote ' + result.count + ' URLs to ' + outputPath);
        mongoose.connection.close();
        process.exit(0);
    });
});
