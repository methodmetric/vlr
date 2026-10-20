var express = require('express');
var router = express.Router();
var connect = require('../lib/mongo');
var AWS = require('aws-sdk');
var MeetTeamModel = require('../models/meetTeam');
var config = require('config-lite')(__dirname);
var seoMiddleware = require('../middlewares/seo');
var sitemap = require('../lib/sitemap');
var teamPhotos = require('../lib/teamPhotos');
var log = require('log4js').getLogger('routes');
var resourcePages = require('../lib/resourcePages');
var forRentPages = require('../lib/forRentPages');
var propertiesRouter = require('./properties');

AWS.config.loadFromPath('config/aws.json');
var s3 = new AWS.S3({
  params: {
    Bucket: config.bucket,
  },
});

router.get('/', 
  seoMiddleware({ pageType: 'homepage' }),
  function (req, res) {
    res.render('homepage.ejs');
  }
);

// Generated from the database on every cache miss — see lib/sitemap.js.
// express.static must not shadow this, so there is deliberately no
// public/sitemap.xml on disk.
router.get('/sitemap.xml', function (req, res) {
  sitemap.getSitemap(function (err, xml) {
    if (err) {
      return res.status(503).type('text/plain').send('Sitemap temporarily unavailable');
    }
    res.type('application/xml').send(xml);
  });
});

router.get('/about', function (req, res) {
  res.render('aboutUs.ejs');
});

router.get('/unsubscribe', function (req, res) {
  res.render('unsubscribe.ejs');
});

router.get('/email', function (req, res) {
  res.render('emailTemplate.ejs');
});

router.get('/about/profile', function (req, res) {
  res.render('profile.ejs');
});

router.get('/about/team', function (req, res) {
  // Select explicitly: the legacy `profile` Buffer must never reach the view.
  // Serialising it into the page is what inflated this page to 4.3 MB.
  MeetTeamModel
    .find({}, 'name role detail phone email profileImage')
    .lean()
    .exec(function (err, members) {
      if (err) {
        log.error('Could not load team members', err);
        members = [];
      }
      members.forEach(function (member) {
        member.photoUrl = teamPhotos.publicUrlFor(member);
      });
      res.render('team.ejs', {
        data: members,
      });
    });
});

router.get('/about/career', function (req, res) {
  res.render('career.ejs');
});

router.get('/about/testimonials', function (req, res) {
  res.render('testimonials.ejs');
});

router.get('/contact', function (req, res) {
  res.render('contact.ejs');
});

router.get('/terms', function (req, res) {
  res.render('terms.ejs');
});

router.get('/property-management-vancouver', 
  seoMiddleware({ 
    pageType: 'area',
    dataExtractor: function(req) { return { city: 'Vancouver' }; }
  }),
  function (req, res) {
    res.render('landing.ejs');
  }
);

router.get('/property-management-north-vancouver', 
  seoMiddleware({ 
    pageType: 'area',
    dataExtractor: function(req) { return { city: 'North Vancouver' }; }
  }),
  function (req, res) {
    res.render('northVancouver.ejs');
  }
);

router.get('/west-vancouver-property-management', 
  seoMiddleware({ 
    pageType: 'area',
    dataExtractor: function(req) { return { city: 'West Vancouver', canonicalPath: '/west-vancouver-property-management' }; }
  }),
  function (req, res) {
    res.render('westVancouver.ejs');
  }
);

router.get('/property-management-burnaby', 
  seoMiddleware({ 
    pageType: 'area',
    dataExtractor: function(req) { return { city: 'Burnaby' }; }
  }),
  function (req, res) {
    res.render('burnaby.ejs');
  }
);

router.get('/property-management-coquitlam', 
  seoMiddleware({ 
    pageType: 'area',
    dataExtractor: function(req) { return { city: 'Coquitlam' }; }
  }),
  function (req, res) {
    res.render('coquitlam.ejs');
  }
);

router.get('/richmond-property-management', 
  seoMiddleware({ 
    pageType: 'area',
    dataExtractor: function(req) { return { city: 'Richmond', canonicalPath: '/richmond-property-management' }; }
  }),
  function (req, res) {
    res.render('richmond.ejs');
  }
);

router.get('/resources/:slug', function (req, res, next) {
  var page = resourcePages[req.params.slug];
  if (!page) return next();
  res.render('ai-content.ejs', {
    page: page,
    seoTitle: page.heading + " | Vancouver Luxury Rentals",
    seoDescription: page.intro,
    canonicalUrl: "https://www.vancouverluxuryrentals.com/resources/" + req.params.slug,
    structuredData: [{
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": page.faqs.map(function (item) {
        return {
          "@type": "Question",
          "name": item.q,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": item.a
          }
        };
      })
    }]
  });
});

/**
 * Clean landing-page URLs for the rental search: /for-rent/downtown-vancouver
 * instead of /properties?city=Downtown%20Vancouver&status=Available.
 *
 * The slug is translated back into the query object that routes/properties.js
 * already understands, so the page below is the same search results page, from
 * the same middleware and the same view — only the URL differs. The /properties
 * query form keeps working exactly as before; it just canonicalises here.
 *
 * An unrecognised slug falls through to the 404 handler rather than rendering
 * an empty result set under a URL that looks legitimate.
 */
function resolveForRentPage(req, res, next) {
  var page = forRentPages.resolve(req.params.slug);
  // next('route'), not next(): skip the search handlers below entirely so the
  // request carries on to the 404 handler.
  if (!page) return next('route');

  // Path filters win over anything in the query string, so /for-rent/richmond
  // can never be talked into showing another city. Other params (page=2) pass
  // through untouched.
  Object.keys(page.query).forEach(function (key) {
    req.query[key] = page.query[key];
  });
  req._forRentPage = page;
  next();
}

router.get('/for-rent', function (req, res) {
  res.redirect(301, '/for-rent/all');
});

router.get(
  '/for-rent/:slug',
  resolveForRentPage,
  propertiesRouter.getProperties,
  propertiesRouter.renderPropertiesPage
);

router.get('/property-management/', function (req, res) {
  res.render('property-management.ejs');
});

router.get('/property-management/thank-you', function (req, res) {
  res.render('property-management-thank-you.ejs');
});

router.use('/tenants', require('./tenants'));
router.use('/owners', require('./owners'));
router.use('/user', require('./user'));
router.use('/properties', require('./properties'));
router.use('/VLR-admin/images', require('./images'));
router.use('/VLR-admin', require('./admin'));
router.use('/listing', require('./listing'));

router.get('*', function (req, res) {
  res.render('404.ejs');
});

module.exports = router;
