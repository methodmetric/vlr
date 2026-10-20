var express = require('express');
var router = express.Router();
var mailer = require('../lib/mailer');
var PropertyModel = require('../models/properties');
var ScheduleModel = require('../models/schedule');
var UserModel = require("../models/users");
var AdminModel = require('../models/admins').Admin;
var AWS = require('aws-sdk');
var config = require('config-lite')(__dirname);

var s3 = new AWS.S3({
    params: {
        Bucket: config.bucket
    }
});
var urls = require('../lib/urls');
var SITE_ORIGIN = urls.SITE_ORIGIN;
var stripWrappingQuotes = urls.stripWrappingQuotes;

/**
 * The listing path actually requested, decoded and with the /listing mount
 * prefix restored. Used only to compare against the canonical path.
 *
 * req.path keeps a trailing slash (req.params.id drops it), so comparing on
 * req.path catches trailing-slash duplicates as well as malformed slugs.
 */
function requestedListingPath(req) {
    var raw = "/listing" + req.path;
    try {
        return decodeURIComponent(raw);
    } catch (e) {
        // Malformed percent-encoding: compare the raw form rather than throwing.
        return raw;
    }
}

/**
 * Send any non-canonical spelling of a listing URL to the canonical one.
 *
 * The address portion of the path is decorative — getListing only reads the
 * trailing "-property-id-N" — so one listing was reachable at unlimited URLs,
 * and internal links generated a double-dash variant that Google indexed and
 * then discarded as a duplicate. A 301 consolidates them.
 *
 * The comparison uses lib/urls.buildListingPath, the same function that builds
 * the canonical tag, the JSON-LD and the sitemap. It must stay that way: a
 * comparison that normalises differently (for example stripping the leading
 * dash of "-401-1819-Pendrell-Street") would redirect forever.
 *
 * Returns true when a redirect was issued and the caller should stop.
 */
function redirectToCanonical(req, res) {
    var canonicalPath = urls.buildListingPath(req.property);
    if (requestedListingPath(req) === canonicalPath) return false;
    res.redirect(301, canonicalPath);
    return true;
}

function toAbsoluteImageUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    return SITE_ORIGIN + (url[0] === "/" ? url : "/" + url);
}

function buildListingSeo(property, imgLinks) {
    var cleanedAddress = stripWrappingQuotes(property.address || "");
    var city = property.city || "";
    var province = property.province || "";
    var country = property.country || "CA";
    var displayAddress = [cleanedAddress, city, province].filter(Boolean).join(", ");
    var detailText = stripWrappingQuotes(property.details || "");
    var normalizedType = (property.typeOfProperty || "Residence").toLowerCase();
    var schemaType = normalizedType.indexOf("apartment") >= 0 || normalizedType.indexOf("condo") >= 0 ? "Apartment" : "Residence";
    var canonicalUrl = urls.buildListingUrl(property);
    var primaryImage = toAbsoluteImageUrl((imgLinks && imgLinks[0]) || "");
    var descriptionBase = detailText || (property.bedrooms + " bedroom " + (property.typeOfProperty || "property") + " in " + city + ".");
    var seoDescription = (descriptionBase + " Monthly rent: $" + (property.rent || "N/A") + ".").slice(0, 300);
    var faqItems = [
        {
            question: "Is the property furnished?",
            answer: property.furnished ? ("Furnished status: " + property.furnished + ".") : "Please contact our leasing team to confirm furnishing status."
        },
        {
            question: "What is the minimum lease term?",
            answer: property.minLeaseTerm ? ("The minimum lease term is " + property.minLeaseTerm + " months.") : "Please contact our leasing team for lease term details."
        },
        {
            question: "Are pets allowed?",
            answer: property.allowPets ? ("Pet policy: " + property.allowPets + ".") : "Please contact our leasing team to confirm pet policy."
        }
    ];
    var highlights = [];
    if (property.bedrooms) highlights.push(property.bedrooms + " bedroom");
    if (property.bathrooms) highlights.push(property.bathrooms + " bathroom");
    if (property.squareFeet) highlights.push(property.squareFeet + " sqft");
    if (property.furnished) highlights.push("Furnished: " + property.furnished);
    if (property.minLeaseTerm) highlights.push("Minimum lease: " + property.minLeaseTerm + " months");
    if (city) highlights.push("Located in " + city);

    var listingSchema = {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        name: [property.typeOfProperty || "Property", "in", city].join(" ").trim(),
        description: seoDescription,
        url: canonicalUrl,
        datePosted: property.createdAt || undefined,
        offers: {
            "@type": "Offer",
            price: property.rent || undefined,
            priceCurrency: "CAD",
            availability: property.status === "Available" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
        },
        itemOffered: {
            "@type": schemaType,
            name: displayAddress || property.name || "Rental property",
            address: {
                "@type": "PostalAddress",
                streetAddress: cleanedAddress || undefined,
                addressLocality: city || undefined,
                addressRegion: province || undefined,
                postalCode: property.postalCode || undefined,
                addressCountry: country || undefined
            },
            numberOfRooms: property.bedrooms || undefined,
            numberOfBathroomsTotal: property.bathrooms || undefined,
            floorSize: property.squareFeet ? { "@type": "QuantitativeValue", value: property.squareFeet, unitText: "sqft" } : undefined,
            geo: (property.geoLat && property.geoLng) ? {
                "@type": "GeoCoordinates",
                latitude: property.geoLat,
                longitude: property.geoLng
            } : undefined
        },
        image: primaryImage || undefined
    };

    var faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map(function (item) {
            return {
                "@type": "Question",
                name: item.question,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: item.answer
                }
            };
        })
    };

    return {
        seoTitle: "Vancouver Rental Listing | " + (displayAddress || "Property Details"),
        seoDescription: seoDescription,
        canonicalUrl: canonicalUrl,
        ogImage: primaryImage || SITE_ORIGIN + "/new-img/favicon.ico",
        listingFaqItems: faqItems,
        listingHighlights: highlights,
        structuredData: [listingSchema, faqSchema]
    };
}

router.post('/scheduler/new', function (req, res) {
    var content = JSON.parse(req.body.formString);
    var property = req.body.property;
    var info = {
        fullName: content.fullName,
        email: content.email,
        filename: "schedule",
        propertyId: property.propertyId
    };
    var newSchedule = new ScheduleModel({
        fullName: content.fullName,
        email: content.email,
        phone: content.phone,
        scheduleDate: content.datetime,
        numberOfAdults: content.adults,
        numberOfChildren: content.children,
        message: content.message,
        propertyId: property.propertyId,
        propertyAgent: property.agent,
        forwarded: false,
        numberOfOccupants: content.numberOfOccupants,
        numberOfPets: content.numberOfPets,
        creditCard: content.creditCard,
        startDate: content.startDate,
        preferredDate: content.preferredDate,
        propertyStatus: content.propertyStatus,
    });
    newSchedule.save((err, response) => {
        if (err) {
            return res.status(500).send(err);
        }
        mailer.sendScheduleMail(info, "schedule");
        AdminModel.findOne({
            name: property.agent
        }, (function (err, agent) {
            if (err) 
                return res.status(200).json({});
            if (agent){
                var infoToAgent = {
                    propertyId: property.propertyId,
                    tenantName: content.fullName,
                    tenantEmail: content.email,
                    tenantPhone: content.phone,
                    agentName: property.agent,
                    agentEmail: agent.email,
                    comment: content.message,
                    propertyStatus: content.propertyStatus,
                    numberOfOccupants: content.numberOfOccupants,
                    numberOfPets: content.numberOfPets,
                    creditCard: content.creditCard,
                    startDate: content.startDate.slice(0, 10),
                    filename: 'tenantEnquiries'
                };
                mailer.sendTenantEnquiriesMail(infoToAgent);
            }
            res.status(200).json({});
        }));
    });
});

router.getListing = function (req,res,next){
    var proertyIdIndex = req.params.id.indexOf('-property-id-');
    if (proertyIdIndex === -1) return next(new Error("The property does not exist."));
    else {
        var propertyId = req.params.id.substring(proertyIdIndex + 13) // 13 is the length of -property-id-
        PropertyModel.findOne({
            propertyId: propertyId,
            status: { $ne: 'Not list property' }
        }, (function (err, property) {
            if (err) throw err;
            if (!property){
                return next(new Error("The property with Id " + propertyId + " does not exist."));
            } 
            var size = property.imgs.length;
            var key;
            var urls = [];
            for (var i = 0; i < size; i++) {
                var imgKey = property.propertyId + '/' + property.imgs[i];
                url = 'http://' + config.bucket + '.s3-website-us-west-2.amazonaws.com/' + imgKey.replace(/ /g, "+");
                // s3.getSignedUrl('getObject', {
                //     Bucket: config.bucket,
                //     Key: imgKey
                // });
                urls.push(url);
            }
            req.property = property;
            req.urls = urls;
            next();
        }));
    }
}

router.get('/:id', router.getListing, function (req, res) {
    // GET only: POST /listing/:id is a form submission and must not be redirected.
    if (redirectToCanonical(req, res)) return;
    var seoData = buildListingSeo(req.property, req.urls);
    // Apply per-property SEO overrides stored in the admin panel
    var property = req.property;
    if (property.seoTitle) seoData.seoTitle = property.seoTitle;
    if (property.seoDescription) seoData.seoDescription = property.seoDescription;
    if (property.seoCanonical) seoData.canonicalUrl = property.seoCanonical;
    // Robots tag: pass it through so the template can render it
    var seoRobots = (property.seoRobots && property.seoRobots !== 'index') ? property.seoRobots : null;
    if (req.session && req.session.user){
        var conditions = { email: req.session.user };
        var update = { $inc: { visitCount: 1 } };
        UserModel.update(conditions, update, function (err) {
            if (err) {
                log.error(err);
            }
            res.render('listing.ejs', {
                data: req.property,
                imgLinks: req.urls,
                seoTitle: seoData.seoTitle,
                seoDescription: seoData.seoDescription,
                canonicalUrl: seoData.canonicalUrl,
                ogImage: seoData.ogImage,
                seoRobots: seoRobots,
                listingFaqItems: seoData.listingFaqItems,
                listingHighlights: seoData.listingHighlights,
                structuredData: seoData.structuredData
            });
        });
    }
    else{
        res.render('listing.ejs', {
            data: req.property,
            imgLinks: req.urls,
            seoTitle: seoData.seoTitle,
            seoDescription: seoData.seoDescription,
            canonicalUrl: seoData.canonicalUrl,
            ogImage: seoData.ogImage,
            seoRobots: seoRobots,
            listingFaqItems: seoData.listingFaqItems,
            listingHighlights: seoData.listingHighlights,
            structuredData: seoData.structuredData
        });
    }
});

router.post('/:id', router.getListing, function (req, res) {
    var seoData = buildListingSeo(req.property, req.urls);
    // Apply per-property SEO overrides
    var property = req.property;
    if (property.seoTitle) seoData.seoTitle = property.seoTitle;
    if (property.seoDescription) seoData.seoDescription = property.seoDescription;
    if (property.seoCanonical) seoData.canonicalUrl = property.seoCanonical;
    var seoRobots = (property.seoRobots && property.seoRobots !== 'index') ? property.seoRobots : null;
    if (req.session && req.session.user){
        var conditions = { email: req.session.user };
        var update = { $inc: { visitCount: 1 } };
        UserModel.update(conditions, update, function (err) {
            if (err) {
                log.error(err);
            }
            res.render('listing.ejs', {
                data: req.property,
                imgLinks: req.urls,
                seoTitle: seoData.seoTitle,
                seoDescription: seoData.seoDescription,
                canonicalUrl: seoData.canonicalUrl,
                ogImage: seoData.ogImage,
                seoRobots: seoRobots,
                listingFaqItems: seoData.listingFaqItems,
                listingHighlights: seoData.listingHighlights,
                structuredData: seoData.structuredData
            });
        });
    }
    else{
        res.render('listing.ejs', {
            data: req.property,
            imgLinks: req.urls,
            seoTitle: seoData.seoTitle,
            seoDescription: seoData.seoDescription,
            canonicalUrl: seoData.canonicalUrl,
            ogImage: seoData.ogImage,
            seoRobots: seoRobots,
            listingFaqItems: seoData.listingFaqItems,
            listingHighlights: seoData.listingHighlights,
            structuredData: seoData.structuredData
        });
    }
});
module.exports = router;
