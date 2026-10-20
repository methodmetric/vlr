# VancouverLuxuryRentals.com

Node/Express rental website and admin panel for Vancouver Luxury Rentals, maintained by Seta Workshop since October 2026.

- [CLAUDE.md](CLAUDE.md): commands, rules and where things live. Start here.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the app fits together, request flows, data model.
- [docs/TAKEOVER.md](docs/TAKEOVER.md): accounts, servers, secrets, backups and open questions.
- [IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md): the paused S3 photo backfill.
- [docs/vendor/](docs/vendor/): the previous vendor's docs, archived.

Quick start: `npm ci`, `cp .env.example .env` and set `SESSION_SECRET`, then `npm run dev` (port 3000, needs MongoDB). Tests: `npm test`.
