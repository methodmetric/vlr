# Kiro spec: SEO and UX improvements (vendor, abandoned)

The previous vendor's plan for an SEO and UX overhaul, written as a spec in [Kiro](https://kiro.dev) (AWS's AI IDE). It wasn't in the handover zip. It was copied from `.kiro/specs/seo-ux-improvements/` in `/opt/vlr/app` on vlr-prod-2026 on 2026-11-02 (VLR-8), because the first `deploy.sh` run deletes it there. The spec's `.config.kiro` (a spec id and workflow type) was left out.

| File | What it is |
|---|---|
| `requirements.md` | 12 requirements: generated meta descriptions, owner-first navigation and homepage hero, a stronger owners landing page, longer area pages, internal linking, a blog, Open Graph images, A/B testing, a content validator. The stated main goal is visibility in AI search (ChatGPT, Perplexity, Google AI Overviews). |
| `design.md` | Planned modules: `lib/seoHelpers.js`, `middlewares/seo.js`, `lib/areaContent.js`, `lib/internalLinks.js`, a blog model, routes and admin, `lib/ogImages.js`, `lib/contentValidator.js` |
| `tasks.md` | The implementation checklist, 25 steps |

## What was built

Checked against the code on 2026-11-02:

- **Built:** `lib/seoHelpers.js` and `middlewares/seo.js` (tasks 1.1 and 1.3), and the middleware on the homepage and `/owners` (4.1 and 5.1). The middleware also runs on the six `property-management-*` area pages in `routes/index.js` with `pageType: 'area'`, although `tasks.md` doesn't tick that step (11.2).
- **Not built:** none of the other modules in `design.md` exist (`lib/areaContent.js`, `lib/internalLinks.js`, `lib/ogImages.js`, `lib/contentValidator.js`), and there is no blog or A/B testing. `seoHelpers` supports a `blog` page type that no page uses. The navigation and hero changes and all the test tasks are unticked.

Treat it as the vendor's thinking, not a commitment: check any claim against the code, as with the other files in this folder.
