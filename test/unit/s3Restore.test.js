// Unit tests for lib/s3Restore.js — which version Scripts/restore_s3_originals.js
// copies back for each key. No S3 calls.
//     node --test test/unit/s3Restore.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const s3Restore = require('../../lib/s3Restore');

function version(key, id, modified, latest) {
    return { Key: key, VersionId: id, LastModified: new Date(modified), IsLatest: !!latest };
}

test('restores the version just before the current one', () => {
    const plans = s3Restore.planRestores([
        version('5799/0349.jpg', 'new', '2026-10-28T14:40:00Z', true),
        version('5799/0349.jpg', 'null', '2019-03-01T10:00:00Z')
    ]);
    assert.deepStrictEqual(plans, [{
        key: '5799/0349.jpg', current: 'new', previous: 'null',
        modified: Date.parse('2026-10-28T14:40:00Z')
    }]);
});

test('uses S3 listing order, even for versions written in the same second', () => {
    const plans = s3Restore.planRestores([
        version('1/a.JPEG', 'current', '2026-10-29T15:00:00Z', true),
        version('1/a.JPEG', 'restored', '2026-10-29T15:00:00Z'),
        version('1/a.JPEG', 'reencoded', '2026-10-29T15:00:00Z'),
        version('1/a.JPEG', 'original', '2018-01-01T00:00:00Z')
    ]);
    assert.strictEqual(plans[0].current, 'current');
    assert.strictEqual(plans[0].previous, 'restored');
});

test('a delete marker in the same second as the previous version counts as in between', () => {
    const plans = s3Restore.planRestores([
        version('1/a.jpg', 'v2', '2026-10-29T15:00:05Z', true),
        version('1/a.jpg', 'v1', '2026-10-29T15:00:00Z')
    ], [
        version('1/a.jpg', 'dm', '2026-10-29T15:00:00Z')
    ]);
    assert.strictEqual(plans[0].skip, 'previous is a delete marker');
});

test('skips keys that cannot be a restore', () => {
    const plans = s3Restore.planRestores([
        version('1/only.jpg', 'v1', '2026-10-29T15:00:00Z', true),
        version('1/gone.jpg', 'v1', '2020-01-01T00:00:00Z'),
        version('1/reupload.jpg', 'v2', '2026-10-29T15:00:00Z', true),
        version('1/reupload.jpg', 'v1', '2020-01-01T00:00:00Z'),
        version('1/plan.png', 'v2', '2026-10-29T15:00:00Z', true),
        version('1/plan.png', 'v1', '2020-01-01T00:00:00Z')
    ], [
        version('1/gone.jpg', 'dm', '2025-01-01T00:00:00Z', true),
        version('1/reupload.jpg', 'dm', '2025-01-01T00:00:00Z')
    ]);
    const byKey = Object.fromEntries(plans.map((p) => [p.key, p.skip]));
    assert.deepStrictEqual(byKey, {
        '1/only.jpg': 'no previous version',
        '1/gone.jpg': 'deleted',
        '1/reupload.jpg': 'previous is a delete marker'
    });
});

test('copy source encodes each path segment and the version id', () => {
    assert.strictEqual(
        s3Restore.copySource('vancouverluxuryrental.com', '4391/IMG 01+b.jpg', 'null'),
        'vancouverluxuryrental.com/4391/IMG%2001%2Bb.jpg?versionId=null'
    );
});
