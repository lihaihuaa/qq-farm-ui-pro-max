const { Buffer } = require('node:buffer');
/**
 * 商城自动购买
 * 当前实现：按分类自动购买普通/有机化肥
 */

const { getItemById, getItemImageById } = require('../config/gameConfig');
const { sendMsgAsync, getUserState } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum, log, logWarn, sleep } = require('../utils/utils');
const { getMonthCardInfos, claimMonthCardReward } = require('./monthcard');
const { getBag, getBagItems, getContainerHoursFromBagItems } = require('./warehouse');
const { getAccountBagPreferences, saveAccountBagPreferences } = require('./account-bag-preferences');
const { isMysqlInitialized } = require('./mysql-db');

const ORGANIC_FERTILIZER_MALL_GOODS_ID = 1002;
const NORMAL_FERTILIZER_MALL_GOODS_ID = 1003;
const COUPON_ITEM_ID = 1002;
const FERTILIZER_CONTAINER_LIMIT_HOURS = 990;
const BUY_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_ROUNDS = 100;
const BUY_PER_ROUND = 10;
const FREE_GIFTS_DAILY_KEY = 'mall_free_gifts';
const FERTILIZER_ITEM_HOURS = new Map([
    [80001, { type: 'normal', hours: 1 }],
    [80002, { type: 'normal', hours: 4 }],
    [80003, { type: 'normal', hours: 8 }],
    [80004, { type: 'normal', hours: 12 }],
    [80011, { type: 'organic', hours: 1 }],
    [80012, { type: 'organic', hours: 4 }],
    [80013, { type: 'organic', hours: 8 }],
    [80014, { type: 'organic', hours: 12 }],
]);
const MALL_SLOT_META = Object.freeze({
    1: {
        key: 'gift',
        label: '礼包商城',
        description: '限时礼包、活动礼包与免费福利',
        supportsPurchase: true,
        purchaseHint: '',
    },
    2: {
        key: 'month_card',
        label: '月卡商城',
        description: '月卡购买页与月卡奖励状态',
        supportsPurchase: false,
        purchaseHint: '月卡购买需在游戏内完成支付',
    },
    3: {
        key: 'recharge',
        label: '充值商城',
        description: '钻石充值页，仅展示价格与档位',
        supportsPurchase: false,
        purchaseHint: '充值类商品需在游戏内完成支付',
    },
});

let lastBuyAt = 0;
let buyDoneDateKey = '';
let buyLastSuccessAt = 0;
let buyPausedNoGoldDateKey = '';
let freeGiftDoneDateKey = '';
let freeGiftLastAt = 0;
let freeGiftLastCheckAt = 0;
let fertilizerBuyDailyState = createEmptyFertilizerBuyDailyState();

function createEmptyFertilizerBuyDailyState(date = getDateKey()) {
    return {
        date,
        count: 0,
        typeCounts: { normal: 0, organic: 0 },
        lastDecisionAt: 0,
        result: '',
        reason: '',
        message: '',
        enabledTypes: [],
        missingTypes: [],
        containerHours: { normal: 0, organic: 0 },
        targetHours: { normal: 0, organic: 0 },
        limit: 0,
        lastResolvedGoods: { normal: null, organic: null },
        lastSuccessAt: 0,
    };
}

function getRuntimeAccountId() {
    return String(process.env.FARM_ACCOUNT_ID || '').trim();
}

function normalizeFertilizerTypeCounts(input = {}) {
    return {
        normal: Math.max(0, Number(input && input.normal) || 0),
        organic: Math.max(0, Number(input && input.organic) || 0),
    };
}

function normalizeFertilizerHoursMap(input = {}) {
    return {
        normal: Math.max(0, Number(input && input.normal) || 0),
        organic: Math.max(0, Number(input && input.organic) || 0),
    };
}

function normalizeResolvedFertilizerGoodsMap(input = {}) {
    const source = (input && typeof input === 'object') ? input : {};
    return {
        normal: normalizeResolvedFertilizerGoodsEntry(source.normal, 'normal'),
        organic: normalizeResolvedFertilizerGoodsEntry(source.organic, 'organic'),
    };
}

function ensureFertilizerBuyDailyState(date = getDateKey()) {
    if (fertilizerBuyDailyState.date !== date) {
        fertilizerBuyDailyState = {
            ...createEmptyFertilizerBuyDailyState(date),
            lastSuccessAt: Math.max(0, Number(fertilizerBuyDailyState.lastSuccessAt) || 0),
        };
    }
    return fertilizerBuyDailyState;
}

function applyFertilizerBuyDailyDecision(patch = {}) {
    const today = getDateKey();
    const state = ensureFertilizerBuyDailyState(today);
    fertilizerBuyDailyState = {
        ...state,
        result: String(patch.result || ''),
        reason: String(patch.reason || ''),
        message: String(patch.message || ''),
        enabledTypes: Array.isArray(patch.enabledTypes) ? [...new Set(patch.enabledTypes.map(type => String(type || '').trim()).filter(Boolean))] : [...state.enabledTypes],
        missingTypes: Array.isArray(patch.missingTypes) ? [...new Set(patch.missingTypes.map(type => String(type || '').trim()).filter(Boolean))] : [...state.missingTypes],
        containerHours: patch.containerHours ? normalizeFertilizerHoursMap(patch.containerHours) : normalizeFertilizerHoursMap(state.containerHours),
        targetHours: patch.targetHours ? normalizeFertilizerHoursMap(patch.targetHours) : normalizeFertilizerHoursMap(state.targetHours),
        limit: Math.max(0, Number(patch.limit) || Number(state.limit) || 0),
        lastResolvedGoods: patch.lastResolvedGoods ? normalizeResolvedFertilizerGoodsMap(patch.lastResolvedGoods) : normalizeResolvedFertilizerGoodsMap(state.lastResolvedGoods),
        lastDecisionAt: Math.max(0, Number(patch.lastDecisionAt) || Date.now()),
        lastSuccessAt: Math.max(0, Number(patch.lastSuccessAt) || Number(state.lastSuccessAt) || 0),
    };
    return fertilizerBuyDailyState;
}

function recordFertilizerBought(type, count, date = getDateKey()) {
    const state = ensureFertilizerBuyDailyState(date);
    const safeType = type === 'normal' ? 'normal' : 'organic';
    const safeCount = Math.max(0, Number(count) || 0);
    if (safeCount <= 0) return state;
    fertilizerBuyDailyState = {
        ...state,
        count: Math.max(0, Number(state.count) || 0) + safeCount,
        typeCounts: {
            ...normalizeFertilizerTypeCounts(state.typeCounts),
            [safeType]: Math.max(0, Number(state.typeCounts && state.typeCounts[safeType]) || 0) + safeCount,
        },
        lastSuccessAt: Date.now(),
    };
    buyLastSuccessAt = fertilizerBuyDailyState.lastSuccessAt;
    return fertilizerBuyDailyState;
}

function getMallSlotMeta(slotType = 1) {
    return MALL_SLOT_META[Number(slotType) || 1] || {
        key: `slot_${Number(slotType) || 1}`,
        label: `商城槽位 ${Number(slotType) || 1}`,
        description: '未命名商城槽位',
        supportsPurchase: false,
        purchaseHint: '当前槽位未配置购买能力',
    };
}

function getDateKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function getMallListBySlotType(slotType = 1) {
    const body = types.GetMallListBySlotTypeRequest.encode(types.GetMallListBySlotTypeRequest.create({
        slot_type: Number(slotType) || 1,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.mallpb.MallService', 'GetMallListBySlotType', body);
    return types.GetMallListBySlotTypeResponse.decode(replyBody);
}

async function purchaseMallGoods(goodsId, count = 1) {
    const body = types.PurchaseRequest.encode(types.PurchaseRequest.create({
        goods_id: Number(goodsId) || 0,
        count: Number(count) || 1,
    })).finish();
    const { body: replyBody } = await sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', body);
    return types.PurchaseResponse.decode(replyBody);
}

async function getMallGoodsList(slotType = 1) {
    const mall = await getMallListBySlotType(slotType);
    const raw = Array.isArray(mall && mall.goods_list) ? mall.goods_list : [];
    const goods = [];
    for (const b of raw) {
        try {
            goods.push(types.MallGoods.decode(b));
        } catch {
            // ignore
        }
    }
    return goods;
}

function parseMallPriceMeta(priceField, slotType = 1) {
    if (priceField == null) {
        return {
            itemId: 0,
            value: 0,
            itemName: '',
            itemImage: '',
            label: '',
        };
    }
    if (typeof priceField === 'number') {
        const value = Math.max(0, Math.floor(priceField));
        return {
            itemId: 0,
            value,
            itemName: '',
            itemImage: '',
            label: (Number(slotType) === 2 || Number(slotType) === 3) ? `￥${value}` : String(value),
        };
    }
    const bytes = Buffer.isBuffer(priceField) ? priceField : Buffer.from(priceField || []);
    if (!bytes.length) {
        return {
            itemId: 0,
            value: 0,
            itemName: '',
            itemImage: '',
            label: '',
        };
    }

    let itemId = 0;
    let value = 0;
    try {
        const decoded = types.CoreItem.decode(bytes);
        itemId = toNum(decoded && decoded.id);
        value = Math.max(0, toNum(decoded && decoded.count));
    } catch {
        // ignore and fall back to raw varint scan below
    }

    if (!value) {
        // 从 bytes 中读取 field=2 的 varint 作为价格
        let idx = 0;
        let parsed = 0;
        while (idx < bytes.length) {
            const key = bytes[idx++];
            const field = key >> 3;
            const wire = key & 0x07;
            if (wire !== 0) break;
            let val = 0;
            let shift = 0;
            while (idx < bytes.length) {
                const b = bytes[idx++];
                val |= (b & 0x7F) << shift;
                if ((b & 0x80) === 0) break;
                shift += 7;
            }
            if (field === 1 && !itemId) itemId = val;
            if (field === 2) parsed = val;
        }
        value = Math.max(0, Math.floor(parsed || 0));
    }

    const priceItem = itemId > 0 ? (getItemById(itemId) || {}) : {};
    let label = '';
    if (itemId === 1001) label = `${value} 金币`;
    else if (itemId === 1002) label = `${value} 点券`;
    else if (itemId === 1004) label = `${value} 钻石`;
    else if (itemId > 0 && priceItem.name) label = `${value} ${priceItem.name}`;
    else if (Number(slotType) === 2 || Number(slotType) === 3) label = `￥${value}`;
    else label = String(value);

    return {
        itemId,
        value,
        itemName: String(priceItem.name || ''),
        itemImage: itemId > 0 ? getItemImageById(itemId) : '',
        label,
    };
}

function parseMallPriceValue(priceField, slotType = 1) {
    return Math.max(0, Number(parseMallPriceMeta(priceField, slotType).value || 0));
}

function parseMallIntList(bytesField) {
    const bytes = Buffer.isBuffer(bytesField) ? bytesField : Buffer.from(bytesField || []);
    if (!bytes.length) return [];
    const values = [];
    let idx = 0;
    while (idx < bytes.length) {
        let value = 0;
        let shift = 0;
        while (idx < bytes.length) {
            const b = bytes[idx++];
            value |= (b & 0x7F) << shift;
            if ((b & 0x80) === 0) break;
            shift += 7;
        }
        if (value > 0) values.push(value);
    }
    return values;
}

function buildMallItemPreviews(itemIds = []) {
    return (Array.isArray(itemIds) ? itemIds : [])
        .filter(itemId => Number(itemId) > 0)
        .map((itemId) => {
            const item = getItemById(itemId) || {};
            return {
                id: Number(itemId) || 0,
                name: String(item.name || `物品#${Number(itemId) || 0}`),
                image: getItemImageById(itemId),
                type: Number(item.type) || 0,
                rarity: Number(item.rarity) || 0,
                desc: String(item.desc || ''),
                effectDesc: String(item.effectDesc || ''),
                canUse: Number(item.can_use) === 1,
                level: Number(item.level) || 0,
                price: Number(item.price) || 0,
                interactionType: String(item.interaction_type || ''),
            };
        });
}

function isGenericItemIcon(image = '') {
    return /^\/asset-cache\/item-icons\/item-\d+\.svg$/i.test(String(image || ''));
}

function pickPrimaryMallItem(itemPreviews = []) {
    const previews = Array.isArray(itemPreviews) ? itemPreviews : [];
    return previews.find(item => item.image && !isGenericItemIcon(item.image))
        || previews.find(item => !!item.image)
        || previews[0]
        || null;
}

function normalizeMallGoods(goods, slotType = 1) {
    const row = goods || {};
    const slotMeta = getMallSlotMeta(slotType);
    const itemIds = parseMallIntList(row.item_ids);
    const itemPreviews = buildMallItemPreviews(itemIds);
    const primaryItem = pickPrimaryMallItem(itemPreviews);
    const priceMeta = parseMallPriceMeta(row.price, slotType);
    return {
        sourceType: 'mall',
        entryKey: `mall:${Number(slotType) || 1}:${toNum(row.goods_id)}`,
        goodsId: toNum(row.goods_id),
        name: String(row.name || `商品#${toNum(row.goods_id)}`),
        type: toNum(row.type),
        slotType: Number(slotType) || 1,
        slotKey: slotMeta.key,
        slotLabel: slotMeta.label,
        slotDescription: slotMeta.description,
        isFree: row.is_free === true,
        isLimited: row.is_limited === true,
        discount: String(row.discount || ''),
        priceValue: priceMeta.value,
        priceItemId: priceMeta.itemId,
        priceItemName: priceMeta.itemName,
        priceLabel: row.is_free === true ? '免费领取' : priceMeta.label,
        itemIds,
        image: primaryItem ? String(primaryItem.image || '') : '',
        primaryItemId: primaryItem ? Number(primaryItem.id || 0) : 0,
        summary: primaryItem ? String(primaryItem.effectDesc || primaryItem.desc || '') : String(slotMeta.description || ''),
        itemPreviews,
        supportsPurchase: !!slotMeta.supportsPurchase,
        purchaseDisabledReason: slotMeta.supportsPurchase ? '' : slotMeta.purchaseHint,
    };
}

async function getMallGoodsCatalog(slotType = 1) {
    const goods = await getMallGoodsList(slotType);
    return goods.map(item => normalizeMallGoods(item, slotType));
}

function normalizeMonthCardInfo(info) {
    const goodsId = Number(info && info.goods_id) || 0;
    const reward = info && info.reward ? info.reward : null;
    const rewardId = toNum(reward && reward.id);
    const rewardCount = Math.max(0, toNum(reward && reward.count));
    const item = rewardId > 0 ? (getItemById(rewardId) || {}) : {};
    return {
        goodsId,
        canClaim: !!(info && info.can_claim),
        reward: rewardId > 0
            ? {
                id: rewardId,
                count: rewardCount,
                name: String(item.name || `物品#${rewardId}`),
                image: getItemImageById(rewardId),
                desc: String(item.desc || ''),
                effectDesc: String(item.effectDesc || ''),
            }
            : null,
    };
}

async function getMallCatalog() {
    const sections = [];
    for (const slotType of [1, 2, 3]) {
        const slotMeta = getMallSlotMeta(slotType);
        try {
            const goods = await getMallGoodsCatalog(slotType);
            sections.push({
                slotType,
                slotKey: slotMeta.key,
                label: slotMeta.label,
                description: slotMeta.description,
                supportsPurchase: !!slotMeta.supportsPurchase,
                purchaseHint: slotMeta.purchaseHint,
                goods,
            });
        } catch (error) {
            sections.push({
                slotType,
                slotKey: slotMeta.key,
                label: slotMeta.label,
                description: slotMeta.description,
                supportsPurchase: !!slotMeta.supportsPurchase,
                purchaseHint: slotMeta.purchaseHint,
                goods: [],
                error: error && error.message ? String(error.message) : '加载商城失败',
            });
        }
    }

    let monthCards = [];
    try {
        const reply = await getMonthCardInfos();
        monthCards = (Array.isArray(reply && reply.infos) ? reply.infos : []).map(normalizeMonthCardInfo);
    } catch {
        monthCards = [];
    }

    return { sections, monthCards };
}

function getFertilizerTypeLabel(type) {
    return type === 'normal' ? '普通化肥' : '有机化肥';
}

function getFertilizerCouponBalanceFromBagItems(items = []) {
    for (const item of (Array.isArray(items) ? items : [])) {
        if (toNum(item && item.id) === COUPON_ITEM_ID) {
            return Math.max(0, toNum(item && item.count));
        }
    }
    const state = getUserState() || {};
    return Math.max(0, toNum(state.coupon));
}

function getMallGoodsFertilizerType(goods) {
    const goodsId = toNum(goods && goods.goods_id);
    if ([ORGANIC_FERTILIZER_MALL_GOODS_ID, 1004, 1007, 1008, 1009, 1010].includes(goodsId)) {
        return 'organic';
    }
    if ([NORMAL_FERTILIZER_MALL_GOODS_ID, 1005, 1011, 1012, 1013, 1014].includes(goodsId)) {
        return 'normal';
    }

    const normalized = normalizeMallGoods(goods, 1);
    const itemIds = Array.isArray(normalized.itemIds) ? normalized.itemIds : [];
    let hasNormal = false;
    let hasOrganic = false;
    for (const itemId of itemIds) {
        const meta = FERTILIZER_ITEM_HOURS.get(Number(itemId) || 0);
        if (!meta) continue;
        if (meta.type === 'normal') hasNormal = true;
        if (meta.type === 'organic') hasOrganic = true;
    }
    if (hasOrganic && !hasNormal) return 'organic';
    if (hasNormal && !hasOrganic) return 'normal';

    const name = String(normalized.name || goods && goods.name || '').trim();
    if (name.includes('有机化肥')) return 'organic';
    if (name.includes('化肥') && !name.includes('有机')) return 'normal';
    return '';
}

function getMallGoodsFertilizerHours(goods) {
    const normalized = normalizeMallGoods(goods, 1);
    const itemIds = Array.isArray(normalized.itemIds) ? normalized.itemIds : [];
    let totalHours = 0;
    for (const itemId of itemIds) {
        const meta = FERTILIZER_ITEM_HOURS.get(Number(itemId) || 0);
        if (!meta) continue;
        totalHours += Number(meta.hours || 0);
    }
    if (totalHours > 0) return totalHours;

    const name = String(normalized.name || goods && goods.name || '').trim();
    const match = name.match(/(\d+)\s*小时/);
    if (match) return Math.max(1, Number.parseInt(match[1], 10) || 0);
    return 10;
}

function normalizeResolvedFertilizerGoodsEntry(entry, type) {
    const safeEntry = (entry && typeof entry === 'object') ? entry : {};
    const goodsId = Math.max(0, Number(safeEntry.goodsId) || 0);
    if (goodsId <= 0) return null;
    return {
        goodsId,
        type: type === 'normal' ? 'normal' : 'organic',
        name: String(safeEntry.name || ''),
        packHours: Math.max(0, Number(safeEntry.packHours) || 0),
        priceItemId: Math.max(0, Number(safeEntry.priceItemId) || 0),
        priceValue: Math.max(0, Number(safeEntry.priceValue) || 0),
        resolvedAt: Math.max(0, Number(safeEntry.resolvedAt) || 0),
    };
}

function buildResolvedFertilizerGoodsEntry(candidate, type, resolvedAt = Date.now()) {
    if (!candidate || !candidate.normalized) return null;
    return normalizeResolvedFertilizerGoodsEntry({
        goodsId: Number(candidate.normalized.goodsId || 0),
        type,
        name: String(candidate.normalized.name || ''),
        packHours: Math.max(0, Number(candidate.packHours || 0)),
        priceItemId: Math.max(0, Number(candidate.normalized.priceItemId || 0)),
        priceValue: Math.max(0, Number(candidate.normalized.priceValue || 0)),
        resolvedAt,
    }, type);
}

function getMallResolverCacheHash(cache = {}) {
    const source = (cache && typeof cache === 'object') ? cache : {};
    return JSON.stringify({
        fertilizerGoodsByType: {
            normal: normalizeResolvedFertilizerGoodsEntry(source.fertilizerGoodsByType && source.fertilizerGoodsByType.normal, 'normal'),
            organic: normalizeResolvedFertilizerGoodsEntry(source.fertilizerGoodsByType && source.fertilizerGoodsByType.organic, 'organic'),
        },
        lastAlertAt: Math.max(0, Number(source.lastAlertAt) || 0),
        lastAlertReason: String(source.lastAlertReason || ''),
    });
}

function shouldEmitMallResolverAlert(cache = {}, reason, now = Date.now()) {
    const lastReason = String(cache && cache.lastAlertReason || '');
    const lastAlertAt = Math.max(0, Number(cache && cache.lastAlertAt) || 0);
    return String(reason || '') !== lastReason || (now - lastAlertAt) >= 30 * 60 * 1000;
}

function buildFertilizerMallCandidates(goodsList, type) {
    const preferredGoodsId = type === 'normal'
        ? NORMAL_FERTILIZER_MALL_GOODS_ID
        : ORGANIC_FERTILIZER_MALL_GOODS_ID;
    return (Array.isArray(goodsList) ? goodsList : [])
        .map((goods) => {
            const fertilizerType = getMallGoodsFertilizerType(goods);
            if (fertilizerType !== type) return null;
            const normalized = normalizeMallGoods(goods, 1);
            const goodsId = Number(normalized.goodsId || 0);
            const isPreferredGoods = goodsId === preferredGoodsId;
            if (!isPreferredGoods && Number(normalized.priceItemId || 0) !== COUPON_ITEM_ID) return null;
            return {
                goods,
                normalized,
                packHours: getMallGoodsFertilizerHours(goods),
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const aGoodsId = Number(a.normalized.goodsId || 0);
            const bGoodsId = Number(b.normalized.goodsId || 0);
            const aPreferred = aGoodsId === preferredGoodsId ? 1 : 0;
            const bPreferred = bGoodsId === preferredGoodsId ? 1 : 0;
            const aUnitPrice = Number(a.normalized.priceValue || 0) / Math.max(1, Number(a.packHours || 0));
            const bUnitPrice = Number(b.normalized.priceValue || 0) / Math.max(1, Number(b.packHours || 0));
            return (
                bPreferred - aPreferred
                || Number(b.packHours || 0) - Number(a.packHours || 0)
                || aUnitPrice - bUnitPrice
                || aGoodsId - bGoodsId
            );
        });
}

function resolvePreferredFertilizerMallGoods(goodsList, type, resolverCache = {}) {
    const candidates = buildFertilizerMallCandidates(goodsList, type);
    const cachedEntry = normalizeResolvedFertilizerGoodsEntry(resolverCache && resolverCache.fertilizerGoodsByType && resolverCache.fertilizerGoodsByType[type], type);
    const cachedGoodsId = Math.max(0, Number(cachedEntry && cachedEntry.goodsId) || 0);
    const cachedCandidate = cachedGoodsId > 0
        ? candidates.find(candidate => Number(candidate && candidate.normalized && candidate.normalized.goodsId || 0) === cachedGoodsId)
        : null;
    const selectedCandidate = cachedCandidate || candidates[0] || null;
    return {
        candidate: selectedCandidate,
        candidatesCount: candidates.length,
        cachedGoodsId,
        cacheHit: !!cachedCandidate,
        cacheStale: cachedGoodsId > 0 && !cachedCandidate,
    };
}

async function persistMallResolverCache(accountId, currentPreferences, nextCache) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) return;
    if (!isMysqlInitialized()) return;
    const current = (currentPreferences && typeof currentPreferences === 'object') ? currentPreferences : {};
    if (getMallResolverCacheHash(current.mallResolverCache) === getMallResolverCacheHash(nextCache)) {
        return;
    }
    await saveAccountBagPreferences(normalizedAccountId, {
        ...current,
        mallResolverCache: nextCache,
    });
}

function getEnabledFertilizerBuyTypes(automation = {}) {
    const buyType = String(automation && automation.fertilizer_buy_type || 'organic').trim();
    if (buyType === 'both') return ['organic', 'normal'];
    if (buyType === 'normal') return ['normal'];
    return ['organic'];
}

function getFertilizerBuyTargetHours(automation = {}, type) {
    const mode = String(automation && automation.fertilizer_buy_mode || 'unlimited').trim();
    if (mode === 'threshold') {
        const value = type === 'normal'
            ? Number(automation && automation.fertilizer_buy_threshold_normal)
            : Number(automation && automation.fertilizer_buy_threshold_organic);
        return Math.max(0, Number.isFinite(value) ? value : 24);
    }
    return FERTILIZER_CONTAINER_LIMIT_HOURS;
}

function sortFertilizerBuyTypes(typesToBuy = [], containerHours = {}) {
    return [...new Set(Array.isArray(typesToBuy) ? typesToBuy : [])].sort((a, b) => {
        const aHours = Number(containerHours && containerHours[a] || 0);
        const bHours = Number(containerHours && containerHours[b] || 0);
        return aHours - bHours || String(a).localeCompare(String(b));
    });
}

async function purchaseFertilizerCandidate(candidate, desiredCount, couponBalance) {
    const goodsId = Number(candidate && candidate.normalized && candidate.normalized.goodsId || 0);
    const singlePrice = Math.max(0, Number(candidate && candidate.normalized && candidate.normalized.priceValue || 0));
    const targetCount = Math.max(0, Number(desiredCount || 0));
    let remainingCoupon = Math.max(0, Number(couponBalance || 0));
    let totalBought = 0;
    let pausedNoGold = false;
    let perRound = Math.min(BUY_PER_ROUND, Math.max(1, targetCount));

    if (goodsId <= 0 || targetCount <= 0) {
        return { bought: 0, couponBalance: remainingCoupon, pausedNoGold: false };
    }

    for (let round = 0; round < MAX_ROUNDS && totalBought < targetCount; round++) {
        if (singlePrice > 0 && remainingCoupon < singlePrice) {
            pausedNoGold = true;
            break;
        }

        let roundLimit = targetCount - totalBought;
        if (singlePrice > 0) {
            roundLimit = Math.min(roundLimit, Math.floor(remainingCoupon / singlePrice));
        }
        if (roundLimit <= 0) {
            pausedNoGold = true;
            break;
        }

        const thisRoundBuy = Math.min(perRound, roundLimit);
        if (thisRoundBuy <= 0) break;

        try {
            await purchaseMallGoods(goodsId, thisRoundBuy);
            totalBought += thisRoundBuy;
            if (singlePrice > 0) {
                remainingCoupon = Math.max(0, remainingCoupon - (singlePrice * thisRoundBuy));
            }
            await sleep(300);
        } catch (e) {
            const msg = String((e && e.message) || '');
            if (msg.includes('余额不足') || msg.includes('点券不足') || msg.includes('code=1000019')) {
                if (perRound > 1) {
                    perRound = 1;
                    continue;
                }
                pausedNoGold = true;
            }
            break;
        }
    }

    return {
        bought: totalBought,
        couponBalance: remainingCoupon,
        pausedNoGold,
    };
}

async function autoBuyFertilizerViaMall() {
    const today = getDateKey();
    const { getAutomation } = require('../models/store');
    const automation = getAutomation() || {};
    const limit = Math.max(1, Number(automation.fertilizer_buy_limit) || 100);
    const state = ensureFertilizerBuyDailyState(today);
    let dailyBoughtCount = Math.max(0, Number(state.count) || 0);
    const enabledTypes = getEnabledFertilizerBuyTypes(automation);
    const targetHoursMap = {
        normal: getFertilizerBuyTargetHours(automation, 'normal'),
        organic: getFertilizerBuyTargetHours(automation, 'organic'),
    };

    if (dailyBoughtCount >= limit) {
        buyDoneDateKey = today;
        applyFertilizerBuyDailyDecision({
            result: 'skipped',
            reason: 'daily_limit',
            message: `今日自动购肥已达上限 ${limit}`,
            enabledTypes,
            limit,
            targetHours: targetHoursMap,
        });
        return 0;
    }

    if (enabledTypes.length <= 0) {
        applyFertilizerBuyDailyDecision({
            result: 'skipped',
            reason: 'disabled',
            message: '当前未启用自动购肥类型',
            enabledTypes: [],
            limit,
            targetHours: targetHoursMap,
        });
        return 0;
    }

    const bagReply = await getBag();
    const bagItems = getBagItems(bagReply);
    const containerHours = getContainerHoursFromBagItems(bagItems);
    let couponBalance = getFertilizerCouponBalanceFromBagItems(bagItems);
    const goodsList = await getMallGoodsList(1);
    const accountId = getRuntimeAccountId();
    const preferences = accountId ? await getAccountBagPreferences(accountId).catch(() => null) : null;
    const resolverCache = (preferences && preferences.mallResolverCache && typeof preferences.mallResolverCache === 'object')
        ? preferences.mallResolverCache
        : { fertilizerGoodsByType: { normal: null, organic: null }, lastAlertAt: 0, lastAlertReason: '' };
    const nextResolverCache = {
        fertilizerGoodsByType: {
            normal: normalizeResolvedFertilizerGoodsEntry(resolverCache.fertilizerGoodsByType && resolverCache.fertilizerGoodsByType.normal, 'normal'),
            organic: normalizeResolvedFertilizerGoodsEntry(resolverCache.fertilizerGoodsByType && resolverCache.fertilizerGoodsByType.organic, 'organic'),
        },
        lastAlertAt: Math.max(0, Number(resolverCache.lastAlertAt) || 0),
        lastAlertReason: String(resolverCache.lastAlertReason || ''),
    };
    const resolutions = {};
    const missingTypes = [];
    const staleCacheTypes = [];
    const resolvedGoodsMap = { normal: null, organic: null };
    const now = Date.now();

    for (const type of enabledTypes) {
        const resolution = resolvePreferredFertilizerMallGoods(goodsList, type, resolverCache);
        resolutions[type] = resolution;
        if (resolution.candidate) {
            const cacheEntry = buildResolvedFertilizerGoodsEntry(resolution.candidate, type, now);
            nextResolverCache.fertilizerGoodsByType[type] = cacheEntry;
            resolvedGoodsMap[type] = cacheEntry;
        } else {
            missingTypes.push(type);
        }
        if (resolution.cacheStale) {
            staleCacheTypes.push(type);
            const reason = `${type}:cache_stale`;
            if (shouldEmitMallResolverAlert(resolverCache, reason, now)) {
                logWarn('商城', `${getFertilizerTypeLabel(type)}礼包缓存已失效，已切换到实时扫描结果`, {
                    module: 'warehouse',
                    event: 'fertilizer_buy_cache_stale',
                    result: 'warn',
                    type,
                    cachedGoodsId: resolution.cachedGoodsId,
                });
            }
            nextResolverCache.lastAlertAt = now;
            nextResolverCache.lastAlertReason = reason;
        }
        if (!resolution.candidate) {
            const reason = `${type}:missing_goods`;
            if (shouldEmitMallResolverAlert(resolverCache, reason, now)) {
                logWarn('商城', `未匹配到${getFertilizerTypeLabel(type)}礼包，已尝试 ID、内容物和名称识别`, {
                    module: 'warehouse',
                    event: 'fertilizer_buy_missing_goods',
                    result: 'warn',
                    type,
                });
            }
            nextResolverCache.lastAlertAt = now;
            nextResolverCache.lastAlertReason = reason;
        }
    }

    if (accountId) {
        await persistMallResolverCache(accountId, preferences, nextResolverCache).catch((error) => {
            logWarn('商城', `保存购肥礼包识别缓存失败: ${error.message}`, {
                module: 'warehouse',
                event: 'fertilizer_buy_cache_save',
                result: 'error',
            });
        });
    }

    let totalBought = 0;
    let thresholdSatisfiedTypes = [];
    let pausedNoGold = false;
    for (const type of sortFertilizerBuyTypes(enabledTypes, containerHours)) {
        const resolution = resolutions[type];
        const candidate = resolution && resolution.candidate;
        if (!candidate) continue;

        const currentHours = Math.max(0, Number(containerHours[type] || 0));
        const targetHours = Math.max(0, Number(targetHoursMap[type] || 0));
        if (currentHours >= targetHours) {
            thresholdSatisfiedTypes.push(type);
            continue;
        }

        const packHours = Math.max(1, Number(candidate.packHours || 0) || 10);
        const buyTargetCount = Math.min(
            limit - dailyBoughtCount,
            Math.ceil((targetHours - currentHours) / packHours),
        );
        if (buyTargetCount <= 0) continue;

        const result = await purchaseFertilizerCandidate(candidate, buyTargetCount, couponBalance);
        couponBalance = Math.max(0, Number(result.couponBalance || 0));
        if (result.pausedNoGold) {
            buyPausedNoGoldDateKey = today;
            pausedNoGold = true;
        }
        if (result.bought <= 0) {
            continue;
        }

        totalBought += result.bought;
        dailyBoughtCount += result.bought;
        containerHours[type] = currentHours + (result.bought * packHours);
        recordFertilizerBought(type, result.bought, today);
        log('商城', `自动购买${getFertilizerTypeLabel(type)} x${result.bought}，容器约 ${containerHours[type].toFixed(1)} 小时`, {
            module: 'warehouse',
            event: type === 'normal' ? 'fertilizer_buy_normal' : 'fertilizer_buy_organic',
            result: 'ok',
            count: result.bought,
            type,
            targetHours,
            containerHours: containerHours[type],
        });

        if (dailyBoughtCount >= limit) {
            buyDoneDateKey = today;
            break;
        }
    }

    if (dailyBoughtCount >= limit) {
        buyDoneDateKey = today;
    }

    if (totalBought > 0) {
        const typeCounts = normalizeFertilizerTypeCounts(ensureFertilizerBuyDailyState(today).typeCounts);
        applyFertilizerBuyDailyDecision({
            result: 'purchased',
            reason: 'purchased',
            message: `今日已购 ${typeCounts.normal + typeCounts.organic} 份，普通 ${typeCounts.normal} / 有机 ${typeCounts.organic}`,
            enabledTypes,
            missingTypes,
            containerHours,
            targetHours: targetHoursMap,
            limit,
            lastResolvedGoods: resolvedGoodsMap,
            lastSuccessAt: Date.now(),
        });
        return totalBought;
    }

    if (pausedNoGold) {
        applyFertilizerBuyDailyDecision({
            result: 'skipped',
            reason: 'no_coupon',
            message: '点券不足，已暂停本轮自动购肥',
            enabledTypes,
            missingTypes,
            containerHours,
            targetHours: targetHoursMap,
            limit,
            lastResolvedGoods: resolvedGoodsMap,
        });
        return 0;
    }

    if (missingTypes.length > 0) {
        applyFertilizerBuyDailyDecision({
            result: 'skipped',
            reason: 'missing_goods',
            message: `${missingTypes.map(getFertilizerTypeLabel).join('、')}礼包未匹配到可购商品`,
            enabledTypes,
            missingTypes,
            containerHours,
            targetHours: targetHoursMap,
            limit,
            lastResolvedGoods: resolvedGoodsMap,
        });
        return 0;
    }

    applyFertilizerBuyDailyDecision({
        result: 'skipped',
        reason: 'threshold_not_reached',
        message: `${thresholdSatisfiedTypes.map(getFertilizerTypeLabel).join('、') || '当前化肥'}容器剩余时长已满足阈值`,
        enabledTypes,
        containerHours,
        targetHours: targetHoursMap,
        limit,
        lastResolvedGoods: resolvedGoodsMap,
    });
    return totalBought;
}

async function autoBuyFertilizer(force = false) {
    const now = Date.now();
    if (!force && now - lastBuyAt < BUY_COOLDOWN_MS) return 0;
    lastBuyAt = now;

    try {
        const totalBought = await autoBuyFertilizerViaMall();
        if (totalBought > 0) {
            buyLastSuccessAt = Date.now();
        }
        return totalBought;
    } catch (error) {
        applyFertilizerBuyDailyDecision({
            result: 'error',
            reason: 'runtime_error',
            message: `自动购肥失败: ${error && error.message ? error.message : '未知错误'}`,
        });
        return 0;
    }
}

function isDoneTodayByKey(key) {
    return String(key || '') === getDateKey();
}

async function buyFreeGifts(force = false) {
    const now = Date.now();
    if (!force && isDoneTodayByKey(freeGiftDoneDateKey)) return 0;
    if (!force && now - freeGiftLastCheckAt < BUY_COOLDOWN_MS) return 0;
    freeGiftLastCheckAt = now;

    try {
        const mall = await getMallListBySlotType(1);
        const raw = Array.isArray(mall && mall.goods_list) ? mall.goods_list : [];
        const goods = [];
        for (const b of raw) {
            try {
                goods.push(types.MallGoods.decode(b));
            } catch {
                // ignore
            }
        }
        const free = goods.filter((g) => !!g && g.is_free === true && Number(g.goods_id || 0) > 0);
        if (!free.length) {
            freeGiftDoneDateKey = getDateKey();
            log('商城', '今日暂无可领取免费礼包', {
                module: 'task',
                event: FREE_GIFTS_DAILY_KEY,
                result: 'none',
            });
            return 0;
        }

        let bought = 0;
        for (const g of free) {
            try {
                await purchaseMallGoods(Number(g.goods_id || 0), 1);
                bought += 1;
            } catch {
                // 单个失败跳过
            }
        }
        freeGiftDoneDateKey = getDateKey();
        if (bought > 0) {
            freeGiftLastAt = Date.now();
            log('商城', `自动购买免费礼包 x${bought}`, {
                module: 'task',
                event: FREE_GIFTS_DAILY_KEY,
                result: 'ok',
                count: bought,
            });
        } else {
            log('商城', '本次未成功领取免费礼包', {
                module: 'task',
                event: FREE_GIFTS_DAILY_KEY,
                result: 'none',
            });
        }
        return bought;
    } catch (e) {
        log('商城', `领取免费礼包失败: ${e.message}`, {
            module: 'task',
            event: FREE_GIFTS_DAILY_KEY,
            result: 'error',
        });
        return 0;
    }
}

module.exports = {
    getMallListBySlotType,
    getMallGoodsList,
    getMallGoodsCatalog,
    getMallCatalog,
    purchaseMallGoods,
    claimMonthCardRewardByGoodsId: claimMonthCardReward,
    autoBuyFertilizer,
    autoBuyOrganicFertilizer: autoBuyFertilizer,
    buyFreeGifts,
    getFertilizerBuyDailyState: () => {
        const state = ensureFertilizerBuyDailyState(getDateKey());
        return {
            key: 'fertilizer_buy',
            doneToday: buyDoneDateKey === getDateKey(),
            pausedNoGoldToday: buyPausedNoGoldDateKey === getDateKey(),
            lastSuccessAt: Math.max(0, Number(state.lastSuccessAt) || Number(buyLastSuccessAt) || 0),
            lastDecisionAt: Math.max(0, Number(state.lastDecisionAt) || 0),
            result: String(state.result || ''),
            reason: String(state.reason || ''),
            message: String(state.message || ''),
            count: Math.max(0, Number(state.count) || 0),
            typeCounts: normalizeFertilizerTypeCounts(state.typeCounts),
            enabledTypes: Array.isArray(state.enabledTypes) ? [...state.enabledTypes] : [],
            missingTypes: Array.isArray(state.missingTypes) ? [...state.missingTypes] : [],
            containerHours: normalizeFertilizerHoursMap(state.containerHours),
            targetHours: normalizeFertilizerHoursMap(state.targetHours),
            limit: Math.max(0, Number(state.limit) || 0),
            lastResolvedGoods: normalizeResolvedFertilizerGoodsMap(state.lastResolvedGoods),
        };
    },
    getFreeGiftDailyState: () => ({
        key: FREE_GIFTS_DAILY_KEY,
        doneToday: freeGiftDoneDateKey === getDateKey(),
        lastCheckAt: freeGiftLastCheckAt,
        lastClaimAt: freeGiftLastAt,
    }),
};
