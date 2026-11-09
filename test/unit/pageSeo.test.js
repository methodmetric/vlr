// Unit tests for lib/pageSeo.js — admin-editable SEO for the key pages.
// No database: the model's query methods are replaced per test.
//     node --test test/unit/pageSeo.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
require('../../lib/mongooseCompat');
const PageSeoModel = require('../../models/pageSeo');
const pageSeo = require('../../lib/pageSeo');

const SITE = 'https://www.vancouverluxuryrentals.com';

function stubFind(impl) {
    PageSeoModel.find = () => ({ lean: () => ({ exec: impl }) });
}

test('registry: unique keys, and every page that applies defaults has a title and description', () => {
    const pages = pageSeo.all();
    const keys = pages.map(p => p.key);
    assert.strictEqual(new Set(keys).size, keys.length);
    assert.ok(keys.includes('home') && keys.includes('for-rent/all') && keys.includes('city-richmond'));
    pages.forEach(p => {
        const d = p.defaults();
        assert.ok(d.title && d.description, p.key + ' needs a default title and description');
    });
});

test('registry: keys inherited from Object.prototype are not pages', async () => {
    ['constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach(key =>
        assert.strictEqual(pageSeo.find(key), null, key));

    let writes = 0;
    PageSeoModel.findOneAndUpdate = () => { writes++; return { lean: () => ({ exec: () => Promise.resolve({}) }) }; };
    const outcome = await pageSeo.saveOverride('constructor', { title: 'x' }, 'a@b.c');
    assert.ok(outcome.unknownPage);
    assert.strictEqual(writes, 0);
});

test('registry: every /for-rent page is registered under for-rent/<slug>', () => {
    const forRentPages = require('../../lib/forRentPages');
    forRentPages.all().forEach(landing => {
        const entry = pageSeo.find('for-rent/' + landing.slug);
        assert.ok(entry, landing.slug);
        assert.strictEqual(entry.url, landing.url);
        assert.strictEqual(entry.applyDefaults, false); // buildPropertiesSeo() owns these defaults
    });
});

test('forRentMiddleware: reads the page from req._forRentPage and exposes its override', async () => {
    stubFind(() => Promise.resolve([{ pageKey: 'for-rent/all', title: 'Edited', noindex: true }]));
    pageSeo.invalidate();
    const res = { locals: {} };
    await new Promise(resolve => pageSeo.forRentMiddleware()({ _forRentPage: { slug: 'all' } }, res, resolve));
    assert.strictEqual(res.locals.pageSeoOverride.title, 'Edited');
    assert.strictEqual(res.locals.seoTitle, 'Edited');
    assert.strictEqual(res.locals.seoRobots, 'noindex');

    const other = { locals: {} };
    await new Promise(resolve => pageSeo.forRentMiddleware()({}, other, resolve)); // not a for-rent request
    assert.deepStrictEqual(other.locals, {});
});

test('registry: every key a route asks for exists', () => {
    const dir = path.join(__dirname, '..', '..', 'routes');
    const used = [];
    fs.readdirSync(dir).forEach(file => {
        const src = fs.readFileSync(path.join(dir, file), 'utf8');
        const re = /pageSeo\.middleware\('([^']+)'\)/g;
        let m;
        while ((m = re.exec(src))) used.push(m[1]);
    });
    assert.ok(used.length >= 15);
    used.forEach(key => assert.ok(pageSeo.find(key), 'unknown page key ' + key));
});

test('localsFor: a page with no override keeps its defaults; blank fields keep them too', () => {
    const entry = pageSeo.find('contact');
    const defaults = entry.defaults();
    assert.deepStrictEqual(pageSeo.localsFor(entry, null),
        { seoTitle: defaults.title, seoDescription: defaults.description });
    assert.deepStrictEqual(pageSeo.localsFor(entry, { title: '', description: '', canonical: '', noindex: false }),
        { seoTitle: defaults.title, seoDescription: defaults.description });
});

test('localsFor: overrides win field by field, noindex sets robots', () => {
    const entry = pageSeo.find('contact');
    const locals = pageSeo.localsFor(entry, {
        title: 'New title', description: '', canonical: SITE + '/contact', noindex: true
    });
    assert.strictEqual(locals.seoTitle, 'New title');
    assert.strictEqual(locals.seoDescription, entry.defaults().description);
    assert.strictEqual(locals.canonicalUrl, SITE + '/contact');
    assert.strictEqual(locals.seoRobots, 'noindex');
});

test('overrideLocals: only the fields that were set, nothing for a missing or blank override', () => {
    assert.deepStrictEqual(pageSeo.overrideLocals(null), {});
    assert.deepStrictEqual(pageSeo.overrideLocals({ title: '', description: '', canonical: '', noindex: false }), {});
    assert.deepStrictEqual(pageSeo.overrideLocals({ title: 'T', noindex: true }),
        { seoTitle: 'T', seoRobots: 'noindex' });
    assert.deepStrictEqual(pageSeo.overrideLocals({ description: 'D', canonical: SITE + '/x' }),
        { seoDescription: 'D', canonicalUrl: SITE + '/x' });
});

test('localsFor: pages whose defaults come from elsewhere only get the override', () => {
    const home = pageSeo.find('home');
    assert.deepStrictEqual(pageSeo.localsFor(home, null), {});
    assert.deepStrictEqual(pageSeo.localsFor(home, { title: 'T' }), { seoTitle: 'T' });
});

test('normalizeInput: trims, treats whitespace as blank, reads the indexing radio', () => {
    const { value, errors } = pageSeo.normalizeInput({ title: '  Hi  ', description: '   ', canonical: '', robots: 'noindex' });
    assert.deepStrictEqual(errors, {});
    assert.deepStrictEqual(value, { title: 'Hi', description: '', canonical: '', noindex: true });
    assert.strictEqual(pageSeo.normalizeInput({ robots: 'index' }).value.noindex, false);
});

test('normalizeInput: caps field length', () => {
    const { errors } = pageSeo.normalizeInput({ title: 'x'.repeat(301), description: 'y'.repeat(301) });
    assert.ok(errors.title && errors.description);
    assert.deepStrictEqual(pageSeo.normalizeInput({ title: 'x'.repeat(300) }).errors, {});
});

test('normalizeInput: canonical must be an https URL on the site host', () => {
    const ok = u => Object.keys(pageSeo.normalizeInput({ canonical: u }).errors).length === 0;
    assert.ok(ok(SITE + '/about'));
    assert.ok(ok(SITE + '/'));
    assert.ok(!ok('http://www.vancouverluxuryrentals.com/about'));
    assert.ok(!ok('https://example.com/about'));
    assert.ok(!ok('https://www.vancouverluxuryrentals.com.evil.com/about'));
    assert.ok(!ok('/about'));
    assert.ok(!ok('javascript:alert(1)'));
});

test('hiddenUrls: noindex and canonical-elsewhere are hidden; same canonical is not', () => {
    const hidden = pageSeo.hiddenUrls({
        contact: { noindex: true },
        terms: { canonical: SITE + '/about' },
        about: { canonical: SITE + '/about/' }, // same page, trailing slash
        owners: { title: 'Only a title' },
        'for-rent/all': { noindex: true }
    });
    assert.ok(hidden[SITE + '/contact']);
    assert.ok(hidden[SITE + '/terms']);
    assert.ok(hidden[SITE + '/for-rent/all']);
    assert.ok(!hidden[SITE + '/about']);
    assert.ok(!hidden[SITE + '/owners']);
});

test('loadOverrides: a database error falls back to the last known set and never rejects', async () => {
    stubFind(() => Promise.resolve([{ pageKey: 'contact', title: 'Hello' }]));
    pageSeo.invalidate();
    assert.strictEqual((await pageSeo.loadOverrides()).contact.title, 'Hello');

    stubFind(() => Promise.reject(new Error('db down')));
    pageSeo.invalidate();
    const map = await pageSeo.loadOverrides();
    assert.strictEqual(map.contact.title, 'Hello');
});

test('loadOverrides: a save during an in-flight load is not overwritten by that load', async () => {
    // The load starts, an admin saves and invalidates, then the load finishes with
    // what the database held before the save. The next request must see the save.
    let db = [{ pageKey: 'contact', title: 'OLD' }];
    let finishFirstLoad;
    PageSeoModel.find = () => ({ lean: () => ({ exec: () => {
        const snapshot = db.slice();
        return new Promise(resolve => { finishFirstLoad = () => resolve(snapshot); });
    } }) });
    pageSeo.invalidate();
    const inFlight = pageSeo.loadOverrides();

    db = [{ pageKey: 'contact', title: 'NEW' }];
    pageSeo.invalidate();
    finishFirstLoad();
    await inFlight;

    stubFind(() => Promise.resolve(db));
    assert.strictEqual((await pageSeo.loadOverrides()).contact.title, 'NEW');
});

test('loadOverrides: caches for the TTL, one query for concurrent callers', async () => {
    let calls = 0;
    stubFind(() => { calls++; return Promise.resolve([]); });
    pageSeo.invalidate();
    await Promise.all([pageSeo.loadOverrides(), pageSeo.loadOverrides()]);
    await pageSeo.loadOverrides();
    assert.strictEqual(calls, 1);
});

test('middleware: sets res.locals from defaults plus override, and carries on if lookup fails', async () => {
    stubFind(() => Promise.resolve([{ pageKey: 'contact', title: 'Edited', noindex: true }]));
    pageSeo.invalidate();
    const res = { locals: {} };
    await new Promise(resolve => pageSeo.middleware('contact')({}, res, resolve));
    assert.strictEqual(res.locals.seoTitle, 'Edited');
    assert.strictEqual(res.locals.seoRobots, 'noindex');
    assert.strictEqual(res.locals.seoDescription, pageSeo.find('contact').defaults().description);

    stubFind(() => Promise.reject(new Error('db down')));
    pageSeo.invalidate();
    const res2 = { locals: {} };
    await new Promise(resolve => pageSeo.middleware('terms')({}, res2, resolve));
    assert.strictEqual(res2.locals.seoTitle, pageSeo.find('terms').defaults().title);
});

test('saveOverride: rejects bad input, stores overrides, deletes when everything is blank', async () => {
    const calls = [];
    PageSeoModel.deleteOne = filter => ({ exec: () => { calls.push(['delete', filter]); return Promise.resolve({}); } });
    PageSeoModel.findOneAndUpdate = (filter, update, options) => ({
        lean: () => ({ exec: () => { calls.push(['upsert', filter, update, options]); return Promise.resolve(update.$set); } })
    });

    assert.ok((await pageSeo.saveOverride('nope', {}, 'a@b.c')).unknownPage);
    assert.ok((await pageSeo.saveOverride('contact', { canonical: 'https://evil.com' }, 'a@b.c')).errors.canonical);
    assert.strictEqual(calls.length, 0);

    const saved = await pageSeo.saveOverride('contact', { title: 'T', robots: 'noindex' }, 'a@b.c');
    assert.ok(saved.saved);
    assert.deepStrictEqual(calls[0][1], { pageKey: 'contact' });
    assert.strictEqual(calls[0][2].$set.title, 'T');
    assert.strictEqual(calls[0][2].$set.noindex, true);
    assert.strictEqual(calls[0][2].$set.updatedBy, 'a@b.c');
    assert.strictEqual(calls[0][3].upsert, true);

    const cleared = await pageSeo.saveOverride('contact', { title: ' ', robots: 'index' }, 'a@b.c');
    assert.ok(cleared.cleared);
    assert.deepStrictEqual(calls[1], ['delete', { pageKey: 'contact' }]);
});
