/**
 * SEO Middleware
 * Injects SEO metadata into res.locals for template access
 * Follows Express middleware pattern
 */

var generateSeoMetadata = require('../lib/seoHelpers').generateSeoMetadata;

/**
 * Create SEO middleware for a specific page type
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.pageType - Page type identifier (homepage, owners, area, property, blog)
 * @param {Function} options.dataExtractor - Optional function to extract data from req
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Simple usage for static pages
 * router.get('/owners', seoMiddleware({ pageType: 'owners' }), function(req, res) {
 *   res.render('owners.ejs');
 * });
 * 
 * @example
 * // Usage with data extraction for dynamic pages
 * router.get('/property-management-:city', 
 *   seoMiddleware({ 
 *     pageType: 'area',
 *     dataExtractor: function(req) { return { city: req.params.city }; }
 *   }), 
 *   function(req, res) {
 *     res.render('area.ejs');
 *   }
 * );
 */
function seoMiddleware(options) {
  // Validate options
  if (!options || !options.pageType) {
    throw new Error('seoMiddleware requires options.pageType');
  }
  
  return function(req, res, next) {
    try {
      // Build context for SEO metadata generation
      var context = {
        pageType: options.pageType,
        data: {}
      };
      
      // Extract data from request if dataExtractor provided
      if (options.dataExtractor && typeof options.dataExtractor === 'function') {
        context.data = options.dataExtractor(req);
      }
      
      // Generate SEO metadata
      var seoData = generateSeoMetadata(context);
      
      // Attach to res.locals for template access
      // Templates can now use: seoTitle, seoDescription, canonicalUrl, ogImage, structuredData
      res.locals.seoTitle = seoData.seoTitle;
      res.locals.seoDescription = seoData.seoDescription;
      res.locals.canonicalUrl = seoData.canonicalUrl;
      res.locals.ogImage = seoData.ogImage;
      res.locals.structuredData = seoData.structuredData;
      
      // Continue to next middleware/route handler
      next();
    } catch (error) {
      // Log error but don't break the request chain
      console.error('SEO middleware error:', error);
      
      // Set default values to prevent template errors
      res.locals.seoTitle = res.locals.seoTitle || 'Vancouver Luxury Rentals';
      res.locals.seoDescription = res.locals.seoDescription || 'Professional property management and luxury rentals in Vancouver';
      res.locals.canonicalUrl = res.locals.canonicalUrl || 'https://www.vancouverluxuryrentals.com';
      res.locals.ogImage = res.locals.ogImage || 'https://www.vancouverluxuryrentals.com/og-images/vlr-default.jpg';
      res.locals.structuredData = res.locals.structuredData || [];
      
      // Continue despite error
      next();
    }
  };
}

// Export middleware factory
module.exports = seoMiddleware;
