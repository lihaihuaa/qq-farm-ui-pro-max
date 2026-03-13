const test = require('node:test');
const assert = require('node:assert/strict');

const reportServiceModulePath = require.resolve('../src/services/report-service');
const databaseModulePath = require.resolve('../src/services/database');
const loggerModulePath = require.resolve('../src/services/logger');

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

function createSchedulerMock() {
    return {
        setTimeoutTask() {
            return null;
        },
        setIntervalTask() {
            return null;
        },
        clearAll() {
            return null;
        },
    };
}

test('sendTestReport builds styled html payload for email channel', async () => {
    const restoreDatabase = mockModule(databaseModulePath, {
        async insertReportLog() {
            return { ok: true };
        },
        async pruneReportLogs() {
            return { ok: true, affectedRows: 0 };
        },
    });
    const restoreLogger = mockModule(loggerModulePath, {
        createModuleLogger() {
            return {
                info() {},
                warn() {},
                error() {},
            };
        },
    });

    try {
        delete require.cache[reportServiceModulePath];
        const { createReportService } = require(reportServiceModulePath);
        const deliveries = [];
        const scheduler = createSchedulerMock();

        const service = createReportService({
            store: {
                getReportConfig(accountId) {
                    if (!accountId) return null;
                    return {
                        enabled: true,
                        channel: 'email',
                        smtpHost: 'smtp.example.com',
                        smtpPort: 465,
                        smtpSecure: true,
                        smtpUser: 'bot@example.com',
                        smtpPass: 'secret',
                        emailFrom: 'bot@example.com',
                        emailTo: 'user@example.com',
                        title: '经营汇报',
                    };
                },
                getReportState() {
                    return {};
                },
            },
            dataProvider: {
                async resolveAccountId(accountRef) {
                    return String(accountRef);
                },
                getStatus() {
                    return {
                        accountId: '1009',
                        accountName: '尤隔情窗唤梦回',
                        sessionExpGained: 170,
                        sessionGoldGained: 0,
                        sessionCouponGained: 50,
                        operations: {
                            harvest: 8,
                            water: 0,
                            weed: 4,
                            bug: 5,
                            fertilize: 0,
                            plant: 0,
                            steal: 0,
                            helpWater: 0,
                            helpWeed: 0,
                            helpBug: 0,
                            taskClaim: 1,
                            sell: 0,
                            upgrade: 0,
                            levelUp: 0,
                        },
                        status: {
                            name: '尤隔情窗唤梦回',
                            platform: 'wx_car',
                            level: 13,
                            gold: 62150,
                            exp: 36240,
                        },
                        connection: {
                            connected: true,
                        },
                    };
                },
                async getLands() {
                    return {
                        lands: Array.from({ length: 24 }, () => ({})),
                        summary: {
                            harvestable: 0,
                            growing: 11,
                            empty: 0,
                            needWater: 0,
                            needWeed: 0,
                            needBug: 0,
                            soonToMature: 0,
                            upgradable: 0,
                            unlockable: 0,
                        },
                    };
                },
                async getBag() {
                    return {
                        totalKinds: 17,
                        items: [{ count: 106595 }],
                    };
                },
                async getFriends() {
                    return [{ name: '悠然悦若隔世梦' }];
                },
            },
            getAccounts() {
                return [{ id: '1009', name: '尤隔情窗唤梦回', platform: 'wx_car' }];
            },
            async sendPushooMessage(payload) {
                deliveries.push(payload);
                return { ok: true, msg: 'ok' };
            },
            scheduler,
        });

        const result = await service.sendTestReport('1009');

        assert.equal(result.ok, true);
        assert.equal(deliveries.length, 1);
        assert.equal(deliveries[0].channel, 'email');
        assert.equal(typeof deliveries[0].html, 'string');
        assert.match(deliveries[0].html, /经营汇报测试/);
        assert.match(deliveries[0].html, /尤隔情窗唤梦回/);
        assert.match(deliveries[0].html, /农场概况/);
        assert.match(deliveries[0].html, /背包概况/);
        assert.match(deliveries[0].html, /此邮件由 QQ Farm Bot 自动发送/);
        assert.match(deliveries[0].content, /账号: 尤隔情窗唤梦回 \(1009\)/);
        assert.match(deliveries[0].content, /本时段收益: 经验 \+170/);
    } finally {
        delete require.cache[reportServiceModulePath];
        restoreDatabase();
        restoreLogger();
    }
});
