const { getPool } = require('./mysql-db');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('user-preferences');
const CARD_PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100]);
const SYSTEM_LOG_PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100]);

const DEFAULT_CARDS_VIEW_STATE = Object.freeze({
    keyword: '',
    type: 'all',
    status: 'all',
    source: 'all',
    batchNo: 'all',
    createdBy: 'all',
    page: 1,
    pageSize: 20,
});

const DEFAULT_SYSTEM_LOGS_VIEW_STATE = Object.freeze({
    level: '',
    accountId: '',
    keyword: '',
    page: 1,
    pageSize: 20,
});

const DEFAULT_ACCOUNTS_VIEW_STATE = Object.freeze({
    viewMode: 'standard',
    tableSortKey: 'activity',
    tableSortDirection: 'desc',
    tableColumnVisibility: {
        owner: true,
        platform: true,
        activity: true,
        mode: true,
        state: true,
        actions: true,
    },
});

const DEFAULT_ACCOUNTS_ACTION_HISTORY = Object.freeze([]);

const DEFAULT_DASHBOARD_VIEW_STATE = Object.freeze({
    module: '',
    event: '',
    keyword: '',
    isWarn: '',
});

const DEFAULT_ANALYTICS_VIEW_STATE = Object.freeze({
    sortKey: 'exp',
    strategyPanelCollapsed: false,
});

const DEFAULT_REPORT_HISTORY_VIEW_STATE = Object.freeze({
    mode: 'all',
    status: 'all',
    keyword: '',
    sortOrder: 'desc',
    pageSize: 3,
});

const DEFAULT_ANNOUNCEMENT_DISMISSED_ID = '';
const DEFAULT_NOTIFICATION_LAST_READ_DATE = '';
const DEFAULT_APP_SEEN_VERSION = '';

function normalizeCurrentAccountId(value) {
    return String(value || '').trim().slice(0, 128);
}

function normalizeAnnouncementDismissedId(value, fallback = DEFAULT_ANNOUNCEMENT_DISMISSED_ID) {
    const normalized = String(value !== undefined && value !== null ? value : fallback).trim().slice(0, 32);
    if (!normalized) return '';
    return /^\d+$/.test(normalized) ? normalized : '';
}

function normalizeNotificationLastReadDate(value, fallback = DEFAULT_NOTIFICATION_LAST_READ_DATE) {
    return String(value !== undefined && value !== null ? value : fallback).trim().slice(0, 32);
}

function normalizeAppSeenVersion(value, fallback = DEFAULT_APP_SEEN_VERSION) {
    return String(value !== undefined && value !== null ? value : fallback).trim().slice(0, 64);
}

function clampInteger(value, fallback, min = 1, max = 999999) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function normalizeViewText(value, fallback = '', maxLength = 160) {
    const normalized = String(value !== undefined && value !== null ? value : fallback).trim().slice(0, maxLength);
    return normalized;
}

function parseJsonColumn(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function normalizeCardsPageSize(value, fallback = DEFAULT_CARDS_VIEW_STATE.pageSize) {
    const next = clampInteger(value, fallback, 1, 1000);
    return CARD_PAGE_SIZE_OPTIONS.has(next) ? next : fallback;
}

function normalizeSystemLogPageSize(value, fallback = DEFAULT_SYSTEM_LOGS_VIEW_STATE.pageSize) {
    const next = clampInteger(value, fallback, 1, 1000);
    return SYSTEM_LOG_PAGE_SIZE_OPTIONS.has(next) ? next : fallback;
}

function normalizeReportPageSize(value, fallback = DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize) {
    const next = clampInteger(value, fallback, 1, 1000);
    return new Set([3]).has(next) ? next : fallback;
}

function normalizeCardsViewState(input = {}, fallback = DEFAULT_CARDS_VIEW_STATE) {
    const source = (input && typeof input === 'object') ? input : {};
    const base = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_CARDS_VIEW_STATE;
    return {
        keyword: normalizeViewText(source.keyword, base.keyword, 120),
        type: normalizeViewText(source.type, base.type, 32) || 'all',
        status: normalizeViewText(source.status, base.status, 32) || 'all',
        source: normalizeViewText(source.source, base.source, 64) || 'all',
        batchNo: normalizeViewText(source.batchNo, base.batchNo, 128) || 'all',
        createdBy: normalizeViewText(source.createdBy, base.createdBy, 120) || 'all',
        page: clampInteger(source.page, clampInteger(base.page, DEFAULT_CARDS_VIEW_STATE.page, 1), 1),
        pageSize: normalizeCardsPageSize(source.pageSize, normalizeCardsPageSize(base.pageSize, DEFAULT_CARDS_VIEW_STATE.pageSize)),
    };
}

function normalizeSystemLogsViewState(input = {}, fallback = DEFAULT_SYSTEM_LOGS_VIEW_STATE) {
    const source = (input && typeof input === 'object') ? input : {};
    const base = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_SYSTEM_LOGS_VIEW_STATE;
    const rawLevel = normalizeViewText(source.level, base.level, 16).toLowerCase();
    return {
        level: new Set(['', 'info', 'warn', 'error']).has(rawLevel) ? rawLevel : DEFAULT_SYSTEM_LOGS_VIEW_STATE.level,
        accountId: normalizeViewText(source.accountId, base.accountId, 128),
        keyword: normalizeViewText(source.keyword, base.keyword, 120),
        page: clampInteger(source.page, clampInteger(base.page, DEFAULT_SYSTEM_LOGS_VIEW_STATE.page, 1), 1),
        pageSize: normalizeSystemLogPageSize(source.pageSize, normalizeSystemLogPageSize(base.pageSize, DEFAULT_SYSTEM_LOGS_VIEW_STATE.pageSize)),
    };
}

function normalizeBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : !!fallback;
}

function normalizeAccountsViewState(input = {}, fallback = DEFAULT_ACCOUNTS_VIEW_STATE) {
    const source = (input && typeof input === 'object') ? input : {};
    const base = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_ACCOUNTS_VIEW_STATE;
    const rawViewMode = normalizeViewText(source.viewMode, base.viewMode, 16);
    const rawTableSortKey = normalizeViewText(source.tableSortKey, base.tableSortKey, 32);
    const rawTableSortDirection = normalizeViewText(source.tableSortDirection, base.tableSortDirection, 8);
    const rawVisibility = (source.tableColumnVisibility && typeof source.tableColumnVisibility === 'object')
        ? source.tableColumnVisibility
        : {};
    const baseVisibility = (base.tableColumnVisibility && typeof base.tableColumnVisibility === 'object')
        ? base.tableColumnVisibility
        : DEFAULT_ACCOUNTS_VIEW_STATE.tableColumnVisibility;

    return {
        viewMode: new Set(['standard', 'compact', 'table']).has(rawViewMode) ? rawViewMode : DEFAULT_ACCOUNTS_VIEW_STATE.viewMode,
        tableSortKey: new Set(['account', 'owner', 'platform', 'activity', 'mode', 'state']).has(rawTableSortKey) ? rawTableSortKey : DEFAULT_ACCOUNTS_VIEW_STATE.tableSortKey,
        tableSortDirection: new Set(['asc', 'desc']).has(rawTableSortDirection) ? rawTableSortDirection : DEFAULT_ACCOUNTS_VIEW_STATE.tableSortDirection,
        tableColumnVisibility: {
            owner: normalizeBoolean(rawVisibility.owner, baseVisibility.owner),
            platform: normalizeBoolean(rawVisibility.platform, baseVisibility.platform),
            activity: normalizeBoolean(rawVisibility.activity, baseVisibility.activity),
            mode: normalizeBoolean(rawVisibility.mode, baseVisibility.mode),
            state: normalizeBoolean(rawVisibility.state, baseVisibility.state),
            actions: normalizeBoolean(rawVisibility.actions, baseVisibility.actions),
        },
    };
}

function normalizeNonNegativeInteger(value, fallback, max = 999999) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num) || num < 0) return fallback;
    return Math.min(max, num);
}

function normalizeActionHistoryNames(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => normalizeViewText(item, '', 60))
        .filter(Boolean)
        .slice(0, 6);
}

function resolveAccountsActionHistoryStatus(successCount, failedCount, skippedCount, fallback = 'warning') {
    if (successCount > 0 && failedCount === 0) return 'success';
    if (successCount > 0 || skippedCount > 0) return 'warning';
    return new Set(['success', 'warning', 'error']).has(fallback) ? fallback : 'error';
}

function normalizeAccountsActionHistory(input = [], fallback = DEFAULT_ACCOUNTS_ACTION_HISTORY) {
    const source = Array.isArray(input) ? input : fallback;
    return source
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => {
            const timestamp = normalizeNonNegativeInteger(item.timestamp, 0, Number.MAX_SAFE_INTEGER);
            const successCount = normalizeNonNegativeInteger(item.successCount, 0);
            const affectedNames = normalizeActionHistoryNames(item.affectedNames);
            const failedNames = normalizeActionHistoryNames(item.failedNames);
            const failedCount = Math.max(normalizeNonNegativeInteger(item.failedCount, failedNames.length), failedNames.length);
            const skippedCount = normalizeNonNegativeInteger(item.skippedCount, 0);
            const totalCount = Math.max(
                normalizeNonNegativeInteger(item.totalCount, successCount + failedCount + skippedCount),
                successCount + failedCount + skippedCount,
            );
            const actionLabel = normalizeViewText(item.actionLabel, '批量操作', 60) || '批量操作';
            const targetLabel = normalizeViewText(item.targetLabel, '', 120);
            const rawStatus = normalizeViewText(item.status, 'warning', 16);
            return {
                id: normalizeViewText(item.id, `${actionLabel}-${timestamp || Date.now()}-${index}`, 96),
                actionLabel,
                status: resolveAccountsActionHistoryStatus(
                    successCount,
                    failedCount,
                    skippedCount,
                    new Set(['success', 'warning', 'error']).has(rawStatus) ? rawStatus : 'warning',
                ),
                timestamp,
                totalCount,
                successCount,
                failedCount,
                skippedCount,
                affectedNames,
                failedNames,
                targetLabel: targetLabel || undefined,
            };
        })
        .filter((item) => item.timestamp > 0)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 8);
}

function normalizeDashboardViewState(input = {}, fallback = DEFAULT_DASHBOARD_VIEW_STATE) {
    const source = (input && typeof input === 'object') ? input : {};
    const base = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_DASHBOARD_VIEW_STATE;
    const rawModule = normalizeViewText(source.module, base.module, 32);
    const rawEvent = normalizeViewText(source.event, base.event, 64);
    const rawKeyword = normalizeViewText(source.keyword, base.keyword, 120);
    const rawIsWarn = normalizeViewText(source.isWarn, base.isWarn, 16);
    return {
        module: new Set(['', 'farm', 'friend', 'warehouse', 'task', 'system']).has(rawModule) ? rawModule : DEFAULT_DASHBOARD_VIEW_STATE.module,
        event: rawEvent,
        keyword: rawKeyword,
        isWarn: new Set(['', 'info', 'warn']).has(rawIsWarn) ? rawIsWarn : DEFAULT_DASHBOARD_VIEW_STATE.isWarn,
    };
}

function normalizeAnalyticsViewState(input = {}, fallback = DEFAULT_ANALYTICS_VIEW_STATE) {
    const source = (input && typeof input === 'object') ? input : {};
    const base = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_ANALYTICS_VIEW_STATE;
    const rawSortKey = normalizeViewText(source.sortKey, base.sortKey, 16);
    return {
        sortKey: new Set(['exp', 'fert', 'profit', 'fert_profit', 'level']).has(rawSortKey) ? rawSortKey : DEFAULT_ANALYTICS_VIEW_STATE.sortKey,
        strategyPanelCollapsed: normalizeBoolean(source.strategyPanelCollapsed, base.strategyPanelCollapsed),
    };
}

function normalizeReportHistoryViewState(input = {}, fallback = DEFAULT_REPORT_HISTORY_VIEW_STATE) {
    const source = (input && typeof input === 'object') ? input : {};
    const base = (fallback && typeof fallback === 'object') ? fallback : DEFAULT_REPORT_HISTORY_VIEW_STATE;
    const rawMode = normalizeViewText(source.mode, base.mode, 16);
    const rawStatus = normalizeViewText(source.status, base.status, 16);
    const rawSortOrder = normalizeViewText(source.sortOrder, base.sortOrder, 8);
    return {
        mode: new Set(['all', 'test', 'hourly', 'daily']).has(rawMode) ? rawMode : DEFAULT_REPORT_HISTORY_VIEW_STATE.mode,
        status: new Set(['all', 'success', 'failed']).has(rawStatus) ? rawStatus : DEFAULT_REPORT_HISTORY_VIEW_STATE.status,
        keyword: normalizeViewText(source.keyword, base.keyword, 100),
        sortOrder: new Set(['asc', 'desc']).has(rawSortOrder) ? rawSortOrder : DEFAULT_REPORT_HISTORY_VIEW_STATE.sortOrder,
        pageSize: normalizeReportPageSize(source.pageSize, normalizeReportPageSize(base.pageSize, DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize)),
    };
}

function mapUserPreferencesRow(row = {}) {
    return {
        currentAccountId: normalizeCurrentAccountId(row.current_account_id),
        announcementDismissedId: normalizeAnnouncementDismissedId(row.announcement_dismissed_id),
        notificationLastReadDate: normalizeNotificationLastReadDate(row.notification_last_read_date),
        appSeenVersion: normalizeAppSeenVersion(row.app_seen_version),
        accountsViewState: normalizeAccountsViewState(parseJsonColumn(row.accounts_view_state, DEFAULT_ACCOUNTS_VIEW_STATE), DEFAULT_ACCOUNTS_VIEW_STATE),
        accountsActionHistory: normalizeAccountsActionHistory(parseJsonColumn(row.accounts_action_history, DEFAULT_ACCOUNTS_ACTION_HISTORY), DEFAULT_ACCOUNTS_ACTION_HISTORY),
        dashboardViewState: normalizeDashboardViewState(parseJsonColumn(row.dashboard_view_state, DEFAULT_DASHBOARD_VIEW_STATE), DEFAULT_DASHBOARD_VIEW_STATE),
        analyticsViewState: normalizeAnalyticsViewState(parseJsonColumn(row.analytics_view_state, DEFAULT_ANALYTICS_VIEW_STATE), DEFAULT_ANALYTICS_VIEW_STATE),
        reportHistoryViewState: normalizeReportHistoryViewState(parseJsonColumn(row.report_history_view_state, DEFAULT_REPORT_HISTORY_VIEW_STATE), DEFAULT_REPORT_HISTORY_VIEW_STATE),
        cardsViewState: normalizeCardsViewState(parseJsonColumn(row.cards_view_state, DEFAULT_CARDS_VIEW_STATE), DEFAULT_CARDS_VIEW_STATE),
        systemLogsViewState: normalizeSystemLogsViewState(parseJsonColumn(row.system_logs_view_state, DEFAULT_SYSTEM_LOGS_VIEW_STATE), DEFAULT_SYSTEM_LOGS_VIEW_STATE),
    };
}

async function getUserPreferences(username) {
    const normalizedUsername = String(username || '').trim();
    const pool = getPool();
    if (!normalizedUsername || !pool) return null;

    try {
        const [rows] = await pool.query(
            `SELECT up.current_account_id, up.announcement_dismissed_id, up.notification_last_read_date, up.app_seen_version, up.accounts_view_state, up.accounts_action_history, up.dashboard_view_state, up.analytics_view_state, up.report_history_view_state, up.cards_view_state, up.system_logs_view_state
             FROM user_preferences up
             INNER JOIN users u ON u.id = up.user_id
             WHERE u.username = ?
             ORDER BY up.updated_at DESC, up.id DESC
             LIMIT 1`,
            [normalizedUsername],
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) return null;
        return mapUserPreferencesRow(row);
    } catch (err) {
        logger.warn(`读取用户偏好失败 [${normalizedUsername}]: ${err.message}`);
        return null;
    }
}

async function saveUserPreferences(username, input = {}) {
    const normalizedUsername = String(username || '').trim();
    const pool = getPool();
    if (!normalizedUsername || !pool) {
        throw new Error('用户偏好保存失败：缺少用户名或数据库连接');
    }

    const currentPreferences = await getUserPreferences(normalizedUsername);
    const nextPreferences = {
        currentAccountId: input.currentAccountId !== undefined
            ? normalizeCurrentAccountId(input.currentAccountId)
            : normalizeCurrentAccountId(currentPreferences?.currentAccountId),
        announcementDismissedId: input.announcementDismissedId !== undefined
            ? normalizeAnnouncementDismissedId(input.announcementDismissedId)
            : normalizeAnnouncementDismissedId(currentPreferences?.announcementDismissedId),
        notificationLastReadDate: input.notificationLastReadDate !== undefined
            ? normalizeNotificationLastReadDate(input.notificationLastReadDate)
            : normalizeNotificationLastReadDate(currentPreferences?.notificationLastReadDate),
        appSeenVersion: input.appSeenVersion !== undefined
            ? normalizeAppSeenVersion(input.appSeenVersion)
            : normalizeAppSeenVersion(currentPreferences?.appSeenVersion),
        accountsViewState: input.accountsViewState !== undefined
            ? normalizeAccountsViewState(input.accountsViewState, currentPreferences?.accountsViewState || DEFAULT_ACCOUNTS_VIEW_STATE)
            : normalizeAccountsViewState(currentPreferences?.accountsViewState || DEFAULT_ACCOUNTS_VIEW_STATE, DEFAULT_ACCOUNTS_VIEW_STATE),
        accountsActionHistory: input.accountsActionHistory !== undefined
            ? normalizeAccountsActionHistory(input.accountsActionHistory, currentPreferences?.accountsActionHistory || DEFAULT_ACCOUNTS_ACTION_HISTORY)
            : normalizeAccountsActionHistory(currentPreferences?.accountsActionHistory || DEFAULT_ACCOUNTS_ACTION_HISTORY, DEFAULT_ACCOUNTS_ACTION_HISTORY),
        dashboardViewState: input.dashboardViewState !== undefined
            ? normalizeDashboardViewState(input.dashboardViewState, currentPreferences?.dashboardViewState || DEFAULT_DASHBOARD_VIEW_STATE)
            : normalizeDashboardViewState(currentPreferences?.dashboardViewState || DEFAULT_DASHBOARD_VIEW_STATE, DEFAULT_DASHBOARD_VIEW_STATE),
        analyticsViewState: input.analyticsViewState !== undefined
            ? normalizeAnalyticsViewState(input.analyticsViewState, currentPreferences?.analyticsViewState || DEFAULT_ANALYTICS_VIEW_STATE)
            : normalizeAnalyticsViewState(currentPreferences?.analyticsViewState || DEFAULT_ANALYTICS_VIEW_STATE, DEFAULT_ANALYTICS_VIEW_STATE),
        reportHistoryViewState: input.reportHistoryViewState !== undefined
            ? normalizeReportHistoryViewState(input.reportHistoryViewState, currentPreferences?.reportHistoryViewState || DEFAULT_REPORT_HISTORY_VIEW_STATE)
            : normalizeReportHistoryViewState(currentPreferences?.reportHistoryViewState || DEFAULT_REPORT_HISTORY_VIEW_STATE, DEFAULT_REPORT_HISTORY_VIEW_STATE),
        cardsViewState: input.cardsViewState !== undefined
            ? normalizeCardsViewState(input.cardsViewState, currentPreferences?.cardsViewState || DEFAULT_CARDS_VIEW_STATE)
            : normalizeCardsViewState(currentPreferences?.cardsViewState || DEFAULT_CARDS_VIEW_STATE, DEFAULT_CARDS_VIEW_STATE),
        systemLogsViewState: input.systemLogsViewState !== undefined
            ? normalizeSystemLogsViewState(input.systemLogsViewState, currentPreferences?.systemLogsViewState || DEFAULT_SYSTEM_LOGS_VIEW_STATE)
            : normalizeSystemLogsViewState(currentPreferences?.systemLogsViewState || DEFAULT_SYSTEM_LOGS_VIEW_STATE, DEFAULT_SYSTEM_LOGS_VIEW_STATE),
    };

    const [result] = await pool.query(
        `INSERT INTO user_preferences (
            user_id, current_account_id, announcement_dismissed_id, notification_last_read_date, app_seen_version, accounts_view_state, accounts_action_history, dashboard_view_state, analytics_view_state, report_history_view_state, cards_view_state, system_logs_view_state
        )
        SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM users
        WHERE username = ?
        ON DUPLICATE KEY UPDATE
            current_account_id = VALUES(current_account_id),
            announcement_dismissed_id = VALUES(announcement_dismissed_id),
            notification_last_read_date = VALUES(notification_last_read_date),
            app_seen_version = VALUES(app_seen_version),
            accounts_view_state = VALUES(accounts_view_state),
            accounts_action_history = VALUES(accounts_action_history),
            dashboard_view_state = VALUES(dashboard_view_state),
            analytics_view_state = VALUES(analytics_view_state),
            report_history_view_state = VALUES(report_history_view_state),
            cards_view_state = VALUES(cards_view_state),
            system_logs_view_state = VALUES(system_logs_view_state)`,
        [
            nextPreferences.currentAccountId,
            nextPreferences.announcementDismissedId,
            nextPreferences.notificationLastReadDate,
            nextPreferences.appSeenVersion,
            JSON.stringify(nextPreferences.accountsViewState),
            JSON.stringify(nextPreferences.accountsActionHistory),
            JSON.stringify(nextPreferences.dashboardViewState),
            JSON.stringify(nextPreferences.analyticsViewState),
            JSON.stringify(nextPreferences.reportHistoryViewState),
            JSON.stringify(nextPreferences.cardsViewState),
            JSON.stringify(nextPreferences.systemLogsViewState),
            normalizedUsername,
        ],
    );

    if (!result || result.affectedRows === 0) {
        throw new Error(`用户不存在或偏好保存失败: ${normalizedUsername}`);
    }

    return nextPreferences;
}

module.exports = {
    DEFAULT_ACCOUNTS_VIEW_STATE,
    DEFAULT_ACCOUNTS_ACTION_HISTORY,
    DEFAULT_ANALYTICS_VIEW_STATE,
    DEFAULT_APP_SEEN_VERSION,
    DEFAULT_ANNOUNCEMENT_DISMISSED_ID,
    DEFAULT_CARDS_VIEW_STATE,
    DEFAULT_DASHBOARD_VIEW_STATE,
    DEFAULT_NOTIFICATION_LAST_READ_DATE,
    DEFAULT_REPORT_HISTORY_VIEW_STATE,
    DEFAULT_SYSTEM_LOGS_VIEW_STATE,
    normalizeAnnouncementDismissedId,
    normalizeAppSeenVersion,
    normalizeCurrentAccountId,
    normalizeAccountsActionHistory,
    normalizeAccountsViewState,
    normalizeAnalyticsViewState,
    normalizeCardsViewState,
    normalizeDashboardViewState,
    normalizeNotificationLastReadDate,
    normalizeReportHistoryViewState,
    normalizeSystemLogsViewState,
    getUserPreferences,
    saveUserPreferences,
};
