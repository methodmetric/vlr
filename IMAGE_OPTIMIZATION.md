# Image Optimization — Work In Progress

> **Status**: partially complete, safe to pause here
> **Last updated**: 2026-09-29
> **Commits**: `b2deba0` … `dcea73d` on `main` (all pushed)
> **Read this with**: [HANDOVER.md](HANDOVER.md) (server access), [CLAUDE.md](CLAUDE.md) (architecture)
>
> **Resuming on a new computer? Start at [§10](#10-resume-point--2026-09-29).** The
> sharp environment is now proven working on the dev server and a second property
> (5810) has been optimized for real. §10 has the exact commands and the two gotchas
> that will otherwise waste your time (nvm defaults to a broken Node 20; a stale
> `sharp` in `~/vlr/node_modules` shadows the good one).

Picking this up on a new machine? Read **§1** (the problem), **§4.1** (dev and prod
share one bucket — there is no isolated test environment), **§9** (what can and cannot
be undone) and **§7** (gotchas). Then **§5** for what to do next.

Asked "is there a script, and is it reversible?" — yes to both: `Scripts/optimize_s3_images.js`,
and §9 has the reversibility answer including the three ways to destroy it by accident.
Do not write a new script.

---

## 1. The problem in one paragraph

The client reported that images across the site are too large — property detail
pages, `/properties` search results, and the "You Might Also Like" strip, all of
which share the same photos. Investigation found four independent causes, three
now fixed and one (the big one) only started. The single biggest remaining item
is not compression at all: it's that the listing page downloads every gallery
photo eagerly and the search cards download full-size images into thumbnail-sized
boxes.

---

## 2. What is done

### 2.1 Static hero and page-header images — DONE, not yet deployed

Commit `b2deba0`. Re-encoded 7 banner JPEGs in `public/new-img/` at quality 80–82,
downscaling two oversized ones to 1920px wide.

| File | Before | After |
|---|---|---|
| `penthouse2.jpg` | 1369 KB @ 3600x2400 | 216 KB @ 1920x1280 |
| `the-westin-bayshore-vancouver-2017.jpg` | 640 KB @ 2048x1536 | 514 KB @ 1920x1440 |
| `property-management-coquitlam.jpg` | 220 KB | 109 KB |
| `condo-in-richmond.jpg` | 192 KB | 106 KB |
| `north-vancouver-property-management.jpg` | 183 KB | 90 KB |
| `property-management-burnaby.jpg` | 170 KB | 84 KB |
| `penthouse-west-vancouver.jpg` | 118 KB | 56 KB |

**Total 2892 KB → 1176 KB (−59%).**

`penthouse2.jpg` is one of three images the homepage hero picks at random in
[`public/libs/js/main.js:37`](public/libs/js/main.js#L37) — the homepage was a
dice roll between a 129 KB banner and a 1.4 MB one.

EXIF orientation was checked on every file before re-encoding (all `1` or absent),
so dropping metadata cannot rotate anything.

Four other header images were measured and **deliberately left alone** — they are
already well compressed and re-encoding made them *larger*.

### 2.2 Carousel placeholder PNGs on the listing page — DONE, not yet deployed

Commit `2ae093d`. This was the largest single item on a listing page, bigger than
the photo gallery itself.

`views/listing.ejs` ships six area images inside `.carousel-inner` as the initial
slides. They were photographs stored as **lossless PNG**, totalling **9963 KB on
every listing page view**. Converted to JPEG q82 → **453 KB (−95%)**, references
updated, old PNGs deleted.

Five had an alpha channel, but the transparency is a faint anti-aliased edge:
alpha never drops below 185/255 and touches only 0.62% of pixels, so flattening
onto white is invisible. *(Verified, not assumed — don't re-litigate this.)*

> **Important and not yet acted on**: these six slides are placeholders.
> [`views/listing.ejs:116-123`](views/listing.ejs#L116-L123) empties
> `.carousel-inner` and appends the property's own photos as soon as the page
> script runs. So for any property that has photos — the normal case — this
> payload is downloaded and then **thrown away**. They are only ever displayed for
> a property with no photos at all. Not downloading them at all is the real fix.
> See §5.2.

### 2.3 Upload pipeline quality — DONE, not yet deployed

Commit `b2deba0`. [`routes/properties.js:636`](routes/properties.js#L636) now passes
an explicit quality:

```js
.save(sourceImgPath, { quality: JPEG_QUALITY });   // JPEG_QUALITY = 82, was implicit 100
```

The `images` package defaults to quality 100 (`node_modules/images/index.js`
`CONFIG_GENERATOR`), which is 2–3× the bytes of q82 with no visible difference.

**Scope**: affects only photos uploaded *from now on*. The line runs inside the
`for (needUploadImg of needUploadImgs)` loop in the `PUT /properties/id/:id`
handler, and that list is explicitly filtered to exclude anything already in
`data.imgs`. Nothing already in S3 is touched.

**Known limitation**: quality only reaches the JPEG encoder. `CONFIG_GENERATOR`
has no `TYPE_PNG` entry (the line is commented out upstream), so `.png` uploads
are still written losslessly and stay large.

### 2.4 S3 backfill script — WRITTEN AND PROVEN, one property done

Commits `2561bee`, `bc2c0e4`, `e21da85`, `10cedf7`, `7d7bc3c`, `dcea73d`.

[`Scripts/optimize_s3_images.js`](Scripts/optimize_s3_images.js) re-encodes existing
photos in the bucket. Follows the `--dry-run`-by-default convention of the
neighbouring `migrate_team_photos.js`. **Read its header comment — it is long and
current.**

**Property 3606 has been processed for real** (run from a laptop, not the server):

```
27 photos   5.7 MB -> 1.08 MB   (-81%)   0 failures
```

Verified afterwards in S3: `ContentType: image/jpeg` (was missing entirely),
`Cache-Control: public, max-age=2592000` (was absent on every object in the
bucket), metadata tag `vlr-optimized: 82`, and **2 versions retained** on each key
(current 87 KB, previous 383 KB) so the originals are recoverable.

Nothing else in the bucket has been touched.

---

## 3. The bucket, as measured

Bucket `vancouverluxuryrental.com`, region `us-west-2`, credentials in
`config/aws.json`. Keys are `{propertyId}/{filename}`.

| | |
|---|---|
| Objects | 68,261 |
| Total size | ~71 GB |
| Mean object | 1066 KB |
| Versioning | **Enabled** |

By extension: 64,706 jpg (68.1 GB) · 1,468 jpeg (1.7 GB) · 1,297 png (1.2 GB) ·
771 extensionless (7.5 MB) · 19 pdf.

35,587 files sit in the 1–2 MB band alone (46.8 GB). That ~1 MB average for a
1920px photo is the quality-100 signature.

**Measured savings** from a 24-image sample spread evenly across the whole bucket,
and reproduced by the script's own dry-run: **−77% to −81%**. Projected
**71 GB → ~16 GB**.

Properties numbered below ~3800 have smaller 700×465 images (156–374 KB);
properties 4000+ are 1920px at 0.8–2 MB. Both compress ~77%, but the absolute win
is far larger on the newer ones.

---

## 4. Environment constraints — read before running anything

### 4.1 Dev and production share one S3 bucket — PROVEN, not inferred

`config/default.js` and `config/production.js` both set
`bucket: 'vancouverluxuryrental.com'`. **There is no separate dev copy of the
images.** Optimizing "on dev" changes the live production site. This is why
versioning matters.

This was verified empirically on 2026-09-25, not just read off the config. Both
`https://www.vancouverluxuryrentals.com/listing/...-property-id-3606` and the `dev.`
equivalent emit the **identical image URL string**, and fetching that object returns:

```
HTTP/1.1 200 OK
Content-Length: 86984
Content-Type: image/jpeg
Cache-Control: public, max-age=2592000
x-amz-meta-vlr-optimized: 82          <- written by Scripts/optimize_s3_images.js
Last-Modified: Sun, 20 Sep 2026 09:33:12 GMT
```

That is the optimized object, carrying this script's own metadata tag, served to
production. **Do not plan any "test on dev only" strategy for S3 photos — it does
not exist.** Static images under `public/` *are* per-server, since they ship with
the code; that asymmetry is the thing to keep straight.

If genuine isolation is ever needed, the options are: copy a few properties to a
`test-<id>/` prefix and point a throwaway listing at them (needs temporary code
changes), or stand up a separate dev bucket (a 71 GB copy that then drifts from
production). Neither was judged worth it — versioning plus one-property-at-a-time
covers the risk.

### 4.1a The server-rendered image URLs are broken; only JS saves them

Found while verifying 4.1, and worth knowing before touching URL construction.

The URLs rendered into the HTML use the S3 **website** endpoint, which does not
serve these objects — it 301-redirects to the site itself and returns `text/html`:

```
http://vancouverluxuryrental.com.s3-website-us-west-2.amazonaws.com/3606/...jpg
  -> 301 https://vancouverluxuryrentals.com/3606/...jpg
  -> 301 https://www.vancouverluxuryrentals.com/3606/...jpg
  -> 200 Content-Type: text/html   (136 bytes, not an image)
```

The gallery works only because [`views/listing.ejs:111-113`](views/listing.ejs#L111-L113)
rewrites that host to the REST endpoint (`http://s3.us-west-2.amazonaws.com/vancouverluxuryrental.com/...`)
in client-side JavaScript.

**Consequence: the `og:image` meta tag is broken.** It carries the un-rewritten
website-endpoint URL, meta tags are not touched by that JS, and crawlers do not run
JS — so sharing any listing on Facebook, LinkedIn or WhatsApp produces **no preview
image**. Unrelated to file size, but a real SEO/social loss, and a small fix to make
as part of the URL consolidation in §5.4.

### 4.2 The dev server cannot run sharp

`ssh ubuntu@18.237.239.200` (checkout `~/vlr`):

- `node -v` → **v8.9.4** (end-of-life since 2019)
- Node 18 and 20 **will not start at all**:
  `libc.so.6: version 'GLIBC_2.28' not found` — the box has glibc < 2.27
  (Ubuntu 16.04 ships 2.23, consistent with Node 8)

Current sharp needs Node 18.17+. `npm install sharp` there installs nothing usable
**and still exits 0**, which is why it appeared to work.

Working combination, which touches neither the system Node nor the app's
`node_modules`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 16                  # NOT 18 or 20 — glibc
node -v                         # must say v16.x

mkdir -p ~/imgopt && cd ~/imgopt && npm init -y
npm install sharp@0.32.6        # NOT plain "sharp" — 0.33+ needs Node 18.17+

cd ~/vlr
NODE_PATH=~/imgopt/node_modules node Scripts/optimize_s3_images.js --dry-run --listing 3606
```

Every sharp option the script uses (`failOn`, `rotate`, `withoutEnlargement`,
`mozjpeg`, `palette`) exists in 0.32.x; `failOn` was added in 0.32.0, which is why
0.32.6 rather than an older line. Cleanup is `nvm deactivate && rm -rf ~/imgopt`.

**UPDATE 2026-09-29: this path is now PROVEN on the dev server**, with two
corrections — see [§10](#10-resume-point--2026-09-29) for the full walkthrough:
- nvm was **already installed** on dev, defaulting to **Node 20** (which cannot start
  — glibc). Every new SSH session resets to it, so `node -v` greets you with the
  `GLIBC_2.28` error until you run `nvm use 16`. Skip the `curl … install.sh` step.
- A stale `~/vlr/node_modules/sharp` (0.33+, no working binary) **shadowed** the good
  `~/imgopt` copy and made the script report "sharp is not installed". `rm -rf
  ~/vlr/node_modules/sharp` fixes it; sharp is not in `package.json`, so this is safe.

If the pairing ever fails on another box, check `ldd --version`; below 2.17 would mean
dropping to Node 14, which `sharp@0.32.6` still supports.

### 4.3 The production server — CHECKED 2026-09-29, identical to dev

`HANDOVER.md` lists a second machine: `ssh ubuntu@34.217.51.226`, checkout
`~/vlr_website`. It has now been checked and is **identical to the dev box**:
Node **v8.9.4**, glibc **2.23**, no nvm. So there is no "simpler because newer"
advantage — both need the same Node-16-via-nvm workaround.

**The backfill was run from the DEV box (`18.237.239.200`), on purpose.** Because
the bucket is shared (§4.1), running it from either server produces the identical
result on both sites — but the machine running sharp takes a heavy 1–3 hour CPU hit,
and each box is also its live web server (§5.3). Running on dev keeps production's
responsiveness untouched while production's photos still get optimized. Same region,
same cost, so dev wins on the tie-break.

Also confirmed while checking: the live site is launched by systemd
(`vlr.service`, `ExecStart=/usr/local/bin/node server.js`) using the **2018 system
Node 8 at `/usr/local/bin/node`** — a completely separate binary from anything nvm
manages. Nothing you do with nvm (`nvm use`, `nvm install`, `nvm alias default`) can
touch the running site.

### 4.4 Running from a laptop costs egress

The bucket and both servers are in `us-west-2`, so transfer between them is free.
Pulling 71 GB to a laptop is roughly $6 in egress plus many hours. Fine for a
single property (that is how 3606 was done); wrong for the full run.

### 4.5 The `images` npm package crashes on Windows

`require('images')` succeeds but decoding a file exits the process with code 127.
Dimension-reading on Windows was done by parsing JPEG/PNG headers directly. Not a
problem on the servers, but do not expect `images` to work locally.

---

## 5. What is left, in priority order

### 5.1 Lazy-load the gallery — biggest remaining win, no infrastructure

[`views/listing.ejs:120-122`](views/listing.ejs#L120-L122) appends **every** gallery
image into `.carousel-inner` on page load. Only one is visible; the browser fetches
all of them. On a 30-photo listing that is the entire library downloaded up front.

Keep `src` on the first slide only, put the rest in `data-src`, swap on slide
change. Add `loading="lazy"` to the search-result cards in `views/properties.ejs`
(~line 249 and ~line 303) and the recommendations strip. Add explicit
`width`/`height` to stop the layout shift. Only `views/team.ejs:67` uses
`loading="lazy"` anywhere today.

### 5.2 Stop downloading the carousel placeholders

Per §2.2 — 453 KB still fetched and discarded on every listing view. Best fix:
render the property's own photos server-side from `imgLinks` (already passed to the
template and serialized at `views/listing.ejs:42`) and emit the area-image fallback
only when `imgLinks` is empty. Also removes the JS dependency for the main image,
which should help LCP and crawlers.

### 5.3 Finish the S3 backfill

~68,200 objects, ~71 GB remaining. Resolve §4.2/§4.3 first, then:

```bash
node Scripts/optimize_s3_images.js --dry-run --limit 200      # sanity check
node Scripts/optimize_s3_images.js --apply --listing 5810     # a 1920px property
# then, in screen/tmux — it is 1-3 hours:
nice -n 19 node Scripts/optimize_s3_images.js --apply --concurrency 4
```

`nice` and `--concurrency 4` are deliberate: this is also the web server and sharp
is CPU-hungry. Safe to interrupt and re-run — see §7.

Afterwards, **add an S3 lifecycle rule expiring noncurrent versions** (30 days is
reasonable). Until then you store both the old 71 GB and the new ~16 GB. Only ~$2/mo,
but the rule is what makes the saving permanent.

### 5.4 Thumbnail variants — structural, do after 5.3

Even at 230 KB, a search card renders a 1920px photo into a 230px-tall box
([`public/libs/css/properties.css:130-138`](public/libs/css/properties.css#L130-L138)).
Generate `{propertyId}/thumb/{filename}` at 640w on upload and point the card URL
builders at it.

**Prerequisite**: the S3 URL construction is copy-pasted in ~9 places (six in
`routes/properties.js`, two in `routes/user.js`, one in `routes/listing.js`), several
with commented-out alternatives and string `.replace()` patches. Centralize it into
`lib/imageUrls.js` alongside the existing `lib/urls.js` **first** — then this is a
one-line change instead of nine.

Also note `/properties` builds URLs with `s3.getSignedUrl`
([`routes/properties.js:289`](routes/properties.js#L289)); the signature changes every
render, so the browser can never reuse a cached copy. `routes/listing.js` uses the
plain website endpoint. These two disagree and the signed one defeats the new
`Cache-Control` header entirely. Fix as part of the same consolidation.

### 5.5 Agent portrait PNGs — worst byte-per-pixel on the site

Nine PNGs in `public/img/` totalling ~6.5 MB (`Baxter Welch.png` is 1011 KB at
469×550), used as mobile CSS backgrounds displayed at **170×190**
([`public/libs/css/content.css:498-537`](public/libs/css/content.css#L498-L537)).
Photographs stored losslessly. JPEG would take the set under 300 KB. Team page only,
but it is a ~6 MB page.

### 5.6 PNGs in the bucket — needs a DB migration, not just a bucket change

1,297 files, 1.2 GB, averaging 970 KB. The script **skips these by default** for a
reason: their `.png` keys are referenced by `imgs[]` in MongoDB, so converting to
JPEG changes the filename and requires updating the database in lockstep. Do not
run `--include-png` expecting a big win; it only re-compresses them as PNG.

### 5.7 Dead files in the repo

`public/new-img/White VLR Logo - ori.png` (14 MB), `Telus Garden.jpg` (1 MB),
`Shangri-La 1 Bed.jpg` (1 MB), `4362-Stearman-Ave-WV-360hometours-36.jpg` — grepped
and referenced nowhere in `views/`, `public/libs/`, `lib/` or `routes/`. Not served,
so no page-load cost, but they bloat clones and deploys.

---

## 6. Alternative worth reconsidering

A resizing CDN in front of S3 (Cloudflare Images fetch mode, imgix, or CloudFront +
Lambda@Edge) fixes existing *and* future images with no rewriting, no generation
loss, and no 71 GB job — you append `?w=640&q=75&fm=webp` to existing URLs and get
edge caching and WebP/AVIF negotiation for free. It also makes §5.4 nearly trivial.

Costs a vendor dependency and a monthly bill. It was offered and the backfill was
chosen instead, which is a reasonable call — but if §4.2/§4.3 turn into a swamp,
this is the escape hatch. **Requires dropping the signed URLs** (§5.4), which are
uncacheable at the edge.

---

## 7. Gotchas for whoever runs this next

- **The script is safe to interrupt.** Completed keys are appended to
  `Scripts/.optimize_s3_progress.log`; a re-run skips them. Rewritten objects also
  carry a `vlr-optimized` metadata tag, so they are skipped even if the log is lost.
- **That progress log is gitignored on purpose** (commit `dcea73d`). It is
  per-machine state. Committing it would make one machine skip keys another had
  done. **A laptop's log does not know what the server has done, and vice versa** —
  the metadata tag is the real defence.
- **Nothing writes without `--apply`.** Dry run is the default.
- **Rollback**: versioning is on. Every original survives as a previous version.
- **A file is only replaced if it saves ≥15%** (`--min-saving`), so already-efficient
  files are not degraded for nothing.
- **Per-file failures are logged to `Scripts/.optimize_s3_failures.json` and skipped**,
  never aborting the run. Re-running retries them. The sample run had zero failures
  with sharp; an earlier attempt with .NET/GDI+ failed on 1 in 24, which is why the
  script uses sharp.
- **`CLAUDE.md` is inaccurate in two places.** It describes `npm test` / mocha
  scripts and a `.npmrc` with `ignore-scripts=true`. Neither exists: `package.json`
  has `"test": "node test/unit/restartPolicy.test.js"` and there is no `.npmrc` in
  the repo. Do not trust it on tooling.
- **Quality is one flag.** If 82 looks too soft, `--quality 85` or `88`. Re-running
  a property needs its keys cleared from the progress log *and* its
  `vlr-optimized` tag ignored — simplest is a fresh `--progress /tmp/other.log`,
  but note it will re-encode from the *already compressed* current version, not the
  original. To redo properly, restore the previous S3 versions first.

---

## 8. Deployment state

Verified by fetching both sites on 2026-09-25 — the two servers are **not** at the
same commit:

| | dev (`18.237.239.200`) | production (`34.217.51.226`) |
|---|---|---|
| §2.1 / §2.2 / §2.3 deployed | **Yes** | **No** |
| `/img/Burnaby.*` served | `Burnaby.jpg`, 72,586 bytes | `Burnaby.png`, **1,759,669 bytes** |

So **production is still carrying the full 9963 KB of placeholder PNGs on every
listing page**, still rolling the 1.4 MB homepage banner, and still writing new
uploads at quality 100. Deploying production is the single cheapest remaining win —
it needs only a `git pull` and restart, no image processing at all.

**§2.4 is already live**, because S3 is shared and the objects were rewritten
directly — property 3606 shows the optimized photos on both dev and production
right now. Check it at:
`https://dev.vancouverluxuryrentals.com/listing/2132-West-51st-Avenue-property-id-3606`
(hard-refresh; browsers cache the old versions).

Deploy per `HANDOVER.md` — both servers run the site as `vlr.service` under systemd.

---

## 9. Reversibility — what can and cannot be undone

The client's main worry is "will the site break, and can we go back". Short answers:
**it will not break, and yes — but the ability to go back has three expiry conditions
that are easy to destroy by accident.**

### Why it cannot break the site

Optimizing does not change filenames, keys, URLs, or formats. An object is replaced
in place with a smaller JPEG of the same dimensions. The worst realistic outcome is
"one photo looks soft", never "images stopped loading". Verified on property 3606:
27 photos re-encoded, all still serving `200 OK` with `Content-Type: image/jpeg`.

### What protects each category

| What | How to undo |
|---|---|
| S3 photos | Bucket versioning — restore the previous version of the key |
| Static images under `public/` | `git revert` the commit, redeploy |
| Upload-quality change | `git revert b2deba0` (only affects future uploads anyway) |

Confirmed live on 2026-09-25 for a 3606 key:

```
bucket versioning : Enabled
versions: 2
  current (optimized)   87 KB   2026-09-20
  previous (original)  383 KB   2018-10-26
```

The 2018 original is still there. Every rewritten object has one.

### The three things that END reversibility

**1. An S3 lifecycle rule expiring noncurrent versions. THIS IS IRREVERSIBLE.**
§5.3 recommends adding one to stop paying for both copies. It is the right thing
eventually and about $2/month until then — but **once noncurrent versions are
expired the originals are gone permanently**. Do not add that rule until the
client has signed off on the visual result. If in doubt, leave it; the cost is
trivial next to losing 71 GB of originals.

**2. Re-running at a different quality without restoring first.**
Bumping `--quality 82` to `88` and re-running does **not** improve anything — it
re-encodes the *already compressed* current version, compounding the loss. To
genuinely redo a property: restore its previous S3 versions first, then re-run
with the new quality. (Also clear its keys from the progress log, or use
`--progress /tmp/other.log`, and note the `vlr-optimized` tag will otherwise
cause a skip.)

**3. Browser caches outlive an S3 rollback.**
Rewritten objects carry `Cache-Control: public, max-age=2592000` (30 days).
Restoring an old version in S3 takes effect instantly at the origin, but visitors
who already cached the optimized copy may keep seeing it for up to 30 days. The
key is unchanged, so there is no cache-busting URL to force a refresh. Factor this
into any "we need to roll back now" conversation — and it is an argument for
checking quality on a small batch *before* the full run, not after.

### Practical guidance

Run a property, look at it, then continue. That is what was done with 3606 and it
worked. Do not add the lifecycle rule until the whole run is done and approved.

---

## 10. Resume point — 2026-09-29

Everything up to a single-property backfill is now proven end-to-end on the **dev
server**. Two properties are optimized (3606, 5810); the full bucket run has **not**
been started. Resume from step "C" below.

### What is confirmed working now (was only "reasoned" before)

- **Host: dev box, `ssh ubuntu@18.237.239.200`, checkout `~/vlr`.** Prod is identical
  (Node 8.9.4 / glibc 2.23) — run on dev to spare production's CPU (§4.3).
- **Node 16 via the pre-existing nvm works, sharp 0.32.6 loads and encodes.** Dry run
  and `--apply` both succeeded.
- **Reversibility verified live.** After optimizing 5810, `5810/12.jpg` shows two S3
  versions: current 468 KB (2026-09-29) + previous 1985 KB (2024-07-10). Originals
  are retained.

### Property 5810 result (the second real property, done 2026-09-29)

```
40 photos   63.2 MB -> 13.1 MB   (-79%)   0 failures
```
Objects now carry `Content-Type: image/jpeg`, `Cache-Control: public, max-age=2592000`,
and `x-amz-meta-vlr-optimized: 82` (previously served as `application/octet-stream`
with no caching hint).

### Two gotchas that will waste your time if you forget them

1. **Every new SSH session resets `node` to nvm's default, which is Node 20 — and
   Node 20 cannot start here** (`GLIBC_2.28 not found`). So a fresh login greets you
   with that error. Run **`nvm use 16`** first thing, every session. `node -v` must
   say **v16.20.2** before you run anything. (Optional permanent fix: `nvm alias
   default 16` — safe, the live site runs on `/usr/local/bin/node` regardless.)
2. **If the script says "sharp is not installed" even with Node 16 active**, it is a
   stale `~/vlr/node_modules/sharp` (0.33+, no working binary) shadowing the good
   `~/imgopt` copy — Node checks the project's `node_modules` before `NODE_PATH`.
   Fix once: `rm -rf ~/vlr/node_modules/sharp` (sharp is not in `package.json`, so
   this is safe). This has already been removed on the dev box, but a future
   `npm install` in `~/vlr` could recreate it.

### A. One-time environment setup (already done on dev; redo on a fresh box)

```bash
ssh ubuntu@18.237.239.200
source ~/.nvm/nvm.sh          # nvm already installed — do NOT re-run the curl installer
nvm install 16                # skip if already present
mkdir -p ~/imgopt && cd ~/imgopt && npm init -y
npm install sharp@0.32.6
node -e "console.log(require('sharp').format ? 'sharp OK' : 'bad')"   # -> sharp OK
```

### B. Every session (this is the part people forget)

```bash
source ~/.nvm/nvm.sh
nvm use 16
node -v                       # MUST print v16.20.2
cd ~/vlr
```

### C. RESUME HERE — run the full bucket

Sanity-check first, then launch under screen/tmux (it is 1–3 hours):

```bash
# quick sanity on a fresh sample
NODE_PATH=~/imgopt/node_modules node Scripts/optimize_s3_images.js --dry-run --limit 200

# the full run — nice'd so it does not starve the web server, in screen so it
# survives disconnects. Safe to interrupt and re-run (finished keys are logged + tagged).
screen -S imgopt              # reattach later with: screen -r imgopt
NODE_PATH=~/imgopt/node_modules nice -n 19 node Scripts/optimize_s3_images.js --apply --concurrency 4
# detach: Ctrl-A then D
```

Expected: ~68,200 objects, ~71 GB → ~16 GB, roughly −79% (matches the 5810 sample).

### D. After the run

- **Spot-check a sample of properties visually** before doing anything irreversible.
- **Then, and only then**, add the S3 lifecycle rule expiring noncurrent versions
  (30 days) to stop paying for both copies. This is the one **irreversible** step
  (§9) — it deletes the retained originals. Leave it off until the client signs off.

### Still outstanding (unchanged, independent of the S3 run)

- **Deploy the committed code to production** (§8): `ssh ubuntu@34.217.51.226`,
  `cd ~/vlr_website && git pull && sudo systemctl restart vlr.service`. Prod still
  ships the 9963 KB placeholder PNGs, the 1.4 MB homepage banner, and writes new
  uploads at quality 100. Dev already has these; prod does not.
- The front-end wins (§5.1 lazy-load, §5.2 placeholders) and structural items
  (§5.4–§5.7) are untouched.
