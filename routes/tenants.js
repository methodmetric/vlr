var express = require('express');
var router = express.Router();
var ShowRoomModel = require('../models/showRoom');

router.get('/', function (req, res) {
  res.render('tenants.ejs');
});

router.get('/services', function (req, res) {
  res.render('tenant-services.ejs');
});

router.get('/forms', function (req, res) {
  ShowRoomModel.findOne({
    category: 'uploadForms'
  }, function (err, uploadForms) {
    if (err) {
      log.error(err);
      return err;
    }
    res.render('tenant-forms.ejs', {
      data: uploadForms
    });
  });
});

router.get('/maintenance-request', function (req, res) {
  res.render('maintenance-request.ejs');
});

router.get('/FAQ', function (req, res) {
  ShowRoomModel.findOne({
    category: 'faq'
  }, function (err, faqData) {
    var faqItems = [];
    if (!err && faqData && faqData.value && faqData.value.length) {
      for (var i = 0; i < faqData.value.length / 2; i++) {
        faqItems.push({
          question: faqData.value[2 * i],
          answer: faqData.value[2 * i + 1]
        });
      }
    }

    var fallbackFaqItems = [
      {
        question: "What is the process of renting a property through Vancouver Luxury Realty?",
        answer: "Browse listings, schedule viewings, complete the online application, and finalize tenancy agreement and deposits once approved."
      },
      {
        question: "What is your minimum rental period?",
        answer: "Most unfurnished properties require a 12 month term. Some furnished rentals allow shorter terms depending on the listing."
      },
      {
        question: "Do I need tenant insurance?",
        answer: "Yes. Tenant insurance is required to protect personal contents and liability."
      }
    ];

    var finalFaqItems = faqItems.length ? faqItems : fallbackFaqItems;
    var faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": finalFaqItems.map(function (item) {
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

    res.render('tenant-FAQ.ejs', {
      faqItems: finalFaqItems,
      seoTitle: "How To Rent A Property in Vancouver BC | VLR",
      seoDescription: "Find answers to common tenant questions about Vancouver rental listings, lease terms, fees, and viewing process.",
      canonicalUrl: "https://www.vancouverluxuryrentals.com/tenants/FAQ",
      structuredData: [faqSchema]
    });
  });
});

module.exports = router;