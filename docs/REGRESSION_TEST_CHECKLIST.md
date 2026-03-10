# 回归测试清单

> 用于功能优化、Async 修复、Provider 变更后的验证。  
> 更新日期：2026-03-10

---

## 一、API 接口回归

### 1.1 `/api/status`

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 启动服务，无账号 | 返回 `{ ok: true, ... }`，`accounts` 为空或列表 |
| 2 | 添加账号并启动 | `accounts` 中对应项 `running: true` |
| 3 | 停止账号 | `running: false` |

**验证点**：无 500 错误，`getStatus` 返回完整结构。

---

### 1.2 `/api/logs`

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 无账号时请求 | 返回 `{ ok: true, logs: [] }` 或空数组 |
| 2 | 有账号且有操作日志 | `logs` 非空，含 `accountId`、`action`、`msg` 等 |
| 3 | 带 `?accountId=xxx` 过滤 | 仅返回该账号日志 |

**验证点**：无 500 错误，`getLogs` / `getAccountLogs` 正常返回。

---

### 1.3 偷菜好友列表

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 打开偷菜页面 / 好友列表 | 列表正常加载，无空白或报错 |
| 2 | 有好友缓存时 | 显示好友昵称、土地状态等 |
| 3 | 无缓存时 | 显示加载中或空状态，不崩溃 |

**验证点**：`getCachedFriends`、`getFriendLands` 调用正常，前端无未捕获异常。

---

### 1.4 好友缓存同步

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 账号运行中，等待 `sync_friends_cache` 触发 | 控制台无 `[worker-manager] 好友缓存同步失败` 等未捕获错误 |
| 2 | 同步成功后刷新偷菜页 | 好友列表更新 |

**验证点**：`updateFriendsCache` 使用 `.catch()` 处理拒绝，无未捕获 Promise 拒绝。

---

## 二、账号与设置

### 2.1 账号备注更新

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 修改账号备注（`PATCH /api/accounts/:id`） | 返回 `{ ok: true }` |
| 2 | 刷新状态页 | 备注已更新，`setRuntimeAccountName` 生效 |

---

### 2.2 设置保存

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 保存种植策略、偷菜过滤等 | 无 500，配置持久化 |
| 2 | 重启账号 | 配置正确加载 |

---

## 三、执行方式

- **手动**：按清单逐项操作并记录结果
- **自动化**：可基于 `curl` / `fetch` 编写脚本，对 `/api/status`、`/api/logs` 等做基础断言

---

## 四、前端结构性改动强制校验

> 适用范围：Vue 页面结构调整、共享 composable / store / utils 收口、模板重构、视图偏好持久化、构建产物链路调整。

### 4.1 TypeScript 与模板校验

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 执行 `pnpm -C web exec vue-tsc -b --pretty false --force` | 无类型错误、无模板解析错误 |
| 2 | 若涉及共享状态或组合式逻辑 | 对应 `web/__tests__` 最小回归测试通过 |

**验证点**：不能只依赖局部 `eslint`，必须确认全量类型和模板都可通过。

### 4.2 正式构建校验

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 执行 `pnpm -C web build` | 构建成功，生成有效前端产物 |
| 2 | 若涉及 `web/dist` 选路 / fallback | 构建日志与系统自检状态一致 |

**验证点**：正式 `vite build` 能暴露局部 lint 看不到的问题，例如模板截断、闭合标签缺失、产物目录异常。

### 4.3 推荐最小校验组合

1. `pnpm -C web exec eslint "src/**/*.{ts,vue}"`
2. `pnpm -C web exec vue-tsc -b --pretty false --force`
3. `pnpm -C web build`
4. 相关 `node --test ...` 或 `web/__tests__` 最小回归

**结论**：只要是前端结构性改动，`pnpm -C web build` 视为必跑项，不能省略。

### 4.4 固定执行入口

- 本地推荐入口：`pnpm test:frontend`
- 根目录兼容入口：`pnpm test:web:regression`
- Web 子包入口：`pnpm -C web test:regression`
- Web 运行时产物入口：`pnpm -C web build:runtime`
- CI 入口：`.github/workflows/ci.yml` 中的 `Verify Frontend Regression`（执行 `pnpm test:frontend`）
- 附加审计：`pnpm -C web run lint:check`

**说明**：固定脚本当前以 `vue-tsc --force + web 单测 + build:runtime` 作为阻断链，显式写入 `dist-runtime`，避免历史 `web/dist` 权限污染把结构性回归链误杀；`lint:check` 保留为附加审计，用于持续清理历史页面的 lint 债务，但不再阻断这条结构性回归链。`test:frontend` 只是更直观的根级别别名，实际仍走同一条回归链。

---

**最后更新**: 2026-03-10
