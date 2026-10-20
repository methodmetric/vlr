var log = require('log4js').getLogger("setAvailable");
var AdminModel = require('../models/admins').Admin;
var PropertyModel = require('../models/properties');
var PropertyFavoriteModel = require("../models/propertyFavorite");
var UserModel = require("../models/users");
var mailer = require('../lib/mailer');

module.exports = {
    checkAvailable: function checkAvailable() {
        PropertyModel.find({
            availableDate: {
                $lte: new Date()
            },
            status: "Rented"
        }, function (err, properties) {
            if (err) {
                log.error(err);
                return -1;
            } else {
                count = 0;
                for (i = 0; i < properties.length; i++) {
                    let property = properties[i];
                    count++;
                    module.exports.sendAvailableForProperty(property);
                }
                log.info("Total: " + properties.length + " and we did " + count);
                return 1;
            }
        });
    },

    sendAvailableForProperty: function sendAvailableForProperty(property) {
        AdminModel.findOne({
            name: property.agent
        }, (function (err, admin){
            let agent = admin;
            if (err) {
                log.error(err);
                return -1;
            }
            if (!agent)
                agent = {
                    name: "VLR",
                    phone: 6048990220,
                    email: 'info@vancouverluxuryrealty.com'
                };
            // TODO: should still use findOne here ( after refactoring )
            PropertyFavoriteModel.find({
                propertyId: property.propertyId
            }, function (err, propertyFavorites) {
                if (err) {
                    log.error(err);
                    return -1;
                }
                let userSent = [];
                for (var i = 0; i < propertyFavorites.length; i++) {
                    var propertyFavorite = propertyFavorites[i];
                    if (propertyFavorite && propertyFavorite.users){
                        for (x = 0; x < propertyFavorite.users.length; x++) {
                            var userId = propertyFavorite.users[x];
                            if (userSent.indexOf(userId.toString()) != -1) {
                                continue;
                            }
                            // console.log("Sending email to " + userId);
                            userSent.push(userId.toString());
                            UserModel.findOne({
                                _id: userId
                            }, (function (err, user) {                            
                                if (err) {
                                    log.error(err);
                                    return -1;
                                }
                                if (user){
                                    if (user.name == '') user.name = "Mr./Ms."
                                    var info = {
                                        name: user.name,
                                        email: user.email,
                                        propertyId: property.propertyId,
                                        _id: property._id,
                                        propertyName: property.name,
                                        propertyAddress: property.address,
                                        agentName: agent.name,
                                        agentPhone: agent.phone,
                                        agentEmail: agent.email
                                    };
                                    mailer.sendAvailableMail(info);
                                }
                            }));
                        }
                        property.status = "Available";
                        property.save((err, data) => {
                            if (err) {
                                log.error(err);
                                return -1;
                            }
                        });
                    }
                }
            });
        }));
    },

    setPriceChangeForProperty: function setPriceChangeForProperty(property) {
        AdminModel.findOne({
            name: property.agent
        }, (function (err, admin){
            let agent = admin;
            if (err) {
                log.error(err);
                return -1;
            }
            if (!agent)
                agent = {
                    name: "VLR",
                    phone: 6048990220,
                    email: 'info@vancouverluxuryrealty.com'
                };
            // TODO: should still use findOne here ( after refactoring )
            PropertyFavoriteModel.find({
                propertyId: property.propertyId
            }, function (err, propertyFavorites) {
                if (err) {
                    log.error(err);
                    return -1;
                }
                let userSent = [];
                for (var i = 0; i < propertyFavorites.length; i++) {
                    var propertyFavorite = propertyFavorites[i];
                    if (propertyFavorite && propertyFavorite.users){
                        for (x = 0; x < propertyFavorite.users.length; x++) {
                            var userId = propertyFavorite.users[x];
                            if (userSent.indexOf(userId.toString()) != -1) {
                                continue;
                            }
                            userSent.push(userId.toString());
                            UserModel.findOne({
                                _id: userId
                            }, (function (err, user) {
                                if (err) {
                                    log.error(err);
                                    return -1;
                                }
                                if (user){
                                    if (user.name == '') user.name = "Mr./Ms."
                                    var info = {
                                        name: user.name,
                                        email: user.email,
                                        propertyId: property.propertyId,
                                        propertyName: property.name,
                                        propertyAddress: property.address,
                                        rent: property.rent,
                                        agentPhone: agent.phone,
                                        _id: property._id,
                                    };
                                    mailer.sendPriceChangeMail(info);
                                }
                            }));
                        }
                    }
                }
            });
        }));
    }
}