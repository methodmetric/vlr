# Tests

`npm test` runs all 41 unit tests. They need no database, AWS or Mailgun.

| File | Covers | Run alone |
|---|---|---|
| `unit/restartPolicy.test.js` | `lib/restartPolicy.js`: when the cluster master gives up on crash-looping workers | `node test/unit/restartPolicy.test.js` (own runner) |
| `unit/mongooseCompat.test.js` | `lib/mongooseCompat.js`: Mongoose 4-style callbacks on Mongoose 8; stubs every query. Also loads the `showRoom`, `propertyFavorite` and `meetTeam` models to test their hooks, so changes there can break it | `node --test test/unit/mongooseCompat.test.js` |
| `unit/imageProcessing.test.js` | `lib/imageProcessing.js`: sharp resize, JPEG quality, watermark placement | `node --test test/unit/imageProcessing.test.js` |

`imageProcessing` uses `test/fixtures/` and `public/img/vlr-logo-watermark.png`, and writes temp files to the OS temp dir. New tests use `node:test` and `node:assert`; add the file to the `test` script in `package.json`.
