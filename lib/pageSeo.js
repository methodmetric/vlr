/**
 * Editable SEO for the site's key pages (admin: /VLR-admin/page-seo).
 *
 * Four fields per page, mirroring the per-property SEO form: title, meta
 * description, indexing (index / noindex) and canonical URL. A blank field keeps
 * the page's own text, so a page with no override renders exactly as it did
 * before this module existed.
 *
 * PAGES is the single registry of editable pages. Each entry carries the page's
 * default title/description/canonical; the routes apply those defaults through
 * middleware(), so the admin screen shows the same values the live page uses.
 * `applyDefaults: false` marks pages whose defaults are produced elsewhere (the
 * home route runs middlewares/seo.js; /for-rent/* is built by
 * buildPropertiesSeo()); their entry only documents what that code yields, and
 * just the override is applied. Owners also runs middlewares/seo.js but applies
 * its registry defaults on top, because its title and description used to be set
 * by browser-side code.
 *
 * Overrides live in MongoDB (models/pageSeo.js) and are cached per worker for
 * CACHE_TTL_MS, so an edit reaches every worker within about a minute. A failed
 * lookup never throws: the last known overrides (or none) are used instead.
 *
 * Property listings are deliberately not handled here; they keep their own
 * per-property SEO (routes/listing.js).
 */

var log = require('log4js').getLogger('pageSeo');
var PageSeoModel = require('../models/pageSeo');
var forRentPages = require('./forRentPages');
var seoHelpers = require('./seoHelpers');
var urls = require('./urls');

var SITE_ORIGIN = urls.SITE_ORIGIN;
var SITE_HOST = SITE_ORIGIN.replace(/^https:\/\//, '');

var CACHE_TTL_MS = 60 * 1000;
var RETRY_AFTER_ERROR_MS = 10 * 1000;
var MAX_FIELD_LENGTH = 300;

// What views/header.ejs shows when a page passes nothing. Pages that rely on it
// get it through the registry instead, so the admin screen can show it.
var DEFAULT_TITLE = 'Residential Property Management Services in Vancouver: VLR';
var DEFAULT_DESCRIPTION = 'Vancouver Luxury Rentals is the premier specialist in Residential Property Management. Search our selection of condos, lofts, and luxury houses in Vancouver’s most exclusive neighbourhoods. | Luxury Rental management vancouver, Property management company Vancouver, Rental Management company Vancouver, Apartment rental company Vancouver, Best property management companies vancouver, Property Manager Vancouver';

function page(key, label, group, path, defaults, applyDefaults) {
    return {
        key: key,
        label: label,
        group: group,
        path: path,
        url: SITE_ORIGIN + path,
        applyDefaults: applyDefaults !== false,
        defaults: function () {
            var value = typeof defaults === 'function' ? defaults() : defaults;
            return {
                title: value.title || '',
                description: value.description || '',
                canonical: value.canonical || ''
            };
        }
    };
}

var PAGES = [
    page('home', 'Home', 'Main pages', '/', function () {
        var seo = seoHelpers.generateSeoMetadata({ pageType: 'homepage' });
        return { title: seo.seoTitle, description: seo.seoDescription, canonical: seo.canonicalUrl };
    }, false),
    page('about', 'About us', 'About', '/about',
        { title: 'Vancouver Luxury Rentals: About us', description: DEFAULT_DESCRIPTION }),
    page('about-profile', 'About: Profile', 'About', '/about/profile', {
        title: 'Vancouver Luxury Rentals: About us',
        description: 'Vancouver Luxury Rentals (VLR) is a licensed British Columbia Real Estate corporation that specializes in property management with luxury accommodation rentals in all of the Greater Vancouver area.'
    }),
    page('about-team', 'About: Team', 'About', '/about/team', {
        title: 'Vancouver Luxury Rentals: Meet VLR Team',
        description: 'Our elite team of Luxury Rental Specialists is available 7 days a week for all your renting needs. VLR offers premium services that allow our properties to stand out above the rest.'
    }),
    page('about-career', 'About: Careers', 'About', '/about/career', {
        title: 'Vancouver Luxury Rentals: Career',
        description: 'If you enjoy working with luxury products and services and have an excellent understanding of the needs and wants of VIP clients, then we invite you to submit your application today.'
    }),
    page('about-testimonials', 'About: Testimonials', 'About', '/about/testimonials', {
        title: 'Vancouver Luxury Rentals: Testimonials',
        description: 'Read testimonials from satisfied landlords and tenants who have worked with Vancouver Luxury Rentals for their property management needs.'
    }),
    page('contact', 'Contact', 'Main pages', '/contact', {
        title: 'Vancouver Luxury Rentals: Contact Us',
        description: 'Contact Vancouver Luxury Rentals for property management services, rental inquiries, or to speak with our expert team. We\'re here to help with all your real estate needs.'
    }),
    page('terms', 'Terms', 'Main pages', '/terms',
        { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }),
    page('owners', 'Owners', 'Owners and tenants', '/owners', function () {
        var seo = seoHelpers.generateSeoMetadata({ pageType: 'owners' });
        return {
            title: 'Vancouver Luxury Rentals: Services for Property Owners',
            description: 'Vancouver Luxury Rental (VLR) specializes in luxury property rentals and offers luxury value assessment, tenants credit checks, property advertising, collection of all rental revenue and more.',
            canonical: seo.canonicalUrl
        };
    }),
    page('owner-list-properties', 'Owners: List a property', 'Owners and tenants', '/owners/list-properties', {
        title: 'Vancouver Luxury Rentals: List A Property',
        description: 'If you are ready to list your luxury property with VLR, or just looking for more information, please call us to discuss our property management services, process and fees.'
    }),
    // The organic owners page; not the Google Ads landing page at /property-management/.
    page('owner-property-management', 'Owners: Property management', 'Owners and tenants', '/owners/property-management', {
        title: 'Vancouver Luxury Rentals: Luxury Property Management',
        description: 'At Vancouver Luxury Rentals, we specialize in managing residential properties offering premium amenities. Call us today to discuss our property management services.'
    }),
    page('tenant-services', 'Tenants: Services', 'Owners and tenants', '/tenants/services', {
        title: 'Vancouver Luxury Rentals: Services for Tenants',
        description: 'Vancouver Luxury Rentals (VLR) specializes in luxury property rentals, both short and long term furnished and unfurnished. If you are looking for luxury property rentals, please review our properties.'
    }),
    page('tenant-forms', 'Tenants: Forms', 'Owners and tenants', '/tenants/forms', {
        title: 'Move Out | Cleaning Checklist | Ending a Tenancy in BC | Vancouver Luxury Rentals',
        description: DEFAULT_DESCRIPTION
    }),
    page('owner-faq', 'Owner FAQ', 'Owners and tenants', '/owners/FAQ', {
        title: 'Property Owner FAQ | Vancouver Luxury Rentals',
        description: 'Answers to common property owner questions about VLR\'s property management services, tenant screening, marketing, rental income, fees, and non-resident owners.',
        canonical: SITE_ORIGIN + '/owners/FAQ'
    }),
    page('tenant-faq', 'Tenant FAQ', 'Owners and tenants', '/tenants/FAQ', {
        title: 'How To Rent A Property in Vancouver BC | VLR',
        description: 'Find answers to common tenant questions about Vancouver rental listings, lease terms, fees, and viewing process.',
        canonical: SITE_ORIGIN + '/tenants/FAQ'
    }),
    page('property-management', 'Property Management (Google Ads landing)', 'Property management', '/property-management/', {
        title: 'Professional Property Management Services in Metro Vancouver | VLR',
        description: 'Vancouver Luxury Rentals is the premier specialist in Residential Property Management in Metro Vancouver.',
        canonical: SITE_ORIGIN + '/property-management/'
    }),
    page('city-vancouver', 'City: Vancouver', 'City pages', '/property-management-vancouver', {
        title: 'VLR - Property Management in Vancouver',
        description: 'Property Management Services in Vancouver & Lower Mainland for over 15 Years. We speak English and Chinese. Call for free consultation 604.899.0220'
    }),
    page('city-north-vancouver', 'City: North Vancouver', 'City pages', '/property-management-north-vancouver', {
        title: 'Property Management in North Vancouver | VLR',
        description: ' Property Management Services in North Vancouver by VLR.  Our professionals have extensive North Vancouver property management experience. Call for free consultation. '
    }),
    page('city-west-vancouver', 'City: West Vancouver', 'City pages', '/west-vancouver-property-management', {
        title: 'West Vancouver Property Management Company | VLR',
        description: 'West Vancouver Property Management Company VLR.  We are Residential Property Management Company with over 15 years of experience. Specializes in rental property management in West Vancouver & lower mainland.'
    }),
    page('city-burnaby', 'City: Burnaby', 'City pages', '/property-management-burnaby', {
        title: 'VLR - Property Management Services in Burnaby, BC',
        description: 'Property Management Services in Burnaby, BC. We find the right tenants, protect your real estate investment and manage your property effectively.'
    }),
    page('city-coquitlam', 'City: Coquitlam', 'City pages', '/property-management-coquitlam', {
        title: ' Coquitlam Property Management Services by VLR',
        description: 'Coquitlam Property Management Services provided by VLR. Vancouver Luxury Rentals is the premier specialist in property management services in Coquitlam, BC and Lower Mainland. '
    }),
    page('city-richmond', 'City: Richmond', 'City pages', '/richmond-property-management', {
        title: 'Richmond Property Management Services | VLR',
        description: 'Richmond Property Management services provided by Vancouver Luxury Rentals (VLR). We lease and manage condos & luxury houses in Richmond, BC.'
    })
];

forRentPages.all().forEach(function (landing) {
    PAGES.push({
        key: 'for-rent/' + landing.slug,
        label: landing.heading,
        group: 'For rent search pages',
        path: landing.path,
        url: landing.url,
        applyDefaults: false, // routes/properties.js builds these
        defaults: function () {
            return { title: landing.seoTitle, description: landing.seoDescription, canonical: landing.url };
        }
    });
});

// No prototype: find('constructor') and the like must not match.
var BY_KEY = Object.create(null);
PAGES.forEach(function (entry) { BY_KEY[entry.key] = entry; });

function find(key) {
    return BY_KEY[key] || null;
}

function all() {
    return PAGES.slice();
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

/**
 * Validate and normalise what the admin form sent. Blank (or whitespace-only)
 * means "use the page's own text". Returns { value, errors }, where `value` is
 * what to store and `errors` maps a field to a message the form shows inline.
 */
function normalizeInput(body) {
    body = body || {};
    var errors = {};
    var value = {
        title: String(body.title == null ? '' : body.title).trim(),
        description: String(body.description == null ? '' : body.description).trim(),
        canonical: String(body.canonical == null ? '' : body.canonical).trim(),
        noindex: body.robots === 'noindex' || body.noindex === true
    };

    ['title', 'description', 'canonical'].forEach(function (field) {
        if (value[field].length > MAX_FIELD_LENGTH) {
            errors[field] = 'Must be ' + MAX_FIELD_LENGTH + ' characters or fewer.';
        }
    });

    if (value.canonical && !errors.canonical && !isOwnSiteUrl(value.canonical)) {
        errors.canonical = 'Must be a full https://' + SITE_HOST + '/... address.';
    }

    return { value: value, errors: errors };
}

function isOwnSiteUrl(candidate) {
    var parsed;
    try {
        parsed = new URL(candidate);
    } catch (e) {
        return false;
    }
    return parsed.protocol === 'https:' && parsed.host === SITE_HOST;
}

function isBlank(value) {
    return !value.title && !value.description && !value.canonical && !value.noindex;
}

// ---------------------------------------------------------------------------
// Override cache
// ---------------------------------------------------------------------------

var cache = { map: {}, loadedAt: 0, ttl: CACHE_TTL_MS, pending: null, generation: 0 };

function byPageKey(docs) {
    var map = {};
    docs.forEach(function (doc) { map[doc.pageKey] = doc; });
    return map;
}

/**
 * Every override, keyed by page key. Never rejects: on a database error it logs,
 * keeps whatever it last loaded (nothing, on a fresh worker) and tries again
 * shortly, so pages simply render with their own text.
 */
function loadOverrides() {
    if (Date.now() - cache.loadedAt < cache.ttl) return Promise.resolve(cache.map);
    if (cache.pending) return cache.pending;

    // A save calls invalidate() while a load may be in flight. That load read the
    // database before the save, so once the generation has moved on its result
    // must be dropped, not cached as fresh.
    var generation = cache.generation;
    var pending = PageSeoModel.find({}).lean().exec()
        .then(function (docs) {
            if (generation !== cache.generation) return;
            cache.map = byPageKey(docs);
            cache.ttl = CACHE_TTL_MS;
        })
        .catch(function (err) {
            log.error('Could not load page SEO overrides; using the last known set', err);
            if (generation === cache.generation) cache.ttl = RETRY_AFTER_ERROR_MS;
        })
        .then(function () {
            if (generation === cache.generation) cache.loadedAt = Date.now();
            if (cache.pending === pending) cache.pending = null;
            return cache.map;
        });
    cache.pending = pending;
    return pending;
}

/** Make this worker re-read the overrides on the next request (after a save). */
function invalidate() {
    cache.generation++;
    cache.loadedAt = 0;
    cache.pending = null;
}

// ---------------------------------------------------------------------------
// Applying overrides
// ---------------------------------------------------------------------------

/**
 * An override (or a page's defaults) as view locals: only the fields that are
 * set. The one place that maps these fields onto the locals the views read, used
 * by localsFor() and by routes/properties.js for the /for-rent pages.
 */
function overrideLocals(override) {
    var locals = {};
    if (!override) return locals;
    if (override.title) locals.seoTitle = override.title;
    if (override.description) locals.seoDescription = override.description;
    if (override.canonical) locals.canonicalUrl = override.canonical;
    if (override.noindex) locals.seoRobots = 'noindex';
    return locals;
}

/**
 * The view locals for one page: its defaults (when the registry owns them) with
 * any non-blank override on top. Only fields that have a value are returned, so
 * a page keeps whatever else its route already put in res.locals.
 */
function localsFor(entry, override) {
    // Defaults have no noindex, so the same mapping serves both.
    var defaults = entry && entry.applyDefaults ? entry.defaults() : null;
    return Object.assign(overrideLocals(defaults), overrideLocals(override));
}

/**
 * Express middleware: put the page's SEO into res.locals before it renders.
 * `keyOf` is a page key, or a function of the request for dynamic pages.
 * Routes that hand SEO values straight to res.render must not pass the ones this
 * sets, because render locals win over res.locals.
 */
function middleware(keyOf) {
    return function (req, res, next) {
        var key = typeof keyOf === 'function' ? keyOf(req) : keyOf;
        var entry = find(key);
        if (!entry) return next();

        loadOverrides().then(function (overrides) {
            var override = overrides[key] || null;
            res.locals.pageSeoOverride = override;
            Object.assign(res.locals, localsFor(entry, override));
            next();
        }).catch(function (err) {
            log.error('Page SEO middleware failed for ' + key, err);
            next();
        });
    };
}

/** For /for-rent/:slug, where the page is resolved first (req._forRentPage). */
function forRentMiddleware() {
    return middleware(function (req) {
        return req._forRentPage ? 'for-rent/' + req._forRentPage.slug : null;
    });
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

function trimSlash(url) {
    return String(url).replace(/\/+$/, '');
}

/**
 * Absolute URLs that must not be advertised in the sitemap: pages set to
 * noindex, and pages whose canonical now points somewhere else. Same rules the
 * sitemap already applies to listings.
 */
function hiddenUrls(overrides) {
    var hidden = {};
    PAGES.forEach(function (entry) {
        var override = overrides[entry.key];
        if (!override) return;
        var elsewhere = override.canonical && trimSlash(override.canonical) !== trimSlash(entry.url);
        if (override.noindex || elsewhere) hidden[entry.url] = true;
    });
    return hidden;
}

function loadHiddenUrls() {
    return loadOverrides().then(hiddenUrls);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** Every page with its defaults and current override, for the admin screen. */
function listForAdmin() {
    // Read through the database rather than the cache: the admin must see what
    // is stored, not what this worker cached up to a minute ago.
    return PageSeoModel.find({}).lean().exec().then(function (docs) {
        var map = byPageKey(docs);
        return PAGES.map(function (entry) {
            var override = map[entry.key];
            return {
                key: entry.key,
                label: entry.label,
                group: entry.group,
                path: entry.path,
                defaults: entry.defaults(),
                override: override ? {
                    title: override.title || '',
                    description: override.description || '',
                    canonical: override.canonical || '',
                    noindex: !!override.noindex,
                    updatedBy: override.updatedBy || '',
                    updatedAt: override.updatedAt || null
                } : null
            };
        });
    });
}

/**
 * Store (or, when every field is blank, remove) a page's override.
 * Resolves { errors } for invalid input, { cleared: true } or { saved: doc }.
 */
function saveOverride(key, body, updatedBy) {
    if (!find(key)) return Promise.resolve({ unknownPage: true });

    var result = normalizeInput(body);
    if (Object.keys(result.errors).length) return Promise.resolve({ errors: result.errors });

    var done;
    if (isBlank(result.value)) {
        done = PageSeoModel.deleteOne({ pageKey: key }).exec().then(function () {
            return { cleared: true };
        });
    } else {
        var update = Object.assign({}, result.value, {
            updatedBy: updatedBy || '',
            updatedAt: new Date()
        });
        done = PageSeoModel.findOneAndUpdate(
            { pageKey: key },
            { $set: update },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean().exec().then(function (doc) {
            return { saved: doc };
        });
    }
    return done.then(function (outcome) {
        invalidate();
        return outcome;
    });
}

module.exports = {
    SITE_HOST: SITE_HOST,
    MAX_FIELD_LENGTH: MAX_FIELD_LENGTH,
    find: find,
    all: all,
    normalizeInput: normalizeInput,
    localsFor: localsFor,
    overrideLocals: overrideLocals,
    middleware: middleware,
    forRentMiddleware: forRentMiddleware,
    hiddenUrls: hiddenUrls,
    loadHiddenUrls: loadHiddenUrls,
    loadOverrides: loadOverrides,
    invalidate: invalidate,
    listForAdmin: listForAdmin,
    saveOverride: saveOverride
};
