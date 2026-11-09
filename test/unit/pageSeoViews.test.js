// Page SEO: what the views emit, and a guard against browser-side rewrites.
// Renders the EJS views directly; no server or database.
//     node --test test/unit/pageSeoViews.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const VIEWS = path.join(__dirname, '..', '..', 'views');

function render(view, locals) {
    return ejs.renderFile(path.join(VIEWS, view + '.ejs'), Object.assign({
        data: [], faqItems: [], structuredData: [], page: {}
    }, locals), { views: [VIEWS] });
}

const title = html => (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
const description = html => (html.match(/<meta name="description"\s+content="([^"]*)"/) || [])[1];
const canonical = html => (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
const robots = html => (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1];

// Views whose <head> is not header.ejs: each is rendered to prove it reads the locals.
const OWN_HEAD_VIEWS = ['northVancouver', 'westVancouver', 'richmond', 'coquitlam', 'burnaby',
    'landing', 'property-management'];
// Pages that use header.ejs.
const HEADER_VIEWS = ['aboutUs', 'profile', 'team', 'career', 'testimonials', 'contact', 'terms', 'owners',
    'owner-FAQ', 'tenant-FAQ'];

const OVERRIDE = {
    seoTitle: 'Edited <b>"title"</b>',
    seoDescription: 'Edited "description" & more',
    canonicalUrl: 'https://www.vancouverluxuryrentals.com/edited',
    seoRobots: 'noindex'
};

[...OWN_HEAD_VIEWS, ...HEADER_VIEWS].forEach(view => {
    test(view + ': renders the title, description, canonical and robots it is given, escaped', async () => {
        const html = await render(view, OVERRIDE);
        assert.strictEqual(title(html), 'Edited &lt;b&gt;&#34;title&#34;&lt;/b&gt;');
        assert.strictEqual(description(html), 'Edited &#34;description&#34; &amp; more');
        assert.strictEqual(canonical(html), OVERRIDE.canonicalUrl);
        assert.strictEqual(robots(html), 'noindex');
        assert.ok(!html.includes('<b>"title"</b>'), 'unescaped markup in the page');
    });
});

test('own-head views fall back to a generic title and description when given nothing', async () => {
    for (const view of OWN_HEAD_VIEWS) {
        const html = await render(view, {});
        assert.ok(title(html), view + ' has no title');
        assert.ok(description(html), view + ' has no description');
        assert.strictEqual(robots(html), undefined, view + ' should not be noindex by default');
    }
});

test('header.ejs falls back to its site default when given nothing, and has no robots tag', async () => {
    const html = await render('terms', {});
    assert.strictEqual(title(html), 'Residential Property Management Services in Vancouver: VLR');
    assert.strictEqual(robots(html), undefined);
});

test('city views have exactly one title and one description tag', async () => {
    for (const view of ['burnaby', 'westVancouver', 'northVancouver', 'richmond', 'coquitlam', 'landing']) {
        const html = await render(view, OVERRIDE);
        assert.strictEqual((html.match(/<title>/g) || []).length, 1, view + ' title tags');
        assert.strictEqual((html.match(/name="description"/g) || []).length, 1, view + ' description tags');
    }
});

test('property-management: og:description follows an overridden description only', async () => {
    const plain = await render('property-management', {});
    assert.ok(plain.includes('property="og:description" content="Vancouver Luxury Rentals is the premier specialist in Residential Property Management."'));
    const edited = await render('property-management', { pageSeoOverride: { description: 'New <desc>' } });
    assert.ok(edited.includes('property="og:description" content="New &lt;desc&gt;"'));
});

test('registered pages do not rewrite their title or description in the browser', () => {
    // Views of pages in the registry (including the About subpages and Owners).
    // A jQuery/document.title rewrite here would undo an admin override.
    const registered = ['aboutUs', 'profile', 'team', 'career', 'testimonials', 'contact', 'terms', 'owners',
        'owner-FAQ', 'tenant-FAQ', 'homepage', 'property-management', 'landing', 'burnaby', 'coquitlam',
        'northVancouver', 'westVancouver', 'richmond'];
    const rewrite = /document\.title\s*=|\$\(\s*["']title["']\s*\)|\$\(\s*["']meta\[name=.?description/;
    registered.forEach(view => {
        const source = fs.readFileSync(path.join(VIEWS, view + '.ejs'), 'utf8');
        assert.ok(!rewrite.test(source), view + '.ejs rewrites its title or description in the browser');
    });
});
