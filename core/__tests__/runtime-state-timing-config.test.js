const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeState } = require('../src/runtime/runtime-state');

test('buildConfigSnapshotForAccount includes latest system timing config for worker sync', () => {
    const runtimeState = createRuntimeState({
        store: {
            getConfigSnapshot: () => ({ automation: { farm: true } }),
            getTimingConfig: () => ({ ghostingMinMin: 7, ghostingMaxMin: 9, ghostingProbability: 0.35 }),
            getAutomation: () => ({ farm: true }),
            getPlantingStrategy: () => 'preferred',
            getPreferredSeed: () => 0,
            getIntervals: () => ({ farm: 60 }),
            getFriendQuietHours: () => ({ enabled: false, start: '23:00', end: '07:00' }),
            getFriendBlacklist: () => [],
            getStealFilterConfig: () => ({ enabled: false, mode: 'blacklist', plantIds: [] }),
            getStealFriendFilterConfig: () => ({ enabled: false, mode: 'blacklist', friendIds: [] }),
            getStakeoutStealConfig: () => ({ enabled: false, delaySec: 3 }),
            getSkipStealRadishConfig: () => ({ enabled: false }),
            getForceGetAllConfig: () => ({ enabled: false }),
            getReportConfig: () => ({ enabled: false }),
            getReportState: () => ({ lastSentAt: 0 }),
        },
    });

    const snapshot = runtimeState.buildConfigSnapshotForAccount('acc-1');

    assert.deepEqual(snapshot.timingConfig, {
        ghostingMinMin: 7,
        ghostingMaxMin: 9,
        ghostingProbability: 0.35,
    });
});
