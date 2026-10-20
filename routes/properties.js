var express = require("express");
var router = express.Router();
var fs = require("fs");
var path = require("path");
var aqp = require("api-query-params");
var multer = require("multer");
var rimraf = require("rimraf");
var imageProcessing = require("../lib/imageProcessing");
var log = require("log4js").getLogger("properties");
var connect = require("../lib/mongo");
var PropertyModel = require("../models/properties");
var AttributeModel = require("../models/attributes");
var AdminModel = require("../models/admins").Admin;
var dbStatusModel = require("../models/dbStatus");
var PropertyFavoriteModel = require("../models/propertyFavorite");
var AdminController = require("../middlewares/admin");
var ShowRoomModel = require("../models/showRoom");
var moment = require("moment");
var default_img = "/img/1.Richmond-3Bedroom.png";
var upload = multer({
  dest: "uploads/",
});
var config = require("config-lite")(__dirname);
var sendAvailableForProperty = require("../lib/setAvailable")
  .sendAvailableForProperty;
var setPriceChangeForProperty = require("../lib/setAvailable")
  .setPriceChangeForProperty;
var urls = require("../lib/urls");
var forRentPages = require("../lib/forRentPages");
var SITE_ORIGIN = urls.SITE_ORIGIN;

var AWS = require("aws-sdk");
AWS.config.loadFromPath("config/aws.json");
var s3 = new AWS.S3({
  params: {
    Bucket: config.bucket,
  },
});

/**
 * Plain objects for the view and the JSON API, each carrying a precomputed
 * canonical `url` built by the same function as the JSON-LD and the sitemap.
 *
 * The front end must not rebuild the URL from the address: it used a rule that
 * did not collapse repeated dashes, so "1250 Comox Street, Unit# 602" produced
 * a double-dash link that Google indexed and then discarded as a duplicate.
 */
function toViewProperties(docs) {
  return (docs || []).map(function (doc) {
    var plain = doc && doc.toObject ? doc.toObject() : doc;
    plain.url = urls.buildListingPath(doc);
    return plain;
  });
}

function buildPropertiesSeo(req, properties) {
  var query = Object.assign({}, req.query || {});
  var page = query.page ? parseInt(query.page, 10) : 1;
  delete query.page;
  // A filter that has a /for-rent/... landing page is the same page under two
  // URLs. The clean path is the one we want indexed, so it is the canonical for
  // both forms — whichever of the two the visitor arrived on.
  var landing = req._forRentPage || forRentPages.findByQuery(query);
  var canonicalUrl = landing ? landing.url : urls.buildPropertiesUrl(query);
  var city = query.city ? decodeURIComponent(query.city).split(",")[0] : "";
  var status = query.status || "Available";
  var titleCity = city ? (" in " + city) : "";
  var seoTitle = "Vancouver Rental Listings" + titleCity + " | VLR";
  if (status && status.toLowerCase() === "rented") seoTitle = "Rented Property Listings" + titleCity + " | VLR";
  var seoDescription = "Browse " + (status || "Available") + " rental listings" + titleCity + ". Compare price, bedrooms, furnished status, and lease terms.";
  if (landing) {
    seoTitle = landing.seoTitle;
    seoDescription = landing.seoDescription;
  }
  var itemListSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: seoTitle,
    url: canonicalUrl,
    description: seoDescription,
    hasPart: (properties || []).slice(0, 24).map(function (property, index) {
      return {
        "@type": "ListItem",
        position: index + 1,
        url: urls.buildListingUrl(property),
        name: (property.typeOfProperty || "Property") + " in " + (property.city || "Vancouver")
      };
    })
  };

  return {
    seoTitle: page > 1 ? (seoTitle + " - Page " + page) : seoTitle,
    seoDescription: seoDescription,
    canonicalUrl: canonicalUrl,
    ogImage: SITE_ORIGIN + "/new-img/favicon.ico",
    structuredData: [itemListSchema]
  };
}

/**
 * Encoded URLs may use availableDate%3C%3D12 → key "availableDate<=12" with an
 * empty value. Normalize to the shape the rest of this file expects.
 */
function normalizeAvailabilityMonthQueryParam(req) {
  var q = req.query;
  if (!q || typeof q !== "object") return;
  var keys = Object.keys(q);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var m = k.match(/^availableDate<=(\d{1,2})$/);
    if (m && (q[k] === "" || q[k] == null)) {
      q["availableDate<"] = m[1];
      delete q[k];
    }
  }
}

function hasAvailabilityMonthInQuery(req) {
  var v = req.query && req.query["availableDate<"];
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/** Pagination / bookmarks may carry keys already rewritten to a moment string. */
function hasTransformedAvailabilityDateKeys(req) {
  var q = req.query;
  if (!q || typeof q !== "object") return false;
  return Object.keys(q).some(function (k) {
    if (/^availableDate<=/.test(k)) return true;
    if (k.indexOf("availableDate<") === 0 && k !== "availableDate<") return true;
    return false;
  });
}

function stripAvailabilityDateFromQuery(req) {
  var q = req.query;
  if (!q || typeof q !== "object") return;
  Object.keys(q).forEach(function (k) {
    if (k === "availableDate" || k.indexOf("availableDate") === 0) {
      delete q[k];
    }
  });
}

router.getProperties = function (req, res, next) {
  //   console.log("This will be called when search properties");
  var _page = 0;
  var _offset = 0;
  var _limit = 12;
  if (req.query.limit) _limit = parseInt(req.query.limit);
  delete req.query["limit"];
  if (req.query.offset) _offset = parseInt(req.query.offset);
  delete req.query["offset"];
  if (req.query.page) {
    _page = parseInt(req.query.page) - 1;
    delete req.query["page"];
    _offset = _page * _limit;
  }
  normalizeAvailabilityMonthQueryParam(req);
  var useAvailabilityDateFilter =
    hasTransformedAvailabilityDateKeys(req) || hasAvailabilityMonthInQuery(req);

  if (useAvailabilityDateFilter) {
    // Backward compat: old month-based availability filter (bookmarked URLs)
    if (hasAvailabilityMonthInQuery(req)) {
      var selectedYear = moment().year();
      var currentMonth = moment().month();
      if (currentMonth > req.query["availableDate<"])
        selectedYear = selectedYear + 1;
      if (req.query["availableDate<"] != 12) {
        currentMonth = parseInt(req.query["availableDate<"]) + 1;
        var filterDate = new Date(selectedYear, currentMonth);
        delete req.query["availableDate<"];
        req.query["availableDate<" + moment(filterDate)] = "";
      } else {
        var filterDate = new Date();
        delete req.query["availableDate<"];
        req.query["availableDate<=" + moment(filterDate)] = "";
      }
    }
    if (req.query["status"]) {
      // use status from query
    } else {
      // Show Available and Rented properties; exclude only unlisted
      req.query["status!"] = "Not list property";
    }
  } else {
    stripAvailabilityDateFromQuery(req);
    if (req.query["status"] === "Available" || req.query["status"] === "Rented") {
      // Explicit status filter — aqp will translate this directly
    } else {
      delete req.query["status"];
      req.query["status!"] = "Not list property";
    }
  }

  if (req.query["searchBar"]) {
    req.query["searchColumn"] =
      "/.*" + req.query["searchBar"].toLowerCase() + ".*/i";
    delete req.query["searchBar"];
  }
 
  if (req.query["allowPets"] && req.query["allowPets"] === "Yes") {
    delete req.query["allowPets"];
    req.query["allowPets!"] = "No";
  }
  if (req.query["furnished"]) {
    if (req.query["furnished"] === "Yes") req.query["furnished!"] = "No";
    else if (req.query["furnished"] === "No") req.query["furnished!"] = "Yes";
    delete req.query["furnished"];
  }
  if (req.query["bedrooms"]) {
    temp = req.query["bedrooms"].split(",");
    if (temp.includes("8 ")) {
      temp.push("9");
      temp.push("10");
      temp.push("11");
      temp.push("12");
    }
    req.query["bedrooms"] = temp.toString();
  }

  const query = aqp(req.query);
  req._page = _page;

  // Ensure address exists - required for template rendering
  // This filters out incomplete property records
  query.filter.address = query.filter.address || { $exists: true, $ne: null, $ne: "" };

  PropertyModel.find(query.filter)
    .select("-searchColumn")
    .limit(_limit) //remove limits to get all search results on properties search result page - 2018 August 17, edited by Oscar
    .skip(_offset)
    .sort("status") //sort the results first by status (available or not on list ), minus sign means by DESc order
    .sort("availableDate") //then sort by available date
    .sort("_id") //tie-break: MongoDB 4.4+ does not keep insertion order for ties, so paging with skip() repeats/misses listings without it
    // .sort('-createdAt')
    //.sort('propertyId')
    .exec(function (err, data) {
      // console.log("data = ", data);
      if (err) return;
      req._properties = data;
      next();
    });
};

// DEBUG ENDPOINT - Add this temporarily to diagnose pagination issue
// Must be BEFORE the main "/" route so it matches first
router.get("/debug-search", router.getProperties, function (req, res) {
  res.json({
    page: req._page + 1,
    count: req._properties.length,
    query: req.query,
    properties: req._properties.map(function(p) {
      return {
        id: p.propertyId,
        address: p.address,
        status: p.status,
        availableDate: p.availableDate,
        city: p.city
      };
    })
  });
});

/**
 * Renders the search results page from what getProperties() left on the request.
 *
 * Exported because the /for-rent/... landing pages in routes/index.js are the
 * same page under a clean URL: they translate their slug into the query object,
 * run the same getProperties middleware, and render through here. Anything they
 * need to differ on (canonical URL, title, pagination base) arrives on
 * req._forRentPage.
 */
function renderPropertiesPage(req, res) {
  var landing = req._forRentPage;
  var seoData = buildPropertiesSeo(req, req._properties);
  var coverImgs = [];
  for (var i = 0; i < req._properties.length; i++) {
    if (req._properties[i].coverImg && req._properties[i].coverImg != "") {
      var imgKey =
        req._properties[i].propertyId + "/" + req._properties[i].coverImg;
      // url =
      //   "http://" +
      //   config.bucket +
      //   ".s3-website-us-west-2.amazonaws.com/" +
      //   imgKey.replace(/ /g, "+");
      url = s3.getSignedUrl('getObject', {
          Bucket: config.bucket,
          Key: imgKey
      });

      url = url.replace("https://vancouverluxuryrentals.com/", "http://s3-us-west-2.amazonaws.com/vancouverluxuryrental.com/")
      coverImgs.push(url);
    } else {
      coverImgs.push(default_img);
    }
  }
  res.render("properties.ejs", {
    data: toViewProperties(req._properties),
    coverImgs: coverImgs,
    currentPage: req._page + 1,
    seoTitle: seoData.seoTitle,
    seoDescription: seoData.seoDescription,
    canonicalUrl: seoData.canonicalUrl,
    ogImage: seoData.ogImage,
    structuredData: seoData.structuredData,
    // Empty on /properties: there the filters are already in the address bar,
    // and the page reads them from window.location as it always has.
    filterQuery: landing ? landing.filterQuery : "",
    pagePath: landing ? landing.path : "/properties",
    pageHeading: landing ? landing.heading : "",
  });
}

router.get("/", router.getProperties, renderPropertiesPage);

router.renderPropertiesPage = renderPropertiesPage;

router.get(
  "/random",
  function (req, res, next) {
    req.query.limit = "all";
    next();
  },
  router.getProperties,
  function (req, res) {
    var num = req._properties.length;
    var result = [];
    var resultNum = [];
    for (i = 0; i < Math.min(3, num); i++) {
      randomNum = Math.floor(Math.random() * num);
      while (resultNum.length < num && resultNum.indexOf(randomNum) != -1)
        randomNum = Math.floor(Math.random() * num);
      result.push(req._properties[randomNum]);
      resultNum.push(randomNum);
    }
    var coverImgs = [];
    var findFav = [];
    for (var i = 0; i < result.length; i++) {
      if (result[i].coverImg && result[i].coverImg != "") {
        var imgKey = result[i].propertyId + "/" + result[i].coverImg;
        // url =
        //   "http://" +
        //   config.bucket +
        //   ".s3-website-us-west-2.amazonaws.com/" +
        //   imgKey.replace(/ /g, "+");

        url = s3.getSignedUrl('getObject', {
            Bucket: config.bucket,
            Key: imgKey
        });
        url = url.replace("https://vancouverluxuryrentals.com/", "http://s3-us-west-2.amazonaws.com/vancouverluxuryrental.com/")
        coverImgs.push(url);
      } else {
        coverImgs.push(default_img);
      }
      findFav.push(result[i].propertyId);
    }
    if (req.session.user) {
      PropertyFavoriteModel.find({
        propertyId: {
          $in: findFav,
        },
      })
        .select("propertyId users")
        .exec(function (err, propertyFavorites) {
          res.status(200).json({
            data: result,
            coverImgs: coverImgs,
            propertyFavorites: propertyFavorites,
          });
        });
    } else {
      res.status(200).json({
        data: result,
        coverImgs: coverImgs,
        propertyFavorites: [],
      });
    }
  }
);

router.get("/agent/:name", function (req, res) {
  AdminModel.findOne(
    {
      name: req.params.name,
    },
    function (err, agent) {
      if (err) return res.status(200).json({});
      if (agent)
        res.status(200).json({
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
        });
      else res.status(200).json({});
    }
  );
});

router.get("/api/all", function (req, res) {
  PropertyModel.find()
    .select("-searchColumn")
    .sort("-createdAt")
    .exec(function (err, properties) {
      if (err) return;
      res.send({
        data: toViewProperties(properties),
      });
    });
});

router.get("/id/:id", function (req, res) {
  PropertyModel.findOne(
    {
      propertyId: req.params.id,
    },
    function (err, property) {
      if (err) return;
      res.send(property);
    }
  );
});

router.put(
  "/id/:id",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res) {
    PropertyModel.findOne(
      {
        propertyId: req.params.id,
      },
      function (err, data) {
        if (err) return res.status(500).send(err);
        var newId = false;
        if (data == null) {
          data = new PropertyModel({
            propertyId: req.params.id,
            imgs: [],
          });
          newId = true;
        }
        var sendAvailable = false;
        var sendPriceChange = false;
        if (
          data.status &&
          data.status !== "Available" &&
          req.body.form.status === "Available"
        )
          sendAvailable = true;
        if (
          data.rent &&
          req.body.form.rent &&
          data.rent.toString() !== req.body.form.rent
        )
          sendPriceChange = true;
        data.agent = req.body.form.agent;
        data.address = req.body.form.address;
        data.city = req.body.form.city;
        data.province = req.body.form.province;
        data.postalCode = req.body.form.postalCode;
        data.country = req.body.form.country;
        data.neighborhoodName = req.body.form.neighborhoodName;
        data.buildingName = req.body.form.buildingName;
        data.typeOfProperty = req.body.form.typeOfProperty;
        data.yearBuilt = req.body.form.yearBuilt;
        data.availableDate = req.body.form.availableDate;
        data.createdAt = req.body.createdAt;
        data.status = req.body.form.status;
        data.bedrooms = req.body.form.bedrooms;
        data.bathrooms = req.body.form.bathrooms;
        data.den = req.body.form.den;
        data.flexOrStorage = req.body.form.flexOrStorage;
        data.mountainView = req.body.form.mountainView;
        data.waterView = req.body.form.waterView;
        data.cityView = req.body.form.cityView;
        data.squareFeet = req.body.form.squareFeet;
        data.lotSquareFootage = req.body.form.lotSquareFootage;
        data.furnished = req.body.form.furnished;
        data.rent = req.body.form.rent;
        data.allowPets = req.body.form.allowPets;
        data.smoking = req.body.form.smoking;
        data.minLeaseTerm = req.body.form.minLeaseTerm;
        data.maxLeaseTerm = req.body.form.maxLeaseTerm;
        data.name = '"' + req.body.form.name + '"';
        data.details = '"' + req.body.form.details + '"';
        data.storageOrLocker = req.body.form.storageOrLocker;
        data.numberOfParking = req.body.form.numberOfParking;
        data.garage = req.body.form.garage;
        data.carport = req.body.form.carport;
        data.streetParking = req.body.form.streetParking;
        data.drivewayParking = req.body.form.drivewayParking;
        data.visitorParking = req.body.form.visitorParking;
        data.bikeStorage = req.body.form.bikeStorage;
        data.Heat = req.body.form.Heat;
        data.water = req.body.form.water;
        data.garbageCollection = req.body.form.garbageCollection;
        data.gasFireplace = req.body.form.gasFireplace;
        data.electricFireplace = req.body.form.electricFireplace;
        data.woodburnFireplace = req.body.form.woodburnFireplace;
        data.ac = req.body.form.ac;
        data.inSuiteWasherDryer = req.body.form.inSuiteWasherDryer;
        data.sharedLaundry = req.body.form.sharedLaundry;
        data.refrigerator = req.body.form.refrigerator;
        data.windowCoverings = req.body.form.windowCoverings;
        data.gasStove = req.body.form.gasStove;
        data.electricStove = req.body.form.electricStove;
        data.dishwasher = req.body.form.dishwasher;
        data.microwave = req.body.form.microwave;
        data.oven = req.body.form.oven;
        data.wineCooler = req.body.form.wineCooler;
        data.builtinCoffeeMachine = req.body.form.builtinCoffeeMachine;
        data.pantry = req.body.form.pantry;
        data.kitchenIsland = req.body.form.kitchenIsland;
        data.carpets = req.body.form.carpets;
        data.woodFloor = req.body.form.woodFloor;
        data.tileFloor = req.body.form.tileFloor;
        data.balcony = req.body.form.balcony;
        data.rooftopDeck = req.body.form.rooftopDeck;
        data.patio = req.body.form.patio;
        data.privateYard = req.body.form.privateYard;
        data.allDayConcierge = req.body.form.allDayConcierge;
        data.onSiteManager = req.body.form.onSiteManager;
        data.swimmingPool = req.body.form.swimmingPool;
        data.gym = req.body.form.gym;
        data.yogaStudio = req.body.form.yogaStudio;
        data.sauna = req.body.form.sauna;
        data.steamRoom = req.body.form.steamRoom;
        data.hotTub = req.body.form.hotTub;
        data.amenityRoom = req.body.form.amenityRoom;
        data.meetingRoom = req.body.form.meetingRoom;
        data.hotWater = req.body.form.hotWater;
        data.electricity = req.body.form.electricity;
        data.gas = req.body.form.gas;
        data.basicInternetPackage = req.body.form.basicInternetPackage;
        data.ensuiteStorage = req.body.form.ensuiteStorage;
        data.walkinStorage = req.body.form.walkinStorage;
        data.radiantFloorHeat = req.body.form.radiantFloorHeat;
        data.basicCablePackage = req.body.form.basicCablePackage;
        data.additionalNote = req.body.form.additionalNote;
        data.geoLat = req.body.form.geoLat;
        data.geoLng = req.body.form.geoLng;
        data.searchColumn = "";
        data.searchColumn = JSON.stringify(data);
        data.vrurl = req.body.form.vrurl;
        data.propertyStatus = req.body.form.propertyStatus;
        // SEO overrides
        data.seoTitle = req.body.form.seoTitle || '';
        data.seoDescription = req.body.form.seoDescription || '';
        data.seoRobots = req.body.form.seoRobots || 'index';
        data.seoCanonical = req.body.form.seoCanonical || '';


        // Save the updated document back to the database
        data.save((err, property) => {
          if (err) {
            return res.status(500).send(err);
          }
          if (newId) {
            dbStatusModel
              .findOneAndUpdate(
                { statusName: "maxId" },
                { statusValue: property.propertyId }
              )
              .exec(function (err, data) {
                if (err) throw err;
                else res.status(200).send(property);
              });
          } else {
            if (sendAvailable) sendAvailableForProperty(property);
            if (sendPriceChange && property.status === "Available")
              setPriceChangeForProperty(property);
            res.status(200).send(property);
          }
        });
      }
    );
  }
);

router.put(
  "/id/:id/images",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res) {
    PropertyModel.findOne(
      {
        propertyId: req.params.id,
      },
      function (err, data) {
        if (err) return res.status(500).send(err);

        //check uploadPaths and property imgs
        var reqImgs = req.body.form.imgs || [];
        var tempArray = req.body.uploadPaths || [];
        needUploadImgs = [];
        if (reqImgs != null && reqImgs.length != 0)
          needUploadImgs = reqImgs.filter((x) => data.imgs.indexOf(x) < 0);
        // Watermarking is async (sharp): photos are processed one after
        // another, each uploaded once written, and the rest of the request
        // (S3 removals, save, temp folder cleanup) runs after the last one.
        var watermarking = Promise.resolve();
        if (needUploadImgs.length == 0)
          log.debug("No image needs to be uploaded.");
        else {
          log.debug(needUploadImgs + " need to be uploaded.");
          var uploadPaths = new Map();
          for (var index = 0; index < tempArray.length; ++index) {
            uploadPaths.set(tempArray[index][1], tempArray[index][0]);
          }
          needUploadImgs.forEach(function (needUploadImg) {
            var folderName = uploadPaths.get(needUploadImg);
            // resize to 1920 wide and apply watermark, see lib/imageProcessing.js
            var sourceImgPath = "uploads/" + folderName + "/" + needUploadImg;
            watermarking = watermarking
              .then(function () {
                return imageProcessing.watermarkPropertyPhoto(sourceImgPath);
              })
              .then(function () {
                uploadToS3(folderName, needUploadImg, data.propertyId);
              });
          });
        }

        watermarking.then(function () {
          needRemoveImgs = [];
          if (data.imgs != null && data.imgs.length != 0)
            needRemoveImgs = data.imgs.filter((x) => reqImgs.indexOf(x) < 0);
          if (needRemoveImgs.length == 0)
            log.debug("No image needs to be removed.");
          else {
            log.debug(needRemoveImgs + " need to be removed.");
            deleteFromS3(needRemoveImgs, data.propertyId);
          }

          data.coverImg = req.body.form.coverImg;
          data.imgs = req.body.form.imgs;
          data.save((err, property) => {
            if (err) {
              return res.status(500).send(err);
            }
            for (var index = 0; index < tempArray.length; ++index) {
              log.debug("Remove temp folder:" + tempArray[index][0]);
              rimraf("uploads/" + tempArray[index][0], function (error) {
                if (error) log.error("Error: ", error);
              });
            }
            res.status(200).send(property);
          });
        }, function (error) {
          log.error("Image processing failed for property " + data.propertyId + ": ", error);
          res.status(500).send("Image processing failed.");
        });
      }
    );
  }
);

router.get(
  "/id/:id/imglist",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res) {
    PropertyModel.findOne(
      {
        propertyId: req.params.id,
      },
      function (err, property) {
        if (err) return;
        if (property && property.propertyId)
          s3.listObjects(
            {
              Bucket: config.bucket,
              Prefix: property.propertyId + "/",
              MaxKeys: 100,
            },
            function (err, data) {
              if (err) throw err;
              var fileList = data.Contents;
              res.status(200).send(fileList);
            }
          );
      }
    );
  }
);

router.get(
  "/image/:id/:filename",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res) {
    var key = req.params.id + "/" + req.params.filename;
    s3.getObject(
      {
        Bucket: config.bucket,
        Key: key,
      },
      function (err, data) {
        if (err) throw err;
        originalFile = new Buffer(data.Body, "base64");
        res.status(200).json({
          fileName: req.params.filename,
          fileData: originalFile,
          fileType: data.ContentType,
        });
      }
    );
  }
);

router.delete(
  "/id/:id",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res) {
    PropertyModel.findOneAndRemove(
      {
        propertyId: req.params.id,
      },
      function (err, property) {
        if (err) return;
        res.status(200).json({
          id: property.propertyId,
        });
      }
    );
  }
);

router.get("/count", function (req, res) {
  normalizeAvailabilityMonthQueryParam(req);
  var useAvailabilityDateFilter =
    hasTransformedAvailabilityDateKeys(req) || hasAvailabilityMonthInQuery(req);

  if (useAvailabilityDateFilter) {
    // Backward compat: old month-based availability filter (bookmarked URLs)
    if (hasAvailabilityMonthInQuery(req)) {
      var selectedYear = moment().year();
      var currentMonth = moment().month();
      if (currentMonth > req.query["availableDate<"])
        selectedYear = selectedYear + 1;
      if (req.query["availableDate<"] != 12) {
        currentMonth = parseInt(req.query["availableDate<"]) + 1;
        var filterDate = new Date(selectedYear, currentMonth);
        delete req.query["availableDate<"];
        req.query["availableDate<" + moment(filterDate)] = "";
      } else {
        var filterDate = new Date();
        delete req.query["availableDate<"];
        req.query["availableDate<=" + moment(filterDate)] = "";
      }
    }
    if (req.query["status"]) {
      // use status from query
    } else {
      // Show Available and Rented properties; exclude only unlisted
      req.query["status!"] = "Not list property";
    }
  } else {
    stripAvailabilityDateFromQuery(req);
    if (req.query["status"] === "Available" || req.query["status"] === "Rented") {
      // Explicit status filter — aqp will translate this directly
    } else {
      delete req.query["status"];
      req.query["status!"] = "Not list property";
    }
  }
  if (req.query["searchBar"]) {
    req.query["searchColumn"] =
      "/.*" + req.query["searchBar"].toLowerCase() + ".*/i";
    delete req.query["searchBar"];
  }
  if (req.query["allowPets"] && req.query["allowPets"] === "Yes") {
    delete req.query["allowPets"];
    req.query["allowPets!"] = "No";
  }
  if (req.query["furnished"]) {
    if (req.query["furnished"] === "Yes") req.query["furnished!"] = "No";
    else if (req.query["furnished"] === "No") req.query["furnished!"] = "Yes";
    delete req.query["furnished"];
  }
  if (req.query["bedrooms"]) {
    temp = req.query["bedrooms"].split(",");
    if (temp.includes("8 ")) {
      temp.push("9");
      temp.push("10");
      temp.push("11");
      temp.push("12");
    }
    req.query["bedrooms"] = temp.toString();
  }

  console.log(req.query)

  const query = aqp(req.query);

  // Ensure address exists - required for template rendering
  query.filter.address = query.filter.address || { $exists: true, $ne: null, $ne: "" };

  PropertyModel.find(query.filter).count({}, function (err, count) {
    if (err) {
      res.sendStatus(400);
      return;
    }
    res.status(200).json({
      count: count,
    });
  });
});

router.get(
  "/attributes",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res) {
    AttributeModel.find(function (err, attributes) {
      if (err) {
        res.sendStatus(400);
        log.error("There is error when retriving attributes.");
        return;
      }
      res.status(200).json({
        data: attributes,
      });
    });
  }
);

router.get("/recentlyRented", function (req, res, next) {
  ShowRoomModel.findOne(
    {
      category: "recentlyRentedProperties",
    },
    function (err, recentlyRentedProperties) {
      if (err) {
        log.error(err);
        return err;
      }
      PropertyModel.find(
        {
          propertyId: {
            $in: recentlyRentedProperties.value,
          },
        },
        function (err, properties) {
          if (err) {
            log.error(err);
            return err;
          }
          var coverImgs = [];
          for (var i = 0; i < properties.length; i++) {
            if (properties[i].coverImg && properties[i].coverImg != "") {
              var imgKey =
                properties[i].propertyId + "/" + properties[i].coverImg;
              // url =
              //   "http://" +
              //   config.bucket +
              //   ".s3-website-us-west-2.amazonaws.com/" +
              //   imgKey.replace(/ /g, "+");

              url = s3.getSignedUrl('getObject', {
                  Bucket: config.bucket,
                  Key: imgKey
              });
              url = url.replace("https://vancouverluxuryrentals.com/", "http://s3-us-west-2.amazonaws.com/vancouverluxuryrental.com/")
              coverImgs.push(url);
            } else {
              coverImgs.push(default_img);
            }
          }

          if (req.session.user) {
            PropertyFavoriteModel.find({
              propertyId: {
                $in: recentlyRentedProperties.value,
              },
            })
              .select("propertyId users")
              .exec(function (err, propertyFavorites) {
                res.status(200).json({
                  data: toViewProperties(properties),
                  coverImgs: coverImgs,
                  propertyFavorites: propertyFavorites,
                });
              });
          } else {
            res.status(200).json({
              data: toViewProperties(properties),
              coverImgs: coverImgs,
              propertyFavorites: [],
            });
          }
        }
      );
    }
  );
});

router.get("/featured", function (req, res, next) {
  ShowRoomModel.findOne(
    {
      category: "featuredProperties",
    },
    function (err, featuredProperties) {
      if (err) {
        log.error(err);
        return err;
      }
      PropertyModel.find(
        {
          propertyId: {
            $in: featuredProperties.value,
          },
        },
        function (err, properties) {
          if (err) {
            log.error(err);
            return err;
          }
          var coverImgs = [];
          var propertyFavorites = [];
          for (var i = 0; i < properties.length; i++) {
            if (properties[i].coverImg && properties[i].coverImg != "") {
              var imgKey =
                properties[i].propertyId + "/" + properties[i].coverImg;
              // url =
              //   "http://" +
              //   config.bucket +
              //   ".s3-website-us-west-2.amazonaws.com/" +
              //   imgKey.replace(/ /g, "+");

              url = s3.getSignedUrl('getObject', {
                  Bucket: config.bucket,
                  Key: imgKey
              });
              url = url.replace("https://vancouverluxuryrentals.com/", "http://s3-us-west-2.amazonaws.com/vancouverluxuryrental.com/")
              coverImgs.push(url);
            } else {
              coverImgs.push(default_img);
            }
          }

          if (req.session.user) {
            PropertyFavoriteModel.find({
              propertyId: {
                $in: featuredProperties.value,
              },
            })
              .select("propertyId users")
              .exec(function (err, propertyFavorites) {
                res.status(200).json({
                  data: toViewProperties(properties),
                  coverImgs: coverImgs,
                  propertyFavorites: propertyFavorites,
                });
              });
          } else {
            res.status(200).json({
              data: toViewProperties(properties),
              coverImgs: coverImgs,
              propertyFavorites: [],
            });
          }
        }
      );
    }
  );
});

router.get("/banner", function (req, res, next) {
  ShowRoomModel.findOne(
    {
      category: "bannerProperties",
    },
    function (err, bannerProperties) {
      if (err) {
        log.error(err);
        return err;
      }
      PropertyModel.find(
        {
          propertyId: {
            $in: bannerProperties.value,
          },
        },
        function (err, properties) {
          if (err) {
            log.error(err);
            return err;
          }
          var coverImgs = [];
          for (var i = 0; i < properties.length; i++) {
            if (properties[i].coverImg && properties[i].coverImg != "") {
              var imgKey =
                properties[i].propertyId + "/" + properties[i].coverImg;
              // url =
              //   "http://" +
              //   config.bucket +
              //   ".s3-website-us-west-2.amazonaws.com/" +
              //   imgKey.replace(/ /g, "+");

              url = s3.getSignedUrl('getObject', {
                  Bucket: config.bucket,
                  Key: imgKey
              });
              url = url.replace("https://vancouverluxuryrentals.com/", "http://s3-us-west-2.amazonaws.com/vancouverluxuryrental.com/")
              coverImgs.push(url);
            } else {
              coverImgs.push(default_img);
            }
          }
          res.status(200).json({
            data: toViewProperties(properties),
            coverImgs: coverImgs,
          });
        }
      );
    }
  );
});

router.get("/rented", function (req, res) {
  PropertyModel.find({
    status: {
      $ne: "Available",
    },
  }).count({}, function (err, count) {
    if (err) {
      res.sendStatus(400);
      return;
    }
    res.status(200).json({
      count: count + 500,
    });
  });
});

router.get("/forRent", function (req, res) {
  PropertyModel.find({
    status: "Available",
  }).count({}, function (err, count) {
    if (err) {
      res.sendStatus(400);
      return;
    }
    res.status(200).json({
      count: count,
    });
  });
});

router.post(
  "/new",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    var new_property = new PropertyModel(JSON.parse(req.body.property));
    new_property.name = '"' + new_property.name + '"';
    new_property.details = '"' + new_property.details + '"';
    new_property.searchColumn = JSON.stringify(new_property);
    new_property.save(function (err, property) {
      if (err) return;
      res.status(200).json({
        id: property.propertyId,
      });
    });
  }
);

function uploadToS3(sourceFolder, fileName, destFolder) {
  // get the full path of the file
  var filePath = "uploads/" + sourceFolder + "/" + fileName;
  var destFilePath = destFolder + "/" + fileName;
  // read file contents
  fs.readFile(filePath, (error, fileContent) => {
    // if unable to read file contents, throw exception
    if (error) {
      throw error;
    }

    // upload file to S3
    s3.putObject(
      {
        Bucket: config.bucket,
        Key: destFilePath,
        Body: fileContent,
      },
      function (err, data) {
        if (err) throw err;
        else log.info(data);
      }
    );
  });
}

function deleteFromS3(fileNames, destFolder) {
  var deleteKeys = [];
  for (var index = 0; index < fileNames.length; ++index) {
    deleteKeys.push({
      Key: destFolder + "/" + fileNames[index],
    });
  }
  log.info(deleteKeys);
  s3.deleteObjects(
    {
      Bucket: config.bucket,
      Delete: {
        Objects: deleteKeys,
        Quiet: false,
      },
    },
    function (err, data) {
      if (err) throw err;
      else log.info(data);
    }
  );
}

function listObjectFromS3(destFolder) {
  s3.listObjects(
    {
      Bucket: config.bucket,
      Prefix: destFolder + "/",
      MaxKeys: 100,
    },
    function (err, data) {
      if (err) throw err;
      var fileList = data.Contents;
      return fileList;
    }
  );
}

function getObjectFromS3(key) {
  s3.getObject(
    {
      Bucket: config.bucket,
      Key: key,
    },
    function (err, data) {
      if (err) throw err;
      return data;
    }
  );
}

module.exports = router;