const mongoose = require('mongoose');
const Admin = require('../models/admins').Admin;
const Boom = require('boom');
var log = require('log4js').getLogger("admin");


/**
 * Create Admin
 */

exports.create = function(req, res, next) {
	Admin.create(req.body, function(err, result) {
		if (err) {
			log.error(err);
			if (err.code === 11000) {
				return res.json({
					data: "email already exist"
				});
			}
			return res.send(Boom.badImplementation(err));
		}
		return next();//res.json(result);
	});
};

/**
 * Show login form
 */

exports.login = function(req, res, next) {
	if (req.user == "Unknown user") {
		return res.json({
			status: "Not Exist"
		});
	} else if (req.user == "Invalid password") {
		return res.json({
			status: "Invalid Username and Password"
		});
	} else {
		log.info("Admin", req.user.email, "has logged in.");
		//return res.json(req.user);
		return next();
	}
};

/**
 * Logout
 */

exports.logout = function(req, res, next) {
	req.logout();
	return next();
};

/** authentication check. */
exports.authCallback = function(req, res) {
	return res.json(req.user);
};

/** checkLogin */
exports.isAuthenticated = function(req, res, next) {
	if (req.user)
        return next();
	else
		return res.redirect('/VLR-admin/login');
}

exports.isSuperAdmin = function(req, res, next) {
	if (req.user.role == 'SuperAdmin')
        return next();
	else{
        log.error("You don't have premission to do this.");
        return res.status(550);
    }
}
