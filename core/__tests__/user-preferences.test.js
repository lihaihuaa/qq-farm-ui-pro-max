const test = require('node:test');
const assert = require('node:assert/strict');

const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const userPreferencesModulePath = require.resolve('../src/services/user-preferences');

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
        users: Array.isArray(initialState.users) ? initialState.users.map(item => ({ ...item })) : [],
        preferences: Array.isArray(initialState.preferences) ? initialState.preferences.map(item => ({ ...item })) : [],
    };

    async function handleQuery(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalizedSql.startsWith('select up.current_account_id, up.announcement_dismissed_id, up.notification_last_read_date, up.app_seen_version, up.accounts_view_state, up.accounts_action_history, up.dashboard_view_state, up.analytics_view_state, up.report_history_view_state, up.cards_view_state, up.system_logs_view_state from user_preferences up inner join users u on u.id = up.user_id')) {
            const username = String(params[0] || '');
            const user = state.users.find(item => item.username === username);
            if (!user) return [[]];
            const rows = state.preferences
                .filter(item => Number(item.user_id) === Number(user.id))
                .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
            return [rows.slice(0, 1)];
        }

        if (normalizedSql.startsWith('insert into user_preferences')) {
            const username = String(params[params.length - 1] || '');
            const user = state.users.find(item => item.username === username);
            if (!user) {
                return [{ affectedRows: 0 }];
            }

            const nextRow = {
                id: state.preferences.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
                user_id: user.id,
                current_account_id: params[0],
                announcement_dismissed_id: params[1],
                notification_last_read_date: params[2],
                app_seen_version: params[3],
                accounts_view_state: params[4],
                accounts_action_history: params[5],
                dashboard_view_state: params[6],
                analytics_view_state: params[7],
                report_history_view_state: params[8],
                cards_view_state: params[9],
                system_logs_view_state: params[10],
            };

            const existingIndex = state.preferences.findIndex(item => Number(item.user_id) === Number(user.id));
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
        getPool() {
            return {
                query: handleQuery,
                execute: handleQuery,
            };
        },
        __state: state,
    };
}

test('user preferences persist current account selection per user', async () => {
    const mysqlMock = createMysqlMock({
        users: [{ id: 7, username: 'alice' }],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[userPreferencesModulePath];
        const { getUserPreferences, saveUserPreferences } = require(userPreferencesModulePath);

        const saved = await saveUserPreferences('alice', { currentAccountId: 'acc-1001' });
        assert.deepEqual(saved, {
            currentAccountId: 'acc-1001',
            announcementDismissedId: '',
            notificationLastReadDate: '',
            appSeenVersion: '',
            accountsViewState: {
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
            },
            accountsActionHistory: [],
            dashboardViewState: {
                module: '',
                event: '',
                keyword: '',
                isWarn: '',
            },
            analyticsViewState: {
                sortKey: 'exp',
                strategyPanelCollapsed: false,
            },
            reportHistoryViewState: {
                mode: 'all',
                status: 'all',
                keyword: '',
                sortOrder: 'desc',
                pageSize: 3,
            },
            cardsViewState: {
                keyword: '',
                type: 'all',
                status: 'all',
                source: 'all',
                batchNo: 'all',
                createdBy: 'all',
                page: 1,
                pageSize: 20,
            },
            systemLogsViewState: {
                level: '',
                accountId: '',
                keyword: '',
                page: 1,
                pageSize: 20,
            },
        });
        assert.equal(mysqlMock.__state.preferences.length, 1);

        const loaded = await getUserPreferences('alice');
        assert.equal(loaded.currentAccountId, 'acc-1001');
        assert.equal(loaded.announcementDismissedId, '');
        assert.equal(loaded.notificationLastReadDate, '');
        assert.equal(loaded.appSeenVersion, '');
        assert.equal(loaded.accountsViewState.viewMode, 'standard');
        assert.deepEqual(loaded.accountsActionHistory, []);
        assert.equal(loaded.dashboardViewState.module, '');
        assert.equal(loaded.analyticsViewState.sortKey, 'exp');
        assert.equal(loaded.reportHistoryViewState.pageSize, 3);
        assert.equal(loaded.cardsViewState.pageSize, 20);
        assert.equal(loaded.systemLogsViewState.level, '');

        const updated = await saveUserPreferences('alice', { currentAccountId: 'acc-2002' });
        assert.equal(updated.currentAccountId, 'acc-2002');
        assert.equal(mysqlMock.__state.preferences.length, 1);
        assert.equal(mysqlMock.__state.preferences[0].current_account_id, 'acc-2002');
    } finally {
        delete require.cache[userPreferencesModulePath];
        restoreMysql();
    }
});

test('user preferences merge view state updates without clearing current account selection', async () => {
    const mysqlMock = createMysqlMock({
        users: [{ id: 7, username: 'alice' }],
        preferences: [{
            id: 1,
            user_id: 7,
            current_account_id: 'acc-1001',
            announcement_dismissed_id: '7',
            notification_last_read_date: '2026-03-10 08:00:00',
            app_seen_version: 'v9.9.9',
            accounts_view_state: JSON.stringify({
                viewMode: 'table',
                tableSortKey: 'owner',
                tableSortDirection: 'asc',
                tableColumnVisibility: {
                    owner: true,
                    platform: false,
                    activity: true,
                    mode: true,
                    state: true,
                    actions: false,
                },
            }),
            accounts_action_history: JSON.stringify([
                {
                    id: 'history-1',
                    actionLabel: '批量启动',
                    status: 'warning',
                    timestamp: 1741593600000,
                    totalCount: 4,
                    successCount: 3,
                    failedCount: 1,
                    skippedCount: 0,
                    affectedNames: ['账号A', '账号B'],
                    failedNames: ['账号C'],
                    targetLabel: '当前筛选：4 项',
                },
            ]),
            dashboard_view_state: JSON.stringify({
                module: 'farm',
                event: 'harvest_crop',
                keyword: '收获',
                isWarn: 'warn',
            }),
            analytics_view_state: JSON.stringify({
                sortKey: 'profit',
                strategyPanelCollapsed: true,
            }),
            report_history_view_state: JSON.stringify({
                mode: 'daily',
                status: 'failed',
                keyword: '邮件',
                sortOrder: 'asc',
                pageSize: 50,
            }),
            cards_view_state: JSON.stringify({
                keyword: '批次A',
                type: 'all',
                status: 'unused',
                source: 'manual',
                batchNo: 'batch-a',
                createdBy: 'admin',
                page: 2,
                pageSize: 50,
            }),
            system_logs_view_state: JSON.stringify({
                level: 'warn',
                accountId: '',
                keyword: 'worker',
                page: 3,
                pageSize: 20,
            }),
        }],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[userPreferencesModulePath];
        const { getUserPreferences, saveUserPreferences } = require(userPreferencesModulePath);

        const saved = await saveUserPreferences('alice', {
            systemLogsViewState: {
                level: 'error',
                accountId: 'acc-1001',
                keyword: '',
                page: 1,
                pageSize: 20,
            },
        });

        assert.equal(saved.currentAccountId, 'acc-1001');
        assert.equal(saved.announcementDismissedId, '7');
        assert.equal(saved.notificationLastReadDate, '2026-03-10 08:00:00');
        assert.equal(saved.appSeenVersion, 'v9.9.9');
        assert.deepEqual(saved.accountsViewState, {
            viewMode: 'table',
            tableSortKey: 'owner',
            tableSortDirection: 'asc',
            tableColumnVisibility: {
                owner: true,
                platform: false,
                activity: true,
                mode: true,
                state: true,
                actions: false,
            },
        });
        assert.deepEqual(saved.accountsActionHistory, [{
            id: 'history-1',
            actionLabel: '批量启动',
            status: 'warning',
            timestamp: 1741593600000,
            totalCount: 4,
            successCount: 3,
            failedCount: 1,
            skippedCount: 0,
            affectedNames: ['账号A', '账号B'],
            failedNames: ['账号C'],
            targetLabel: '当前筛选：4 项',
        }]);
        assert.deepEqual(saved.dashboardViewState, {
            module: 'farm',
            event: 'harvest_crop',
            keyword: '收获',
            isWarn: 'warn',
        });
        assert.deepEqual(saved.analyticsViewState, {
            sortKey: 'profit',
            strategyPanelCollapsed: true,
        });
        assert.deepEqual(saved.reportHistoryViewState, {
            mode: 'daily',
            status: 'failed',
            keyword: '邮件',
            sortOrder: 'asc',
            pageSize: 3,
        });
        assert.deepEqual(saved.cardsViewState, {
            keyword: '批次A',
            type: 'all',
            status: 'unused',
            source: 'manual',
            batchNo: 'batch-a',
            createdBy: 'admin',
            page: 2,
            pageSize: 50,
        });
        assert.deepEqual(saved.systemLogsViewState, {
            level: 'error',
            accountId: 'acc-1001',
            keyword: '',
            page: 1,
            pageSize: 20,
        });

        const loaded = await getUserPreferences('alice');
        assert.equal(loaded.currentAccountId, 'acc-1001');
        assert.equal(loaded.announcementDismissedId, '7');
        assert.equal(loaded.notificationLastReadDate, '2026-03-10 08:00:00');
        assert.equal(loaded.appSeenVersion, 'v9.9.9');
        assert.equal(loaded.accountsViewState.tableSortKey, 'owner');
        assert.equal(loaded.accountsActionHistory[0].actionLabel, '批量启动');
        assert.equal(loaded.dashboardViewState.event, 'harvest_crop');
        assert.equal(loaded.analyticsViewState.strategyPanelCollapsed, true);
        assert.equal(loaded.reportHistoryViewState.mode, 'daily');
        assert.equal(loaded.cardsViewState.batchNo, 'batch-a');
        assert.equal(loaded.systemLogsViewState.level, 'error');
    } finally {
        delete require.cache[userPreferencesModulePath];
        restoreMysql();
    }
});

test('user preferences merge accounts page state without clearing existing page preferences', async () => {
    const mysqlMock = createMysqlMock({
        users: [{ id: 9, username: 'bob' }],
        preferences: [{
            id: 1,
            user_id: 9,
            current_account_id: 'acc-9',
            accounts_view_state: JSON.stringify({
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
            }),
            accounts_action_history: JSON.stringify([
                {
                    id: 'history-2',
                    actionLabel: '批量导出',
                    status: 'success',
                    timestamp: 1741597200000,
                    totalCount: 2,
                    successCount: 2,
                    failedCount: 0,
                    skippedCount: 0,
                    affectedNames: ['账号D', '账号E'],
                    failedNames: [],
                    targetLabel: '视图：表格',
                },
            ]),
            dashboard_view_state: JSON.stringify({
                module: 'task',
                event: 'task_scan',
                keyword: '',
                isWarn: '',
            }),
            analytics_view_state: JSON.stringify({
                sortKey: 'level',
                strategyPanelCollapsed: false,
            }),
            report_history_view_state: JSON.stringify({
                mode: 'hourly',
                status: 'success',
                keyword: '',
                sortOrder: 'desc',
                pageSize: 20,
            }),
            cards_view_state: JSON.stringify({
                keyword: '试用卡',
                type: 'all',
                status: 'all',
                source: 'all',
                batchNo: 'all',
                createdBy: 'all',
                page: 4,
                pageSize: 20,
            }),
            system_logs_view_state: JSON.stringify({
                level: 'warn',
                accountId: 'acc-9',
                keyword: 'worker',
                page: 2,
                pageSize: 50,
            }),
        }],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[userPreferencesModulePath];
        const { getUserPreferences, saveUserPreferences } = require(userPreferencesModulePath);

        const saved = await saveUserPreferences('bob', {
            accountsViewState: {
                viewMode: 'table',
                tableSortKey: 'platform',
                tableSortDirection: 'asc',
                tableColumnVisibility: {
                    owner: true,
                    platform: true,
                    activity: false,
                    mode: true,
                    state: true,
                    actions: true,
                },
            },
        });

        assert.equal(saved.currentAccountId, 'acc-9');
        assert.equal(saved.accountsActionHistory[0].actionLabel, '批量导出');
        assert.equal(saved.dashboardViewState.module, 'task');
        assert.equal(saved.analyticsViewState.sortKey, 'level');
        assert.equal(saved.reportHistoryViewState.mode, 'hourly');
        assert.equal(saved.cardsViewState.keyword, '试用卡');
        assert.equal(saved.systemLogsViewState.level, 'warn');
        assert.deepEqual(saved.accountsViewState, {
            viewMode: 'table',
            tableSortKey: 'platform',
            tableSortDirection: 'asc',
            tableColumnVisibility: {
                owner: true,
                platform: true,
                activity: false,
                mode: true,
                state: true,
                actions: true,
            },
        });

        const loaded = await getUserPreferences('bob');
        assert.equal(loaded.accountsActionHistory[0].targetLabel, '视图：表格');
        assert.equal(loaded.dashboardViewState.module, 'task');
        assert.equal(loaded.analyticsViewState.sortKey, 'level');
        assert.equal(loaded.reportHistoryViewState.pageSize, 3);
        assert.equal(loaded.cardsViewState.page, 4);
        assert.equal(loaded.systemLogsViewState.pageSize, 50);
        assert.equal(loaded.accountsViewState.viewMode, 'table');
    } finally {
        delete require.cache[userPreferencesModulePath];
        restoreMysql();
    }
});

test('user preferences persist accounts action history without clearing other view states', async () => {
    const mysqlMock = createMysqlMock({
        users: [{ id: 11, username: 'charlie' }],
        preferences: [{
            id: 1,
            user_id: 11,
            current_account_id: 'acc-11',
            accounts_view_state: JSON.stringify({
                viewMode: 'compact',
                tableSortKey: 'platform',
                tableSortDirection: 'desc',
                tableColumnVisibility: {
                    owner: true,
                    platform: true,
                    activity: true,
                    mode: true,
                    state: false,
                    actions: true,
                },
            }),
            cards_view_state: JSON.stringify({
                keyword: '',
                type: 'all',
                status: 'all',
                source: 'all',
                batchNo: 'all',
                createdBy: 'all',
                page: 1,
                pageSize: 20,
            }),
            system_logs_view_state: JSON.stringify({
                level: '',
                accountId: '',
                keyword: '',
                page: 1,
                pageSize: 20,
            }),
        }],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[userPreferencesModulePath];
        const { getUserPreferences, saveUserPreferences } = require(userPreferencesModulePath);

        const saved = await saveUserPreferences('charlie', {
            accountsActionHistory: [
                {
                    id: 'history-3',
                    actionLabel: '批量删除',
                    status: 'warning',
                    timestamp: 1741600800000,
                    totalCount: 3,
                    successCount: 2,
                    failedCount: 1,
                    skippedCount: 0,
                    affectedNames: ['账号X', '账号Y', '账号Z'],
                    failedNames: ['账号Z'],
                    targetLabel: '删除 3 个账号',
                },
            ],
        });

        assert.equal(saved.accountsViewState.viewMode, 'compact');
        assert.deepEqual(saved.accountsActionHistory, [{
            id: 'history-3',
            actionLabel: '批量删除',
            status: 'warning',
            timestamp: 1741600800000,
            totalCount: 3,
            successCount: 2,
            failedCount: 1,
            skippedCount: 0,
            affectedNames: ['账号X', '账号Y', '账号Z'],
            failedNames: ['账号Z'],
            targetLabel: '删除 3 个账号',
        }]);

        const loaded = await getUserPreferences('charlie');
        assert.equal(loaded.accountsViewState.tableSortKey, 'platform');
        assert.equal(loaded.accountsActionHistory[0].actionLabel, '批量删除');
        assert.equal(loaded.cardsViewState.pageSize, 20);
    } finally {
        delete require.cache[userPreferencesModulePath];
        restoreMysql();
    }
});
