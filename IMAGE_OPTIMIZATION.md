# Image Optimization — Work In Progress

> **Status**: S3 backfill done on 2026-10-29 (§5.3). The originals are kept as old S3 versions until the client signs off (§9).
> **Last checked against the code**: 2026-10-20 (VLR-16). Backfill results added 2026-10-29 (VLR-15). Written by the previous vendor up to 2026-09-29.
> **Read this with**: [docs/TAKEOVER.md](docs/TAKEOVER.md) (servers, accounts), [ARCHITECTURE.md](ARCHITECTURE.md) §4.4–4.5 (upload pipeline, image URLs)
>
> The vendor's commit hashes for this work (`b2deba0`, `dcea73d`, …) are from their private repo and don't exist in ours, which starts at the handover baseline. Results of runs against S3 (sizes, versions, headers) are the vendor's measurements; we haven't re-checked them.

Picking this up? Read **§1** (the problem), **§4.1** (dev and prod share one bucket — there is no isolated test environment), **§9** (what can and cannot be undone) and **§7** (gotchas). Then **§5** for what to do next; **§5.3** records the S3 backfill run.

Asked "is there a script, and is it reversible?" — yes to both: `Scripts/optimize_s3_images.js`, and §9 has the reversibility answer, including the one thing that destroys it. Do not write a new script.

---

## 1. The problem in one paragraph

The client reported that images across the site are too large — property detail pages, `/properties` search results, and the "You Might Also Like" strip, all of which share the same photos. Investigation found four independent causes, three now fixed and one (the big one) only started. The single biggest remaining item is not compression at all: it's that the listing page downloads every gallery photo eagerly and the search cards download full-size images into thumbnail-sized boxes.

---

## 2. What is done

§2.1–2.3 are in the handover code (our baseline commit `f304cbb`, made from the vendor's `dedbc40` zip). Per the vendor, that is exactly what production runs (TAKEOVER §5); we haven't been able to confirm it on the server yet.

### 2.1 Static hero and page-header images — DONE

Re-encoded 7 banner JPEGs in `public/new-img/` at quality 80–82, downscaling two oversized ones to 1920px wide.

| File | Before | After |
|---|---|---|
| `penthouse2.jpg` | 1369 KB @ 3600x2400 | 216 KB @ 1920x1280 |
| `the-westin-bayshore-vancouver-2017.jpg` | 640 KB @ 2048x1536 | 514 KB @ 1920x1440 |
| `property-management-coquitlam.jpg` | 220 KB | 109 KB |
| `condo-in-richmond.jpg` | 192 KB | 106 KB |
| `north-vancouver-property-management.jpg` | 183 KB | 90 KB |
| `property-management-burnaby.jpg` | 170 KB | 84 KB |
| `penthouse-west-vancouver.jpg` | 118 KB | 56 KB |

**Total 2892 KB → 1176 KB (−59%).** (The "after" sizes match the files in the repo.)

`penthouse2.jpg` is one of three images the homepage hero picks at random in [`public/libs/js/main.js:37`](public/libs/js/main.js#L37) — the homepage had a one-in-three chance of a 1.4 MB banner (the other two are 129 KB and 209 KB).

EXIF orientation was checked on every file before re-encoding (all `1` or absent), so dropping metadata cannot rotate anything.

Four other header images were measured and **deliberately left alone** — they are already well compressed and re-encoding made them *larger*.

### 2.2 Carousel placeholder PNGs on the listing page — DONE

This was the largest single item on a listing page, bigger than the photo gallery itself.

`views/listing.ejs` ships six area images inside `.carousel-inner` as the initial slides. They were photographs stored as **lossless PNG**, totalling **9963 KB on every listing page view**. Converted to JPEG q82 → **453 KB (−95%)**, references updated, old PNGs deleted.

Five had an alpha channel, but the transparency is a faint anti-aliased edge: alpha never drops below 185/255 and touches only 0.62% of pixels, so flattening onto white is invisible. *(Verified, not assumed — don't re-litigate this.)*

> **Important and not yet acted on**: these six slides are placeholders. [`views/listing.ejs:115-123`](views/listing.ejs#L115-L123) empties `.carousel-inner` and appends the property's own photos as soon as the page script runs. So for any property that has photos — the normal case — this payload is downloaded and then **thrown away**. They are only ever displayed for a property with no photos at all. Not downloading them at all is the real fix. See §5.2.

### 2.3 Upload pipeline quality — DONE

New uploads are processed by [`lib/imageProcessing.js`](lib/imageProcessing.js) with `sharp`, called from `PUT /properties/id/:id/images` (`routes/properties.js`). JPEGs are written at `JPEG_QUALITY = 82`. Older versions of the code saved with the `images` package's default of quality 100, which is 2–3× the bytes with no visible difference; the last `images`-based version already passed 82 (see the comment at the top of `lib/imageProcessing.js`).

**Scope**: affects only photos uploaded *from now on*. The handler only processes images not already in the property's `imgs[]`. Nothing already in S3 is touched.

**Known limitations**: `.png` uploads are still written losslessly as PNG (`image.png({ adaptiveFiltering: true })`) and stay large. Since VLR-15, `uploadToS3` in `routes/properties.js` sets the same `ContentType`, `Cache-Control` and (JPEGs only) `vlr-optimized` tag as the backfill, from `s3UploadParams()` in `lib/imageProcessing.js`; photos uploaded before that deploy have none of them (see §7).

### 2.4 S3 backfill script — RUN ON THE WHOLE BUCKET (2026-10-29)

[`Scripts/optimize_s3_images.js`](Scripts/optimize_s3_images.js) re-encodes existing photos in the bucket. It is a dry run unless given `--apply`. (The neighbouring `migrate_team_photos.js` is the opposite: it writes unless given `--dry-run`.) Its header comment and messages are the vendor's and partly stale: the Node 8 / `NODE_PATH` setup, usage lines with a lowercase `scripts/` path (wrong on Linux), `npm install --no-save sharp`, and an end-of-run message recommending the lifecycle rule. Follow this doc instead (fixing the script is VLR-22).

The vendor processed two properties (per vendor); we did one more as a test, then the rest of the bucket (§5.3):

```
3606   27 photos    5.7 MB -> 1.08 MB   (-81%)   0 failures   2026-09-20, from a laptop
5810   40 photos   63.2 MB -> 13.1 MB   (-79%)   0 failures   2026-09-29, from the old dev server
5799   22 photos   31.3 MB ->  5.6 MB   (-82%)   0 failures   2026-10-28, vlr-prod-2026
```

Verified afterwards in S3 (by the vendor): `ContentType: image/jpeg` (was missing or `application/octet-stream`), `Cache-Control: public, max-age=2592000` (was absent on every object in the bucket), metadata tag `vlr-optimized: 82`, and **2 versions retained** on each key (e.g. `3606/…` current 87 KB, previous 383 KB; `5810/12.jpg` current 468 KB, previous 1985 KB) so the originals are recoverable.

Before our runs the script had touched nothing else in the bucket (per vendor). On 5799 we also tested the rollback, `Scripts/restore_s3_originals.js` (§9): restored to the originals, then re-encoded again.

---

## 3. The bucket, as measured

Bucket `vancouverluxuryrental.com`, region `us-west-2`. Credentials come from the environment (`AWS_*`, see CLAUDE.md). Keys are `{propertyId}/{filename}`.

Measured with `listObjectVersions` from the server, right before and after the full backfill on 2026-10-29 (GB = 10⁹ bytes):

| | Before (04:04 UTC) | After (15:46 UTC) |
|---|---|---|
| Current objects, all types | 68,929 files, 74.85 GB | 68,929 files, **15.07 GB** |
| Current JPEGs only (included in the row above) | 66,841 files, 73.55 GB | 66,841 files, 13.77 GB |
| Older versions | 8,810 files, 9.45 GB | 75,146 files, 82.88 GB |
| Total stored | 84.30 GB | 97.95 GB |
| Delete markers | 8,200 | 8,200 |

What the site serves went from 74.85 GB to 15.07 GB (−80%). The older versions grew by exactly the 66,336 photos re-encoded: each original is kept, so the total stored went *up* until those versions are expired (§9). Versioning is **enabled**.

The vendor's earlier measurement (2026-09): 68,261 objects, ~71 GB, mean object 1066 KB. By extension: 64,706 jpg (68.1 GB) · 1,468 jpeg (1.7 GB) · 1,297 png (1.2 GB) · 771 extensionless (7.5 MB) · 19 pdf.

35,587 files sit in the 1–2 MB band alone (46.8 GB). That ~1 MB average for a 1920px photo is the quality-100 signature.

**Measured savings** from a 24-image sample spread evenly across the whole bucket: **−77% to −81%**. (A dry run with `--limit N` takes the first N keys in S3's lexicographic order (`10/` sorts before `2/`), so it is not a spread sample.) Projected **71 GB → ~16 GB**; the real result was 15.07 GB (above).

Properties numbered below ~3800 have smaller 700×465 images (156–374 KB); properties 4000+ are 1920px at 0.8–2 MB. Both compress ~77%, but the absolute win is far larger on the newer ones.

---

## 4. Environment constraints — read before running anything

### 4.1 Dev and production share one S3 bucket

`config/default.js` and `config/production.js` both set `bucket: 'vancouverluxuryrental.com'`. **There is no separate dev copy of the images.** Running the app or a script locally with real AWS keys changes the live production site. This is why versioning matters.

The vendor also verified this empirically on 2026-09-25: production and the (now stopped) dev server emitted the **identical image URL string** for property 3606, and fetching that object returned the optimized copy with this script's `x-amz-meta-vlr-optimized: 82` tag. **Do not plan any "test on dev only" strategy for S3 photos — it does not exist.** Static images under `public/` *are* per-server, since they ship with the code; that asymmetry is the thing to keep straight.

If genuine isolation is ever needed, the options are: copy a few properties to a `test-<id>/` prefix and point a throwaway listing at them (needs temporary code changes), or stand up a separate dev bucket (a 71 GB copy that then drifts from production). Neither was judged worth it — versioning plus one-property-at-a-time covers the risk.

### 4.1a The server-rendered image URLs are broken; only JS saves them

The URLs rendered into the listing HTML use the S3 **website** endpoint (`routes/listing.js:240`), which does not serve these objects — per the vendor's check it 301-redirects to the site itself and returns `text/html`:

```
http://vancouverluxuryrental.com.s3-website-us-west-2.amazonaws.com/3606/...jpg
  -> 301 https://vancouverluxuryrentals.com/3606/...jpg
  -> 301 https://www.vancouverluxuryrentals.com/3606/...jpg
  -> 200 Content-Type: text/html   (136 bytes, not an image)
```

The gallery works only because [`views/listing.ejs:111-113`](views/listing.ejs#L111-L113) rewrites that host to the REST endpoint (`http://s3.us-west-2.amazonaws.com/vancouverluxuryrental.com/...`) in client-side JavaScript.

**Consequence: the `og:image` meta tag (and the JSON-LD `image`) is broken.** It carries the un-rewritten website-endpoint URL, meta tags are not touched by that JS, and crawlers do not run JS — so sharing any listing on Facebook, LinkedIn or WhatsApp produces **no preview image**. Tracked in VLR-21; fix it as part of the URL consolidation in §5.4.

### 4.2 Where to run it

On the production server, `vlr-prod-2026` (us-west-2, same region as the bucket, so transfer is free). `sharp` is a normal dependency of the app now, so the checkout `deploy.sh` runs from already has it after `npm ci`; nothing extra to install. Run from that git checkout rather than `/opt/vlr/app`, which is the running site's copy (owned by the `vlr` user). Run from `/opt/vlr/app`, the next deploy's `rsync --delete` would remove the progress and failure files the script keeps in `Scripts/`; run from the checkout, deploys copy them into `/opt/vlr/app`, which is harmless. **Don't run `deploy.sh` while the backfill is running**: it pulls and runs `npm ci` (which replaces `node_modules`) in that same checkout.

The script only needs the AWS keys. `/etc/vlr/env` is a systemd environment file, not a shell script, and `deploy.sh` reads it with `sudo`, so load just those three keys into the shell you run the script from (bash or zsh), inside the tmux/screen session for a long run (a tmux server started earlier won't inherit them). The first line clears any keys left in the shell from earlier. The second prints an error if a key didn't load: if it does, don't run the script, or the SDK is free to use other credentials, such as the instance role. Each line is exported as-is, so values must be unquoted and the file must have Unix line endings, as a systemd environment file normally does:

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION; while IFS= read -r l; do export "$l"; done < <(sudo grep -E '^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION)=' /etc/vlr/env)
: "${AWS_ACCESS_KEY_ID:?not set}" "${AWS_SECRET_ACCESS_KEY:?not set}" "${AWS_REGION:?not set}"
```

We have SSH access, and our git checkout is `~ubuntu/vlr` (TAKEOVER §4, since 2026-10-28). The old servers the vendor used (old dev and old vlr-prod) ran Node 8 and needed a Node 16 + `sharp@0.32.6` workaround under `~/imgopt`. They no longer serve the site (old vlr-prod is running with the site stopped, vlr-staging is stopped, both pending termination; TAKEOVER §4), and the workaround doesn't apply to the new server. In particular, **never delete `node_modules/sharp`** from the app as the old instructions said: `routes/properties.js` loads `lib/imageProcessing.js` at startup, so the site would fail to boot.

vlr-prod-2026 is now the only server running the site (TAKEOVER §4), and it also runs MongoDB. It's a t3.large: 2 burstable vCPUs. The run is CPU-heavy (sharp with mozjpeg), and if the instance uses standard CPU credits, running out of them throttles the whole machine, site included. How long the full run takes on this box hasn't been measured. Time a single property first, check the instance's credit specification, and keep `nice -n 19` with `--concurrency 2` (§5.3).

### 4.3 Running from a laptop costs egress

The bucket and the server are both in `us-west-2`, so transfer between them is free. Pulling 71 GB to a laptop is roughly $6 in egress plus many hours. Fine for a single property (that is how 3606 was done); wrong for the full run.

---

## 5. What is left, in priority order

### 5.1 Lazy-load the gallery — biggest remaining win, no infrastructure

[`views/listing.ejs:120-121`](views/listing.ejs#L120-L121) appends **every** gallery image into `.carousel-inner` on page load. Only one is visible; the browser fetches all of them. On a 30-photo listing that is the entire library downloaded up front.

Keep `src` on the first slide only, put the rest in `data-src`, swap on slide change. Add `loading="lazy"` to the search-result cards in `views/properties.ejs` (lines 249 and 303) and the recommendations strip. Add explicit `width`/`height` to stop the layout shift. Only `views/team.ejs:67` uses `loading="lazy"` anywhere today.

### 5.2 Stop downloading the carousel placeholders

Per §2.2 — 453 KB still fetched and discarded on every listing view. Best fix: render the property's own photos server-side from `imgLinks` (already passed to the template and serialized at `views/listing.ejs:42`), rewriting them to the REST endpoint on the server first (they're website-endpoint URLs, §4.1a, which only the JS at `views/listing.ejs:111-113` fixes today), and emit the area-image fallback only when `imgLinks` is empty. Also removes the JS dependency for the main image, which should help LCP and crawlers.

### 5.3 The S3 backfill — DONE 2026-10-29

Run on vlr-prod-2026 from our checkout (`~ubuntu/vlr`), unattended, as a one-off systemd timer that read the keys from `/etc/vlr/env`:

```
sudo systemd-run --unit=vlr-backfill --uid=ubuntu --working-directory=/home/ubuntu/vlr \
  --property=EnvironmentFile=/etc/vlr/env --property=Nice=19 \
  --on-calendar='2026-10-29 02:00:00 America/Vancouver' \
  "$(which node)" Scripts/optimize_s3_images.js --apply --concurrency 2
```

| | |
|---|---|
| Run | 2026-10-29 09:00:01 to 14:55:33 UTC (5 h 55 min), 7 h 51 min of CPU, 645 MB peak memory |
| Examined | 66,806 JPEGs |
| Rewritten | 66,336 |
| Skipped | 402 (would save under 15%), 68 already tagged (3606, 5810). 5799 was left out by the progress file |
| Failed | 0 |
| Size | 70,124 MB → 13,108 MB (−81%; the script's MB are 2²⁰ bytes) |
| CPU credits | standard; balance 864 → lowest 603, so no throttling |
| Site | responded normally throughout (homepage 0.2–0.9 s) |

Checked afterwards from outside: all 435 JPEGs on the 15 featured listings load as `image/jpeg`, carry `vlr-optimized: 82` and average 204 KB.

Photos uploaded after the run, until our first deploy, are written at quality 82 but without the tag (the vendor's upload code is still running). A later re-run of the backfill would re-encode those; there's no need to re-run it.

The original instructions, kept for a re-run (on the server (§4.2), from the deploy checkout, with the AWS keys exported):

```bash
node Scripts/optimize_s3_images.js --limit 200                # dry-run sanity check on a sample
time node Scripts/optimize_s3_images.js --apply --listing <id>   # one more 1920px property: look at it, and extrapolate the duration
# then, in screen/tmux:
nice -n 19 node Scripts/optimize_s3_images.js --apply --concurrency 2
```

`nice` and `--concurrency 2` are deliberate: this is also the web and database server, it has 2 vCPUs, and sharp is CPU-hungry. Safe to interrupt and re-run — see §7.

Until old versions are expired, the bucket keeps the originals as older versions: 82.88 GB of them against 15.07 GB of current objects, 97.95 GB in all (§3). At S3 Standard prices that's about US$2.25/month; expiring the old versions would bring it to about US$0.35/month. **Do not add the S3 lifecycle rule that expires noncurrent versions until the client has signed off on the quality** — it deletes the originals permanently (§9). TAKEOVER §9 has the open question to the client.

### 5.4 Thumbnail variants — structural, do after 5.3

Even at 230 KB, a search card renders a 1920px photo into a 230px-tall box ([`public/libs/css/properties.css:131-134`](public/libs/css/properties.css#L131-L134)). Generate `{propertyId}/thumb/{filename}` at 640w on upload and point the card URL builders at it.

**Prerequisite**: S3 URL construction is copy-pasted across the code — five `getSignedUrl` calls in `routes/properties.js`, two website-endpoint URLs in `routes/user.js`, one in `routes/listing.js`, one in `routes/showRoom.js`, path-style URLs in `lib/teamPhotos.js` and `lib/seoHelpers.js` (ARCHITECTURE §4.5), plus client-side host rewrites in `views/listing.ejs:111-113`, `views/myFavorites.ejs` and `views/tenant-forms.ejs`. Centralize it into one module alongside `lib/urls.js` **first**, so thumbnails become a change in one place.

Also note `/properties` builds URLs with `s3.getSignedUrl` ([`routes/properties.js:286`](routes/properties.js#L286)); the signature changes every render, so the browser can never reuse a cached copy, and the URLs expire after 15 minutes (the `.replace()` after it never matches; VLR-21). `routes/listing.js` uses the plain website endpoint. These disagree, and the signed one defeats the new `Cache-Control` header entirely. Fix as part of the same consolidation.

### 5.5 Agent portrait PNGs — repo bloat, not page weight

Nine PNGs in `public/img/` totalling ~6.4 MB (`Baxter Welch.png` is 1011 KB at 469×550), referenced only as backgrounds by the `-pic` classes in [`public/libs/css/content.css:498-532`](public/libs/css/content.css#L498-L532). No view or script uses those classes, so no page downloads them (the vendor thought the team page did). Delete them with the §5.7 files, or convert them to JPEG if the classes are ever used again.

### 5.6 PNGs in the bucket — needs a DB migration, not just a bucket change

1,297 files, 1.2 GB, averaging 970 KB. The script **skips these by default** for a reason: their `.png` keys are referenced by `imgs[]` in MongoDB, so converting to JPEG changes the filename and requires updating the database in lockstep. Do not run `--include-png`: it re-encodes them as 8-bit palette PNGs (`palette: true`), which is visibly lossy on photographs, and nearly all of them would pass the 15% threshold and be rewritten.

### 5.7 Unreferenced files in the repo

In `public/new-img/`, with no reference anywhere in the code: `White VLR Logo - ori.png` (14 MB), `Telus Garden.jpg` (1 MB), `Shangri-La 1 Bed.jpg` (1 MB), and `4362-Stearman-Ave-WV-360hometours-{11,12,16,20,24,36}.jpg`, among others. Plus 36 tracked macOS metadata files (`public/new-img/__*`, AppleDouble). Not served by any page, so no page-load cost, but they bloat clones and deploys. Before deleting, check that no content stored in MongoDB (CMS text, blog HTML) links to them.

---

## 6. Alternative worth reconsidering

A resizing CDN in front of S3 (Cloudflare Images fetch mode, imgix, or CloudFront + Lambda@Edge) fixes existing *and* future images with no rewriting, no generation loss, and no 71 GB job — you append `?w=640&q=75&fm=webp` to existing URLs and get edge caching and WebP/AVIF negotiation for free. It also makes §5.4 nearly trivial.

Costs a vendor dependency and a monthly bill. It was offered and the backfill was chosen instead, which is a reasonable call. **Requires dropping the signed URLs** (§5.4), which are uncacheable at the edge.

---

## 7. Gotchas for whoever runs this next

- **The script is safe to interrupt.** Completed keys are appended to the progress file (`--progress`, default `Scripts/.optimize_s3_progress.log`); a re-run skips them. Rewritten objects also carry a `vlr-optimized` metadata tag and are always skipped, even if the log is lost.
- **That progress log is gitignored on purpose.** It is per-machine state. **A laptop's log does not know what the server has done, and vice versa** — the metadata tag is the real defence. Run from the git checkout, not `/opt/vlr/app` (§4.2).
- **Nothing writes without `--apply`.** Dry run is the default. Unknown or misspelled flags, including `--dry-run`, are silently ignored, so a typo in `--prefix` or `--listing`, or `--prefix` given last with no value, widens an `--apply` run to the whole bucket (and `--limit abc` means no limit). The run starts immediately: if it prints `prefix      : (all)` when you meant one property, press Ctrl-C. (`--listing` given last with no value widens the run the same way.)
- **Rollback**: versioning is on. Every original survives as a previous version.
- **A file is only replaced if it saves ≥15%** (`--min-saving`), so already-efficient files are not degraded for nothing.
- **Per-file failures are skipped**, never aborting the run, and written to `Scripts/.optimize_s3_failures.json` only when a run finishes with failures (replacing any earlier file; a clean run leaves an old file in place). An interrupted run records none, but re-running retries them anyway because failed keys are never marked done.
- **Uploads from before the tag fix aren't tagged.** Uploads are tagged `vlr-optimized` only once the VLR-15 change to `uploadToS3` is deployed. Photos uploaded between the q82 change and that deploy carry no tag, so the backfill re-encodes them (q82 → q82) wherever that saves 15%. We accept that extra generation loss. The quality, cache lifetime and tag name the script uses by default come from `lib/imageProcessing.js`, shared with the upload path.
- **Quality is one flag** (`--quality`). Re-running a property at a different quality does nothing on its own: tagged objects are always skipped, and a fresh progress file doesn't change that. To redo a property, restore its originals first (`node Scripts/restore_s3_originals.js --apply --listing <id>`), then re-run with a fresh progress file (`--progress <new file>`), because the default one still lists those keys as done.
- **Script flags are merged into the app config** by config-lite, as are the `CONFIG` / `NODE_CONFIG` environment variables. The script's own flags don't collide with config keys, but any flag named after one would override it: `--port`, `--session`, `--mongodb`, `--bucket` (which would send every write to another bucket), `--canonicalHost`, `--redirectHosts`.

---

## 8. Deployment state

The vendor's 2026-09-25 check found the old dev and production servers at different commits, with production still serving the 9963 KB placeholder PNGs and writing uploads at quality 100. Neither serves the site any more (TAKEOVER §4). Production moved to `vlr-prod-2026` on 2026-10-16/17, built from `dedbc40`, which contains §2.1–2.3 (per vendor; TAKEOVER §5).

To confirm on the live site: `/img/Burnaby.jpg` should be served (72,586 bytes) and `/img/Burnaby.png` should not exist.

**§2.4 is live regardless**, because S3 is shared and the objects were rewritten directly: since 2026-10-29 every listing serves the optimized photos (§5.3).

---

## 9. Reversibility — what can and cannot be undone

The client's main worry is "will the site break, and can we go back". Short answers: **it should not break, and yes — as long as nobody deletes the old versions.**

### Why it cannot break the site

Optimizing does not change filenames, keys or URLs: each `.jpg`/`.jpeg` object is replaced in place with a smaller JPEG. Photos wider than 1920px are scaled down, and EXIF orientation is applied (which can swap width and height); both display the same in a browser. The expected worst case is "one photo looks soft". Two edge cases: a `.jpg` key that actually holds PNG or WebP data becomes a real JPEG (transparency flattened), and the script doesn't recheck an object right before writing, so a photo re-uploaded under the same key mid-run could be overwritten with a re-encode of the old one (recoverable from versions). Verified by the vendor on property 3606: 27 photos re-encoded, all still serving `200 OK` with `Content-Type: image/jpeg`.

### What protects each category

| What | How to undo |
|---|---|
| S3 photos | Bucket versioning — restore the previous version of the key. `Scripts/restore_s3_originals.js` does it for a property (`--listing <id>`), a prefix or the whole bucket (`--all`); dry run unless `--apply`. It copies the original back on top (with `image/jpeg` and the cache header, without the tag) and deletes nothing. After our first deploy uploads are tagged too, so limit a restore to the run with `--since`/`--until` |
| Static images under `public/` | Not from git: our history starts at the handover baseline, which already contains the optimized files. The originals are in the vendor's private repo and on old vlr-prod's disk and snapshots (TAKEOVER §4, §7); copy them off before that server is terminated if they matter |
| Upload-quality change | Change `JPEG_QUALITY` in `lib/imageProcessing.js` (only affects future uploads, and the backfill's default `--quality`) |

Confirmed live by the vendor on 2026-09-25 for a 3606 key:

```
bucket versioning : Enabled
versions: 2
  current (optimized)   87 KB   2026-09-20
  previous (original)  383 KB   2018-10-26
```

Per the vendor, the 2018 original was retained, and every rewritten object keeps its previous version; we haven't checked the other keys ourselves.

### What ENDS reversibility

**Deleting noncurrent versions. THIS IS IRREVERSIBLE.** Either through an S3 lifecycle rule that expires them, or by deleting a version by its version ID. A lifecycle rule would save roughly $1.9/month, but **once noncurrent versions are gone the originals are gone permanently**. Do not add that rule until the client has signed off on the visual result. If in doubt, leave it; the cost is trivial next to losing 71 GB of originals.

Also never suspend bucket versioning: objects uploaded before versioning was turned on are stored as the "null" version, and while versioning is suspended the next write to that key replaces it.

### What complicates a rollback

**Re-running at a different quality.** Without restoring first it does nothing (the `vlr-optimized` tag makes the script skip those objects), and forcing it would re-encode the already compressed copy. To genuinely redo a property, restore its previous versions first, then re-run (§7).

**Browser caches outlive an S3 rollback.** Rewritten objects carry `Cache-Control: public, max-age=2592000` (30 days). Restoring an old version in S3 takes effect instantly at the origin, but visitors who already cached the optimized copy may keep seeing it for up to 30 days. The key is unchanged, so there is no cache-busting URL to force a refresh. Factor this into any "we need to roll back now" conversation — and it is an argument for checking quality on a small batch *before* the full run, not after.

### Practical guidance

Run a property, look at it, then continue. That is what was done with 3606, 5810 and 5799 before the full run, and it worked. The whole run is done; do not add the lifecycle rule until the client has approved the result.
