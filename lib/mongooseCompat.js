'use strict';
/**
 * Mongoose 4 -> 8 compatibility layer.
 *
 * The app was written against mongoose 4: every database call passes a
 * node-style callback, and it uses methods that mongoose 7/8 removed. MongoDB
 * 8.0 needs mongoose >= 8.7, so instead of rewriting ~120 call sites this module
 * restores the old calling convention for exactly the methods the code uses:
 *
 *   - a trailing function argument is treated as the callback: the call runs
 *     without it and the result is delivered as callback(err, result);
 *   - removed methods are mapped to their modern equivalents;
 *   - two mongoose 4 defaults that changed are restored (see the bottom).
 *
 * Calls without a callback are passed through untouched, so mongoose's own
 * internals (which never pass functions) and any new promise-style code keep
 * working. In callback mode the call returns undefined; nothing in the app uses
 * the return value of a callback-style call.
 *
 * Load it once before the first query (lib/mongo.js and the Scripts do).
 * It patches the shared mongoose prototypes, so models compiled earlier are
 * covered too. Requiring it again is a no-op.
 *
 * Not covered on purpose (the code does not use them): Aggregate, Model.count,
 * Document#remove/update, Query#update/remove/findOneAndRemove.
 */
var mongoose = require('mongoose');

var Model = mongoose.Model;
var Query = mongoose.Query;
var Connection = mongoose.Connection;

var PATCHED = Symbol.for('vlr.mongooseCompat');

// Splits a trailing callback off an arguments list; null when there is none.
function splitCallback(args) {
    var list = Array.prototype.slice.call(args);
    var last = list[list.length - 1];
    if (typeof last !== 'function') {
        return null;
    }
    return { args: list.slice(0, -1), callback: last };
}

// Runs the callback. If the callback itself throws, the error is rethrown
// outside the promise chain (as mongoose <= 6 did), so it still surfaces as an
// uncaught exception instead of turning into a silent rejected promise.
function invoke(callback, err, result) {
    try {
        callback(err, result);
    } catch (thrown) {
        process.nextTick(function () {
            throw thrown;
        });
    }
}

// Queries are thenables that run on exec(); everything else is a promise or value.
function toPromise(result) {
    if (result && typeof result.exec === 'function') {
        return result.exec();
    }
    return Promise.resolve(result);
}

// Wraps fn so it also accepts an optional trailing node-style callback.
function withCallback(fn) {
    return function () {
        var split = splitCallback(arguments);
        if (!split) {
            return fn.apply(this, arguments);
        }
        var callback = split.callback;
        toPromise(fn.apply(this, split.args)).then(function (result) {
            invoke(callback, null, result);
        }, function (err) {
            invoke(callback, err);
        });
        return undefined;
    };
}

// --- Model statics that still exist but no longer take a callback ---------
var MODEL_STATICS = ['find', 'findOne', 'findById', 'findOneAndUpdate', 'create', 'distinct'];

// --- Model statics removed in mongoose 7/8, mapped to their replacements ----
var REMOVED_MODEL_STATICS = {
    // Model.update() updated one document unless { multi: true } was passed.
    update: function (conditions, doc, options) {
        var opts = Object.assign({}, options);
        var isMulti = Boolean(opts.multi);
        delete opts.multi;
        return isMulti
            ? this.updateMany(conditions, doc, opts)
            : this.updateOne(conditions, doc, opts);
    },
    // Model.remove(conditions) deleted every matching document.
    remove: function (conditions) {
        return this.deleteMany(conditions);
    },
    findOneAndRemove: function (conditions, options) {
        return this.findOneAndDelete(conditions, options);
    },
    findByIdAndRemove: function (id, options) {
        return this.findByIdAndDelete(id, options);
    }
};

function patchModel() {
    MODEL_STATICS.forEach(function (name) {
        Model[name] = withCallback(Model[name]);
    });
    Object.keys(REMOVED_MODEL_STATICS).forEach(function (name) {
        Model[name] = withCallback(REMOVED_MODEL_STATICS[name]);
    });
    Model.prototype.save = withCallback(Model.prototype.save);
}

function patchQuery() {
    var originalExec = Query.prototype.exec;
    Query.prototype.exec = withCallback(function (op) {
        // mongoose 4 ignored a non-string first argument (the app has one
        // `exec({}, cb)`); mongoose 8 only accepts an operation name.
        return typeof op === 'string' ? originalExec.call(this, op) : originalExec.call(this);
    });

    // Query#count(filter, cb) was removed in mongoose 8.
    Query.prototype.count = withCallback(function (filter) {
        return this.countDocuments(filter);
    });
}

function patchConnection() {
    Connection.prototype.close = withCallback(Connection.prototype.close);
}

// mongoose 4 cast booleans loosely ('' -> false, 'on' -> true); mongoose 8
// throws a CastError for anything outside true/false/'true'/'false'/0/1/'yes'/'no'.
// This is mongoose 4.13's "legacy mode" cast, verbatim.
function legacyCastBoolean(value) {
    if (value == null) {
        return value;
    }
    if (value === '0' || value === 'false') {
        return false;
    }
    if (value === 'true') {
        return true;
    }
    return !!value;
}

if (!mongoose[PATCHED]) {
    patchModel();
    patchQuery();
    patchConnection();
    mongoose.Schema.Types.Boolean.cast(legacyCastBoolean);
    // Keep filters on paths that are not in the schema, as mongoose 4 did
    // (the search page builds filters straight from the query string).
    mongoose.set('strictQuery', false);
    mongoose[PATCHED] = true;
}

module.exports = mongoose;
