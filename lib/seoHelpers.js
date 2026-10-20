/**
 * SEO Helpers Library
 * Generates unique, contextually relevant SEO metadata for each page type
 * Follows the existing buildPropertiesSeo() pattern from routes/properties.js
 */

var SITE_ORIGIN = 'https://www.vancouverluxuryrentals.com';

/**
 * Convert text to URL-friendly slug
 * @param {string} value - Text to convert
 * @returns {string} URL-friendly slug
 */
function toSlug(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/,?\s|#/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Sanitize text for meta description
 * Removes HTML tags, entities, and normalizes whitespace
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeForMeta(text) {
  if (!text) return '';
  
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&[^;]+;/g, ' ') // Remove HTML entities
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII characters
    .trim();
}

/**
 * Enforce meta description length constraints (120-158 characters)
 * @param {string} description - Meta description
 * @returns {string} Description within length constraints
 */
function enforceMetaLength(description) {
  if (!description) return '';
  
  var sanitized = sanitizeForMeta(description);
  
  if (sanitized.length < 120) {
    console.warn('Meta description too short (' + sanitized.length + ' chars): ' + sanitized.substring(0, 50) + '...');
  }
  
  if (sanitized.length > 158) {
    return sanitized.substring(0, 155) + '...';
  }
  
  return sanitized;
}

/**
 * Generate SEO metadata for homepage
 * @param {Object} data - Page data
 * @returns {Object} SEO metadata
 */
function generateHomepageSeo(data) {
  return {
    seoTitle: 'VancouverLuxuryRentals: Search Luxury Furnished and Unfurnished Rental Listings in Vancouver',
    seoDescription: enforceMetaLength(
      'Browse luxury rental properties in Vancouver. Professional property management services for owners and premium rentals for tenants. BCREA-licensed agents.'
    ),
    canonicalUrl: SITE_ORIGIN + '/',
    ogImage: SITE_ORIGIN + '/og-images/vlr-homepage.jpg',
    structuredData: []
  };
}

/**
 * Generate SEO metadata for owner landing page
 * @param {Object} data - Page data
 * @returns {Object} SEO metadata
 */
function generateOwnersSeo(data) {
  return {
    seoTitle: 'Professional Property Management Services in Vancouver | VLR',
    seoDescription: enforceMetaLength(
      'BCREA-licensed property management with tenant screening, rent collection, and 24/7 support. Maximize your rental income with Vancouver Luxury Rentals.'
    ),
    canonicalUrl: SITE_ORIGIN + '/owners',
    ogImage: SITE_ORIGIN + '/og-images/vlr-owners.jpg',
    structuredData: []
  };
}

/**
 * Generate SEO metadata for area/neighbourhood pages
 *
 * Not every area page lives at /property-management-<city>: some use the reversed
 * form (/west-vancouver-property-management). Those routes pass an explicit
 * canonicalPath, otherwise the page would advertise a canonical URL that 404s and
 * effectively de-index itself.
 *
 * @param {Object} data - Page data with city property, optional canonicalPath
 * @returns {Object} SEO metadata
 */
function generateAreaSeo(data) {
  var city = data.city || 'Vancouver';
  var citySlug = toSlug(city);
  var canonicalPath = data.canonicalPath || '/property-management-' + citySlug;
  
  return {
    seoTitle: city + ' Property Management & Rental Listings | VLR',
    seoDescription: enforceMetaLength(
      'Professional property management in ' + city + '. Browse available rentals and learn about the local rental market. BCREA-licensed agents with local expertise.'
    ),
    canonicalUrl: SITE_ORIGIN + canonicalPath,
    ogImage: SITE_ORIGIN + '/og-images/areas/' + citySlug + '.jpg',
    structuredData: []
  };
}

/**
 * Generate SEO metadata for property listing pages
 * @param {Object} data - Page data with property object
 * @returns {Object} SEO metadata
 */
function generatePropertySeo(data) {
  var prop = data.property || {};
  var address = prop.address || 'Property';
  var city = prop.city || 'Vancouver';
  var beds = prop.bedrooms || '0';
  var baths = prop.bathrooms || '0';
  var sqft = prop.squareFeet || 'N/A';
  var rent = prop.rent ? '$' + prop.rent : 'Contact for pricing';
  var propType = prop.typeOfProperty || 'Property';
  
  var title = address + ' - ' + beds + ' Bed ' + baths + ' Bath in ' + city + ' | VLR';
  var description = propType + ' for rent in ' + city + '. ' + beds + ' bedrooms, ' + baths + ' bathrooms, ' + sqft + ' sqft. ' + rent + '/month.';
  
  var propertySlug = toSlug(address) + '-property-id-' + (prop.propertyId || '');
  
  return {
    seoTitle: title,
    seoDescription: enforceMetaLength(description),
    canonicalUrl: SITE_ORIGIN + '/listing/' + propertySlug,
    ogImage: prop.coverImg 
      ? 'https://s3-us-west-2.amazonaws.com/vancouverluxuryrental.com/' + prop.propertyId + '/' + prop.coverImg
      : SITE_ORIGIN + '/og-images/vlr-default-property.jpg',
    structuredData: []
  };
}

/**
 * Generate SEO metadata for blog posts
 * @param {Object} data - Page data with post object
 * @returns {Object} SEO metadata
 */
function generateBlogSeo(data) {
  var post = data.post || {};
  var title = post.title || 'Blog Post';
  var excerpt = post.excerpt || post.content || '';
  var slug = post.slug || toSlug(title);
  
  // Use first 150 characters of content if no excerpt
  var description = excerpt.substring(0, 150);
  
  return {
    seoTitle: title + ' | VLR Blog',
    seoDescription: enforceMetaLength(description),
    canonicalUrl: SITE_ORIGIN + '/blog/' + slug,
    ogImage: post.featuredImage || SITE_ORIGIN + '/og-images/vlr-blog-default.jpg',
    structuredData: []
  };
}

/**
 * Page type handlers mapping
 */
var metaGenerators = {
  homepage: generateHomepageSeo,
  owners: generateOwnersSeo,
  area: generateAreaSeo,
  property: generatePropertySeo,
  blog: generateBlogSeo
};

/**
 * Generate SEO metadata for a given page context
 * Main entry point for SEO metadata generation
 * 
 * @param {Object} context - Page context object
 * @param {string} context.pageType - Type of page (homepage, owners, area, property, blog)
 * @param {Object} context.data - Page-specific data
 * @returns {Object} SEO metadata object with seoTitle, seoDescription, canonicalUrl, ogImage, structuredData
 */
function generateSeoMetadata(context) {
  if (!context || !context.pageType) {
    console.warn('generateSeoMetadata called without valid context');
    return {
      seoTitle: 'Vancouver Luxury Rentals',
      seoDescription: enforceMetaLength('Professional property management and luxury rentals in Vancouver'),
      canonicalUrl: SITE_ORIGIN,
      ogImage: SITE_ORIGIN + '/og-images/vlr-default.jpg',
      structuredData: []
    };
  }
  
  var generator = metaGenerators[context.pageType];
  
  if (!generator) {
    console.warn('Unknown page type: ' + context.pageType);
    return {
      seoTitle: 'Vancouver Luxury Rentals',
      seoDescription: enforceMetaLength('Professional property management and luxury rentals in Vancouver'),
      canonicalUrl: SITE_ORIGIN,
      ogImage: SITE_ORIGIN + '/og-images/vlr-default.jpg',
      structuredData: []
    };
  }
  
  return generator(context.data || {});
}

// Export functions
module.exports = {
  generateSeoMetadata: generateSeoMetadata,
  toSlug: toSlug,
  sanitizeForMeta: sanitizeForMeta,
  enforceMetaLength: enforceMetaLength
};
