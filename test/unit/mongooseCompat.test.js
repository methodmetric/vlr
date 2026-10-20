// Unit tests for lib/mongooseCompat.js — the mongoose 4 -> 8 callback/removed-method layer.
// No database needed: test models short-circuit every operation in a pre hook
// (mongoose.skipMiddlewareFunction), so the real query/save pipeline runs up to
// the point where it would talk to MongoDB.
//     node --test test/unit/mongooseCompat.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const mongoose = require('../../lib/mongooseCompat');

const QUERY_OPS = ['find', 'findOne', 'countDocuments', 'distinct', 'findOneAndUpdate',
    'findOneAndDelete', 'updateOne', 'updateMany', 'deleteMany'];

// Builds a model whose queries and saves never reach MongoDB. Each query records
// what it would have sent and returns `fakeResult(op)` instead.
function stubbedModel(name, schema, fakeResult) {
    const calls = [];
    schema.pre(QUERY_OPS, function (next) {
        calls.push({
            op: this.op,
            filter: this.getFilter(),
            update: this.getUpdate(),
            options: this.getOptions()
        });
        next(mongoose.skipMiddlewareFunction(fakeResult(this.op)));
    });
    schema.pre('save', function (next) {
        calls.push({ op: 'save', doc: this.toObject() });
        next(mongoose.skipMiddlewareFunction(this));
    });
    return { Model: mongoose.model(name, schema), calls: calls };
}

function plainSchema() {
    return new mongoose.Schema({ name: String, flag: Boolean, count: Number });
}

// Promisifies one callback-style call so tests can await (err, result).
function viaCallback(fn) {
    return new Promise(function (resolve) {
        fn(function (err, result) {
            resolve({ err: err, result: result });
        });
    });
}

const { Model: Thing, calls } = stubbedModel('CompatThing', plainSchema(), function (op) {
    return { op: op };
});

test.beforeEach(function () {
    calls.length = 0;
});

test('Model.find with a callback delivers the result as callback(null, docs)', async function () {
    const { err, result } = await viaCallback(function (cb) {
        Thing.find({ name: 'a' }, cb);
    });
    assert.strictEqual(err, null);
    assert.deepStrictEqual(result, { op: 'find' });
    assert.deepStrictEqual(calls[0].filter, { name: 'a' });
});

test('findOne, findById, findOneAndUpdate and distinct accept a trailing callback', async function () {
    const id = new mongoose.Types.ObjectId();
    const ops = [];
    for (const call of [
        function (cb) { Thing.findOne({ name: 'a' }, cb); },
        function (cb) { Thing.findById(id, cb); },
        function (cb) { Thing.findOneAndUpdate({ name: 'a' }, { count: 2 }, { new: true }, cb); },
        function (cb) { Thing.distinct('name', { flag: true }, cb); }
    ]) {
        const { err, result } = await viaCallback(call);
        assert.strictEqual(err, null);
        ops.push(result.op);
    }
    assert.deepStrictEqual(ops, ['findOne', 'findOne', 'findOneAndUpdate', 'distinct']);
    assert.strictEqual(String(calls[1].filter._id), String(id));
});

test('Query#exec(cb) and the legacy exec({}, cb) form both call back', async function () {
    const plain = await viaCallback(function (cb) {
        Thing.find().select('name').exec(cb);
    });
    const withObject = await viaCallback(function (cb) {
        Thing.find().exec({}, cb);
    });
    assert.deepStrictEqual(plain.result, { op: 'find' });
    assert.deepStrictEqual(withObject.result, { op: 'find' });
});

test('calls without a callback still return a thenable Query', async function () {
    const result = await Thing.findOne({ name: 'b' });
    assert.deepStrictEqual(result, { op: 'findOne' });
});

test('Model.update without multi runs updateOne and drops no other options', async function () {
    await viaCallback(function (cb) {
        Thing.update({ name: 'a' }, { $inc: { count: 1 } }, { upsert: true }, cb);
    });
    assert.strictEqual(calls[0].op, 'updateOne');
    assert.strictEqual(calls[0].options.upsert, true);
    assert.deepStrictEqual(calls[0].update.$inc, { count: 1 });
});

test('Model.update with { multi: true } runs updateMany and does not mutate the options', async function () {
    const options = { multi: true };
    await viaCallback(function (cb) {
        Thing.update({}, { flag: false }, options, cb);
    });
    assert.strictEqual(calls[0].op, 'updateMany');
    assert.strictEqual(calls[0].options.multi, undefined);
    assert.deepStrictEqual(options, { multi: true });
});

test('Model.update(conditions, doc, cb) works without an options argument', async function () {
    const { err } = await viaCallback(function (cb) {
        Thing.update({ name: 'a' }, { count: 3 }, cb);
    });
    assert.strictEqual(err, null);
    assert.strictEqual(calls[0].op, 'updateOne');
});

test('removed methods map to their replacements', async function () {
    const id = new mongoose.Types.ObjectId();
    await viaCallback(function (cb) { Thing.remove({ flag: true }, cb); });
    await viaCallback(function (cb) { Thing.findOneAndRemove({ name: 'a' }, cb); });
    await viaCallback(function (cb) { Thing.findByIdAndRemove(id, cb); });
    await viaCallback(function (cb) { Thing.find({ flag: true }).count({}, cb); });
    assert.deepStrictEqual(calls.map(function (c) { return c.op; }),
        ['deleteMany', 'findOneAndDelete', 'findOneAndDelete', 'countDocuments']);
    assert.deepStrictEqual(calls[0].filter, { flag: true });
    assert.strictEqual(String(calls[2].filter._id), String(id));
    assert.deepStrictEqual(calls[3].filter, { flag: true });
});

test('document.save(cb) and Model.create(doc, cb) call back with the document', async function () {
    const saved = await viaCallback(function (cb) {
        new Thing({ name: 'x' }).save(cb);
    });
    const created = await viaCallback(function (cb) {
        Thing.create({ name: 'y' }, cb);
    });
    assert.strictEqual(saved.err, null);
    assert.strictEqual(saved.result.name, 'x');
    assert.strictEqual(created.err, null);
    assert.strictEqual(created.result.name, 'y');
});

test('errors reach the callback as its first argument', async function () {
    const Strict = mongoose.model('CompatStrict', new mongoose.Schema({ name: { type: String, required: true } }));
    const { err, result } = await viaCallback(function (cb) {
        new Strict({}).save(cb);
    });
    assert.ok(err instanceof mongoose.Error.ValidationError);
    assert.strictEqual(result, undefined);
});

test('an exception thrown inside a callback crashes the process, as it did on mongoose 4', function () {
    // Run in a child process: an uncaught exception is the expected outcome.
    const script = [
        "const mongoose = require(" + JSON.stringify(require.resolve('../../lib/mongooseCompat')) + ");",
        "const schema = new mongoose.Schema({ name: String });",
        "schema.pre('findOne', function (next) { next(mongoose.skipMiddlewareFunction(null)); });",
        "mongoose.model('Crash', schema).findOne({}, function () { throw new Error('boom from callback'); });"
    ].join('\n');
    const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 20000 });
    assert.notStrictEqual(child.status, 0);
    assert.match(child.stderr, /boom from callback/);
});

test('connection.close(cb) calls back', async function () {
    const conn = mongoose.createConnection();
    const { err } = await viaCallback(function (cb) {
        conn.close(cb);
    });
    assert.strictEqual(err, null);
});

test('booleans cast the mongoose 4 way', function () {
    const cases = [['', false], ['on', true], ['TRUE', true], ['false', false], ['0', false],
        ['true', true], [0, false], [1, true], [true, true], [null, null]];
    cases.forEach(function ([input, expected]) {
        const doc = new Thing({ flag: input });
        assert.strictEqual(doc.validateSync(), undefined, 'no cast error for ' + JSON.stringify(input));
        assert.strictEqual(doc.flag, expected, 'flag for ' + JSON.stringify(input));
    });
});

test('filters on paths outside the schema are kept (strictQuery false)', function () {
    const query = Thing.find({ notInSchema: 'x', name: 'a' });
    query.cast(Thing);
    assert.deepStrictEqual(query.getFilter(), { notInSchema: 'x', name: 'a' });
});

test('requiring the module twice does not wrap methods twice', function () {
    const find = mongoose.Model.find;
    delete require.cache[require.resolve('../../lib/mongooseCompat')];
    require('../../lib/mongooseCompat');
    assert.strictEqual(mongoose.Model.find, find);
});

test('pre-update hooks in the app models still stamp lastUpdatedDate', async function () {
    ['showRoom', 'propertyFavorite', 'meetTeam'].forEach(function (file) {
        require('../../models/' + file);
    });
    for (const name of ['ShowRoom', 'PropertyFavorite', 'MeetTeam']) {
        const schema = mongoose.model(name).schema.clone();
        const stub = stubbedModel('Compat' + name, schema, function () {
            return { acknowledged: true };
        });
        await viaCallback(function (cb) {
            stub.Model.update({ _id: new mongoose.Types.ObjectId() }, { $set: { phone: '1' } }, { upsert: true }, cb);
        });
        assert.ok(stub.calls[0].update.$set.lastUpdatedDate instanceof Date, name + ' stamps lastUpdatedDate');
    }
});
