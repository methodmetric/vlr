// Unit tests for lib/imageProcessing.js — the sharp replacement for the `images`
// resize + watermark step behind PUT /properties/id/:id/images.
//     node --test test/unit/imageProcessing.test.js
//
// Fixtures (test/fixtures/): wide-photo.jpg is 2400x1600 (wider than the 1920px
// target), small-photo.png is 640x480 (narrower, so it is enlarged). Both have a
// flat slate colour (BG) in the bottom-left corner, where the watermark lands.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const imageProcessing = require('../../lib/imageProcessing');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const WATERMARK = path.join(__dirname, '..', '..', 'public', 'img', 'vlr-logo-watermark.png');
const BG = [40, 60, 90];
// Points inside the 750x300 logo (watermark coordinates).
const LOGO_RED = [186, 150];        // inside the stem of the red "L"
const LOGO_WHITE = [44, 84];        // inside the white "V"
const LOGO_CLEAR = [200, 50];       // transparent, above the "L"

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlr-imgproc-'));
test.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function copyFixture(name, newName) {
    const dest = path.join(tmpDir, newName || name);
    fs.copyFileSync(path.join(FIXTURES, name), dest);
    return dest;
}

async function writeSolid(name, width, height, format) {
    const dest = path.join(tmpDir, name);
    await sharp({ create: { width, height, channels: 3, background: { r: BG[0], g: BG[1], b: BG[2] } } })
        .toFormat(format).toFile(dest);
    return dest;
}

async function readRaw(file) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, info, at: (x, y) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)) };
}

function assertNear(actual, expected, tolerance, label) {
    const off = actual.some((v, i) => Math.abs(v - expected[i]) > tolerance);
    assert.ok(!off, label + ': expected ~' + expected + ' (+/-' + tolerance + '), got ' + actual);
}

function assertRed(rgb, label) {
    assert.ok(rgb[0] > 200 && rgb[1] < 70 && rgb[2] < 70, label + ': expected logo red, got ' + rgb);
}

// Luminance quantisation table of a baseline JPEG, in file (zigzag) order.
function lumaQuantTable(jpeg) {
    for (let i = 2; i < jpeg.length - 4;) {
        const marker = jpeg[i + 1];
        const length = jpeg.readUInt16BE(i + 2);
        if (marker === 0xdb && (jpeg[i + 4] & 0x0f) === 0) return Array.from(jpeg.subarray(i + 5, i + 5 + 64));
        i += 2 + length;
    }
    throw new Error('no DQT table 0');
}

test('resizes a JPEG wider than 1920px to 1920 wide, keeps the aspect ratio and overwrites it as JPEG', async () => {
    const file = copyFixture('wide-photo.jpg');
    await imageProcessing.watermarkPropertyPhoto(file);
    const meta = await sharp(file).metadata();
    assert.strictEqual(meta.format, 'jpeg');
    assert.strictEqual(meta.width, 1920);
    assert.strictEqual(meta.height, 1280);
});

test('encodes JPEG at quality 82 (standard tables scaled to 36%), not the libjpeg/sharp defaults', async () => {
    const file = copyFixture('wide-photo.jpg', 'quality.jpg');
    await imageProcessing.watermarkPropertyPhoto(file);
    const table = lumaQuantTable(fs.readFileSync(file));
    assert.strictEqual(table[0], 6);   // 16 * 0.36, rounded: q100 would be 1, q75 8
    assert.strictEqual(table[63], 36); // 99 * 0.36, rounded: q80 would be 40
});

test('draws the full-size logo at x=0 with its top 250px above the bottom edge of a JPEG', async () => {
    const file = copyFixture('wide-photo.jpg', 'placement.jpg');
    await imageProcessing.watermarkPropertyPhoto(file);
    const out = await readRaw(file);
    const top = 1280 - 250;
    // Full size: a 60%-scaled logo (what the old call's ignored width/height
    // arguments asked for) would leave this point transparent.
    assertRed(out.at(LOGO_RED[0], top + LOGO_RED[1]), 'red L');
    assert.ok(out.at(LOGO_WHITE[0], top + LOGO_WHITE[1]).every((v) => v > 215), 'white V');
    assertNear(out.at(LOGO_CLEAR[0], top + LOGO_CLEAR[1]), BG, 12, 'transparent part of the logo');
    assertNear(out.at(1000, 1200), BG, 12, 'right of the logo');
    assertNear(out.at(200, top - 40), BG, 12, 'above the logo');
});

test('enlarges a PNG narrower than 1920px, keeps it PNG and blends the logo exactly like images did', async () => {
    const file = copyFixture('small-photo.png');
    await imageProcessing.watermarkPropertyPhoto(file);
    const meta = await sharp(file).metadata();
    assert.strictEqual(meta.format, 'png');
    assert.strictEqual(meta.width, 1920);
    assert.strictEqual(meta.height, 1440);
    // images wrote this as 51 KB (libpng adaptive filtering); unfiltered is ~218 KB.
    assert.ok(fs.statSync(file).size < 100000, 'PNG is ' + fs.statSync(file).size + ' bytes');

    const out = await readRaw(file);
    const wm = await sharp(WATERMARK).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const top = 1440 - 250;
    let maxDiff = 0;
    for (let y = top; y < 1440; y++) {
        for (let x = 0; x < wm.info.width; x++) {
            const o = (((y - top) * wm.info.width) + x) * 4;
            const alpha = wm.data[o + 3] / 255;
            // images' Pixel::Merge onto an opaque pixel, truncating to uint8
            const expected = [0, 1, 2].map((c) => Math.trunc(wm.data[o + c] * alpha + BG[c] * (1 - alpha)));
            out.at(x, y).forEach((v, c) => { maxDiff = Math.max(maxDiff, Math.abs(v - expected[c])); });
        }
    }
    assert.ok(maxDiff <= 2, 'logo blend differs from images by up to ' + maxDiff);
    for (const [x, y] of [[0, top - 1], [749, top - 1], [750, top], [1100, 1439]]) {
        assert.deepStrictEqual(out.at(x, y), BG, 'outside the logo at ' + x + ',' + y);
    }
});

test('leaves a 1920px-wide image at its size, and skips the logo when it would start above the top edge', async () => {
    const tall = await writeSolid('h250.png', 1920, 250, 'png');
    const short = await writeSolid('h240.png', 1920, 240, 'png');
    await imageProcessing.watermarkPropertyPhoto(tall);
    await imageProcessing.watermarkPropertyPhoto(short);

    const t = await readRaw(tall);
    assert.deepStrictEqual([t.info.width, t.info.height], [1920, 250]);
    assertRed(t.at(LOGO_RED[0], LOGO_RED[1]), 'logo at y=0 on a 250px image');

    const s = await readRaw(short);
    assert.deepStrictEqual([s.info.width, s.info.height], [1920, 240]);
    for (let i = 0; i < s.data.length; i += 3) {
        if (s.data[i] !== BG[0] || s.data[i + 1] !== BG[1] || s.data[i + 2] !== BG[2]) {
            assert.fail('240px image was changed at byte ' + i);
        }
    }
});

test('picks the output format from the extension case-insensitively and supports GIF', async () => {
    const upper = copyFixture('wide-photo.jpg', 'PHOTO.JPG');
    const gif = await writeSolid('photo.gif', 960, 640, 'gif');
    await imageProcessing.watermarkPropertyPhoto(upper);
    await imageProcessing.watermarkPropertyPhoto(gif);
    assert.strictEqual((await sharp(upper).metadata()).format, 'jpeg');
    const gifMeta = await sharp(gif).metadata();
    assert.deepStrictEqual([gifMeta.format, gifMeta.width, gifMeta.height], ['gif', 1920, 1280]);
});

test('ignores EXIF orientation and writes no EXIF, as images did', async () => {
    const file = path.join(tmpDir, 'rotated.jpg');
    await sharp(path.join(FIXTURES, 'wide-photo.jpg')).withMetadata({ orientation: 6 }).toFile(file);
    assert.strictEqual((await sharp(file).metadata()).orientation, 6);
    await imageProcessing.watermarkPropertyPhoto(file);
    const meta = await sharp(file).metadata();
    assert.deepStrictEqual([meta.width, meta.height, meta.orientation], [1920, 1280, undefined]);
});

test('rejects and leaves the file untouched for an extension images could not encode', async () => {
    const file = copyFixture('wide-photo.jpg', 'photo.tiff');
    const before = fs.readFileSync(file);
    await assert.rejects(imageProcessing.watermarkPropertyPhoto(file), /Unsupported image type/);
    assert.ok(fs.readFileSync(file).equals(before));
});

test('rejects and leaves the file untouched when it is not an image', async () => {
    const file = path.join(tmpDir, 'not-an-image.jpg');
    fs.writeFileSync(file, 'hello');
    await assert.rejects(imageProcessing.watermarkPropertyPhoto(file));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'hello');
});

test('a missing watermark file does not throw when loaded; processing with it rejects', async () => {
    const missing = imageProcessing.loadWatermark(path.join(tmpDir, 'no-such-logo.png'));
    const file = copyFixture('wide-photo.jpg', 'no-logo.jpg');
    const before = fs.readFileSync(file);
    await assert.rejects(imageProcessing.watermarkPhoto(file, missing), /no-such-logo/);
    assert.ok(fs.readFileSync(file).equals(before));
});
