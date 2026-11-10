// Page SEO: sitemap wiring, admin routes and the /for-rent override logic.
// No database: model methods are replaced, and lib/mongo (which would connect)
// is stubbed before routes/properties.js loads.
//     node --test test/unit/pageSeoRoutes.test.js
'use strict';
const test = require('node:test');
const { afterEach } = test;
const assert = require('node:assert');
const path = require('node:path');
const express = require('express');
const mongoose = require('../../lib/mongooseCompat');

// routes/properties.js requires lib/mongo, which opens a connection on load.
const mongoPath = require.resolve('../../lib/mongo');
require.cache[mongoPath] = { id: mongoPath, filename: mongoPath, loaded: true, exports: mongoose };

const PageSeoModel = require('../../models/pageSeo');
const PropertyModel = require('../../models/properties');
const pageSeo = require('../../lib/pageSeo');
const sitemap = require('../../lib/sitemap');
const forRentPages = require('../../lib/forRentPages');
const propertiesRouter = require('../../routes/properties');

const SITE = 'https://www.vancouverluxuryrentals.com';

// Put the real model methods back after every test (see pageSeo.test.js).
const REAL = {
    pageSeo: { find: PageSeoModel.find, deleteOne: PageSeoModel.deleteOne, findOneAndUpdate: PageSeoModel.findOneAndUpdate },
    property: { find: PropertyModel.find, distinct: PropertyModel.distinct }
};
afterEach(() => {
    Object.assign(PageSeoModel, REAL.pageSeo);
    Object.assign(PropertyModel, REAL.property);
    pageSeo.invalidate();
});

function stubProperties() {
    PropertyModel.distinct = (field, filter, cb) => cb(null, ['Burnaby']);
    PropertyModel.find = () => ({ lean: () => ({ exec: cb => cb(null, []) }) });
}

function stubOverrides(docs) {
    PageSeoModel.find = () => ({ lean: () => ({ exec: () => Promise.resolve(docs) }) });
    pageSeo.invalidate();
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

function locs(xml) {
    return (xml.match(/<loc>([^<]*)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, ''));
}

function getSitemap() {
    return new Promise((resolve, reject) => sitemap.getSitemap((err, xml) => err ? reject(err) : resolve(xml)));
}

test('sitemap: hides noindex and canonical-elsewhere pages, keeps the rest, updates without a rebuild', async () => {
    stubProperties();

    stubOverrides([]);
    const before = locs(await getSitemap());
    assert.ok(before.includes(SITE + '/terms'));
    assert.ok(before.includes(SITE + '/for-rent/all'));
    assert.ok(before.includes(SITE + '/property-management/'));
    assert.ok(before.includes(SITE + '/about/team'));

    stubOverrides([
        { pageKey: 'terms', noindex: true },
        { pageKey: 'for-rent/all', noindex: true },
        { pageKey: 'property-management', canonical: SITE + '/somewhere-else' },
        { pageKey: 'about-team', canonical: SITE + '/about/team' }, // same URL: stays
        { pageKey: 'contact', title: 'Only a title' }
    ]);
    // The sitemap itself is cached for an hour; the filter must still apply.
    const after = locs(await getSitemap());
    assert.ok(!after.includes(SITE + '/terms'));
    assert.ok(!after.includes(SITE + '/for-rent/all'));
    assert.ok(!after.includes(SITE + '/property-management/'));
    assert.ok(after.includes(SITE + '/about/team'));
    assert.strictEqual(after.length, before.length - 3);

    stubOverrides([]);
    assert.deepStrictEqual(locs(await getSitemap()), before);
});

test('sitemap: the Owner and Tenant pages are listed, and noindex drops each one', async () => {
    // Guards a registry path that drifts from the sitemap's: noindex would then
    // add the robots tag but leave the page in the sitemap.
    const keys = ['owner-list-properties', 'owner-property-management', 'tenant-services', 'tenant-forms'];
    stubProperties();

    stubOverrides([]);
    const before = locs(await getSitemap());
    keys.forEach(key => assert.ok(before.includes(pageSeo.find(key).url), key + ' not in the sitemap'));

    stubOverrides(keys.map(key => ({ pageKey: key, noindex: true })));
    const after = locs(await getSitemap());
    keys.forEach(key => assert.ok(!after.includes(pageSeo.find(key).url), key + ' still in the sitemap'));
    assert.strictEqual(after.length, before.length - keys.length);
});

test('sitemap: a failing override lookup keeps the last known overrides instead of dropping them', async () => {
    stubProperties();
    stubOverrides([{ pageKey: 'terms', noindex: true }]);
    assert.ok(!locs(await getSitemap()).includes(SITE + '/terms'));

    PageSeoModel.find = () => ({ lean: () => ({ exec: () => Promise.reject(new Error('db down')) }) });
    pageSeo.invalidate();
    const duringOutage = locs(await getSitemap());
    assert.ok(!duringOutage.includes(SITE + '/terms'), 'last known noindex must still apply');
    assert.ok(duringOutage.includes(SITE + '/about'), 'rest of the sitemap still served');
    assert.ok(duringOutage.includes(SITE + '/owners'), 'rest of the sitemap still served');
});

test('sitemap: with no override ever loaded, a failing lookup serves the full sitemap', async () => {
    stubProperties();
    stubOverrides([]);
    await getSitemap();
    PageSeoModel.find = () => ({ lean: () => ({ exec: () => Promise.reject(new Error('db down')) }) });
    pageSeo.invalidate();
    assert.ok(locs(await getSitemap()).includes(SITE + '/terms'));
});

// ---------------------------------------------------------------------------
// buildPropertiesSeo (/for-rent/:slug)
// ---------------------------------------------------------------------------

function seoFor(query, landing, override) {
    const req = { query: Object.assign({}, query), _forRentPage: landing };
    return propertiesRouter.buildPropertiesSeo(req, [], override);
}

test('for-rent: no override leaves the computed title, description and canonical', () => {
    const landing = forRentPages.resolve('downtown-vancouver');
    assert.ok(landing, 'downtown-vancouver must stay a for-rent page for this test');
    const seo = seoFor(landing.query, landing, null);
    assert.strictEqual(seo.seoTitle, landing.seoTitle);
    assert.strictEqual(seo.seoDescription, landing.seoDescription);
    assert.strictEqual(seo.canonicalUrl, landing.url);
    assert.strictEqual(seo.seoRobots, undefined);
});

test('for-rent: an override replaces each field; blank fields keep the computed text', () => {
    const landing = forRentPages.resolve('all');
    const seo = seoFor(landing.query, landing, {
        title: 'Edited', description: '', canonical: SITE + '/for-rent/elsewhere', noindex: true
    });
    assert.strictEqual(seo.seoTitle, 'Edited');
    assert.strictEqual(seo.seoDescription, landing.seoDescription);
    assert.strictEqual(seo.canonicalUrl, SITE + '/for-rent/elsewhere');
    assert.strictEqual(seo.seoRobots, 'noindex');
    assert.strictEqual(seo.structuredData[0].name, 'Edited');
    assert.strictEqual(seo.structuredData[0].url, SITE + '/for-rent/elsewhere');
});

test('for-rent: page 2 keeps the " - Page N" suffix on an overridden title', () => {
    const landing = forRentPages.resolve('all');
    const seo = seoFor(Object.assign({ page: '2' }, landing.query), landing, { title: 'Edited' });
    assert.strictEqual(seo.seoTitle, 'Edited - Page 2');
});

test('/properties?... (no landing page of its own) ignores overrides', () => {
    const query = { city: 'Nowhere', status: 'Available' };
    const withOverride = seoFor(query, undefined, { title: 'Edited', noindex: true, canonical: SITE + '/x' });
    const without = seoFor(query, undefined, null);
    assert.deepStrictEqual(withOverride.seoTitle, without.seoTitle);
    assert.strictEqual(withOverride.canonicalUrl, without.canonicalUrl);
    assert.strictEqual(withOverride.seoRobots, undefined);
});

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

async function withAdminApp(fn) {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', '..', 'views'));
    app.use(express.json());
    // Stand-in for passport: the role comes from a header, none means logged out.
    app.use((req, res, next) => {
        const role = req.get('x-test-role');
        if (role) req.user = { role, email: 'admin@test.local' };
        next();
    });
    app.use('/VLR-admin/page-seo', require('../../routes/pageSeoAdmin'));
    app.get('/VLR-admin/login', (req, res) => res.send('login'));

    const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
    const base = 'http://127.0.0.1:' + server.address().port + '/VLR-admin/page-seo';
    try {
        await fn(base);
    } finally {
        server.close();
    }
}

const SUPER = { 'x-test-role': 'SuperAdmin' };
const JSON_HEADERS = Object.assign({ 'content-type': 'application/json' }, SUPER);

test('admin: logged-out requests go to the login page and nothing is read or written', async () => {
    let touched = false;
    PageSeoModel.find = () => { touched = true; return { lean: () => ({ exec: () => Promise.resolve([]) }) }; };
    PageSeoModel.findOneAndUpdate = () => { touched = true; };
    await withAdminApp(async base => {
        for (const [method, url] of [['GET', '/'], ['GET', '/api/all'], ['POST', '/api/save']]) {
            const res = await fetch(base + url, {
                method, redirect: 'manual',
                headers: { 'content-type': 'application/json' },
                body: method === 'POST' ? JSON.stringify({ key: 'contact', title: 'x' }) : undefined
            });
            assert.strictEqual(res.status, 302, method + ' ' + url);
            assert.ok(res.headers.get('location').endsWith('/VLR-admin/login'));
        }
    });
    assert.strictEqual(touched, false);
});

test('admin: super admin gets the page and the list of every registered page', async () => {
    stubOverrides([{ pageKey: 'contact', title: 'Edited', noindex: true, updatedBy: 'a@b.c', updatedAt: new Date() }]);
    await withAdminApp(async base => {
        const page = await fetch(base + '/', { headers: SUPER });
        assert.strictEqual(page.status, 200);
        assert.ok((await page.text()).includes('Page SEO'));

        const res = await fetch(base + '/api/all', { headers: SUPER });
        const { data } = await res.json();
        assert.strictEqual(data.length, pageSeo.all().length);
        const contact = data.find(p => p.key === 'contact');
        assert.strictEqual(contact.override.title, 'Edited');
        assert.strictEqual(contact.override.noindex, true);
        assert.ok(contact.defaults.title && contact.defaults.description);
        assert.strictEqual(data.find(p => p.key === 'terms').override, null);
    });
});

test('admin: writes must be JSON, valid, and for a known page', async () => {
    const writes = [];
    PageSeoModel.findOneAndUpdate = (filter, update) => ({
        lean: () => ({ exec: () => { writes.push(update.$set); return Promise.resolve(update.$set); } })
    });
    PageSeoModel.deleteOne = filter => ({ exec: () => { writes.push(['delete', filter]); return Promise.resolve({}); } });

    await withAdminApp(async base => {
        const post = (body, headers) => fetch(base + '/api/save', {
            method: 'POST', headers: headers || JSON_HEADERS, body: typeof body === 'string' ? body : JSON.stringify(body)
        });

        const form = await post('key=contact&title=x', Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, SUPER));
        assert.strictEqual(form.status, 415);

        const unknown = await post({ key: 'nope', title: 'x' });
        assert.strictEqual(unknown.status, 404);

        const bad = await post({ key: 'contact', canonical: 'https://evil.example/x' });
        assert.strictEqual(bad.status, 400);
        assert.ok((await bad.json()).errors.canonical);

        const tooLong = await post({ key: 'contact', title: 'x'.repeat(301) });
        assert.strictEqual(tooLong.status, 400);
        assert.strictEqual(writes.length, 0, 'nothing may be written for rejected requests');

        const ok = await post({ key: 'contact', title: ' New title ', robots: 'noindex' });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(writes[0].title, 'New title');
        assert.strictEqual(writes[0].noindex, true);
        assert.strictEqual(writes[0].updatedBy, 'admin@test.local');

        const cleared = await post({ key: 'contact', title: '', description: '  ', canonical: '', robots: 'index' });
        assert.strictEqual((await cleared.json()).cleared, true);
        assert.deepStrictEqual(writes[1], ['delete', { pageKey: 'contact' }]);
    });
});

test('admin: a database failure on save is a 500 response, not a crash', async () => {
    PageSeoModel.findOneAndUpdate = () => ({ lean: () => ({ exec: () => Promise.reject(new Error('db down')) }) });
    await withAdminApp(async base => {
        const res = await fetch(base + '/api/save', {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ key: 'contact', title: 'x' })
        });
        assert.strictEqual(res.status, 500);
    });
});
