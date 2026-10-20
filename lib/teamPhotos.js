/**
 * Team photo storage.
 *
 * Team photos used to live in MongoDB as raw Buffers and were serialised
 * straight into /about/team, where each byte became a decimal number in the
 * HTML (~3.6 characters per byte). Nine photos inflated that page to 4.3 MB and
 * the images had no crawlable URL at all — they were assembled in the browser
 * as blob: handles.
 *
 * Photos now live in the same S3 bucket as property images. The database stores
 * only the object key (e.g. "team/shahram-rafati.png"); the public URL is built
 * here so the bucket or region can change without touching stored data.
 */

var path = require('path');
var AWS = require('aws-sdk');
var config = require('config-lite')(__dirname);

AWS.config.loadFromPath('config/aws.json');

var s3 = new AWS.S3({
    params: {
        Bucket: config.bucket
    }
});

// Path-style URL: the bucket name contains dots, which breaks TLS certificate
// matching on virtual-hosted-style URLs (bucket.s3.amazonaws.com).
var S3_ENDPOINT = 'https://s3-us-west-2.amazonaws.com';
var KEY_PREFIX = 'team/';
var DEFAULT_CONTENT_TYPE = 'image/png';

/** Filename-safe version of a person's name, e.g. "Shahram Rafati" -> "shahram-rafati". */
function slugifyName(name) {
    return (name || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function extensionFor(contentType) {
    if (!contentType) return 'png';
    if (contentType.indexOf('jpeg') >= 0 || contentType.indexOf('jpg') >= 0) return 'jpg';
    if (contentType.indexOf('webp') >= 0) return 'webp';
    if (contentType.indexOf('gif') >= 0) return 'gif';
    return 'png';
}

/**
 * S3 object key for a member. Falls back to the document id when the name is
 * empty or slugifies to nothing (e.g. a name written only in Chinese).
 */
function buildKey(member, contentType) {
    var slug = slugifyName(member && member.name);
    if (!slug) slug = String((member && member._id) || 'member');
    return KEY_PREFIX + slug + '.' + extensionFor(contentType);
}

/** Public URL for a stored key. Returns '' when the member has no photo. */
function publicUrl(key) {
    if (!key) return '';
    // Tolerate rows that already hold a full URL rather than a bare key.
    if (key.indexOf('http://') === 0 || key.indexOf('https://') === 0) return key;
    return S3_ENDPOINT + '/' + config.bucket + '/' + key.replace(/^\/+/, '');
}

/** Convenience for templates: the photo URL of a member document, or ''. */
function publicUrlFor(member) {
    return publicUrl(member && member.profileImage);
}

/**
 * Upload image bytes to S3. cb(err, key).
 * ContentType is set explicitly so browsers render the object instead of
 * downloading it.
 */
function upload(key, buffer, contentType, cb) {
    s3.putObject({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || DEFAULT_CONTENT_TYPE,
        CacheControl: 'public, max-age=31536000'
    }, function (err) {
        if (err) return cb(err);
        cb(null, key);
    });
}

/**
 * Decode a browser "data:image/png;base64,...." string into { buffer, contentType }.
 * Returns null when the value is not a data URI (the admin form posts the string
 * "[object Blob]" when the user did not choose a new file).
 */
function decodeDataUri(value) {
    if (!value || typeof value !== 'string') return null;
    var match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!match) return null;
    return {
        contentType: match[1],
        buffer: Buffer.from(match[2], 'base64')
    };
}

module.exports = {
    slugifyName: slugifyName,
    extensionFor: extensionFor,
    buildKey: buildKey,
    publicUrl: publicUrl,
    publicUrlFor: publicUrlFor,
    upload: upload,
    decodeDataUri: decodeDataUri,
    KEY_PREFIX: KEY_PREFIX
};
