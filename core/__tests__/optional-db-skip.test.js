const test = require('node:test');
const assert = require('node:assert/strict');

const warehouseModulePath = require.resolve('../src/services/warehouse');
const mallModulePath = require.resolve('../src/services/mall');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const protoModulePath = require.resolve('../src/utils/proto');
const utilsModulePath = require.resolve('../src/utils/utils');
const accountBagPreferencesModulePath = require.resolve('../src/services/account-bag-preferences');
const statusModulePath = require.resolve('../src/services/status');
const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const monthcardModulePath = require.resolve('../src/services/monthcard');
const warehouseServiceModulePath = require.resolve('../src/services/warehouse');

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

function createMallTypes(goodsList) {
    return {
        GetMallListBySlotTypeRequest: {
            create: (value) => value || {},
            encode: (value) => ({ finish: () => value }),
        },
        GetMallListBySlotTypeResponse: {
            decode: () => ({ goods_list: goodsList }),
        },
        MallGoods: {
            decode: (value) => value,
        },
        PurchaseRequest: {
            create: (value) => value || {},
            encode: (value) => ({ finish: () => value }),
        },
        PurchaseResponse: {
            decode: () => ({ ok: true }),
        },
    };
}

test('getPlantableBagSeeds skips snapshot persistence before mysql initialization', async () => {
    const warnings = [];
    const preferenceCalls = { get: 0, save: 0 };
    const restoreFns = [
        mockModule(gameConfigModulePath, {
            getFruitName: () => '',
            getPlantByFruitId: () => null,
            getPlantBySeedId: (seedId) => (Number(seedId) === 2001 ? {
                name: '白萝卜',
                land_level_need: 1,
                size: 1,
            } : null),
            getPlantNameBySeedId: (seedId) => (Number(seedId) === 2001 ? '白萝卜' : ''),
            getSeedImageBySeedId: (seedId) => (Number(seedId) === 2001 ? '/seed.png' : ''),
            getItemById: (itemId) => (Number(itemId) === 2001 ? {
                name: '白萝卜种子',
                type: 0,
                price: 12,
                level: 1,
                interaction_type: '',
                desc: '',
                effectDesc: '',
                rarity: 0,
                rarity_color: '',
                can_use: 1,
                max_count: 999,
                max_own: 999,
            } : null),
            getItemImageById: (itemId) => (Number(itemId) === 2001 ? '/seed.png' : ''),
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => false,
            getTradeConfig: () => ({}),
            getConfigSnapshot: () => ({
                inventoryPlanting: {
                    globalKeepCount: 0,
                    reserveRules: [],
                },
            }),
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async () => ({ body: Buffer.alloc(0) }),
            networkEvents: {},
            getUserState: () => ({ level: 10 }),
        }),
        mockModule(protoModulePath, {
            types: {
                BagRequest: {
                    create: (value) => value || {},
                    encode: (value) => ({ finish: () => value }),
                },
                BagReply: {
                    decode: () => ({
                        item_bag: {
                            items: [{ id: 2001, count: 5, uid: 1 }],
                        },
                    }),
                },
            },
        }),
        mockModule(utilsModulePath, {
            toLong: (value) => value,
            toNum: (value) => Number(value) || 0,
            log() {},
            logWarn(scope, message) {
                warnings.push({ scope, message });
            },
            sleep: async () => {},
        }),
        mockModule(accountBagPreferencesModulePath, {
            async getAccountBagPreferences() {
                preferenceCalls.get += 1;
                return null;
            },
            async saveAccountBagPreferences() {
                preferenceCalls.save += 1;
            },
        }),
        mockModule(statusModulePath, {
            updateStatusGold() {},
        }),
        mockModule(mysqlDbModulePath, {
            isMysqlInitialized() {
                return false;
            },
        }),
    ];

    try {
        delete require.cache[warehouseModulePath];
        const { getPlantableBagSeeds } = require(warehouseModulePath);

        const seeds = await getPlantableBagSeeds({ accountId: '1008' });
        assert.deepEqual(seeds, [
            {
                seedId: 2001,
                name: '白萝卜',
                count: 5,
                usableCount: 5,
                reservedCount: 0,
                requiredLevel: 1,
                plantSize: 1,
                image: '/seed.png',
                unlocked: true,
            },
        ]);
        assert.deepEqual(preferenceCalls, { get: 0, save: 0 });
        assert.equal(
            warnings.some(item => String(item.message || '').includes('保存背包种子快照失败')),
            false,
        );
    } finally {
        delete require.cache[warehouseModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});

test('autoBuyFertilizer skips resolver cache persistence before mysql initialization', async () => {
    const purchaseCalls = [];
    const warnings = [];
    const preferenceCalls = { get: 0, save: 0 };
    const previousAccountId = process.env.FARM_ACCOUNT_ID;
    process.env.FARM_ACCOUNT_ID = '1008';

    const restoreFns = [
        mockModule(gameConfigModulePath, {
            getItemById: () => ({}),
            getItemImageById: () => '',
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async (_serviceName, methodName, body) => {
                if (methodName === 'GetMallListBySlotType') {
                    return { body: Buffer.alloc(0) };
                }
                if (methodName === 'Purchase') {
                    purchaseCalls.push({ goodsId: Number(body.goods_id || 0), count: Number(body.count || 0) });
                    return { body: Buffer.alloc(0) };
                }
                throw new Error(`unexpected method: ${methodName}`);
            },
            getUserState: () => ({ coupon: 999 }),
        }),
        mockModule(protoModulePath, {
            types: createMallTypes([
                { goods_id: 1003, name: '10小时化肥', price: 34 },
            ]),
        }),
        mockModule(utilsModulePath, {
            toNum: (value) => Number(value) || 0,
            log() {},
            logWarn(scope, message) {
                warnings.push({ scope, message });
            },
            sleep: async () => {},
        }),
        mockModule(monthcardModulePath, {
            getMonthCardInfos: async () => ({ infos: [] }),
            claimMonthCardReward: async () => ({}),
        }),
        mockModule(warehouseServiceModulePath, {
            getBag: async () => ({ ok: true }),
            getBagItems: () => ([
                { id: 1002, count: 999 },
                { id: 1011, count: 2 * 3600 },
            ]),
            getContainerHoursFromBagItems: () => ({ normal: 2, organic: 0 }),
        }),
        mockModule(storeModulePath, {
            getAutomation: () => ({
                fertilizer_buy_limit: 10,
                fertilizer_buy_type: 'normal',
                fertilizer_buy_mode: 'threshold',
                fertilizer_buy_threshold_normal: 24,
                fertilizer_buy_threshold_organic: 24,
            }),
        }),
        mockModule(accountBagPreferencesModulePath, {
            async getAccountBagPreferences() {
                preferenceCalls.get += 1;
                return null;
            },
            async saveAccountBagPreferences() {
                preferenceCalls.save += 1;
                throw new Error('unexpected persistence attempt');
            },
        }),
        mockModule(mysqlDbModulePath, {
            isMysqlInitialized() {
                return false;
            },
        }),
    ];

    try {
        delete require.cache[mallModulePath];
        const { autoBuyFertilizer } = require(mallModulePath);

        const bought = await autoBuyFertilizer(true);
        assert.equal(bought, 3);
        assert.deepEqual(purchaseCalls, [{ goodsId: 1003, count: 3 }]);
        assert.deepEqual(preferenceCalls, { get: 1, save: 0 });
        assert.equal(
            warnings.some(item => String(item.message || '').includes('保存购肥礼包识别缓存失败')),
            false,
        );
    } finally {
        delete require.cache[mallModulePath];
        restoreFns.reverse().forEach(restore => restore());
        if (previousAccountId === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousAccountId;
    }
});
