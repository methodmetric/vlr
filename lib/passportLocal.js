
/**
 * Module dependencies.
 */
const LocalStrategy = require('passport-local').Strategy;
const Admin = require('../models/admins').Admin;

/**
 * Expose
 */

exports.strategy = new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  },
  function(email, password, done) {
    var options = {
      criteria: { email: email },
      select: 'name email hashed_password salt'
    };
    Admin.load(options, function (err, user) {
      if (err) return done(err)
      if (!user) {
        return done(null, false, { message: 'Unknown user' });
      }
      if (!user.authenticate(password)) {
        return done(null, false, { message: 'Invalid password' });
      }
      return done(null, user);
    });
  }
);
