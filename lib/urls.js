/**
 * Canonical URL builders.
 *
 * These are the single source of truth for the public URL of a listing and of a
 * /properties search page. routes/listing.js, routes/properties.js and
 * lib/sitemap.js all build their URLs here so a sitemap entry can never drift
 * out of sync with the <link rel="canonical"> the page itself renders.
 */

var SITE_ORIGIN = "https://www.vancouverluxuryrentals.com";

function stripWrappingQuotes(value) {
    if (typeof value !== "string") return value || "";
    return value.replace(/^"+|"+$/g, "").trim();
}

function toSlug(value) {
    return (value || "")
        .toString()
        .trim()
        .replace(/,?\s|#/g, "-")
        .replace(/-+/g, "-");
}

/**
 * Slug portion of a listing URL, e.g. "1234-Main-St-property-id-42".
 *
 * Note the slug is NOT normalised beyond collapsing repeated dashes: an address
 * like "#401 - 1819 Pendrell Street" legitimately yields a leading dash
 * ("-401-1819-Pendrell-Street"). That is the canonical form. Anything comparing
 * a request against the canonical URL must use this exact function — a
 * comparison that strips leading dashes would disagree with the canonical it
 * redirects to and loop forever.
 */
function buildListingSlug(property) {
    property = property || {};
    return toSlug(stripWrappingQuotes(property.address || "")) +
        "-property-id-" + property.propertyId;
}

/**
 * Path of a property's listing page, e.g. "/listing/1234-Main-St-property-id-42".
 * The trailing "-property-id-<id>" segment is what routes/listing.js parses back out.
 */
function buildListingPath(property) {
    return "/listing/" + buildListingSlug(property);
}

function buildListingUrl(property) {
    return SITE_ORIGIN + buildListingPath(property);
}

/**
 * Path of a /properties search page. Query keys are sorted and encoded so that
 * the same filter set always produces one single URL (?a=1&b=2, never ?b=2&a=1).
 * "page" is dropped: paginated results canonicalise to page 1.
 */
function buildPropertiesPath(query) {
    var params = Object.assign({}, query || {});
    delete params.page;
    var entries = Object.keys(params)
        .sort()
        .map(function (key) {
            return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
        });
    return "/properties" + (entries.length ? "?" + entries.join("&") : "");
}

function buildPropertiesUrl(query) {
    return SITE_ORIGIN + buildPropertiesPath(query);
}

module.exports = {
    SITE_ORIGIN: SITE_ORIGIN,
    stripWrappingQuotes: stripWrappingQuotes,
    toSlug: toSlug,
    buildListingSlug: buildListingSlug,
    buildListingPath: buildListingPath,
    buildListingUrl: buildListingUrl,
    buildPropertiesPath: buildPropertiesPath,
    buildPropertiesUrl: buildPropertiesUrl
};
