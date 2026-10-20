'use strict';

// Crash-loop guard for the cluster master in server.js.
//
// The master re-forks a worker every time one dies. When the death is permanent
// — port 80 already held by a stray process, unreadable config, missing module —
// that loop never ends: the master itself stays alive, so systemd keeps
// reporting "active (running)" while the site serves nothing. The dev box sat
// exactly like that for seven hours on 2026-09-10 after a legacy deploy script
// started a second copy under `forever`.
//
// What separates "permanent" from "unlucky" is how long the worker lived. A
// worker that never reached minHealthyUptimeMs never finished starting up.
// Enough of those back to back and the master should exit non-zero, which is
// the one thing a supervisor can actually see and act on.

var DEFAULT_MIN_HEALTHY_UPTIME_MS = 30000;
var DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

function assertPositiveNumber(value, name) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
        throw new TypeError(name + ' must be a positive finite number, got: ' + value);
    }
}

function assertTimestamp(nowMs) {
    if (typeof nowMs !== 'number' || !isFinite(nowMs)) {
        throw new TypeError('nowMs must be a finite number, got: ' + nowMs);
    }
}

function buildPolicy(minHealthyUptimeMs, maxConsecutiveFailures, consecutiveFailures, startTimes) {
    return Object.freeze({
        minHealthyUptimeMs: minHealthyUptimeMs,
        maxConsecutiveFailures: maxConsecutiveFailures,
        consecutiveFailures: consecutiveFailures,
        startTimes: Object.freeze(startTimes)
    });
}

// options.minHealthyUptimeMs   how long a worker must live to count as started
// options.maxConsecutiveFailures  startup failures in a row before giving up
function createRestartPolicy(options) {
    var opts = options || {};
    var minHealthyUptimeMs = opts.minHealthyUptimeMs === undefined ?
        DEFAULT_MIN_HEALTHY_UPTIME_MS : opts.minHealthyUptimeMs;
    var maxConsecutiveFailures = opts.maxConsecutiveFailures === undefined ?
        DEFAULT_MAX_CONSECUTIVE_FAILURES : opts.maxConsecutiveFailures;

    assertPositiveNumber(minHealthyUptimeMs, 'minHealthyUptimeMs');
    assertPositiveNumber(maxConsecutiveFailures, 'maxConsecutiveFailures');

    return buildPolicy(minHealthyUptimeMs, maxConsecutiveFailures, 0, {});
}

// Returns a new policy that remembers when this worker came online.
function recordStart(policy, workerId, nowMs) {
    assertTimestamp(nowMs);

    var startTimes = Object.assign({}, policy.startTimes);
    startTimes[workerId] = nowMs;

    return buildPolicy(
        policy.minHealthyUptimeMs,
        policy.maxConsecutiveFailures,
        policy.consecutiveFailures,
        startTimes
    );
}

// Returns { policy, shouldRefork, consecutiveFailures, uptimeMs } for a dead
// worker. A worker we never saw start is treated as an immediate failure.
function recordDeath(policy, workerId, nowMs) {
    assertTimestamp(nowMs);

    var startedAt = policy.startTimes[workerId];
    var uptimeMs = startedAt === undefined ? 0 : nowMs - startedAt;
    var isStartupFailure = uptimeMs < policy.minHealthyUptimeMs;
    var consecutiveFailures = isStartupFailure ? policy.consecutiveFailures + 1 : 0;

    var startTimes = Object.assign({}, policy.startTimes);
    delete startTimes[workerId];

    return Object.freeze({
        policy: buildPolicy(
            policy.minHealthyUptimeMs,
            policy.maxConsecutiveFailures,
            consecutiveFailures,
            startTimes
        ),
        shouldRefork: consecutiveFailures < policy.maxConsecutiveFailures,
        consecutiveFailures: consecutiveFailures,
        uptimeMs: uptimeMs
    });
}

module.exports = {
    createRestartPolicy: createRestartPolicy,
    recordStart: recordStart,
    recordDeath: recordDeath
};
