const TIMING_READONLY_PARAMS = [
    { key: 'friendOpSleep', label: '好友操作间延迟', value: '500-700ms + 随机', group: 'operations' },
    { key: 'friendBatchSleep', label: '好友批次间延迟', value: '1000-4000ms + 随机', group: 'operations' },
    { key: 'farmOpSleep', label: '农场操作间延迟', value: '400-700ms + 随机', group: 'operations' },
    { key: 'warehouseOpSleep', label: '仓库操作间延迟', value: '200-300ms + 随机', group: 'operations' },
    { key: 'sellBatchSleep', label: '批量出售间隔', value: '300ms', group: 'operations' },
    { key: 'taskClaimSleep', label: '任务领取间隔', value: '300ms', group: 'operations' },
    { key: 'mallClaimSleep', label: '商城领取间隔', value: '300ms', group: 'operations' },
];

function registerSettingsReportRoutes({
    app,
    authRequired,
    accountOwnershipRequired,
    getAccId,
    getAccountsSnapshot,
    resolveAccId,
    getProvider,
    store,
    adminLogger,
    buildUserUiBody,
    getUserPreferences,
    getUserUiConfig,
    mergeUiConfig,
    saveUserUiConfig,
    saveUserPreferences,
    runUiBackgroundCleanup,
    ensureUiBackgroundDir,
    buildReportHistoryCsv,
    getReportLogs,
    getReportLogStats,
    exportReportLogs,
    deleteReportLogsByIds,
    clearReportLogs,
    crypto,
    fs,
    path,
}) {
    app.get('/api/view-preferences', authRequired, async (req, res) => {
        try {
            const currentUser = req.currentUser;
            if (!currentUser) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }
            const currentPreferences = await getUserPreferences(currentUser.username);
            return res.json({
                ok: true,
                data: {
                    announcementDismissedId: currentPreferences?.announcementDismissedId || '',
                    notificationLastReadDate: currentPreferences?.notificationLastReadDate || '',
                    appSeenVersion: currentPreferences?.appSeenVersion || '',
                    accountsViewState: currentPreferences?.accountsViewState || null,
                    accountsActionHistory: currentPreferences?.accountsActionHistory ?? null,
                    dashboardViewState: currentPreferences?.dashboardViewState || null,
                    analyticsViewState: currentPreferences?.analyticsViewState || null,
                    reportHistoryViewState: currentPreferences?.reportHistoryViewState || null,
                    cardsViewState: currentPreferences?.cardsViewState || null,
                    systemLogsViewState: currentPreferences?.systemLogsViewState || null,
                },
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/view-preferences', authRequired, async (req, res) => {
        try {
            const currentUser = req.currentUser;
            if (!currentUser) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const saved = await saveUserPreferences(currentUser.username, {
                announcementDismissedId: body.announcementDismissedId,
                notificationLastReadDate: body.notificationLastReadDate,
                appSeenVersion: body.appSeenVersion,
                accountsViewState: body.accountsViewState,
                accountsActionHistory: body.accountsActionHistory,
                dashboardViewState: body.dashboardViewState,
                analyticsViewState: body.analyticsViewState,
                reportHistoryViewState: body.reportHistoryViewState,
                cardsViewState: body.cardsViewState,
                systemLogsViewState: body.systemLogsViewState,
            });
            return res.json({
                ok: true,
                data: {
                    announcementDismissedId: saved.announcementDismissedId,
                    notificationLastReadDate: saved.notificationLastReadDate,
                    appSeenVersion: saved.appSeenVersion,
                    accountsViewState: saved.accountsViewState,
                    accountsActionHistory: saved.accountsActionHistory,
                    dashboardViewState: saved.dashboardViewState,
                    analyticsViewState: saved.analyticsViewState,
                    reportHistoryViewState: saved.reportHistoryViewState,
                    cardsViewState: saved.cardsViewState,
                    systemLogsViewState: saved.systemLogsViewState,
                },
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/account-selection', authRequired, async (req, res) => {
        try {
            const currentUser = req.currentUser;
            if (!currentUser) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }

            const requestedId = String(req.body?.currentAccountId || '').trim();
            if (!requestedId) {
                const cleared = await saveUserPreferences(currentUser.username, { currentAccountId: '' });
                return res.json({ ok: true, data: cleared });
            }

            const resolvedId = resolveAccId ? await resolveAccId(requestedId) : requestedId;
            const allAccounts = await getAccountsSnapshot();
            const account = (allAccounts.accounts || []).find(item => String(item.id || '') === String(resolvedId || ''));

            if (!account) {
                return res.status(404).json({ ok: false, error: '账号不存在' });
            }

            if (currentUser.role !== 'admin' && (!account.username || account.username !== currentUser.username)) {
                return res.status(403).json({ ok: false, error: '无权选择此账号' });
            }

            const saved = await saveUserPreferences(currentUser.username, { currentAccountId: String(account.id || resolvedId || '').trim() });
            return res.json({ ok: true, data: saved });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/settings/theme', async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                const globalUi = store.getUI();
                const currentUserUi = await getUserUiConfig(req.currentUser.username, globalUi);
                const effectiveUi = mergeUiConfig(globalUi, currentUserUi);
                const body = buildUserUiBody(req.body || {});
                if (!Object.keys(body).length) {
                    return res.json({ ok: true, data: effectiveUi });
                }
                const savedUserUi = await saveUserUiConfig(
                    req.currentUser.username,
                    { ...effectiveUi, ...body },
                    effectiveUi,
                );
                return res.json({ ok: true, data: mergeUiConfig(globalUi, savedUserUi) });
            }

            const provider = getProvider();
            if ((req.body || {}).theme !== undefined) {
                await provider.setUITheme((req.body || {}).theme);
            }

            const uiUpdates = {};
            if (req.body.loginBackground !== undefined) uiUpdates.loginBackground = req.body.loginBackground;
            if (req.body.backgroundScope !== undefined) uiUpdates.backgroundScope = req.body.backgroundScope;
            if (req.body.loginBackgroundOverlayOpacity !== undefined) uiUpdates.loginBackgroundOverlayOpacity = req.body.loginBackgroundOverlayOpacity;
            if (req.body.loginBackgroundBlur !== undefined) uiUpdates.loginBackgroundBlur = req.body.loginBackgroundBlur;
            if (req.body.workspaceVisualPreset !== undefined) uiUpdates.workspaceVisualPreset = req.body.workspaceVisualPreset;
            if (req.body.appBackgroundOverlayOpacity !== undefined) uiUpdates.appBackgroundOverlayOpacity = req.body.appBackgroundOverlayOpacity;
            if (req.body.appBackgroundBlur !== undefined) uiUpdates.appBackgroundBlur = req.body.appBackgroundBlur;
            if (req.body.colorTheme !== undefined) uiUpdates.colorTheme = req.body.colorTheme;
            if (req.body.performanceMode !== undefined) uiUpdates.performanceMode = req.body.performanceMode;
            if (req.body.themeBackgroundLinked !== undefined) uiUpdates.themeBackgroundLinked = req.body.themeBackgroundLinked;
            if (req.body.siteTitle !== undefined) uiUpdates.siteTitle = req.body.siteTitle;
            if (req.body.supportQqGroup !== undefined) uiUpdates.supportQqGroup = req.body.supportQqGroup;
            if (req.body.copyrightText !== undefined) uiUpdates.copyrightText = req.body.copyrightText;
            if (req.body.timestamp !== undefined) uiUpdates.timestamp = req.body.timestamp;

            if (Object.keys(uiUpdates).length > 0) {
                store.applyConfigSnapshot({ ui: uiUpdates });
            }
            if (typeof store.flushGlobalConfigSave === 'function') {
                await store.flushGlobalConfigSave();
            }

            const nextUi = store.getUI();
            runUiBackgroundCleanup([nextUi.loginBackground || '']);
            res.json({ ok: true, data: nextUi });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/settings/ui-background/upload', async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '仅管理员可上传登录页背景' });
            }

            const dataUrl = String(req.body?.dataUrl || '').trim();
            const matches = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Z0-9+/=]+)$/i);
            if (!matches) {
                return res.status(400).json({ ok: false, error: '仅支持 PNG / JPG / WebP 图片上传' });
            }

            const mimeType = matches[1].toLowerCase();
            const base64Payload = matches[2];
            const buffer = Buffer.from(base64Payload, 'base64');
            if (!buffer.length) {
                return res.status(400).json({ ok: false, error: '图片内容为空' });
            }
            if (buffer.length > 5 * 1024 * 1024) {
                return res.status(400).json({ ok: false, error: '图片压缩后仍超过 5MB，请换一张更小的图片' });
            }

            const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
            const filename = `login-bg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
            const saveDir = ensureUiBackgroundDir();
            const targetPath = path.join(saveDir, filename);

            fs.writeFileSync(targetPath, buffer);
            const uploadedUrl = `/ui-backgrounds/${filename}`;
            runUiBackgroundCleanup([uploadedUrl]);

            return res.json({
                ok: true,
                data: {
                    url: uploadedUrl,
                    mimeType,
                    size: buffer.length,
                },
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/settings/offline-reminder', async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '仅管理员可修改下线提醒设置' });
            }
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setOfflineReminder ? store.setOfflineReminder(body) : {};
            if (typeof store.flushGlobalConfigSave === 'function') {
                await store.flushGlobalConfigSave();
            }
            res.json({ ok: true, data: data || {} });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/settings/timing-config', authRequired, async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: 'Forbidden' });
            }
            const config = store.getTimingConfig();
            const defaults = store.DEFAULT_TIMING_CONFIG;
            res.json({ ok: true, data: { config, defaults, readonlyParams: TIMING_READONLY_PARAMS } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/settings/timing-config', authRequired, async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: 'Forbidden' });
            }
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setTimingConfig(body);
            if (typeof store.flushGlobalConfigSave === 'function') {
                await store.flushGlobalConfigSave();
            }
            const provider = getProvider ? getProvider() : null;
            if (provider && typeof provider.syncSystemTimingConfig === 'function') {
                await provider.syncSystemTimingConfig();
            }
            adminLogger.info('时间参数配置已更新', { config: data });
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/reports/test', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            if (!id) {
                return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            }
            const provider = getProvider();
            if (!provider || typeof provider.sendAccountReportTest !== 'function') {
                return res.status(503).json({ ok: false, error: '经营汇报服务未启动' });
            }
            const result = await provider.sendAccountReportTest(id);
            if (!result || !result.ok) {
                return res.status(400).json({ ok: false, error: result && result.error ? result.error : '发送失败', data: result || {} });
            }
            res.json({ ok: true, data: result });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/reports/send', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            if (!id) {
                return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            }
            const mode = String(((req.body || {}).mode) || '').trim().toLowerCase();
            if (mode !== 'hourly' && mode !== 'daily') {
                return res.status(400).json({ ok: false, error: 'mode 仅支持 hourly 或 daily' });
            }
            const provider = getProvider();
            if (!provider || typeof provider.sendAccountReport !== 'function') {
                return res.status(503).json({ ok: false, error: '经营汇报服务未启动' });
            }
            const result = await provider.sendAccountReport(id, mode);
            if (!result || !result.ok) {
                return res.status(400).json({ ok: false, error: result && result.error ? result.error : '发送失败', data: result || {} });
            }
            res.json({ ok: true, data: result });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/reports/history', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            if (!id) {
                return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            }
            const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
            const pageSize = 3;
            const mode = String(req.query.mode || '').trim().toLowerCase();
            const status = String(req.query.status || '').trim().toLowerCase();
            const sortOrder = String(req.query.sortOrder !== undefined ? req.query.sortOrder : (req.query.order || '')).trim().toLowerCase();
            const keyword = String(req.query.keyword !== undefined ? req.query.keyword : (req.query.q || '')).trim();
            const data = await getReportLogs(id, { page, pageSize, mode, status, sortOrder, keyword });
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/reports/history/stats', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            if (!id) {
                return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            }
            const mode = String(req.query.mode || '').trim().toLowerCase();
            const status = String(req.query.status || '').trim().toLowerCase();
            const keyword = String(req.query.keyword !== undefined ? req.query.keyword : (req.query.q || '')).trim();
            const data = await getReportLogStats(id, { mode, status, keyword });
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/reports/history/export', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            if (!id) {
                return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            }
            const mode = String(req.query.mode || '').trim().toLowerCase();
            const status = String(req.query.status || '').trim().toLowerCase();
            const sortOrder = String(req.query.sortOrder !== undefined ? req.query.sortOrder : (req.query.order || '')).trim().toLowerCase();
            const keyword = String(req.query.keyword !== undefined ? req.query.keyword : (req.query.q || '')).trim();
            const data = await exportReportLogs(id, { mode, status, sortOrder, keyword, maxRows: 2000 });
            const filename = `report-history-${String(id).replace(/[^\w-]/g, '_')}-${Date.now()}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('X-Export-Count', String(data.items.length));
            res.setHeader('X-Export-Total', String(data.total));
            res.setHeader('X-Export-Truncated', data.truncated ? '1' : '0');
            res.send(buildReportHistoryCsv(data.items));
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/reports/history/items', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            if (!id) {
                return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            }
            const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
            if (ids.length === 0) {
                return res.status(400).json({ ok: false, error: 'ids 不能为空' });
            }
            const result = await deleteReportLogsByIds(id, ids);
            res.json({ ok: true, data: result });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.delete('/api/reports/history', accountOwnershipRequired, async (req, res) => {
        try {
            const id = await getAccId(req);
            if (!id) {
                return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
            }
            const result = await clearReportLogs(id);
            res.json({ ok: true, data: result });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = {
    registerSettingsReportRoutes,
};
