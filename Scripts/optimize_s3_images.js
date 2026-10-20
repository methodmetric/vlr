/**
 * One-time (resumable) backfill: re-encode existing property photos in S3.
 *
 * Run it on the SERVER, from the git checkout deploy.sh runs in (not
 * /opt/vlr/app: every deploy's rsync --delete wipes the progress and failure
 * files this script keeps next to itself). The bucket and server are both in
 * us-west-2, so transfer is free there; from a laptop it pulls ~71 GB and costs
 * egress. The AWS keys come from the environment, so load the env file first
 * (see Scripts/readme.txt):
 *
 *     node Scripts/optimize_s3_images.js --limit 200                # measure a sample
 *     node Scripts/optimize_s3_images.js                            # measure everything
 *     node Scripts/optimize_s3_images.js --apply --limit 200        # do 200 for real
 *     node Scripts/optimize_s3_images.js --apply                    # do the whole bucket
 *     node Scripts/optimize_s3_images.js --apply --prefix 4070/     # just one property
 *     node Scripts/optimize_s3_images.js --apply --listing 3606     # same, by id or listing URL
 *
 * Why this exists: photos uploaded before the upload path moved to sharp at
 * quality 82 (lib/imageProcessing.js) were written by the old `images` package
 * at its default quality of 100. A 1920px photo at quality 100 averages ~1 MB
 * where quality 82 is ~230 KB, with no visible difference. A 24-image sample
 * across the bucket measured -77%.
 *
 * Safety properties:
 *   - Dry run is the DEFAULT. Nothing is written without --apply. (--dry-run is
 *     accepted but changes nothing.)
 *   - The bucket has versioning ENABLED, so every overwrite keeps the previous
 *     version and any object can be rolled back. Storage roughly doubles until
 *     noncurrent versions are expired, which needs the client's sign-off first.
 *   - Resumable. Every completed key is appended to a progress file (--progress,
 *     default Scripts/.optimize_s3_progress.log); a re-run skips them.
 *   - Idempotent. Re-encoded objects are tagged with metadata `vlr-optimized`,
 *     and tagged objects are always skipped, even with a fresh progress file.
 *   - A file is only replaced if the new version is meaningfully smaller
 *     (default: at least 15% off). Marginal gains are not worth generation loss.
 *   - Every re-encode is decoded and checked for non-zero dimensions before it
 *     is uploaded. Photos wider than --max-width (default 1920) are scaled down,
 *     and EXIF orientation is applied, so dimensions can change.
 *   - Per-file failures are logged and skipped; they never abort the run.
 *   - PNGs are skipped by default: they are stored under .png keys referenced by
 *     `imgs[]` in MongoDB, so converting them to JPEG is a database change, not
 *     just a bucket change. Pass --include-png to re-encode them as PNG.
 *
 * Uses the app's own sharp (a normal dependency in package.json). The script
 * reads config through config-lite, which also merges every command-line flag
 * into the config, so don't pass flags named after config keys (--bucket,
 * --port, --mongodb).
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

    if (e.code === 'MODULE_NOT_FOUND' && /'sharp'/.test(e.message)) {
        console.error('sharp is a dependency of the app but is not installed here. Run this from');
        console.error('the directory that holds package.json, after installing dependencies:\n');
        console.error('    cd ' + path.join(__dirname, '..'));
        console.error('    npm ci\n');
        console.error('sharp 0.35 needs Node 20.9+ (the app itself needs 22.9+).');
    } else {
        console.error('sharp resolved but its native binary would not load. This is usually a platform');
        console.error('mismatch, e.g. node_modules copied from another OS. Reinstall in place:\n');
        console.error('    npm ci');
    }
    process.exit(1);
}

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
var quality = parseInt(value('quality', '82'), 10);
var maxWidth = parseInt(value('max-width', '1920'), 10);
var concurrency = parseInt(value('concurrency', '8'), 10);
var minSaving = parseFloat(value('min-saving', '0.15'));
var cacheSeconds = parseInt(value('cache-seconds', '2592000'), 10);
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
        // 30 days, deliberately NOT `immutable`. An agent can delete a photo and
        // upload a different one under the same generic filename (12.jpg, IMG_017.jpg),
        // which reuses the S3 key — `immutable` would pin the stale image in
        // returning visitors' browsers for the full year. Override with --cache-seconds.
        CacheControl: 'public, max-age=' + cacheSeconds,
        Metadata: { 'vlr-optimized': String(quality) }
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

    if (head.Metadata && head.Metadata['vlr-optimized']) {
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
        console.log('reversible. Do not add a lifecycle rule that expires noncurrent versions');
        console.log('until the client has approved the quality: it deletes the originals.');
    }
})().catch(function (e) {
    console.error('\nFatal: ' + (e.stack || e.message));
    process.exit(1);
});
