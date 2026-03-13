const test = require('node:test');
const assert = require('node:assert/strict');

const { createDataProvider } = require('../src/runtime/data-provider');

test('getSchedulerStatus aggregates runtime scheduler state and reloadable module targets from worker api', async () => {
    const calls = [];
    const provider = createDataProvider({
        workers: { 'acc-1': { process: {}, status: {}, logs: [] } },
        globalLogs: [],
        accountLogs: [],
        store: {
            getConfigSnapshot: () => ({}),
            resolveAccountZone: () => 'qq_zone',
        },
        accountRepository: null,
        getAccounts: async () => ({ accounts: [{ id: 'acc-1', name: '账号1' }] }),
        callWorkerApi: async (accountId, method) => {
            calls.push([accountId, method]);
            if (method === 'getSchedulers') {
                return { schedulerCount: 2 };
            }
            if (method === 'getReloadableRuntimeModules') {
                return [{ target: 'farm', modules: ['farm', 'friend'] }];
            }
            if (method === 'getRuntimeReloadHistory') {
                return [{ target: 'farm', result: 'ok', durationMs: 600 }];
            }
            throw new Error(`unexpected method: ${method}`);
        },
        buildDefaultStatus: () => ({}),
        normalizeStatusForPanel: status => status,
        filterLogs: logs => logs,
        addAccountLog: () => {},
        nextConfigRevision: () => 1,
        broadcastConfigToWorkers: () => {},
        startWorker: async () => true,
        stopWorker: async () => true,
        restartWorker: async () => true,
    });

    const result = await provider.getSchedulerStatus('acc-1');

    assert.deepEqual(calls, [
        ['acc-1', 'getSchedulers'],
        ['acc-1', 'getReloadableRuntimeModules'],
        ['acc-1', 'getRuntimeReloadHistory'],
    ]);
    assert.equal(result.accountId, 'acc-1');
    assert.equal(result.workerError, '');
    assert.equal(result.reloadError, '');
    assert.deepEqual(result.worker, { schedulerCount: 2 });
    assert.deepEqual(result.reloadTargets, [{ target: 'farm', modules: ['farm', 'friend'] }]);
    assert.deepEqual(result.reloadHistory, [{ target: 'farm', result: 'ok', durationMs: 600 }]);
    assert.equal(typeof result.runtime, 'object');
    assert.equal(typeof result.runtime.schedulerCount, 'number');
});

test('reloadRuntimeModule forwards target and options to worker api', async () => {
    const calls = [];
    const provider = createDataProvider({
        workers: { 'acc-1': { process: {}, status: {}, logs: [] } },
        globalLogs: [],
        accountLogs: [],
        store: {
            getConfigSnapshot: () => ({}),
            resolveAccountZone: () => 'qq_zone',
        },
        accountRepository: null,
        getAccounts: async () => ({ accounts: [{ id: 'acc-1', name: '账号1' }] }),
        callWorkerApi: async (accountId, method, ...args) => {
            calls.push([accountId, method, ...args]);
            return { ok: true };
        },
        buildDefaultStatus: () => ({}),
        normalizeStatusForPanel: status => status,
        filterLogs: logs => logs,
        addAccountLog: () => {},
        nextConfigRevision: () => 1,
        broadcastConfigToWorkers: () => {},
        startWorker: async () => true,
        stopWorker: async () => true,
        restartWorker: async () => true,
    });

    const result = await provider.reloadRuntimeModule('acc-1', 'business', { reason: 'manual' });

    assert.deepEqual(calls, [
        ['acc-1', 'reloadRuntimeModule', 'business', { reason: 'manual' }],
    ]);
    assert.deepEqual(result, { ok: true });
});

test('syncSystemTimingConfig bumps revision and broadcasts to all workers', async () => {
    const broadcastCalls = [];
    let revision = 0;
    const provider = createDataProvider({
        workers: { 'acc-1': { process: {}, status: {}, logs: [] } },
        globalLogs: [],
        accountLogs: [],
        store: {
            getConfigSnapshot: () => ({}),
            resolveAccountZone: () => 'qq_zone',
        },
        accountRepository: null,
        getAccounts: async () => ({ accounts: [{ id: 'acc-1', name: '账号1' }] }),
        callWorkerApi: async () => ({}),
        buildDefaultStatus: () => ({}),
        normalizeStatusForPanel: status => status,
        filterLogs: logs => logs,
        addAccountLog: () => {},
        nextConfigRevision: () => {
            revision += 1;
            return revision;
        },
        broadcastConfigToWorkers: (accountId) => {
            broadcastCalls.push(accountId);
        },
        startWorker: async () => true,
        stopWorker: async () => true,
        restartWorker: async () => true,
    });

    const result = await provider.syncSystemTimingConfig();

    assert.deepEqual(result, { configRevision: 1 });
    assert.deepEqual(broadcastCalls, [undefined]);
});
