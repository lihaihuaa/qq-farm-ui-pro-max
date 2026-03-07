# 数据库文件处理指南

> **重要说明：** 运行时数据库文件不会进入 Git 历史，但**不影响本地和服务器使用**。
>
> **路径说明（2026-03-07 更新）：**
> - 源码逻辑默认仍兼容 `core/data/`
> - 当前整理后的本地工作区将物理数据入口统一到了根目录 `data/`
> - 因此本文出现的 `core/data/...`，在当前工作区可等价理解为 `data/...`

---

## ❓ 常见疑问

### Q: 数据库文件排除了，后台还能用吗？

**A: 完全可以用！** 数据库会在首次运行时自动创建。

### Q: 我的数据会丢失吗？

**A: 不会！** 数据库文件一直在你的本地/服务器上，只是不上传到 GitHub。

### Q: 如何初始化数据库？

**A: 不需要手动操作！** 程序启动时自动初始化。

---

## 📊 数据库文件分类

### 运行时生成（不上传 GitHub）

| 文件 | 说明 | 生成时机 |
|------|------|---------|
| `core/data/farm-bot.db` | 主数据库 | 首次运行自动生成 |
| `core/data/farm-bot.db-wal` | WAL 日志 | 运行时生成 |
| `core/data/farm-bot.db-shm` | 共享内存 | 运行时生成 |
| `core/data/accounts.json` | 账号配置 | 首次添加账号时生成 |
| `core/data/store.json` | 全局配置 | 首次修改配置时生成 |

### 迁移脚本（上传 GitHub）

| 文件 | 说明 | 作用 |
|------|------|------|
| `core/src/database/migrations/001-init.sql` | 初始迁移 | 创建所有基础表 |
| `core/src/database/migrations/002-optimize_storage.sql` | 性能优化 | 优化存储结构 |
| `core/src/database/migrations/003-friends_cache.sql` | 好友缓存 | 添加好友缓存表 |
| `core/src/database/migrations/004-remove-fk.sql` | 外键调整 | 修改外键约束 |

---

## 🔄 数据库初始化流程

### 自动初始化（推荐）

```
程序启动
    ↓
调用 initDatabase()
    ↓
创建 farm-bot.db 文件（如果不存在）
    ↓
执行 PRAGMA 配置
    - journal_mode = WAL
    - busy_timeout = 5000
    - wal_autocheckpoint = 1000
    - foreign_keys = ON
    ↓
执行迁移脚本
    - 001-init.sql → 创建表结构
    - 002-optimize_storage.sql → 性能优化
    - 003-friends_cache.sql → 好友缓存
    - 004-remove-fk.sql → 外键调整
    ↓
设置数据库版本（user_version）
    ↓
初始化完成 ✅
```

### 数据库表结构

初始化后自动创建以下表：

```sql
-- 用户表
CREATE TABLE users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at INTEGER NOT NULL
);

-- 卡密表
CREATE TABLE cards (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    days INTEGER NOT NULL,
    used_by TEXT,
    used_at INTEGER,
    created_at INTEGER NOT NULL
);

-- 账号配置表
CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT,
    code TEXT,
    platform TEXT DEFAULT 'qq',
    uin TEXT,
    qq TEXT,
    avatar TEXT,
    username TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER
);

-- 操作日志表
CREATE TABLE operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    result TEXT
);

-- 配置审计日志表
CREATE TABLE config_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT,
    config_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    timestamp INTEGER NOT NULL
);

-- 好友缓存表
CREATE TABLE friends_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    nickname TEXT,
    avatar TEXT,
    updated_at INTEGER NOT NULL
);
```

---

## 🚀 使用场景

### 场景 1：GitHub 用户首次安装

```bash
# 1. Clone 代码
git clone https://github.com/your-username/qq-farm-bot.git
cd qq-farm-bot

# 2. 复制环境模板
cp core/.env.ai.example core/.env.ai

# 3. 编辑配置（填入 API 密钥等）
nano core/.env.ai

# 4. 安装依赖
pnpm install

# 5. 启动程序（自动创建数据库）
pnpm dev:core

# ✅ 输出示例：
# [database] 数据库初始化成功：/path/to/data/farm-bot.db
# [database] 数据库迁移完成，当前版本：4
```

### 场景 2：本地开发（已有数据库）

```bash
# 直接启动
pnpm dev:core

# ✅ 数据库已存在，包含所有历史数据
# ✅ 正常使用，无任何影响
```

### 场景 3：服务器部署

```bash
# 1. 在根目录主仓提交并推送
git add -A
git commit -m "chore: deploy update"
git push origin <branch>

# 2. 将代码同步到服务器（任选其一）
rsync -av --exclude node_modules --exclude logs --exclude data ./ user@server:/path/to/qq-farm-bot/
# 或使用你现有的 CI / 拉取流程

# 3. 服务器上配置
ssh user@server
cd /path/to/qq-farm-bot

# 复制环境模板
cp core/.env.ai.example core/.env.ai

# 编辑配置
nano core/.env.ai

# 4. 启动（自动创建数据库）
pnpm install
pnpm dev:core

# ✅ 数据库自动创建！
```

### 场景 4：数据库迁移（升级）

```bash
# 1. 更新代码
git pull

# 2. 备份数据库（重要！）
cp core/data/farm-bot.db core/data/farm-bot.db.backup.$(date +%Y%m%d)

# 3. 启动程序（自动执行迁移）
pnpm dev:core

# ✅ 如果有新迁移，自动执行：
# [database] 正在执行迁移：005-new-feature.sql
# [database] 数据库迁移完成，当前版本：5
```

---

## ⚠️ 注意事项

### ✅ 正确做法

1. **本地开发**
   - ✅ 数据库文件保存在本地
   - ✅ 定期备份重要数据
   - ✅ 使用迁移脚本管理表结构变更

2. **服务器部署**
   - ✅ 首次部署时自动创建数据库
   - ✅ 更新代码前备份数据库
   - ✅ 数据库文件不上传到 Git

3. **数据备份**
   - ✅ 定期备份 `core/data/farm-bot.db`
   - ✅ 备份 `core/data/*.json` 配置文件
   - ✅ 备份 `.env` 文件（敏感！）

### ❌ 错误做法

1. **不要上传数据库到 Git**
   ```bash
   # ❌ 错误
   git add core/data/farm-bot.db
   git commit -m "Add database"
   
   # ✅ 正确
   # 数据库已在 .gitignore 中，自动排除
   ```

2. **不要手动修改迁移脚本**
   ```bash
   # ❌ 错误：修改已执行的迁移脚本
   nano core/src/database/migrations/001-init.sql
   
   # ✅ 正确：创建新迁移
   nano core/src/database/migrations/005-new-feature.sql
   ```

3. **不要删除数据库文件**
   ```bash
   # ❌ 错误：直接删除数据库
   rm core/data/farm-bot.db
   
   # ✅ 正确：如需重置，先备份再删除
   cp core/data/farm-bot.db core/data/farm-bot.db.backup
   rm core/data/farm-bot.db
   # 重启程序自动创建新数据库
   ```

---

## 🔧 故障排查

### 问题 1：数据库文件不存在

**现象：** 启动时报错 `database not found`

**解决方案：**
```bash
# 检查 data 目录是否存在
ls -la core/data/

# 如果目录不存在，创建它
mkdir -p core/data

# 重启程序，自动创建数据库
pnpm dev:core
```

### 问题 2：数据库迁移失败

**现象：** 启动时报错 `migration failed`

**解决方案：**
```bash
# 1. 检查迁移脚本
ls -la core/src/database/migrations/

# 2. 检查数据库版本
sqlite3 core/data/farm-bot.db "PRAGMA user_version;"

# 3. 查看日志
tail -f logs/*.log

# 4. 如需重置（谨慎！）
cp core/data/farm-bot.db core/data/farm-bot.db.backup
rm core/data/farm-bot.db
pnpm dev:core
```

### 问题 3：数据库锁定

**现象：** 报错 `SQLITE_BUSY`

**解决方案：**
```bash
# 1. 检查是否有多个进程访问
ps aux | grep node

# 2. 停止所有进程
pkill -f "node.*core"

# 3. 检查 WAL 文件
ls -la core/data/*.db-wal

# 4. 如需清理 WAL
sqlite3 core/data/farm-bot.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

---

## 📝 总结

### 关键点

1. ✅ **数据库文件不上传 GitHub** - 包含用户数据，应保密
2. ✅ **迁移脚本上传 GitHub** - 表结构定义，公开
3. ✅ **自动初始化** - 首次运行自动创建数据库
4. ✅ **向后兼容** - 迁移脚本确保表结构升级

### 文件清单

| 类型 | 文件 | Git 状态 | 说明 |
|------|------|---------|------|
| 数据库 | `core/data/farm-bot.db` | 🚫 忽略 | 运行时生成 |
| 配置 | `core/data/*.json` | 🚫 忽略 | 用户数据 |
| 迁移 | `core/src/database/migrations/*.sql` | ✅ 跟踪 | 表结构定义 |
| 模板 | `core/data/*.json.example` | ✅ 跟踪 | 配置模板 |

### 下一步

1. ✅ 理解数据库处理逻辑
2. ✅ 使用根目录主仓工作流准备推送
3. ✅ 本地测试数据库自动创建
4. ✅ 推送到 GitHub

更多发布细节见：`docs/guides/REPO_ROOT_WORKFLOW_GUIDE.md`

---

**文档创建时间：** 2026-03-01  
**适用版本：** v3.3.3+  
**维护者：** smdk000
