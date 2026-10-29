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
function planRestores(versions, deleteMarkers) {
    var byKey = new Map();
    function add(entry, isDeleteMarker) {
        if (!byKey.has(entry.Key)) byKey.set(entry.Key, []);
        byKey.get(entry.Key).push({
            id: entry.VersionId,
            latest: entry.IsLatest,
            modified: new Date(entry.LastModified).getTime(),
            deleteMarker: isDeleteMarker
        });
    }
    (versions || []).forEach(function (v) { add(v, false); });
    (deleteMarkers || []).forEach(function (m) { add(m, true); });

    var plans = [];
    byKey.forEach(function (list, key) {
        if (!/\.jpe?g$/i.test(key)) return;
        // Newest first; the latest version wins a same-millisecond tie.
        list.sort(function (a, b) {
            return b.modified - a.modified || Number(b.latest) - Number(a.latest);
        });
        var current = list[0];
        var previous = list[1];
        if (current.deleteMarker) return plans.push({ key: key, skip: 'deleted' });
        if (!previous) return plans.push({ key: key, skip: 'no previous version' });
        if (previous.deleteMarker) return plans.push({ key: key, skip: 'previous is a delete marker' });
        plans.push({ key: key, current: current.id, previous: previous.id, modified: current.modified });
    });
    return plans;
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
