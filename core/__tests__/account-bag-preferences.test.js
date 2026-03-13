const test = require('node:test');
const assert = require('node:assert/strict');

const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const accountBagPreferencesModulePath = require.resolve('../src/services/account-bag-preferences');

function mockModule(modulePath, exports) {
    const previous = require.cache[modulePath];
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };

    return () => {
        if (previous) require.cache[modulePath] = previous;
        else delete require.cache[modulePath];
    };
}

function createMysqlMock(initialState = {}) {
    const state = {
        accounts: Array.isArray(initialState.accounts) ? initialState.accounts.map(item => ({ ...item })) : [],
        preferences: Array.isArray(initialState.preferences) ? initialState.preferences.map(item => ({ ...item })) : [],
    };

    async function handleQuery(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalizedSql.startsWith('select purchase_memory, activity_history, plantable_seed_snapshot, mall_resolver_cache from account_bag_preferences where account_id = ?')) {
            const accountId = String(params[0] || '');
            const row = state.preferences.find(item => String(item.account_id) === accountId) || null;
            return [row ? [row] : []];
        }

        if (normalizedSql.startsWith('insert into account_bag_preferences')) {
            const accountId = String(params[params.length - 1] || '');
            const account = state.accounts.find(item => String(item.id) === accountId);
            if (!account) {
                return [{ affectedRows: 0 }];
            }

            const nextRow = {
                id: state.preferences.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
                account_id: account.id,
                purchase_memory: params[0],
                activity_history: params[1],
                plantable_seed_snapshot: params[2],
                mall_resolver_cache: params[3],
            };
            const existingIndex = state.preferences.findIndex(item => String(item.account_id) === accountId);
            if (existingIndex >= 0) {
                nextRow.id = state.preferences[existingIndex].id;
                state.preferences[existingIndex] = nextRow;
            } else {
                state.preferences.push(nextRow);
            }
            return [{ affectedRows: 1 }];
        }

        return [[]];
    }

    return {
        isMysqlInitialized() {
            return true;
        },
        getPool() {
            return {
                query: handleQuery,
                execute: handleQuery,
            };
        },
        __state: state,
    };
}

test('account bag preferences persist purchase memory and activity history per account', async () => {
    const mysqlMock = createMysqlMock({
        accounts: [{ id: 101 }],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[accountBagPreferencesModulePath];
        const { getAccountBagPreferences, saveAccountBagPreferences } = require(accountBagPreferencesModulePath);

        const saved = await saveAccountBagPreferences('101', {
            purchaseMemory: {
                'mall:1': { count: 3, lastPurchasedAt: 1710000000000, name: '神奇肥料' },
            },
            activityHistory: [
                {
                    ts: 1710000000001,
                    type: 'purchase',
                    title: '神奇肥料 x3',
                    summary: '购买成功',
                    goodsId: 1,
                },
            ],
        });

        assert.deepEqual(saved, {
            purchaseMemory: {
                'mall:1': { count: 3, lastPurchasedAt: 1710000000000, name: '神奇肥料' },
            },
            activityHistory: [
                {
                    ts: 1710000000001,
                    type: 'purchase',
                    sourceType: '',
                    entryKey: '',
                    goodsId: 1,
                    goodsName: '',
                    itemId: 0,
                    itemName: '',
                    interactionType: '',
                    title: '神奇肥料 x3',
                    summary: '购买成功',
                    count: 0,
                    soldCount: 0,
                    soldKinds: 0,
                    goldEarned: 0,
                    sectionLabel: '',
                    priceLabel: '',
                    itemIds: [],
                    landIds: [],
                    details: [],
                },
            ],
            plantableSeedSnapshot: {
                generatedAt: 0,
                seeds: [],
            },
            mallResolverCache: {
                fertilizerGoodsByType: {
                    normal: null,
                    organic: null,
                },
                lastAlertAt: 0,
                lastAlertReason: '',
            },
        });

        const loaded = await getAccountBagPreferences('101');
        assert.deepEqual(loaded, saved);
        assert.equal(mysqlMock.__state.preferences.length, 1);
    } finally {
        delete require.cache[accountBagPreferencesModulePath];
        restoreMysql();
    }
});

test('account bag preferences persist plantable seed snapshot and mall resolver cache', async () => {
    const mysqlMock = createMysqlMock({
        accounts: [{ id: 202 }],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[accountBagPreferencesModulePath];
        const { getAccountBagPreferences, saveAccountBagPreferences } = require(accountBagPreferencesModulePath);

        await saveAccountBagPreferences('202', {
            plantableSeedSnapshot: {
                generatedAt: 1710000001111,
                seeds: [
                    { seedId: 20059, name: '银杏树苗', count: 4, usableCount: 3, reservedCount: 1, requiredLevel: 27, plantSize: 2, image: '/seed.png', unlocked: true },
                ],
            },
            mallResolverCache: {
                fertilizerGoodsByType: {
                    normal: { goodsId: 1003, type: 'normal', name: '10小时化肥', packHours: 10, priceItemId: 1002, priceValue: 34, resolvedAt: 1710000002222 },
                    organic: null,
                },
                lastAlertAt: 1710000003333,
                lastAlertReason: 'normal:cache_stale',
            },
        });

        const loaded = await getAccountBagPreferences('202');
        assert.deepEqual(loaded, {
            purchaseMemory: {},
            activityHistory: [],
            plantableSeedSnapshot: {
                generatedAt: 1710000001111,
                seeds: [
                    { seedId: 20059, name: '银杏树苗', count: 4, usableCount: 3, reservedCount: 1, requiredLevel: 27, plantSize: 2, image: '/seed.png', unlocked: true },
                ],
            },
            mallResolverCache: {
                fertilizerGoodsByType: {
                    normal: { goodsId: 1003, type: 'normal', name: '10小时化肥', packHours: 10, priceItemId: 1002, priceValue: 34, resolvedAt: 1710000002222 },
                    organic: null,
                },
                lastAlertAt: 1710000003333,
                lastAlertReason: 'normal:cache_stale',
            },
        });
    } finally {
        delete require.cache[accountBagPreferencesModulePath];
        restoreMysql();
    }
});

test('account bag preferences read returns null before mysql initialization', async () => {
    let getPoolCalls = 0;
    const restoreMysql = mockModule(mysqlDbModulePath, {
        isMysqlInitialized() {
            return false;
        },
        getPool() {
            getPoolCalls += 1;
            throw new Error('MySQL pool is not initialized. Call initMysql() first.');
        },
    });

    try {
        delete require.cache[accountBagPreferencesModulePath];
        const { getAccountBagPreferences } = require(accountBagPreferencesModulePath);

        const loaded = await getAccountBagPreferences('303');
        assert.equal(loaded, null);
        assert.equal(getPoolCalls, 0);
    } finally {
        delete require.cache[accountBagPreferencesModulePath];
        restoreMysql();
    }
});
