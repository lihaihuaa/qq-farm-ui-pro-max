const test = require('node:test');
const assert = require('node:assert/strict');
const { version: packageVersion } = require('../package.json');

const { WorkerClient, buildAssignedAccountFingerprint } = require('../src/cluster/worker-client');

function createLogger() {
    const calls = [];
    return {
        calls,
        info: (...args) => calls.push(['info', ...args]),
        warn: (...args) => calls.push(['warn', ...args]),
        error: (...args) => calls.push(['error', ...args]),
        debug: (...args) => calls.push(['debug', ...args]),
    };
}

function createSocket() {
    const handlers = new Map();
    const emitted = [];
    const calls = [];
    return {
        handlers,
        emitted,
        calls,
        connected: true,
        on(event, handler) {
            handlers.set(event, handler);
        },
        emit(event, payload) {
            emitted.push([event, payload]);
        },
        removeAllListeners() {
            calls.push('removeAllListeners');
            handlers.clear();
        },
        disconnect() {
            calls.push('disconnect');
            this.connected = false;
        },
        close() {
            calls.push('close');
            this.connected = false;
        },
    };
}

test('WorkerClient init wires jobs, runtime engine, shutdown handlers and master socket', async () => {
    const socket = createSocket();
    const logger = createLogger();
    const calls = [];
    const intervalHandles = [];
    const runtimeEngine = {
        async start(options) {
            calls.push(['runtime.start', options]);
        },
        async stop() {
            calls.push(['runtime.stop']);
        },
        startWorker: async () => {},
        stopWorker: () => {},
        restartWorker: async () => {},
    };

    const client = new WorkerClient('http://master:3000', 'worker-token', {
        processRef: { env: {}, pid: 4321 },
        ioFactory: (url, options) => {
            calls.push(['ioFactory', url, options]);
            return socket;
        },
        createRuntimeEngineRef: (options) => {
            calls.push(['createRuntimeEngine', options.processRef.pid]);
            return runtimeEngine;
        },
        initJobsRef: () => {
            calls.push(['initJobs']);
            return { stop() { calls.push(['jobs.stop']); } };
        },
        initDatabaseRef: async () => {
            calls.push(['database.init']);
        },
        closeDatabaseRef: async () => {
            calls.push(['database.close']);
        },
        registerRuntimeShutdownHandlersRef: (options) => {
            calls.push(['registerShutdown', typeof options.runtimeEngine.stop]);
            return { dispose() { calls.push(['shutdown.dispose']); } };
        },
        setIntervalRef: (handler, delay) => {
            intervalHandles.push(['set', delay, typeof handler]);
            return { id: 'heartbeat' };
        },
        clearIntervalRef: (handle) => {
            intervalHandles.push(['clear', handle && handle.id]);
        },
        logger,
    });

    await client.init();

    assert.deepEqual(calls.slice(0, 5), [
        ['database.init'],
        ['initJobs'],
        ['createRuntimeEngine', 4321],
        ['registerShutdown', 'function'],
        ['runtime.start', { startAdminServer: false, autoStartAccounts: false }],
    ]);
    assert.equal(calls[5][0], 'ioFactory');
    assert.equal(calls[5][1], 'http://master:3000');
    assert.equal(calls[5][2].auth.token, 'worker-token');
    assert.match(calls[5][2].auth.nodeId, /^worker-4321-/);

    const connectHandler = socket.handlers.get('connect');
    assert.equal(typeof connectHandler, 'function');
    connectHandler();
    assert.deepEqual(socket.emitted, [
        ['worker:ready', undefined],
        ['worker:heartbeat', {
            nodeId: calls[5][2].auth.nodeId,
            role: 'worker',
            status: 'ready',
            version: packageVersion,
            assignedCount: 0,
            updatedAt: socket.emitted[1][1].updatedAt,
        }],
    ]);
    assert.deepEqual(intervalHandles, [['set', 15000, 'function']]);
});

test('WorkerClient stop tears down shutdown hooks, socket, jobs and runtime engine', async () => {
    const socket = createSocket();
    const logger = createLogger();
    const calls = [];
    const intervalHandles = [];
    const client = new WorkerClient('', '', {
        processRef: { env: {}, pid: 1 },
        ioFactory: () => socket,
        createRuntimeEngineRef: () => ({
            async start() {},
            async stop(options) {
                calls.push(['runtime.stop', options]);
            },
            startWorker: async () => {},
            stopWorker: () => {},
            restartWorker: async () => {},
        }),
        initJobsRef: () => ({
            stop() {
            calls.push(['jobs.stop']);
            },
        }),
        initDatabaseRef: async () => {
            calls.push(['database.init']);
        },
        closeDatabaseRef: async () => {
            calls.push(['database.close']);
        },
        registerRuntimeShutdownHandlersRef: () => ({
            dispose() {
                calls.push(['shutdown.dispose']);
            },
        }),
        setIntervalRef: () => ({ id: 'heartbeat' }),
        clearIntervalRef: (handle) => {
            intervalHandles.push(['clear', handle && handle.id]);
        },
        logger,
    });

    await client.init();
    const connectHandler = socket.handlers.get('connect');
    connectHandler();
    client.assignedAccounts = new Set(['1']);
    client.assignedAccountData = new Map([['1', '{"id":"1"}']]);

    await client.stop();

    assert.deepEqual(calls, [
        ['database.init'],
        ['shutdown.dispose'],
        ['jobs.stop'],
        ['runtime.stop', { stopAdminServer: false }],
        ['database.close'],
    ]);
    assert.deepEqual(socket.calls, ['removeAllListeners', 'disconnect', 'close']);
    assert.equal(client.assignedAccounts.size, 0);
    assert.equal(client.assignedAccountData.size, 0);
    assert.deepEqual(intervalHandles, [['clear', 'heartbeat']]);
});

test('WorkerClient account diff stops removed accounts, restarts changed accounts and starts new ones', async () => {
    const socket = createSocket();
    const logger = createLogger();
    const calls = [];

    const client = new WorkerClient('', '', {
        processRef: { env: {}, pid: 99 },
        ioFactory: () => socket,
        createRuntimeEngineRef: () => ({
            async start() {},
            async stop() {},
            async startWorker(account) {
                calls.push(['startWorker', account.id]);
            },
            stopWorker(accountId) {
                calls.push(['stopWorker', accountId]);
            },
            async restartWorker(account) {
                calls.push(['restartWorker', account.id]);
            },
        }),
        initJobsRef: () => ({ stop() {} }),
        initDatabaseRef: async () => {},
        closeDatabaseRef: async () => {},
        registerRuntimeShutdownHandlersRef: () => ({ dispose() {} }),
        logger,
    });

    await client.init();
    client.assignedAccounts = new Set(['removed', 'changed', 'same']);
    client.assignedAccountData = new Map([
        ['removed', buildAssignedAccountFingerprint({ id: 'removed', name: 'A' })],
        ['changed', buildAssignedAccountFingerprint({ id: 'changed', name: 'B', code: 'old' })],
        ['same', buildAssignedAccountFingerprint({ id: 'same', name: 'C' })],
    ]);

    const assignHandler = socket.handlers.get('master:assign:accounts');
    await assignHandler({
        accounts: [
            { id: 'changed', name: 'B', code: 'new' },
            { id: 'same', name: 'C' },
            { id: 'new', name: 'D' },
        ],
    });

    assert.deepEqual(calls, [
        ['stopWorker', 'removed'],
        ['restartWorker', 'changed'],
        ['startWorker', 'new'],
    ]);
    assert.deepEqual([...client.assignedAccounts], ['changed', 'same', 'new']);
    assert.equal(client.assignedAccountData.get('same'), buildAssignedAccountFingerprint({ id: 'same', name: 'C' }));
    assert.equal(client.assignedAccountData.get('new'), buildAssignedAccountFingerprint({ id: 'new', name: 'D' }));
});

test('WorkerClient account diff ignores runtime-only field changes after master reconnect', async () => {
    const socket = createSocket();
    const logger = createLogger();
    const calls = [];

    const client = new WorkerClient('', '', {
        processRef: { env: {}, pid: 100 },
        ioFactory: () => socket,
        createRuntimeEngineRef: () => ({
            async start() {},
            async stop() {},
            async startWorker(account) {
                calls.push(['startWorker', account.id]);
            },
            stopWorker(accountId) {
                calls.push(['stopWorker', accountId]);
            },
            async restartWorker(account) {
                calls.push(['restartWorker', account.id]);
            },
        }),
        initJobsRef: () => ({ stop() {} }),
        initDatabaseRef: async () => {},
        closeDatabaseRef: async () => {},
        registerRuntimeShutdownHandlersRef: () => ({ dispose() {} }),
        logger,
    });

    await client.init();
    client.assignedAccounts = new Set(['1']);
    client.assignedAccountData = new Map([
        ['1', buildAssignedAccountFingerprint({
            id: '1',
            platform: 'wechat',
            uin: 'wxd8101315',
            code: 'stable-login-code',
        })],
    ]);

    const assignHandler = socket.handlers.get('master:assign:accounts');
    await assignHandler({
        accounts: [
            {
                id: '1',
                platform: 'wechat',
                uin: 'wxd8101315',
                code: 'stable-login-code',
                running: true,
                connected: false,
                gold: 12345,
                exp: 678,
                lastStatusAt: Date.now(),
                wsError: { code: 400, message: 'temporary' },
            },
        ],
    });

    assert.deepEqual(calls, []);
    assert.equal(
        client.assignedAccountData.get('1'),
        buildAssignedAccountFingerprint({
            id: '1',
            platform: 'wechat',
            uin: 'wxd8101315',
            code: 'stable-login-code',
        }),
    );
});
