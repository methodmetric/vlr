'use strict';
/**
 * Picks which S3 object versions Scripts/restore_s3_originals.js restores.
 * Kept free of S3 calls so the choice can be unit-tested.
 *
 * The bucket is versioned. When Scripts/optimize_s3_images.js re-encodes a
 * photo it writes a new current version and the original becomes the version
 * just before it. Restoring copies that previous version back on top, so the
 * re-encoded copy is kept too, as an older version.
 */

// Groups the Versions and DeleteMarkers of listObjectVersions pages by key and
// returns, per JPEG key, either { key, current, previous, modified } (the
// version ids to check and copy, and when the current one was written, in ms)
// or { key, skip } with the reason it can't be a restore.
//
// `versions` must be in listing order: S3 lists each key's versions newest
// first, which is exact, while LastModified only has one-second precision.
// Delete markers come in a separate list, so they are placed by time, and one
// in the same second as the versions around it counts as in between (skip).
function planRestores(versions, deleteMarkers) {
    var byKey = new Map();
    function entry(key) {
        if (!byKey.has(key)) byKey.set(key, { versions: [], markers: [] });
        return byKey.get(key);
    }
    (versions || []).forEach(function (v) { entry(v.Key).versions.push(v); });
    (deleteMarkers || []).forEach(function (m) { entry(m.Key).markers.push(m); });

    var plans = [];
    byKey.forEach(function (e, key) {
        if (!/\.jpe?g$/i.test(key)) return;
        if (e.markers.some(function (m) { return m.IsLatest; })) {
            return plans.push({ key: key, skip: 'deleted' });
        }
        var current = e.versions[0];
        var previous = e.versions[1];
        if (!previous) return plans.push({ key: key, skip: 'no previous version' });
        var after = time(previous);
        var before = time(current);
        if (e.markers.some(function (m) { return time(m) >= after && time(m) <= before; })) {
            return plans.push({ key: key, skip: 'previous is a delete marker' });
        }
        plans.push({ key: key, current: current.VersionId, previous: previous.VersionId, modified: before });
    });
    return plans;
}

function time(entry) {
    return new Date(entry.LastModified).getTime();
}

// CopySource for one version of a key: the key is URL-encoded per path
// segment (photo names contain spaces and other characters).
function copySource(bucket, key, versionId) {
    return bucket + '/' + key.split('/').map(encodeURIComponent).join('/') +
        '?versionId=' + encodeURIComponent(versionId);
}

module.exports = {
    planRestores: planRestores,
    copySource: copySource
};
