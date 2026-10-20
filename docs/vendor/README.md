# Vendor docs (archived)

The previous vendor's documents, moved here on 2026-10-20 (VLR-16). They're kept for history. Several of their claims were already wrong at handover, and they describe servers that have since been retired. For current facts use [CLAUDE.md](../../CLAUDE.md), [ARCHITECTURE.md](../../ARCHITECTURE.md) and [TAKEOVER.md](../TAKEOVER.md).

| File | Was | What it is |
|---|---|---|
| `HANDOVER.md` | `/HANDOVER.md` | Vendor handover document (2026-09-10) |
| `TESTING.md` | `/TESTING.md` | Testing guide |
| `test-README.md` | `/test/README.md` | Test folder guide |
| `README-notes.md` | `/README.md` | The vendor's working notes |

## Known wrong (checked against the code at commit 7b0fd42)

- **Tests.** The mocha/chai/supertest SEO suite, `test/integration/`, and the scripts `test:unit`, `test:watch`, `test:integration`, `test:all` never existed. The real suite is 41 `node:test`/plain-node tests (see `test/README.md`).
- **Install.** There is no `.npmrc` and semantic-ui is not a dependency; `npm ci` works.
- **Runtime.** Not Node 8: `sharp` 0.35 and `--env-file-if-exists` need Node 22.9+. Mongoose is 8 (with `lib/mongooseCompat.js`), not 4. Watermarking uses `sharp` (`lib/imageProcessing.js`), not the `images` package. Logging is log4js, not express-winston.
- **Servers.** The IPs and paths (`18.237.239.200 ~/vlr`, `34.217.51.226 ~/vlr_website`) are the retired servers. Production is `vlr-prod-2026`, app in `/opt/vlr/app` (TAKEOVER §4).
- **Deploy.** `deploy.sh` runs `npm ci --omit=dev` (no copying `node_modules`), checks `/etc/vlr/env`, and rsyncs to `/opt/vlr/app`. `git_pull_and_update.sh` and `server_restart.sh` are now safe wrappers, not `forever` launchers.
- **Secrets.** Since commit 7b0fd42 no keys are in the code; `config/aws.json` is not read and the Mailgun key and session secret come from the environment.
- **Team photos.** Edited in the admin at `/VLR-admin/showRoom/meetTeam`, stored in S3 under `team/`; not via the steps in `README-notes.md`.
- **Repository.** Bitbucket is shut down; the `repository` URL in `package.json` is a leftover.
