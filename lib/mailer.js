var nodemailer = require('nodemailer');
var mg = require('nodemailer-mailgun-transport');
var fs = require("fs");
var ejs = require("ejs");
var log = require('log4js').getLogger("mailer");

module.exports = {
    sendScheduleMail: function sendScheduleMail(input, type) {
        
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }

        ejs.renderFile(__dirname + "/../views/emailTemplate/" + input.filename + ".ejs", {
            name: input.fullName
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));

                nodemailerMailgun.sendMail({
                    from: '"VLR Management" <info@vancouverluxuryrealty.com>',
                    to: input.email,
                    subject: 'Vancouver Luxury Realty Thank you for your Inquiry #' + input.propertyId + ' - This is not a confirmation email',
                    'h:Reply-To': '"Vancouver Luxury Realty" <info@vancouverluxuryrealty.com>',
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },

    sendListPropertyMail: function sendListPropertyMail(input, type) {
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }

        ejs.renderFile(__dirname + "/../views/emailTemplate/" + input.filename + ".ejs", {
            name: input.fullName
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));

                nodemailerMailgun.sendMail({
                    from: '"VLR Management" <info@vancouverluxuryrealty.com>',
                    to: input.email,
                    subject: 'Thank You for Your Inquiry - Vancouver Luxury Realty',
                    'h:Reply-To': '"Vancouver Luxury Realty" <info@vancouverluxuryrealty.com>',
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },

    sendAgentMail: function sendAgentMail(input) {
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }

        ejs.renderFile(__dirname + "/../views/emailTemplate/" + input.filename + ".ejs", {
            message: input.message
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));

                nodemailerMailgun.sendMail({
                    from: '"VLR Management" <info@vancouverluxuryrealty.com>',
                    to: input.agentEmail,
                    subject: 'You get a new request',
                    'h:Reply-To': '"Vancouver Luxury Realty" <info@vancouverluxuryrealty.com>',
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },

    sendRenewalMail: function sendRenewalMail(input) {
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }

        ejs.renderFile(__dirname + "/../views/emailTemplate/" + input.filename + ".ejs", {
            tenantName: input.tenantName,
            leaseEndDate: input.leaseEndDate,
            agentName: input.agentName,
            agentPhone: input.agentPhone
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));

                nodemailerMailgun.sendMail({
                    from: input.agentEmail,
                    to: input.tenantEmail,
                    subject: 'Renewal in 90 days',
                    'h:Reply-To': input.agentEmail,
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },

    sendTenantEnquiriesMail: function sendTenantEnquiriesMail(input) {
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }
        ejs.renderFile(__dirname + "/../views/emailTemplate/" + input.filename + ".ejs", {
            propertyId: input.propertyId,
            propertyStatus: input.propertyStatus,
            tenantName: input.tenantName,
            tenantEmail: input.tenantEmail,
            tenantPhone: input.tenantPhone,
            comment: input.comment,
            agentName: input.agentName,
            numberOfPets: input.numberOfPets,
            numberOfOccupants: input.numberOfOccupants,
            creditCard: input.creditCard,
            startDate: input.startDate,
            preferredDate: input.preferredDate,
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));
                nodemailerMailgun.sendMail({
                    from: '"VLR Management" <info@vancouverluxuryrealty.com>',
                    to: input.agentEmail,
                    subject: 'You have a new viewing request - For #' + input.propertyId,
                    'h:Reply-To': '"Vancouver Luxury Realty" <info@vancouverluxuryrealty.com>',
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },

    sendOwnerLeadMail: function sendOwnerLeadMail(input) {
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }   

        ejs.renderFile(__dirname + "/../views/emailTemplate/" + input.filename + ".ejs", {
            ownerName: input.ownerName,
            ownerPhone: input.ownerPhone,
            ownerEmail: input.ownerEmail,
            condition: input.condition,
            type: input.type,
            bed: input.bed,
            bath: input.bath,
            location: input.location,
            comment: input.comment,
            agentName: input.agentName,
            leaseTerm: input.leaseTerm,
            date: input.date,
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));

                nodemailerMailgun.sendMail({
                    from: '"VLR Management" <info@vancouverluxuryrealty.com>',
                    to: "info@vancouverluxuryrealty.com",
                    subject: 'You have a new owner lead - From VLR Admin',
                    'h:Reply-To': '"Vancouver Luxury Realty" <info@vancouverluxuryrealty.com>',
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },

    sendAvailableMail: function sendAvailableMail(input) {
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }

        ejs.renderFile(__dirname + "/../views/emailTemplate/available.ejs", {
            name: input.name,
            customerEmail: input.email,
            propertyId: input.propertyId,
            propertyName: input.propertyName,
            agentName: input.agentName,
            agentPhone: input.agentPhone,
            agentEmail: input.agentEmail,
            _id: input._id,
            propertyAddress: input.propertyAddress,
            propertyAddressEncoded: encodeURIComponent(input.propertyAddress)
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));

                nodemailerMailgun.sendMail({
                    from: '"VLR Management" <info@vancouverluxuryrealty.com>',
                    to: input.email,
                    subject: 'One of Your Favorite Property ID#' + input.propertyId + ' is Now Available!',
                    'h:Reply-To': '"Vancouver Luxury Realty" <info@vancouverluxuryrealty.com>',
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },

    sendPriceChangeMail: function sendPriceChangeMail(input) {
        var auth = {
            auth: {
                api_key: 'REDACTED-MAILGUN-KEY',
                domain: 'mg.vancouverluxuryrentals.com'
            }
        }
        ejs.renderFile(__dirname + "/../views/emailTemplate/priceChange.ejs", {
            name: input.name,
            customerEmail: input.email,
            propertyId: input.propertyId,
            propertyName: input.propertyName,
            rent: input.rent,
            agentPhone: input.agentPhone,
            _id: input._id,
            propertyAddress: input.propertyAddress,
            propertyAddressEncoded: encodeURIComponent(input.propertyAddress)
        }, function (err, data) {
            if (err) {
                log.error(err);
            } else {
                var nodemailerMailgun = nodemailer.createTransport(mg(auth));

                nodemailerMailgun.sendMail({
                    from: '"VLR Management" <info@vancouverluxuryrealty.com>',
                    to: input.email,
                    subject: 'Vancouver Luxury Realty - Your favourite property ID#' + input.propertyId + ' has price updates',
                    'h:Reply-To': '"Vancouver Luxury Realty" <info@vancouverluxuryrealty.com>',
                    html: data
                }, function (err, info) {
                    if (err) {
                        log.error('Error: ' + JSON.stringify(err));
                    } else {
                        log.info('Response: ' + JSON.stringify(info));
                    }
                });
            };
        });
    },
};