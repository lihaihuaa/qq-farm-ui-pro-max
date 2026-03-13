const test = require('node:test');
const assert = require('node:assert/strict');

const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const mysqlDriverModulePath = require.resolve('mysql2/promise');
const loadEnvModulePath = require.resolve('../src/config/load-env');
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

function createLoggerMock() {
    return {
        createModuleLogger() {
            return {
                info() { },
                warn() { },
                error() { },
                debug() { },
            };
        },
    };
}

test('initMysql nulls orphan account owners instead of deleting accounts while backfilling FK', async () => {
    const executedQueries = [];
    const restoreLoadEnv = mockModule(loadEnvModulePath, {
        loadProjectEnv() { },
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());
    const restoreMysqlDriver = mockModule(mysqlDriverModulePath, {
        createPool() {
            return {
                async query(sql) {
                    executedQueries.push(String(sql).replace(/\s+/g, ' ').trim());
                    return [[]];
                },
                async execute(sql) {
                    const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

                    if (normalizedSql.includes("show tables like 'accounts'")) {
                        return [[{ Tables_in_qq_farm: 'accounts' }]];
                    }
                    if (normalizedSql.includes("from information_schema.table_constraints")
                        && normalizedSql.includes("constraint_name = 'fk_accounts_username'")) {
                        return [[]];
                    }
                    if (normalizedSql.includes('from information_schema.columns')) {
                        return [[{ COLUMN_NAME: 'present' }]];
                    }
                    if (normalizedSql.includes('from information_schema.statistics')) {
                        return [[{ INDEX_NAME: 'present' }]];
                    }
                    if (normalizedSql.includes("show tables like '")) {
                        return [[{ table_name: 'present' }]];
                    }
                    return [[{ value: 1 }]];
                },
                async getConnection() {
                    return {
                        release() { },
                    };
                },
                async end() { },
                pool: {},
            };
        },
        async createConnection() {
            return {
                async query() {
                    return [[]];
                },
                async end() { },
            };
        },
    });

    try {
        delete require.cache[mysqlDbModulePath];
        const mysqlDb = require(mysqlDbModulePath);

        await mysqlDb.initMysql();

        assert.equal(
            executedQueries.some(sql => /update accounts set username = null/i.test(sql)),
            true,
        );
        assert.equal(
            executedQueries.some(sql => /delete from accounts/i.test(sql)),
            false,
        );
        assert.equal(
            executedQueries.some(sql => /alter table accounts add constraint fk_accounts_username/i.test(sql)),
            true,
        );

        await mysqlDb.closeMysql();
    } finally {
        delete require.cache[mysqlDbModulePath];
        restoreMysqlDriver();
        restoreLogger();
        restoreLoadEnv();
    }
});
