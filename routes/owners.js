var express = require('express');
var router = express.Router();
var mailer = require('../lib/mailer');
var LeadsModel = require('../models/ownerLeads');
var log = require('log4js').getLogger("owners");
var AdminController = require('../middlewares/admin');
var seoMiddleware = require('../middlewares/seo');
var pageSeo = require('../lib/pageSeo');

router.get('/', 
  seoMiddleware({ pageType: 'owners' }),
  pageSeo.middleware('owners'),
  function(req, res) {
    res.render('owners.ejs');
  }
);

router.get('/list-properties', pageSeo.middleware('owner-list-properties'), function(req, res) {
  res.render('list-properties.ejs');
});

router.get('/rental-assessment', function(req, res) {
  res.render('rental-assessment.ejs');
});

router.get('/tenant-placement', function(req, res) {
  res.render('tenant-placement.ejs');
});

// The general-audience owners page. Kept separate from property-management.ejs,
// which is the Google Ads landing page (paid traffic only, at /property-management/)
// and carries a promotional offer not meant for organic visitors.
router.get('/property-management', pageSeo.middleware('owner-property-management'), function(req, res) {
  res.render('owners-property-management.ejs');
});

router.get('/FAQ', pageSeo.middleware('owner-faq'), function(req, res) {
  var faqItems = [
    {
      question: "Why VLR is Right for Your Property",
      answer: "Established in 2009, Vancouver Luxury Rentals (VLR) is a premier property management company specializing in managing high-end rental properties. Maximum Exposure: we provide highly targeted online marketing and advertising for your property. Trustworthy Tenants: we go through a rigorous tenant screening process and leverage our extensive network to find the best candidate. Full Transparency: you will receive monthly and annual owner statements, as well as move-in, move-out, and periodic inspection reports. Multilingual Services: all our services are available in English, Mandarin, and Farsi."
    },
    {
      question: "How Experienced Is Your Team?",
      answer: "Vancouver Luxury Rentals is a licensed property management company. Our team of property managers and leasing agents has been in the industry since 2009, with over 50 years of combined experience."
    },
    {
      question: "What Services Do You Provide?",
      answer: "Vancouver Luxury Rentals provides full property management and tenant placement services for owners of both furnished and unfurnished properties: marketing and advertising your property, screening and placing qualified tenants, lease administration, rent collection, move-in/move-out and periodic inspections, maintenance coordination, emergency contact support, trust account handling, owner financial statements, and compliance with the BC Residential Tenancy Act."
    },
    {
      question: "How Do You Market My Property?",
      answer: "We advertise your property across multiple platforms — realtor.ca, our own website (which garners over 20,000 hits a month), Craigslist, REW, Rentals.ca, and other listing sites — and regularly renew those ads to keep them near the top of search results."
    },
    {
      question: "How Will You Screen Prospective Tenants?",
      answer: "Every applicant goes through a rigorous vetting process. Our property managers pre-screen each applicant, collect a full electronic application, financial disclosures, and run personal and corporate credit checks, background tenant history, references, and employment verification. We share everything we find with you as the owner, and the final decision on who to approve is always yours."
    },
    {
      question: "Who Will Handle Maintenance And Emergencies?",
      answer: "VLR coordinates all maintenance and repairs through our network of trusted contractors. Our office hours are not 24/7, so tenants are given emergency contact information (for example, for plumbing issues) so urgent problems can be addressed right away, even outside office hours. For houses, we also ask owners to share any preferred trades who are already familiar with the property or have worked on it before, so repairs stay consistent with its history. Property inspections also help us catch small issues before they become costly ones."
    },
    {
      question: "How And When Will I Receive My Rental Income?",
      answer: "Rent is collected and held in a trust account, then disbursed to you via EFT within 10 business days of the first of the month, along with an owner statement showing income, expenses, and any deductions."
    },
    {
      question: "What If I'm A Non-Resident Owner?",
      answer: "If you're a non-resident of Canada, the Canada Revenue Agency requires us to withhold 25% of the gross rental income collected from your property and remit it to the CRA on your behalf. We handle these NR remittances and related filings for a flat annual fee of $250 + GST. If your residency status changes at any point, please let us know in writing right away. Tax rules around non-resident ownership can be complex, so we'd recommend speaking with a tax professional for advice specific to your situation — VLR isn't able to take responsibility for CRA penalties or fines related to your property."
    },
    {
      question: "What Is The Cost Of Your Services?",
      answer: "Tenant Placement Service Only: we charge ½ month's rent or 8% of the rental contract value, whichever is greater. Full Property Management Services: monthly management fee of 6% for unfurnished properties (minimum $125/month) and 8% for furnished properties (minimum $150/month), plus a one-time leasing commission equal to the greater of 5% of the gross rental income or half a month's rent.",
      callToAction: "Call us at 604.899.0220 or reach out through the website and one of our property managers can confirm exact pricing for your property."
    }
  ];

  var faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map(function (item) {
      return {
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer
        }
      };
    })
  };

  res.render('owner-FAQ.ejs', {
    faqItems: faqItems,
    // title, description and canonical come from res.locals: lib/pageSeo.js
    structuredData: [faqSchema]
  });
});

router.post('/list-properties/new', function (req, res) {
    var content = JSON.parse(req.body.formString);
    var info = {
        fullName: content.fullName,
        email: content.email,
        filename: "listYourProperty"
    };
    var ownerInfo = {
      ownerName: content.fullName,
      ownerPhone: content.phone,
      ownerEmail: content.email,
      condition: content.propertyCondition,
      type: content.type,
      bed: content.bedroom,
      bath: content.bathroom,
      location: content.city,
      comment: content.comment,
      leaseTerm: content.leaseTerm,
      date: content.date.slice(0, content.date.indexOf("T")),
      agentName: "VLR Admin",
      filename: "ownerLead"
    }
    var newLeads = new LeadsModel({
        fullName: content.fullName,
        email: content.email,
        phone: content.phone,
        location: content.city,
        type: content.type,
        bedroom: content.bedroom,
        bathroom: content.bathroom,
        propertyCondition: content.propertyCondition,
        leaseTerm: content.leaseTerm,
        postDate: content.date,
        comment: content.comment,
        forwarded: false,
        formSource: content.formSource || 'list-properties',
        leadSource: content.leadSource || 'Organic',
        utmSource: content.utmSource || '',
        utmMedium: content.utmMedium || '',
        utmCampaign: content.utmCampaign || ''
    });
    newLeads.save((err, response) => {
        if (err) {
            log.error(err);
            return res.status(500).send(err);
        }
        log.info(info.fullName + ' has request a new owner lead.');
        mailer.sendListPropertyMail(info, "listYourProperty");
        mailer.sendOwnerLeadMail(ownerInfo);
        res.status(200);
        res.send();
    });
});

module.exports = router;
