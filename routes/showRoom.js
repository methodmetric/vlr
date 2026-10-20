var express = require("express");
var router = express.Router();
var fs = require("fs");
var connect = require("../lib/mongo");
var AdminController = require("../middlewares/admin");
var AdminModel = require("../models/admins").Admin;
var ShowRoomModel = require("../models/showRoom");
var MeetTeamModel = require("../models/meetTeam");
var teamPhotos = require("../lib/teamPhotos");
var multer = require("multer");
var upload = multer();
var log = require("log4js").getLogger("admin");
var passport = require("passport");
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
var upload = multer({
  storage: storage,
});
var config = require("config-lite")(__dirname);

var AWS = require("aws-sdk");
AWS.config.loadFromPath("config/aws.json");
var s3 = new AWS.S3({
  params: {
    Bucket: config.bucket,
  },
});

router.get(
  "/meetTeam",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    // Project explicitly so the legacy `profile` Buffer is not serialised into
    // the admin page either; send a plain photo URL instead.
    MeetTeamModel
      .find({}, "name role detail phone email profileImage")
      .lean()
      .exec(function (err, meetTeam) {
        if (err) {
          log.error(err);
          return res.status(500).json({ error: "Could not load team members" });
        }
        meetTeam.forEach(function (member) {
          member.photoUrl = teamPhotos.publicUrlFor(member);
        });
        res.status(200).json({
          data: meetTeam,
        });
      });
  }
);

router.post(
  "/meetTeam",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    let size = Array.isArray(req.body.name) ? req.body.name.length : 1;
    MeetTeamModel.find({}, function (err, meetTeam) {
      if (err) return res.status(500).send(err);
      for (i = 0; i < size; i++) {
        let newEmail = Array.isArray(req.body.email)
          ? req.body.email[i]
          : req.body.email;
        let member;
        for (k = 0; k < meetTeam.length; ++k) {
          if (meetTeam[k].email == newEmail) {
            member = meetTeam[k];
            //console.log("Member find: " + member.name);
            break;
          }
        }

        let newName = Array.isArray(req.body.name)
          ? req.body.name[i]
          : req.body.name;
        let newRole = Array.isArray(req.body.role)
          ? req.body.role[i]
          : req.body.role;
        let newDetail = Array.isArray(req.body.detail)
          ? req.body.detail[i]
          : req.body.detail;
        let newPhone = Array.isArray(req.body.phone)
          ? req.body.phone[i]
          : req.body.phone;
        let newProfile = Array.isArray(req.body.photoValue)
          ? req.body.photoValue[i]
          : req.body.photoValue;

        if (!member) {
          member = new MeetTeamModel({
            name: newName,
            detail: newDetail,
            phone: newPhone,
            email: newEmail,
          });
        } else {
          member.name = newName;
          member.role = newRole;
          member.detail = newDetail;
          member.phone = newPhone;
          // member.email = newEmail;
        }

        // A newly chosen file arrives as a data: URI. Upload it to S3 and store
        // only the object key — writing the bytes into MongoDB is what inflated
        // /about/team to 4.3 MB. When no new file was picked the browser posts
        // "[object Blob]", which decodes to null and leaves the photo untouched.
        var decoded = teamPhotos.decodeDataUri(newProfile);
        if (decoded) {
          let key = teamPhotos.buildKey(member, decoded.contentType);
          teamPhotos.upload(key, decoded.buffer, decoded.contentType, function (uploadErr) {
            if (uploadErr) {
              log.error("Error uploading team photo to S3. err:" + uploadErr);
              return;
            }
            member.profileImage = key;
            member.save((err) => {
              if (err) log.error("Error when saving the meetTeam. err:" + err);
            });
          });
        } else {
          member.save((err) => {
            if (err) log.error("Error when saving the meetTeam. err:" + err);
          });
        }
      }
    });
    res.redirect("/VLR-admin/database");
  }
);

router.delete(
  "/meetTeam/:email",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res) {
    MeetTeamModel.findOneAndRemove(
      {
        email: req.params.email,
      },
      function (err, data) {
        if (err) return;
        res.status(200).send();
      }
    );
  }
);

router.get(
  "/recentlyRented",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    ShowRoomModel.findOne(
      {
        category: "recentlyRentedProperties",
      },
      function (err, recentlyRentedProperties) {
        if (err) {
          log.error(err);
          return err;
        }
        res.status(200).json({
          data: recentlyRentedProperties,
        });
      }
    );
  }
);
router.get(
  "/banner",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    ShowRoomModel.findOne(
      {
        category: "bannerProperties",
      },
      function (err, bannerProperties) {
        if (err) {
          log.error(err);
          return err;
        }
        res.status(200).json({
          data: bannerProperties,
        });
      }
    );
  }
);

router.post(
  "/banner",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    var conditions = {
      category: "bannerProperties",
    };
    var bannerProperty = [];
    if (Array.isArray(req.body.bannerProperty))
      bannerProperty = req.body.bannerProperty;
    else bannerProperty.push(req.body.bannerProperty);

    var update = {
      $set: {
        value: bannerProperty.filter(Number),
      },
    };
    var options = {
      upsert: true,
    };
    ShowRoomModel.update(conditions, update, options, function (err) {
      if (err) {
        log.error(err);
        return err;
      }
      res.redirect("/VLR-admin/database");
    });
  }
);

// get faq section
router.get(
  "/faq",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    ShowRoomModel.findOne(
      {
        category: "faq",
      },
      function (err, faqData) {
        if (err) {
          log.error(err);
          return err;
        }
        res.status(200).json({
          data: faqData,
        });
      }
    );
  }
);

// update faq
router.post(
  "/faq",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    var conditions = {
      category: "faq",
    };
    var faqArr = [];
    //faqArr = ["title1", "content1", "title2", "content2"]
    if (Array.isArray(req.body.faq)) faqArr = req.body.faq;
    else faqArr.push(req.body.faq);

    var update = {
      $set: {
        value: faqArr,
      },
    };
    var options = {
      upsert: true,
    };
    ShowRoomModel.update(conditions, update, options, function (err) {
      if (err) {
        log.error(err);
        return err;
      }
      res.redirect("/VLR-admin/database");
    });
  }
);

// get announcement
router.get(
  "/announcement",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    ShowRoomModel.findOne(
      {
        category: "announcement",
      },
      function (err, announcement) {
        if (err) {
          log.error(err);
          return err;
        }
        res.status(200).json({
          data: announcement,
        });
      }
    );
  }
);

// update announcement
// note: use value (arr) to store title(value[0]) and body (value[1])
router.post(
  "/announcement",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    var conditions = {
      category: "announcement",
    };
    var update = {
      $set: {
        value: [
          req.body.announcementShowHide == 1 ? 1 : 0,
          req.body.announcementTitle,
          req.body.announcementBody,
        ],
      },
    };
    var options = {
      upsert: true,
    };
    ShowRoomModel.update(conditions, update, options, function (err) {
      if (err) {
        log.error(err);
        return err;
      }
      res.redirect("/VLR-admin/database");
    });
  }
);

router.get(
  "/featured",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    ShowRoomModel.findOne(
      {
        category: "featuredProperties",
      },
      function (err, featuredProperties) {
        if (err) {
          log.error(err);
          return err;
        }
        res.status(200).json({
          data: featuredProperties,
        });
      }
    );
  }
);

router.post(
  "/featured",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    var conditions = {
      category: "featuredProperties",
    };
    var featuredProperty = [];
    if (Array.isArray(req.body.featuredProperty))
      featuredProperty = req.body.featuredProperty;
    else featuredProperty.push(req.body.featuredProperty);

    var update = {
      $set: {
        value: featuredProperty.filter(Number),
      },
    };
    var options = {
      upsert: true,
    };
    ShowRoomModel.update(conditions, update, options, function (err) {
      if (err) {
        log.error(err);
        return err;
      }
      res.redirect("/VLR-admin/database");
    });
  }
);

router.post(
  "/recentlyRented",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    var conditions = {
      category: "recentlyRentedProperties",
    };
    var recentlyRentedProperty = [];
    if (Array.isArray(req.body.recentlyRentedProperty))
      recentlyRentedProperty = req.body.recentlyRentedProperty;
    else recentlyRentedProperty.push(req.body.recentlyRentedProperty);

    var update = {
      $set: {
        value: recentlyRentedProperty.filter(Number),
      },
    };
    var options = {
      upsert: true,
    };
    ShowRoomModel.update(conditions, update, options, function (err) {
      if (err) {
        log.error(err);
        return err;
      }
      res.redirect("/VLR-admin/database");
    });
  }
);

router.get(
  "/uploadForms",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  function (req, res, next) {
    ShowRoomModel.findOne(
      {
        category: "uploadForms",
      },
      function (err, uploadForms) {
        if (err) {
          log.error(err);
          return err;
        }
        res.status(200).json({
          data: uploadForms,
        });
      }
    );
  }
);

router.post(
  "/uploadForms",
  AdminController.isAuthenticated,
  AdminController.isSuperAdmin,
  upload.array("uploadFiles", 100),
  function (req, res, next) {
    ShowRoomModel.findOne(
      {
        category: "uploadForms",
      },
      function (err, uploadForms) {
        if (err) {
          log.error(err);
          return err;
        }
        var files = [];

        for (var i = 0; i < req.files.length; i++) {
          files.push(req.files[i].originalname);
        }

        var oldFiles = [];
        if (uploadForms != null) oldFiles = uploadForms.value;

        var value = [];
        log.debug(files + " need to be uploaded.");
        for (i = 0; i < files.length; i++) {
          uploadToS3(files[i], "uploadForms");
        }

        var uploadFiles = [];
        if (Array.isArray(req.body.uploadForms))
          uploadFiles = req.body.uploadForms;
        else uploadFiles.push(req.body.uploadForms);
        for (i = 0; i < uploadFiles.length; i++) {
          if (
            uploadFiles[i] != undefined &&
            uploadFiles[i] != null &&
            uploadFiles[i] != ""
          ) {
            url =
              "https://" +
              config.bucket +
              ".s3-website-us-west-2.amazonaws.com/uploadForms/" +
              uploadFiles[i];

            // url = s3.getSignedUrl('getObject', {
            //     Bucket: config.bucket,
            //     Key: 'uploadForms/' + uploadFiles[i]
            // });
            value.push({
              file: uploadFiles[i],
              url: url,
            });
          }
        }

        needRemoveFiles = [];
        if (oldFiles != null && oldFiles.length != 0)
          needRemoveFiles = oldFiles.filter((x) => uploadFiles.indexOf(x) < 0);
        if (needRemoveFiles.length == 0)
          log.debug("No image needs to be removed.");
        else {
          log.debug(needRemoveFiles + " need to be removed.");
          deleteFromS3(needRemoveFiles, "uploadForms");
        }

        var conditions = {
          category: "uploadForms",
        };
        var update = {
          $set: {
            value: JSON.stringify(value),
          },
        };
        var options = {
          upsert: true,
        };
        ShowRoomModel.update(conditions, update, options, function (err) {
          if (err) {
            log.error(err);
            return err;
          }
          res.redirect("/VLR-admin/database");
        });
      }
    );
  }
);

function uploadToS3(fileName, destFolder) {
  // get the full path of the file
  var filePath = "uploads/" + fileName;
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
