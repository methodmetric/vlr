# Vendor docs (archived)

The previous vendor's documents, moved here on 2026-10-20 (VLR-16). They're kept for history. Several of their claims were already wrong at handover, and they describe servers that no longer serve the site. For current facts use [CLAUDE.md](../../CLAUDE.md), [ARCHITECTURE.md](../../ARCHITECTURE.md) and [TAKEOVER.md](../TAKEOVER.md).

| File | Was | What it is |
|---|---|---|
| `HANDOVER.md` | `/HANDOVER.md` | Vendor handover document (2026-09-10) |
| `TESTING.md` | `/TESTING.md` | Testing guide |
| `test-README.md` | `/test/README.md` | Test folder guide |
| `README-notes.md` | `/README.md` | The vendor's working notes |
| `kiro-seo-ux-spec/` | `/opt/vlr/app/.kiro/specs/seo-ux-improvements/` on the server, not in the zip | The vendor's abandoned SEO/UX plan; see its README for what was built (added 2026-11-02, VLR-8) |

## What they get wrong

[FACT-CHECK.md](FACT-CHECK.md) lists the claims in these files, and in the vendor versions of `CLAUDE.md`, `ARCHITECTURE.md`, `IMAGE_OPTIMIZATION.md` and `Scripts/readme.txt`, that the code contradicts, with evidence. In short: the descriptions of how the app works are mostly right; the runtime, test, deploy, server and secrets details are wrong or outdated, and `TESTING.md` / `test-README.md` describe a test suite that never existed.
