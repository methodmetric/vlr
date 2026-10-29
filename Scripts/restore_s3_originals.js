/**
 * Rollback for Scripts/optimize_s3_images.js: puts the original photos back.
 *
 * For each JPEG under the prefix whose current version carries the
 * `vlr-optimized` tag and whose previous version doesn't, it copies the
 * previous version (the original) back on top. S3 does the copy; nothing is
 * downloaded. Nothing is deleted either: the re-encoded copy stays as an older
 * version, so a restore can itself be undone by re-running the backfill.
 *
 * Run it on the server from the git checkout, with the AWS keys exported, like
 * the backfill (IMAGE_OPTIMIZATION.md §4.2):
 *
 *     node Scripts/restore_s3_originals.js --listing 5799            # dry run: what would be restored
 *     node Scripts/restore_s3_originals.js --apply --listing 5799    # restore one property
 *     node Scripts/restore_s3_originals.js --apply --all             # restore the whole bucket
 *
 * Options:
 *   --apply              make changes (the default is a dry run)
 *   --listing <id|url>   one property: its id, or a listing URL ending in -property-id-<id>
 *   --prefix <p>         any key prefix, e.g. 4391/
 *   --all                required with --apply when there is no --listing or --prefix
 *   --since <date>       only restore photos whose current version was written at
 *                        or after this time (ISO 8601, e.g. 2026-10-29T15:00Z)
 *   --concurrency <n>    copies in flight (default 16)
 *
 * Unknown flags are an error, so a typo can't widen an --apply run.
 *
 * Once our code is deployed, admin uploads are tagged too. A photo an agent
 * replaced under the same name then looks like a re-encode (tagged current,
 * untagged previous), and restoring it would bring back the old photo. Use
 * --since with the backfill's start time to limit a restore to the run.
 */
'use strict';
var path = require('path');
var AWS = require('aws-sdk');
var config = require('config-lite')(path.join(__dirname, '..'));
var imageProcessing = require('../lib/imageProcessing');
var s3Restore = require('../lib/s3Restore');

// ---------------------------------------------------------------- arguments

var FLAGS = ['apply', 'all'];
var VALUES = ['listing', 'prefix', 'since', 'concurrency'];

var args = {};
for (var i = 2; i < process.argv.length; i++) {
    var name = process.argv[i].replace(/^--/, '');
    if (FLAGS.indexOf(name) !== -1) {
        args[name] = true;
    } else if (VALUES.indexOf(name) !== -1 && i + 1 < process.argv.length) {
        args[name] = process.argv[++i];
    } else {
        console.error('Unknown or incomplete argument: ' + process.argv[i]);
        console.error('Options: --apply --all --listing <id|url> --prefix <p> --since <date> --concurrency <n>');
        process.exit(1);
    }
}

var apply = !!args.apply;
var prefix = args.prefix || '';
if (args.listing) {
    var m = String(args.listing).match(/-property-id-(\d+)|^(\d+)$/);
    if (!m) {
        console.error('Could not read a property id from --listing "' + args.listing + '".');
        process.exit(1);
    }
    prefix = (m[1] || m[2]) + '/';
}
if (apply && !prefix && !args.all) {
    console.error('Refusing to restore the whole bucket without --all.');
    process.exit(1);
}
var since = null;
if (args.since) {
    since = new Date(args.since).getTime();
    if (isNaN(since)) {
        console.error('Could not read --since "' + args.since + '" as a date.');
        process.exit(1);
    }
}
var concurrency = parseInt(args.concurrency || '16', 10);

var s3 = new AWS.S3({ maxRetries: 5 });
var BUCKET = config.bucket;
var TAG = imageProcessing.OPTIMIZED_TAG;

// ---------------------------------------------------------------- listing

function listAllVersions() {
    var versions = [];
    var markers = [];
    return new Promise(function (resolve, reject) {
        (function page(keyMarker, versionMarker) {
            s3.listObjectVersions({
                Bucket: BUCKET,
                Prefix: prefix,
                KeyMarker: keyMarker,
                VersionIdMarker: versionMarker
            }, function (err, data) {
                if (err) return reject(err);
                versions.push.apply(versions, data.Versions || []);
                markers.push.apply(markers, data.DeleteMarkers || []);
                if (process.stdout.isTTY) {
                    process.stdout.write('\rListing versions… ' + (versions.length + markers.length));
                }
                if (data.IsTruncated) return page(data.NextKeyMarker, data.NextVersionIdMarker);
                if (process.stdout.isTTY) process.stdout.write('\n');
                resolve({ versions: versions, markers: markers });
            });
        })();
    });
}

// ---------------------------------------------------------------- restore

var stats = { keys: 0, restored: 0, failed: 0 };
var skipped = {};
var failures = [];

function skip(reason) {
    skipped[reason] = (skipped[reason] || 0) + 1;
}

function tagOf(key, versionId) {
    return s3.headObject({ Bucket: BUCKET, Key: key, VersionId: versionId }).promise()
        .then(function (head) { return (head.Metadata || {})[TAG]; });
}

async function restore(plan) {
    if (since !== null && plan.modified < since) return skip('written before --since');
    try {
        if (!(await tagOf(plan.key, plan.current))) return skip('current not tagged (not re-encoded)');
        if (await tagOf(plan.key, plan.previous)) return skip('previous is tagged too');
        if (apply) {
            await s3.copyObject({
                Bucket: BUCKET,
                Key: plan.key,
                CopySource: s3Restore.copySource(BUCKET, plan.key, plan.previous),
                MetadataDirective: 'COPY'
            }).promise();
        }
        stats.restored++;
    } catch (e) {
        stats.failed++;
        failures.push(plan.key + ': ' + (e.code || e.message));
    }
}

async function runPool(plans) {
    var next = 0;
    async function worker() {
        while (next < plans.length) {
            await restore(plans[next++]);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
}

(async function main() {
    if (!apply) console.log('DRY RUN — nothing will be written. Pass --apply to make changes.\n');
    console.log('bucket      : ' + BUCKET);
    console.log('prefix      : ' + (prefix || '(all)'));
    console.log('since       : ' + (since === null ? '(any time)' : new Date(since).toISOString()) + '\n');

    var listed = await listAllVersions();
    var plans = s3Restore.planRestores(listed.versions, listed.markers);
    stats.keys = plans.length;
    var todo = plans.filter(function (p) {
        if (p.skip) skip(p.skip);
        return !p.skip;
    });
    console.log('JPEG keys: ' + plans.length + ', with a previous version to check: ' + todo.length);

    await runPool(todo);

    console.log('\n--- summary ---');
    console.log('JPEG keys       : ' + stats.keys);
    console.log('restored        : ' + stats.restored + (apply ? '' : ' (dry run — not written)'));
    Object.keys(skipped).forEach(function (reason) {
        console.log('skipped         : ' + skipped[reason] + '  ' + reason);
    });
    console.log('failed          : ' + stats.failed);
    failures.slice(0, 20).forEach(function (f) { console.log('  ' + f); });
    if (failures.length > 20) console.log('  … and ' + (failures.length - 20) + ' more');
    if (failures.length) console.log('Failed keys were left as they were. Re-running retries them.');
})().catch(function (e) {
    console.error('\nFatal: ' + (e.stack || e.message));
    process.exit(1);
});
