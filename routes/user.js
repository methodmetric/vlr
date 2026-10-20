var express = require("express");
var router = express.Router();
var connect = require("../lib/mongo");
var mongoose = require('mongoose');
var UserModel = require("../models/users");
var PropertyFavoriteModel = require("../models/propertyFavorite");
var AdminController = require("../middlewares/admin");
var multer = require("multer");
var upload = multer(); // for parsing multipart/form-data
var log = require("log4js").getLogger("user");
var default_img = "/img/1.Richmond-3Bedroom.png"
var AWS = require('aws-sdk');
var config = require('config-lite')(__dirname);

AWS.config.loadFromPath('config/aws.json');
var s3 = new AWS.S3({
    params: {
        Bucket: config.bucket
    }
});
// GET user/signout
router.get('/signout', function (req, res, next) {
    req.session.destroy();
    res.redirect('/');
});

router.getUser = function (req, res, next) {
    UserModel.find()
        .populate("favorites")
        .exec(function (err, data) {
            if (err) return;
            req._users = data;
            next();
        });
};

router.get(
    "/api/all",
    AdminController.isAuthenticated,
    AdminController.isSuperAdmin,
    router.getUser,
    function (req, res) {
        res.send({
            data: req._users
        });
    }
);

router.delete(
    "/id/:id",
    AdminController.isAuthenticated,
    AdminController.isSuperAdmin,
    function (req, res) {
        UserModel.findOneAndRemove({
                email: req.params.id
            },
            function (err, user) {
                if (err) {
                    log.error(err);
                    return;
                }
                res.status(200).json({
                    id: user.email
                });
            }
        );
    }
);

router.post('/checkFavorites/:id', function (req, res) {
	if (req.session.user) {
        UserModel.findOne({
                email: req.session.user
        })
        .populate({
            path: "favorites",
            match: {propertyId: req.params.id}
        })
        .exec(function (err, data) {
            if (err) return;
            var found = false;
            if (data.favorites.length > 0) found = true;
            res.json({
                data: found
            });
            res.status(200).send();
        });
    }
});


router.get('/myfavorites', function (req, res) {
    if (req.session && req.session.user) {
        UserModel.findOne({
                email: req.session.user
            })
            .populate("favorites")
            .exec(function (error, user) {
                if (user) {
                    req.session.regenerate(function (err) {
                        if (err) {
                            return res.status(500).send({
                                error: "something is when saving the session"
                            });
                        }
                        req.session.user = user.email;
                        properties = user.favorites;
                        var coverImgs = [];
                        for (var i = 0; i < properties.length; i++) {
                            if (properties[i].coverImg && properties[i].coverImg != "") {
                                var imgKey =
                                    properties[i].propertyId + "/" + properties[i].coverImg;
                                url = 'http://' + config.bucket + '.s3-website-us-west-2.amazonaws.com/' + imgKey.replace(/ /g, "+");

                                // url = s3.getSignedUrl("getObject", {
                                //     Bucket: config.bucket,
                                //     Key: imgKey
                                // });
                                coverImgs.push(url);
                            } else {
                                coverImgs.push(default_img);
                            }
                        }
                        res.render("myFavorites.ejs", {
                            data: properties,
                            coverImgs: coverImgs,
                            user: user.email,
                            userId: user._id
                        });
                    });
                } else {
                    res.status(401).send();
                }
            });
    } else {
        res.status(401).send();
    }
});

// POST /signInUp, if the email exists, signin, else, signup
router.post("/new", upload.array(), function (
    req,
    res
) {
    uemail = req.body.email;
    UserModel.findOne({
            email: uemail
        })
        .exec(function (error, user) {
            if (user) {
                req.session.regenerate(function (err) {
                    if (err) {
                        return res.status(500).send({
                            error: "something is when saving the session"
                        });
                    }
                    req.session.user = user.email;
                    res.json({
                        user: user.email,
                        userId: user._id
                    });
                    res.status(200).send();
                });
            } else {
                UserModel.create({
                        email: uemail
                    },
                    function (error, user) {
                        if (error) {
                            log.error(error);
                            res.redirect("/");
                        } else {
                            req.session.regenerate(function (err) {
                                if (err) {
                                    return res.status(500).send({
                                        error: "something is when saving the session"
                                    });
                                }
                                req.session.user = user.email;
                                res.json({
                                    user: user.email,
                                    userId: user._id
                                });
                                res.status(200).send();
                            });
                        }
                    }
                );
            }
        });
});

router.post("/myfavorites", upload.array(), function (
    req,
    res,
    next
) {
    uemail = req.body.email;
    UserModel.findOne({
            email: uemail
        })
        .populate("favorites")
        .exec(function (error, user) {
            if (user) {
                req.session.regenerate(function (err) {
                    if (err) {
                        return res.status(500).send({
                            error: "something is when saving the session"
                        });
                    }
                    req.session.user = user.email;
                    properties = user.favorites;
                    var coverImgs = [];
                    for (var i = 0; i < properties.length; i++) {
                        if (properties[i].coverImg && properties[i].coverImg != "") {
                            var imgKey =
                                properties[i].propertyId + "/" + properties[i].coverImg;
                            url = 'http://' + config.bucket + '.s3-website-us-west-2.amazonaws.com/' + imgKey.replace(/ /g, "+");

                            // url = s3.getSignedUrl("getObject", {
                            //     Bucket: config.bucket,
                            //     Key: imgKey
                            // });
                            coverImgs.push(url);
                        } else {
                            coverImgs.push(default_img);
                        }
                    }
                    res.render("myFavorites.ejs", {
                        data: properties,
                        coverImgs: coverImgs,
                        user: user.email,
                        userId: user._id
                    });
                });
            } else {
                UserModel.create({
                        email: uemail
                    },
                    function (error, user) {
                        if (error) {
                            log.error(error);
                            res.redirect("/");
                        } else {
                            req.session.regenerate(function (err) {
                                if (err) {
                                    return res.status(500).send({
                                        error: "something is when saving the session"
                                    });
                                }
                                req.session.user = user.email;
                                res.render("myFavorites.ejs", {
                                    data: [],
                                    coverImgs: [],
                                    user: user.email,
                                    userId: user._id
                                });
                            });
                        }
                    }
                );
            }
        });
});

router.post("/newfavorite", function (req, res) {
    userEmail = req.body.user;
    _id = req.body._id;
    propertyId = req.body.propertyId;
    UserModel.findOne({
            email: userEmail
        },
        function (err, findUser) {
            if (err) return;
            if (findUser.favorites && findUser.favorites.indexOf(_id) == -1) {
                findUser.favorites.set(findUser.favorites.length, new mongoose.Types.ObjectId(_id));
                findUser.save(function (err) {
                    if (err) {
                        log.error(err);
                        return;
                    }
                    var conditions = {
                        _id: _id,
                        propertyId: propertyId
                    };
                    var update = {
                        $addToSet: {
                            users: findUser._id
                        }
                    };
                    var options = {
                        upsert: true
                    };
                    PropertyFavoriteModel.update(conditions, update, options, function (err) {
                        if (err) {
                            log.error(err);
                            return err;
                        }
                        res.status(200).json({
                            id: propertyId
                        });
                    });
                });
            }
            else{
                res.status(200).send();
            }
        }
    );
});

router.post("/newfavoriteform", function (req, res) {
    userEmail = req.body.user.email;
    _id = req.body._id;
    propertyId = req.body.propertyId;
    UserModel.findOneAndUpdate(
        {email: userEmail}, 
        {name: req.body.user.name, phone: req.body.user.phone}, 
        {upsert: true, new: true, setDefaultsOnInsert: true},
        function (err, findUser) {
            if (err) return;
            if (findUser.favorites && findUser.favorites.indexOf(_id) == -1) {
                findUser.favorites.set(findUser.favorites.length, new mongoose.Types.ObjectId(_id));
                findUser.save(function (err) {
                    if (err) {
                        log.error(err);
                        return;
                    }
                    var conditions = {
                        _id: _id,
                        propertyId: propertyId
                    };
                    var update = {
                        $addToSet: {
                            users: findUser._id
                        }
                    };
                    var options = {
                        upsert: true
                    };
                    PropertyFavoriteModel.update(conditions, update, options, function (err) {
                        if (err) {
                            log.error(err);
                            return err;
                        }
                        res.status(200).json({
                            id: propertyId
                        });
                    });
                });
            }
            else{
                res.status(200).send();
            }
        }
    );
});

router.delete("/favorite", function (req, res) {
    userEmail = req.body.user;
    _id = req.body._id;
    propertyId = req.body.propertyId;
    UserModel.findOne({
            email: userEmail
        },
        function (err, user) {
            if (err) return;
            var removeIndex = user.favorites.indexOf(_id);
            if (removeIndex != -1) user.favorites.splice(removeIndex,1);
            user.save(function (err, user) {
                if (err) return;
                var conditions = {
                    _id: _id,
                    propertyId: propertyId
                };
                var update = {
                    $pull: {
                        users: user._id
                    }
                };
                var options = {
                    upsert: true
                };
                PropertyFavoriteModel.update(conditions, update, options, function (
                    err
                ) {
                    if (err) {
                        log.error(err);
                        return err;
                    }
                    res.status(200).json({
                        id: propertyId
                    });
                });
            });
        }
    );
});

module.exports = router;