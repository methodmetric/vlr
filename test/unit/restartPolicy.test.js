// Unit tests for lib/restartPolicy.js — the cluster master's crash-loop guard.
// Dependency-free so it runs under the server's node 8.9.4 as well as locally:
//     node test/unit/restartPolicy.test.js
var assert = require('assert');
var restartPolicy = require('../../lib/restartPolicy');

var createRestartPolicy = restartPolicy.createRestartPolicy;
var recordStart = restartPolicy.recordStart;
var recordDeath = restartPolicy.recordDeath;

var tests = [];

function test(name, fn) {
    tests.push({ name: name, fn: fn });
}

// Runs one worker through fork -> death, returning the resulting decision.
function liveAndDie(policy, workerId, startedAt, diedAt) {
    return recordDeath(recordStart(policy, workerId, startedAt), workerId, diedAt);
}

test('forks again when a worker dies after running long enough to be healthy', function() {
    // Arrange
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 5 });

    // Act — worker ran for an hour before crashing
    var decision = liveAndDie(policy, 1, 1000, 1000 + 3600000);

    // Assert
    assert.strictEqual(decision.shouldRefork, true);
    assert.strictEqual(decision.consecutiveFailures, 0);
    assert.strictEqual(decision.uptimeMs, 3600000);
});

test('counts a death before minimum healthy uptime as a startup failure', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 5 });

    var decision = liveAndDie(policy, 1, 1000, 1000 + 9000); // died after 9s, like EADDRINUSE

    assert.strictEqual(decision.consecutiveFailures, 1);
    assert.strictEqual(decision.shouldRefork, true); // still under the limit
});

test('stops forking after the configured number of consecutive startup failures', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });
    var now = 0;
    var decision;

    // Act — three workers in a row die immediately
    for (var i = 1; i <= 3; i++) {
        decision = liveAndDie(policy, i, now, now + 9000);
        policy = decision.policy;
        now += 9000;
    }

    assert.strictEqual(decision.consecutiveFailures, 3);
    assert.strictEqual(decision.shouldRefork, false);
});

test('keeps forking while failures stay below the limit', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });

    var first = liveAndDie(policy, 1, 0, 9000);
    var second = liveAndDie(first.policy, 2, 9000, 18000);

    assert.strictEqual(second.consecutiveFailures, 2);
    assert.strictEqual(second.shouldRefork, true);
});

test('resets the failure streak once a worker survives long enough', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });

    var failed = liveAndDie(policy, 1, 0, 9000);
    var failedTwice = liveAndDie(failed.policy, 2, 9000, 18000);
    var healthy = liveAndDie(failedTwice.policy, 3, 18000, 18000 + 120000);
    var afterReset = liveAndDie(healthy.policy, 4, 200000, 209000);

    assert.strictEqual(healthy.consecutiveFailures, 0);
    assert.strictEqual(afterReset.consecutiveFailures, 1, 'streak should restart from zero');
    assert.strictEqual(afterReset.shouldRefork, true);
});

test('treats a death with no recorded start as a startup failure', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });

    var decision = recordDeath(policy, 99, 5000); // never saw this worker come online

    assert.strictEqual(decision.uptimeMs, 0);
    assert.strictEqual(decision.consecutiveFailures, 1);
});

test('treats uptime exactly at the threshold as healthy', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });

    var decision = liveAndDie(policy, 1, 0, 30000);

    assert.strictEqual(decision.consecutiveFailures, 0);
});

test('does not mutate the policy it is given', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });
    var before = JSON.stringify(policy);

    recordDeath(recordStart(policy, 1, 0), 1, 9000);

    assert.strictEqual(JSON.stringify(policy), before, 'original policy must be untouched');
});

test('forgets a worker start time once that worker has died', function() {
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });

    var decision = liveAndDie(policy, 7, 0, 9000);

    assert.ok(!(7 in decision.policy.startTimes), 'dead worker must not linger in startTimes');
});

test('ships the defaults the production master relies on', function() {
    // server.js calls createRestartPolicy() with no options, so these ARE the
    // production settings. Pinned exactly: a loose "> 0" assertion would let
    // them be changed to useless values with every test still green.
    var policy = createRestartPolicy();

    assert.strictEqual(policy.minHealthyUptimeMs, 30000);
    assert.strictEqual(policy.maxConsecutiveFailures, 5);
});

test('gives up on the real incident shape using default options', function() {
    // The 2026-09-10 outage: worker binds :80, fails, dies after ~9s, forever.
    // With the shipped defaults the master must stop forking rather than loop.
    var policy = createRestartPolicy();
    var now = 0;
    var decision;

    for (var i = 1; i <= 5; i++) {
        decision = liveAndDie(policy, i, now, now + 9000);
        policy = decision.policy;
        now += 9000;
    }

    assert.strictEqual(decision.shouldRefork, false, 'must give up within ~45s of crash-looping');
});

test('tracks start times per worker when several are alive at once', function() {
    // Multi-CPU boxes run overlapping workers. One dying young must not corrupt
    // the recorded start time of its healthy siblings.
    var policy = createRestartPolicy({ minHealthyUptimeMs: 30000, maxConsecutiveFailures: 3 });
    policy = recordStart(policy, 1, 0);
    policy = recordStart(policy, 2, 100);
    policy = recordStart(policy, 3, 200);

    var youngDeath = recordDeath(policy, 2, 5000); // worker 2 dies early
    assert.strictEqual(youngDeath.uptimeMs, 4900);
    assert.strictEqual(youngDeath.consecutiveFailures, 1);

    var elderDeath = recordDeath(youngDeath.policy, 1, 3600000); // worker 1 dies an hour in
    assert.strictEqual(elderDeath.uptimeMs, 3600000, 'sibling start time must survive');
    assert.strictEqual(elderDeath.consecutiveFailures, 0, 'a healthy death clears the streak');
    assert.strictEqual(elderDeath.policy.startTimes[3], 200, 'untouched worker keeps its start time');
});

test('throws when minHealthyUptimeMs is not a positive number', function() {
    assert.throws(function() { createRestartPolicy({ minHealthyUptimeMs: 0 }); }, /minHealthyUptimeMs/);
    assert.throws(function() { createRestartPolicy({ minHealthyUptimeMs: 'soon' }); }, /minHealthyUptimeMs/);
});

test('throws when maxConsecutiveFailures is not a positive number', function() {
    assert.throws(function() { createRestartPolicy({ maxConsecutiveFailures: -1 }); }, /maxConsecutiveFailures/);
    assert.throws(function() { createRestartPolicy({ maxConsecutiveFailures: Infinity }); }, /maxConsecutiveFailures/);
});

test('throws when a timestamp is not a finite number', function() {
    var policy = createRestartPolicy();

    assert.throws(function() { recordStart(policy, 1, 'now'); }, /nowMs/);
    assert.throws(function() { recordDeath(policy, 1, NaN); }, /nowMs/);
});

var failures = 0;
tests.forEach(function(t) {
    try {
        t.fn();
        console.log('  ok   ' + t.name);
    } catch (e) {
        failures++;
        console.log('  FAIL ' + t.name + '\n         ' + e.message);
    }
});
console.log('\n' + (tests.length - failures) + '/' + tests.length + ' passed');
process.exit(failures === 0 ? 0 : 1);
