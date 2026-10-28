/**
 * One-time (resumable) backfill: re-encode existing property photos in S3.
 *
 * Run it on the SERVER, from the project root — the bucket is in us-west-2 and
 * so is the app server, so transfer is free and fast there. Running it from a
 * laptop pulls ~71 GB across the internet and costs egress:
 *
 *     node scripts/optimize_s3_images.js --dry-run --limit 200   # measure a sample
 *     node scripts/optimize_s3_images.js --dry-run               # measure everything
 *     node scripts/optimize_s3_images.js --apply --limit 200     # do 200 for real
 *     node scripts/optimize_s3_images.js --apply                 # do the whole bucket
 *     node scripts/optimize_s3_images.js --apply --prefix 4070/  # just one property
 *
 * Why this exists: images uploaded before the quality fix in routes/properties.js
 * were written by the `images` package at its default quality of 100. A 1920px
 * photo at quality 100 averages ~1 MB where quality 82 is ~230 KB, with no
 * visible difference. A 24-image sample across the bucket measured -77%.
 *
 * Safety properties:
 *   - --dry-run is the DEFAULT. Nothing is written without --apply.
 *   - The bucket has versioning ENABLED, so every overwrite keeps the previous
 *     version and any object can be rolled back. Storage roughly doubles until
 *     noncurrent versions are expired (see the note at the bottom of this file).
 *   - Resumable. Every completed key is appended to a progress file; a re-run
 *     skips them, so an interrupted run costs nothing.
 *   - Idempotent. Re-encoded objects are tagged with metadata `vlr-optimized`,
 *     and tagged objects are skipped even if the progress file is lost.
 *   - A file is only replaced if the new version is meaningfully smaller
 *     (default: at least 15% off). Marginal gains are not worth generation loss.
 *   - Every re-encode is decoded and dimension-checked before it is uploaded.
 *   - Per-file failures are logged and skipped; they never abort the run.
 *   - PNGs are skipped by default: they are stored under .png keys referenced by
 *     `imgs[]` in MongoDB, so converting them to JPEG is a database change, not
 *     just a bucket change. Pass --include-png to re-encode them as PNG.
 *
 * Requires sharp, which is deliberately NOT in package.json — this is a one-time
 * migration and sharp needs a far newer Node than the app runs on.
 *
 * The production server runs Node 8.9.4 (end-of-life since 2019); sharp needs
 * Node 18.17+. Do NOT upgrade the system Node to run this — the app is served by
 * it. Instead install a modern Node beside it and keep sharp out of the app's
 * node_modules entirely, so nothing the running site depends on is touched:
 *
 *     # 1. a modern Node, user-local, system Node untouched
 *     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
 *     source ~/.nvm/nvm.sh
 *     nvm install 16          # NOT 18 or 20 — see the glibc note below
 *
 *     # 2. sharp in its own directory, NOT in the app's node_modules
 *     mkdir -p ~/imgopt && cd ~/imgopt && npm init -y
 *     npm install sharp@0.32.6
 *
 *     # 3. run from the project, pointing Node at that sharp
 *     cd /path/to/vlr
 *     NODE_PATH=~/imgopt/node_modules node Scripts/optimize_s3_images.js --dry-run --listing 3606
 *
 * Why Node 16 and sharp 0.32.6 rather than the current versions: this server is
 * old enough that Node 18 and 20 will not start on it at all —
 *
 *     node: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.28' not found
 *
 * Node 18+ is built against glibc 2.28; this box has an older one (Ubuntu 16.04
 * ships 2.23). Node 16 is built against glibc 2.17 and runs fine. sharp 0.33+
 * in turn needs Node 18.17+, so 0.32.6 — the last release supporting Node 14-16 —
 * is the pairing that works. Every sharp call this script makes exists in 0.32.6.
 *
 * Check with `ldd --version` if unsure: below 2.28 means Node 16.
 *
 * When you are finished, `nvm deactivate` and `rm -rf ~/imgopt` removes every
 * trace; the app never saw any of it.
 */

var fs = require('fs');
var path = require('path');
var AWS = require('aws-sdk');
var config = require('config-lite')(path.join(__dirname, '..'));

var sharp;
try {
    sharp = require('sharp');
} catch (e) {
    // Do not just say "not installed" — sharp fails to load for several very
    // different reasons and the fix depends on which one it is.
    console.error('Could not load sharp.\n');
    console.error('  node     : ' + process.version + '  (' + process.platform + '/' + process.arch + ')');
    console.error('  cwd      : ' + process.cwd());
    console.error('  looked in: ' + path.join(__dirname, '..', 'node_modules'));
    console.error('  error    : ' + (e.code || '') + ' ' + e.message.split('\n')[0] + '\n');

    var major = parseInt(process.version.slice(1).split('.')[0], 10);
    if (e.code === 'MODULE_NOT_FOUND' && /'sharp'/.test(e.message)) {
        if (major < 18) {
            console.error('Node ' + process.version + ' is too old for sharp, which needs Node 18.17+.');
            console.error('npm will have installed nothing usable and still exited 0.\n');
            console.error('Do NOT upgrade the system Node — the site is served by it. Install a modern');
            console.error('Node beside it and keep sharp out of the app\'s node_modules:\n');
            console.error('    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash');
            console.error('    source ~/.nvm/nvm.sh && nvm install 16');
            console.error('    mkdir -p ~/imgopt && cd ~/imgopt && npm init -y && npm install sharp@0.32.6');
            console.error('    cd ' + path.join(__dirname, '..'));
            console.error('    NODE_PATH=~/imgopt/node_modules node Scripts/optimize_s3_images.js --dry-run --listing 3606\n');
            console.error('Node 16 and sharp 0.32.6 are deliberate: if `ldd --version` reports glibc');
            console.error('below 2.28, Node 18 and 20 will not start on this machine at all, and');
            console.error('sharp 0.33+ requires Node 18.17+. This pairing is the one that works.');
        } else {
            console.error('sharp is not in this project\'s node_modules. Most likely the install ran');
            console.error('in a different directory. Run this from the SAME directory as package.json:\n');
            console.error('    cd ' + path.join(__dirname, '..'));
            console.error('    npm install --no-save sharp\n');
            console.error('If npm printed no error but nothing was installed, optional dependencies may');
            console.error('be disabled (sharp ships its binary as one). Check with:  npm config get optional');
        }
    } else {
        console.error('sharp resolved but its native binary would not load. This is usually a platform');
        console.error('or glibc mismatch. Try forcing a clean platform-correct install:\n');
        console.error('    npm install --no-save --force --include=optional sharp\n');
        console.error('On older distributions (Ubuntu 18.04 and similar), use:\n');
        console.error('    npm install --no-save sharp@0.32.6');
    }
    process.exit(1);
}

// After the sharp check: it requires sharp too. Shares the upload path's
// quality, cache lifetime and tag, so uploads and re-encodes stay alike.
var imageProcessing = require('../lib/imageProcessing');

// ---------------------------------------------------------------- arguments

function flag(name) { return process.argv.indexOf('--' + name) !== -1; }

function value(name, fallback) {
    var i = process.argv.indexOf('--' + name);
    return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
}

var apply = flag('apply');
var includePng = flag('include-png');
var prefix = value('prefix', '');

// --listing lets you paste a listing URL (or just the property id) instead of
// working out the S3 prefix by hand. Photos for a property live under
// <propertyId>/ in the bucket, and listing URLs end in -property-id-<id>.
var listing = value('listing', '');
if (listing) {
    var m = String(listing).match(/-property-id-(\d+)|^(\d+)$/);
    if (!m) {
        console.error('Could not read a property id from --listing "' + listing + '".');
        console.error('Pass a listing URL ending in -property-id-<number>, or just the number.');
        process.exit(1);
    }
    prefix = (m[1] || m[2]) + '/';
    console.log('--listing resolved to prefix: ' + prefix);
}
var limit = parseInt(value('limit', '0'), 10) || 0;
var quality = parseInt(value('quality', String(imageProcessing.JPEG_QUALITY)), 10);
var maxWidth = parseInt(value('max-width', '1920'), 10);
var concurrency = parseInt(value('concurrency', '8'), 10);
var minSaving = parseFloat(value('min-saving', '0.15'));
var cacheSeconds = parseInt(value('cache-seconds', String(imageProcessing.CACHE_SECONDS)), 10);
var progressFile = value('progress', path.join(__dirname, '.optimize_s3_progress.log'));

if (!apply) {
    console.log('DRY RUN — nothing will be written. Pass --apply to make changes.\n');
}

var s3 = new AWS.S3({ maxRetries: 5 });
var BUCKET = config.bucket;

// ---------------------------------------------------------------- progress

var done = new Set();
if (fs.existsSync(progressFile)) {
    fs.readFileSync(progressFile, 'utf8').split('\n').forEach(function (line) {
        if (line.trim()) done.add(line.trim());
    });
    console.log('Resuming: ' + done.size + ' keys already processed (from ' + progressFile + ')');
}

var progressStream = apply ? fs.createWriteStream(progressFile, { flags: 'a' }) : null;

function markDone(key) {
    done.add(key);
    if (progressStream) progressStream.write(key + '\n');
}

// ---------------------------------------------------------------- helpers

function isCandidate(key) {
    if (includePng && /\.png$/i.test(key)) return true;
    return /\.jpe?g$/i.test(key);
}

function listAll() {
    var out = [];
    return new Promise(function (resolve, reject) {
        (function page(token) {
            s3.listObjectsV2({
                Bucket: BUCKET,
                Prefix: prefix,
                ContinuationToken: token
            }, function (err, data) {
                if (err) return reject(err);
                data.Contents.forEach(function (o) {
                    if (o.Size > 0 && isCandidate(o.Key) && !done.has(o.Key)) {
                        out.push({ key: o.Key, size: o.Size });
                    }
                });
                if (process.stdout.isTTY) {
                    process.stdout.write('\rListing… ' + out.length + ' candidates');
                }
                if (data.IsTruncated) return page(data.NextContinuationToken);
                if (process.stdout.isTTY) process.stdout.write('\n');
                console.log('Listed ' + out.length + ' candidate objects.');
                resolve(out);
            });
        })();
    });
}

function get(key) {
    return s3.getObject({ Bucket: BUCKET, Key: key }).promise();
}

function put(key, body, contentType) {
    return s3.putObject({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        // These were missing entirely before, which is why S3 served the photos
        // as binary/octet-stream with no caching hint.
        // Default from CACHE_SECONDS in lib/imageProcessing.js (why not `immutable`
        // is explained there). Override with --cache-seconds.
        CacheControl: 'public, max-age=' + cacheSeconds,
        Metadata: { [imageProcessing.OPTIMIZED_TAG]: String(quality) }
    }).promise();
}

var stats = { seen: 0, rewritten: 0, skippedSmall: 0, skippedTagged: 0, failed: 0, before: 0, after: 0 };
var failures = [];

async function processKey(item) {
    var key = item.key;
    stats.seen++;

    var head;
    try {
        head = await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
    } catch (e) {
        stats.failed++;
        failures.push({ key: key, stage: 'head', error: e.code || e.message });
        return;
    }

    if (head.Metadata && head.Metadata[imageProcessing.OPTIMIZED_TAG]) {
        stats.skippedTagged++;
        markDone(key);
        return;
    }

    var obj;
    try {
        obj = await get(key);
    } catch (e) {
        stats.failed++;
        failures.push({ key: key, stage: 'get', error: e.code || e.message });
        return;
    }

    var before = obj.Body.length;
    var isPng = /\.png$/i.test(key);

    var encoded, meta;
    try {
        var pipeline = sharp(obj.Body, { failOn: 'none' })
            .rotate()                                   // honour EXIF, then drop it
            .resize({ width: maxWidth, withoutEnlargement: true });

        encoded = isPng
            ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
            : await pipeline.jpeg({ quality: quality, mozjpeg: true }).toBuffer();

        // Never upload something we cannot read back.
        meta = await sharp(encoded).metadata();
        if (!meta.width || !meta.height) throw new Error('re-encoded image has no dimensions');
    } catch (e) {
        stats.failed++;
        failures.push({ key: key, stage: 'encode', error: e.message });
        return;
    }

    var after = encoded.length;
    var saving = 1 - after / before;

    if (saving < minSaving) {
        stats.skippedSmall++;
        stats.before += before;
        stats.after += before;
        markDone(key);
        return;
    }

    if (apply) {
        try {
            await put(key, encoded, isPng ? 'image/png' : 'image/jpeg');
        } catch (e) {
            stats.failed++;
            failures.push({ key: key, stage: 'put', error: e.code || e.message });
            return;
        }
    }

    stats.rewritten++;
    stats.before += before;
    stats.after += after;
    markDone(key);

    if (stats.rewritten % 50 === 0 || !apply) {
        console.log(
            String(Math.round(before / 1024)).padStart(6) + ' -> ' +
            String(Math.round(after / 1024)).padStart(5) + ' KB  (-' +
            String(Math.round(saving * 100)).padStart(2) + '%)  ' +
            meta.width + 'x' + meta.height + '  ' + key
        );
    }
}

// Fixed-size worker pool: keeps `concurrency` requests in flight without
// building a 68k-entry promise array.
async function runPool(items) {
    var next = 0;
    var started = Date.now();

    async function worker() {
        while (next < items.length) {
            var item = items[next++];
            await processKey(item);
            if (stats.seen % 250 === 0) {
                var pct = ((stats.seen / items.length) * 100).toFixed(1);
                var rate = stats.seen / ((Date.now() - started) / 1000);
                var eta = Math.round((items.length - stats.seen) / rate / 60);
                process.stdout.write(
                    '\r  ' + stats.seen + '/' + items.length + ' (' + pct + '%)  ' +
                    rate.toFixed(1) + '/s  eta ' + eta + 'm  saved ' +
                    ((stats.before - stats.after) / 1073741824).toFixed(2) + ' GB   '
                );
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    process.stdout.write('\n');
}

function mb(bytes) { return (bytes / 1048576).toFixed(1) + ' MB'; }

(async function main() {
    console.log('bucket      : ' + BUCKET);
    console.log('prefix      : ' + (prefix || '(all)'));
    console.log('quality     : ' + quality + '   max width: ' + maxWidth + 'px');
    console.log('concurrency : ' + concurrency + '   min saving: ' + Math.round(minSaving * 100) + '%');
    console.log('png         : ' + (includePng ? 'included' : 'skipped') + '\n');

    var items = await listAll();
    if (limit) {
        items = items.slice(0, limit);
        console.log('Limited to first ' + items.length + ' objects.');
    }
    if (!items.length) {
        console.log('Nothing to do.');
        return;
    }

    await runPool(items);

    console.log('\n--- summary ---');
    console.log('examined        : ' + stats.seen);
    console.log('rewritten       : ' + stats.rewritten + (apply ? '' : ' (dry run — not written)'));
    console.log('skipped (small) : ' + stats.skippedSmall);
    console.log('skipped (tagged): ' + stats.skippedTagged);
    console.log('failed          : ' + stats.failed);
    console.log('size            : ' + mb(stats.before) + ' -> ' + mb(stats.after));
    if (stats.before) {
        console.log('saving          : ' + mb(stats.before - stats.after) +
                    '  (-' + Math.round((1 - stats.after / stats.before) * 100) + '%)');
    }

    if (failures.length) {
        var failFile = path.join(__dirname, '.optimize_s3_failures.json');
        fs.writeFileSync(failFile, JSON.stringify(failures, null, 2));
        console.log('\n' + failures.length + ' failures written to ' + failFile);
        console.log('These objects were left untouched. Re-running retries them.');
    }

    if (apply) {
        console.log('\nOld versions are retained (bucket versioning is on), so this is');
        console.log('reversible. Once you are happy with how the site looks, expire them');
        console.log('with a lifecycle rule on noncurrent versions to stop paying twice.');
    }
})().catch(function (e) {
    console.error('\nFatal: ' + (e.stack || e.message));
    process.exit(1);
});
