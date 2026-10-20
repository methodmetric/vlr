'use strict';
/**
 * Resize + watermark step for property photos uploaded in the admin
 * (PUT /properties/id/:id/images in routes/properties.js), done with sharp.
 *
 * It replaces the `images` native module, which only ever shipped a Node 8
 * binary, and reproduces what this call in routes/properties.js produced:
 *
 *   images(src).size(1920)
 *     .draw(watermark, 0, (h / w) * 1920 - wmHeight + 50, wmWidth * 0.6, wmHeight * 0.6)
 *     .save(path, { quality: 82 })
 *
 *  - size(1920): the width becomes 1920 (smaller photos are enlarged) and the
 *    height 1920 * h / w, truncated to an integer. `images` resampled with
 *    nearest neighbour (PixelArray::SetWidth/SetHeight), so this does too.
 *  - draw(): `images` draw() only takes (img, x, y). The 60% width/height
 *    arguments were ignored, so the logo has always been drawn at its full
 *    750x300 size. Its top edge sits at the truncated y above, so only its top
 *    250 rows fall inside the photo (the rows cut off are transparent). If y
 *    came out at -1 or below (a resized height under about 250px) nothing was
 *    drawn.
 *    The blend is a plain alpha "over", which is what sharp's composite does.
 *  - save(): the format comes from the file extension, case-insensitively.
 *    JPEG is quality 82, PNG uses adaptive filtering, GIF defaults. The file
 *    is overwritten in place. EXIF orientation and embedded colour profiles
 *    were ignored and no metadata was written; sharp is told to do the same.
 */
var fs = require('fs');
var path = require('path');
var sharp = require('sharp');
var log = require('log4js').getLogger('imageProcessing');

var TARGET_WIDTH = 1920;
// How far the logo's bottom edge hangs below the photo (see draw() above).
var WATERMARK_OVERHANG = 50;
// JPEG quality for uploaded property photos. 100 (the `images` package default)
// is indistinguishable from 82 on a photo but several times the file size.
var JPEG_QUALITY = 82;
var WATERMARK_PATH = path.join(__dirname, '..', 'public', 'img', 'vlr-logo-watermark.png');

function toJpeg(image) { return image.jpeg({ quality: JPEG_QUALITY }); }

var ENCODERS = {
    '.jpg': toJpeg,
    '.jpeg': toJpeg,
    // libpng's default adaptive filtering, as `images` used. sharp's default
    // (no filtering) makes the same photo 1.5-4x larger.
    '.png': function (image) { return image.png({ adaptiveFiltering: true }); },
    '.gif': function (image) { return image.gif(); }
};

// Decodes the logo once. A missing or broken file is logged, not thrown, so the
// site still starts; every upload then fails with that error instead.
function loadWatermark(file) {
    var loading = sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    loading.catch(function (err) {
        log.error('Cannot load watermark ' + file + '; photo uploads will fail: ' + err.message);
    });
    return loading;
}

// Resizes and watermarks the image at filePath in place. `watermark` is a
// promise from loadWatermark(). Rejects (leaving the file as it was) if the
// file is not a readable image or its extension has no encoder.
async function watermarkPhoto(filePath, watermark) {
    var encode = ENCODERS[path.extname(filePath).toLowerCase()];
    if (!encode) throw new Error('Unsupported image type: ' + filePath);

    var logo = await watermark;
    var input = await fs.promises.readFile(filePath);
    var options = { ignoreIcc: true };
    var source = await sharp(input, options).metadata();
    var height = Math.trunc(TARGET_WIDTH * source.height / source.width);
    var top = Math.trunc((source.height / source.width) * TARGET_WIDTH - logo.info.height + WATERMARK_OVERHANG);

    var image = sharp(input, options).resize(TARGET_WIDTH, height, {
        fit: 'fill', kernel: 'nearest', fastShrinkOnLoad: false
    });
    if (top >= 0 && top < height) {
        // Pass only the rows that land inside the photo: sharp refuses an
        // overlay taller than the image. The logo (750px) is narrower than 1920.
        var rows = Math.min(logo.info.height, height - top);
        image = image.composite([{
            input: logo.data.subarray(0, rows * logo.info.width * logo.info.channels),
            raw: { width: logo.info.width, height: rows, channels: logo.info.channels },
            left: 0,
            top: top
        }]);
    }
    await fs.promises.writeFile(filePath, await encode(image).toBuffer());
}

var defaultWatermark = loadWatermark(WATERMARK_PATH);

function watermarkPropertyPhoto(filePath) {
    return watermarkPhoto(filePath, defaultWatermark);
}

module.exports = {
    watermarkPropertyPhoto: watermarkPropertyPhoto,
    watermarkPhoto: watermarkPhoto,
    loadWatermark: loadWatermark
};
