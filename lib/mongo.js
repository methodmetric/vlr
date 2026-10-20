// Must load before any query runs: restores mongoose 4 callbacks (see the file).
var mongoose = require('./mongooseCompat');
var config = require('config-lite')(__dirname);
var log = require('log4js').getLogger("mongo");

// MONGO_URL (set in /etc/vlr/env on the server) wins over the config file.
mongoose.connect(process.env.MONGO_URL || config.mongodb).catch(function () {
  // Already logged by the "error" listener below; catching keeps a failed
  // first connect from becoming an unhandled rejection that kills the worker.
});

mongoose.connection.on("error", function (error) {
  log.error("Database connection failed" + error);
});

mongoose.connection.on("open", function () {
  log.info("Database connection succeed");
});

module.exports = mongoose;
