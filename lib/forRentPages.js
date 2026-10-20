/**
 * Static "For Rent" landing pages.
 *
 * The rental search has always lived at /properties?city=...&status=Available.
 * Query-string URLs are poor SEO targets, so every filter combination worth
 * indexing also gets a clean path here:
 *
 *   /for-rent/all
 *   /for-rent/downtown-vancouver
 *   /for-rent/north-vancouver-furnished
 *
 * Both forms render the exact same page from the same data - the clean path is
 * simply translated back into the query object routes/properties.js already
 * understands (see routes/index.js). The query form keeps working for
 * bookmarks, for the search form, and for any filter that has no landing page;
 * it just canonicalises to the clean URL when one exists, so the two forms are
 * never indexed as duplicates.
 *
 * This module is the single source of truth for that mapping: routes/index.js
 * serves from it, routes/properties.js canonicalises with it, and lib/sitemap.js
 * advertises it.
 */

var urls = require('./urls');

var SITE_ORIGIN = urls.SITE_ORIGIN;

/**
 * Cities that get their own landing page, in navigation order. `city` must match
 * the value stored on the property document exactly - it is what the query
 * filter is built from.
 *
 * "Vancouver" and "Downtown Vancouver" are both real, separately used values in
 * the data (older area pages link to the former, the main navigation to the
 * latter), so both get a page.
 */
var CITIES = [
    {
        slug: 'downtown-vancouver',
        city: 'Downtown Vancouver',
        title: 'Downtown Vancouver Condo For Rent Listings | Vancouver Luxury Rentals'
    },
    {
        slug: 'vancouver',
        city: 'Vancouver',
        title: 'Vancouver Apartment, Condo and House For Rent Listings | VLR'
    },
    {
        slug: 'vancouver-west-side',
        city: 'Vancouver West Side',
        title: 'Vancouver West Side, Dunbar, Point Grey, Arbutus Condo and House For Rent | VLR'
    },
    {
        slug: 'vancouver-east-side',
        city: 'Vancouver East Side',
        title: 'Vancouver East Side Condo and House For Rent | VLR'
    },
    {
        slug: 'ubc',
        city: 'UBC',
        title: 'UBC Condo and House For Rent | Vancouver Luxury Rentals'
    },
    {
        slug: 'west-vancouver',
        city: 'West Vancouver',
        title: 'West Vancouver Condo and House For Rent | VLR'
    },
    {
        slug: 'north-vancouver',
        city: 'North Vancouver',
        title: 'North Vancouver Apartment, Condo and House For Rent Listings | VLR'
    },
    {
        slug: 'richmond',
        city: 'Richmond',
        title: 'Richmond Apartment, Condo and House For Rent | VLR'
    },
    {
        slug: 'burnaby',
        city: 'Burnaby',
        title: 'Burnaby Apartment, Condo and House For Rent Listings | VLR'
    },
    {
        slug: 'coquitlam',
        city: 'Coquitlam',
        title: 'Coquitlam Apartment, Condo and House For Rent | VLR'
    },
    {
        slug: 'new-westminster',
        city: 'New Westminster',
        title: 'New Westminster Apartment, Townhouse, Condo and House For Rent | VLR'
    },
    {
        slug: 'port-moody',
        city: 'Port Moody',
        title: 'Port Moody Apartment, Condo and House For Rent | VLR'
    },
    {
        slug: 'surrey',
        city: 'Surrey',
        title: 'Surrey Luxury House For Rent | VLR'
    },
    {
        slug: 'white-rock',
        city: 'White Rock',
        title: 'White Rock Water Front Home For Rent | VLR'
    },
    {
        slug: 'langley',
        city: 'Langley',
        title: 'Langley Luxury Homes For Rent | VLR'
    },
    {
        slug: 'delta',
        city: 'Delta',
        title: 'Delta Luxury House For Rent | VLR'
    },
    {
        slug: 'tsawwassen',
        city: 'Tsawwassen',
        title: 'Tsawwassen Luxury House For Rent | VLR'
    }
];

// Every city page also exists furnished / unfurnished, e.g.
// /for-rent/north-vancouver-furnished.
var FURNISHINGS = [
    { suffix: '', furnished: null, label: '', adjective: '' },
    { suffix: '-furnished', furnished: 'Yes', label: 'Furnished ', adjective: 'furnished ' },
    { suffix: '-unfurnished', furnished: 'No', label: 'Unfurnished ', adjective: 'unfurnished ' }
];

var ALL_SLUG = 'all';
var ALL_TITLE = 'Vancouver Apartment, Condo and House For Rent Listings | VLR';

function encodeQuery(query) {
    return Object.keys(query).map(function (key) {
        return key + '=' + encodeURIComponent(query[key]);
    }).join('&');
}

function buildPage(base, furnishing) {
    var slug = base.slug + furnishing.suffix;
    var path = '/for-rent/' + slug;

    // Key order is what the browser address bar shows on the equivalent query
    // URL, and what the search sidebar reads back on this page.
    var query = {};
    if (base.city) query.city = base.city;
    query.status = 'Available';
    if (furnishing.furnished) query.furnished = furnishing.furnished;

    var place = base.city || 'Metro Vancouver';
    var heading = furnishing.label + place + ' Properties For Rent';
    var title = furnishing.furnished
        ? (furnishing.label + 'Rentals in ' + place + ' | Vancouver Luxury Rentals')
        : base.title;

    return {
        slug: slug,
        path: path,
        url: SITE_ORIGIN + path,
        city: base.city || null,
        furnished: furnishing.furnished,
        query: query,
        // Query string handed to the view so the client-side filter sidebar,
        // result count and pagination behave exactly as they do on /properties.
        filterQuery: encodeQuery(query),
        heading: heading,
        seoTitle: title,
        seoDescription: 'Browse available ' + furnishing.adjective + 'rental listings in ' +
            place + '. Compare price, bedrooms, furnished status and lease terms with ' +
            'Vancouver Luxury Rentals.'
    };
}

var PAGES = [];
var BY_SLUG = {};

[{ slug: ALL_SLUG, city: null, title: ALL_TITLE }].concat(CITIES).forEach(function (base) {
    FURNISHINGS.forEach(function (furnishing) {
        var page = buildPage(base, furnishing);
        PAGES.push(page);
        BY_SLUG[page.slug] = page;
    });
});

/** The page for a slug, or null when the slug is not one we publish. */
function resolve(slug) {
    if (!slug) return null;
    return BY_SLUG[String(slug).trim().toLowerCase()] || null;
}

/**
 * The landing page equivalent to a /properties query, or null when that filter
 * combination has no clean URL. Used to canonicalise the query form onto the
 * clean form; anything beyond city/status/furnished (a keyword, a bedroom count,
 * a price range) is deliberately left on its own query URL.
 */
function findByQuery(query) {
    if (!query) return null;
    var keys = Object.keys(query).filter(function (key) {
        return query[key] !== undefined && query[key] !== null && query[key] !== '';
    });
    var allowed = ['city', 'status', 'furnished'];
    var unexpected = keys.some(function (key) { return allowed.indexOf(key) === -1; });
    if (unexpected) return null;
    if (String(query.status) !== 'Available') return null;

    var city = query.city ? decodeURIComponent(String(query.city)).trim() : null;
    if (city && city.indexOf(',') !== -1) return null; // multi-city search: no landing page
    var furnished = query.furnished ? String(query.furnished) : null;

    for (var i = 0; i < PAGES.length; i++) {
        var page = PAGES[i];
        var sameCity = city
            ? (page.city && page.city.toLowerCase() === city.toLowerCase())
            : !page.city;
        if (sameCity && page.furnished === furnished) return page;
    }
    return null;
}

/** All landing pages, for the sitemap. */
function all() {
    return PAGES.slice();
}

/** The landing page for a city name as stored on a property, if it has one. */
function findByCity(city) {
    return findByQuery({ city: city, status: 'Available' });
}

module.exports = {
    resolve: resolve,
    findByQuery: findByQuery,
    findByCity: findByCity,
    all: all,
    cities: CITIES
};
