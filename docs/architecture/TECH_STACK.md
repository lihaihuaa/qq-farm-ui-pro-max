# QQ 农场智能助手 - 完整技术栈说明

**版本**: v3.8.0  
**更新日期**: 2026-03-02  
**维护者**: smdk000

---

## 📋 目录

1. [整体架构](#整体架构)
2. [后端技术栈](#后端技术栈)
3. [前端技术栈](#前端技术栈)
4. [数据库架构](#数据库架构)
5. [部署技术栈](#部署技术栈)
6. [开发工具链](#开发工具链)
7. [技术选型理由](#技术选型理由)

---

## 🏗️ 整体架构

### 架构模式
- **前后端分离**: Vue 3 前端 + Node.js 后端
- **单体仓库 (Monorepo)**: pnpm workspace 管理
- **微内核架构**: 核心引擎 + 插件化服务
- **多 Worker 并行**: 每个账号独立 Worker 进程

### 系统架构
```
┌─────────────────────────────────────────┐
│           用户层 (User Layer)           │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ Web 面板 │  │ 移动端   │  │ API   │ │
│  └──────────┘  └──────────┘  └───────┘ │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         接入层 (Access Layer)           │
│  ┌─────────────────────────────────┐    │
│  │  Express HTTP Server + Socket.io │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│        应用层 (Application Layer)       │
│  ┌─────────────────────────────────┐    │
│  │   运行时引擎 (Runtime Engine)   │    │
│  │  ┌──────────┐  ┌──────────┐    │    │
│  │  │ Worker 1 │  │ Worker 2 │    │    │
│  │  │ (账号 1)  │  │ (账号 2)  │    │    │
│  │  └──────────┘  └──────────┘    │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│        数据层 (Data Layer)              │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │  MySQL   │  │  Redis   │  │ SQLite│ │
│  │ (主库)   │  │ (缓存)   │  │(离线) │ │
│  └──────────┘  └──────────┘  └───────┘ │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│     外部服务 (External Services)        │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ QQ 农场  │  │ 微信     │  │ 推送  │ │
│  │ 游戏服   │  │ 登录     │  │ 服务  │ │
│  └──────────┘  └──────────┘  └───────┘ │
└─────────────────────────────────────────┘
```

---

## 💻 后端技术栈

### 核心运行时

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **Node.js** | 20+ (推荐 22+) | JavaScript 运行时 | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 10.30.2 | 包管理器 | [pnpm.io](https://pnpm.io/) |
| **CommonJS** | - | 模块系统 | - |

### Web 框架与通信

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **Express** | 4.21.0 | Web 框架 | [expressjs.com](https://expressjs.com/) |
| **Socket.io** | 4.8.3 | WebSocket 实时通信 | [socket.io](https://socket.io/) |
| **Axios** | 1.16.0 | HTTP 客户端 | [axios-http.com](https://axios-http.com/) |
| **qrcode** | 1.5.4 | 二维码生成 | [GitHub](https://github.com/soldair/node-qrcode) |

### 数据库与存储

#### 生产环境（MySQL/Redis 架构）

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **MySQL** | 8.0 | 主数据库 | [mysql.com](https://www.mysql.com/) |
| **mysql2** | 3.18.2 | MySQL 客户端 | [GitHub](https://github.com/sidorares/node-mysql2) |
| **Redis** | 6.0+ | 缓存/分布式锁/Pub/Sub | [redis.io](https://redis.io/) |
| **ioredis** | 5.10.0 | Redis 客户端 | [GitHub](https://github.com/luin/ioredis) |

#### 单机/离线模式（SQLite 架构）

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **SQLite** | 3.x | 本地数据库 | [sqlite.org](https://www.sqlite.org/) |
| **better-sqlite3** | 12.6.2 | SQLite 客户端 | [GitHub](https://github.com/JoshuaWise/better-sqlite3) |

#### 协议处理

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **Protobuf.js** | 8.0.0 | Protocol Buffers | [GitHub](https://github.com/protobufjs/protobuf.js) |

### 日志与通知

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **Winston** | 3.18.3 | 日志框架 | [GitHub](https://github.com/winstonjs/winston) |
| **pushoo** | 0.1.11 | 推送通知服务 | [GitHub](https://github.com/imaegoo/pushoo) |

### 打包与部署

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **pkg** | 5.8.1 | Node.js 打包为二进制 | [GitHub](https://github.com/vercel/pkg) |

**支持平台**:
- Windows x64 (`win-x64`)
- Linux x64 (`linux-x64`)
- macOS x64 (`macos-x64`)
- macOS arm64 (`macos-arm64`)

---

## 🎨 前端技术栈

### 核心框架

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **Vue** | 3.5.28 | 渐进式框架 | [vuejs.org](https://vuejs.org/) |
| **Vite** | 7.3.1 | 构建工具 | [vitejs.dev](https://vitejs.dev/) |
| **TypeScript** | 5.9.3 | 类型系统 | [typescriptlang.org](https://www.typescriptlang.org/) |
| **Pinia** | 3.0.4 | 状态管理 | [pinia.vuejs.org](https://pinia.vuejs.org/) |
| **Vue Router** | 5.0.3 | 路由管理 | [router.vuejs.org](https://router.vuejs.org/) |
| **Axios** | 1.13.5 | HTTP 客户端 | [axios-http.com](https://axios-http.com/) |
| **Socket.io-client** | 4.8.3 | WebSocket 客户端 | [socket.io](https://socket.io/) |
| **@vueuse/core** | 14.2.1 | Vue Composition API 工具库 | [vueuse.org](https://vueuse.org/) |

### UI 与样式

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **UnoCSS** | 66.5.12 | 原子化 CSS 引擎 | [unocss.dev](https://unocss.dev/) |
| **@iconify-json/carbon** | 1.2.18 | Carbon 图标集 | [iconify.design](https://icon-sets.iconify.design/carbon/) |
| **@iconify-json/fa-solid** | 1.2.2 | Font Awesome 图标集 | [icon-sets.iconify.design/fa-solid/] |
| **@iconify-json/svg-spinners** | 1.2.4 | 加载动画图标 | [icon-sets.iconify.design/svg-spinners/] |
| **@unocss/reset** | 66.5.12 | CSS Reset | [GitHub](https://github.com/unocss/unocss) |

### 开发与质量工具

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **vue-tsc** | 3.2.5 | TypeScript 类型检查 | [GitHub](https://github.com/vuejs/language-tools) |
| **ESLint** | 9.39.1 | 代码规范检查 | [eslint.org](https://eslint.org/) |
| **@antfu/eslint-config** | 7.4.3 | ESLint 配置 | [GitHub](https://github.com/antfu/eslint-config) |
| **eslint-plugin-format** | 1.4.0 | 代码格式化插件 | [GitHub](https://github.com/antfu/eslint-plugin-format) |
| **rollup-plugin-visualizer** | 7.0.0 | 打包分析可视化 | [GitHub](https://github.com/btd/rollup-plugin-visualizer) |
| **vite-plugin-compression** | 0.5.1 | 静态资源压缩 | [GitHub](https://github.com/nonzzz/vite-plugin-compression) |

---

## 🗄️ 数据库架构

### MySQL/Redis 架构（生产环境推荐）

#### 架构图
```
┌─────────────────────────────────────┐
│         应用层 (Application)        │
│  ┌─────────────────────────────┐    │
│  │   DataProvider Service      │    │
│  └─────────────────────────────┘    │
│              │         │              │
│              ▼         ▼              │
│  ┌─────────────────┐ ┌─────────────┐ │
│  │   MySQL Pool    │ │ Redis Pool  │ │
│  │  (连接池管理)   │ │ (连接池管理)│ │
│  └─────────────────┘ └─────────────┘ │
└─────────────────────────────────────┘
              │         │
              ▼         ▼
┌─────────────────┐ ┌─────────────┐
│   MySQL 8.0     │ │  Redis 6.0+ │
│  (主数据库)     │ │  (缓存层)   │
│                 │ │             │
│ - users         │ │ - 会话缓存  │
│ - cards         │ │ - 好友列表  │
│ - accounts      │ │ - 农场数据  │
│ - account_configs│ │ - 分布式锁 │
│ - operation_logs│ │ - Pub/Sub   │
│ - config_audit  │ │             │
└─────────────────┘ └─────────────┘
```

#### 核心表结构

**users** - 用户信息表
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(64) NOT NULL,  -- SHA256
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  status ENUM('active', 'banned', 'expired') DEFAULT 'active'
);
```

**cards** - 卡密表
```sql
CREATE TABLE cards (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) UNIQUE NOT NULL,
  type ENUM('D', 'W', 'M', 'F') NOT NULL,  -- 天/周/月/永久
  days INT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_by INT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**accounts** - 账号配置表
```sql
CREATE TABLE accounts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  qid VARCHAR(50) NOT NULL,
  password_encrypted TEXT,
  nickname VARCHAR(100),
  owner_id INT NOT NULL,
  status ENUM('active', 'inactive', 'offline') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

**account_configs** - 账号配置表
```sql
CREATE TABLE account_configs (
  account_id INT PRIMARY KEY,
  auto_harvest BOOLEAN DEFAULT TRUE,
  auto_plant BOOLEAN DEFAULT TRUE,
  auto_water BOOLEAN DEFAULT FALSE,
  steal_enabled BOOLEAN DEFAULT TRUE,
  steal_blacklist JSON,
  steal_whitelist JSON,
  friend_blacklist JSON,
  silent_period_start TIME NULL,
  silent_period_end TIME NULL,
  stakeout_enabled BOOLEAN DEFAULT FALSE,
  stakeout_delay INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

**operation_logs** - 操作日志表
```sql
CREATE TABLE operation_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_id INT NOT NULL,
  operation_type VARCHAR(50) NOT NULL,
  operation_result ENUM('success', 'failed') NOT NULL,
  details JSON NULL,
  duration_ms INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account_time (account_id, created_at)
);
```

#### Redis 缓存策略

**缓存键设计**:
- `session:{userId}` - 用户会话
- `friend_list:{accountId}` - 好友列表缓存 (TTL: 1 小时)
- `farm_data:{accountId}` - 农场数据缓存 (TTL: 5 分钟)
- `config:{accountId}` - 账号配置缓存 (TTL: 10 分钟)
- `lock:account:{accountId}` - 账号操作分布式锁
- `channel:logs:{accountId}` - 日志 Pub/Sub 频道

**缓存更新策略**:
- **Cache-Aside**: 读取时先查缓存，未命中再查数据库
- **Write-Through**: 写入时同时更新缓存和数据库
- **TTL 过期**: 设置合理的过期时间防止脏数据

### SQLite 架构（单机/离线模式）

#### 配置优化
```javascript
// WAL 模式（预写日志）
PRAGMA journal_mode = WAL;

// 忙等待超时（5 秒）
PRAGMA busy_timeout = 5000;

// 自动检查点（每 1000 页）
PRAGMA wal_autocheckpoint = 1000;

// 同步模式（平衡性能与安全）
PRAGMA synchronous = NORMAL;
```

---

## 🚀 部署技术栈

### 容器化

| 技术 | 版本 | 用途 | 官方文档 |
|------|------|------|----------|
| **Docker** | 20+ | 容器引擎 | [docker.com](https://www.docker.com/) |
| **Docker Compose** | v2+ | 多容器编排 | [docs.docker.com](https://docs.docker.com/compose/) |
| **Docker Buildx** | - | 多平台构建 | [GitHub](https://github.com/docker/buildx) |

#### 多平台支持
- **linux/amd64**: Intel/AMD x86_64 服务器
- **linux/arm64**: ARM64 服务器（树莓派 4B/鲲鹏/飞腾/Apple Silicon）

#### 镜像仓库
- **Docker Hub**: `smdk000/qq-farm-bot-ui`
- **GitHub Container Registry**: `ghcr.io/smdk000/qq-farm-bot-ui`

### CI/CD

| 技术 | 用途 | 官方文档 |
|------|------|----------|
| **GitHub Actions** | 持续集成/持续部署 | [github.com/features/actions](https://github.com/features/actions) |

#### 工作流

**1. docker-build-push.yml** - Docker 自动构建和推送
- 触发条件：
  - Tag 推送（自动构建对应版本）
  - main 分支推送（自动构建 latest）
  - 手动触发
- 构建多平台镜像（linux/amd64, linux/arm64）
- 推送到 Docker Hub 和 GHCR

**2. ci.yml** - 持续集成
- 代码质量检查（Lint）
- 前端构建测试
- 多平台二进制打包（Windows/Linux/macOS）

**3. release.yml** - GitHub Release 自动发布
- 自动上传二进制文件到 GitHub Release
- 支持手动指定版本号和预发布标记

### 部署脚本

#### 一键部署脚本

**deploy-arm.sh** - ARM64 服务器部署
```bash
#!/bin/bash
# 适用于树莓派、鲲鹏、飞腾等 ARM64 架构
docker pull smdk000/qq-farm-bot-ui:latest
docker run -d --name qq-farm-bot-ui \
  -p 3080:3000 \
  -v ./data:/app/core/data \
  -e ADMIN_PASSWORD=your_password \
  smdk000/qq-farm-bot-ui:latest
```

**deploy-x86.sh** - x86_64 服务器部署
```bash
#!/bin/bash
# 适用于 Intel/AMD 处理器服务器
docker pull smdk000/qq-farm-bot-ui:latest
docker run -d --name qq-farm-bot-ui \
  -p 3080:3000 \
  -v ./data:/app/core/data \
  -e ADMIN_PASSWORD=your_password \
  smdkk000/qq-farm-bot-ui:latest
```

#### Docker Compose 部署

**docker-compose.prod.yml** - 生产环境配置
```yaml
version: '3.8'
services:
  qq-farm-bot-ui:
    image: smdkk000/qq-farm-bot-ui:latest
    container_name: qq-farm-bot-ui
    restart: unless-stopped
    ports:
      - "3080:3000"
    environment:
      - ADMIN_PASSWORD=your_password
      - TZ=Asia/Shanghai
      - NODE_ENV=production
      - LOG_LEVEL=info
    volumes:
      - ./data:/app/core/data
      - ./logs:/app/logs
      - ./backup:/app/core/backup
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/ping"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## 🛠️ 开发工具链

### 代码编辑器
- **Visual Studio Code** (推荐)
- **Cursor** (AI 辅助开发)

### VS Code 扩展推荐
- **Volar** - Vue 3 语言支持
- **TypeScript Vue Plugin (Volar)** - TS 支持
- **UnoCSS** - UnoCSS 智能提示
- **ESLint** - 代码规范检查
- **Prettier** - 代码格式化
- **Docker** - Docker 支持
- **GitLens** - Git 增强

### 开发命令

```bash
# 安装依赖
pnpm install

# 启动后端（监听模式）
pnpm dev:core

# 启动前端（热重载）
pnpm dev:web

# 构建前端
pnpm build:web

# 类型检查
pnpm type-check

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 打包二进制文件
pnpm package:release

# Docker 多平台构建
./scripts/docker-build-and-push.sh v3.8.0
```

---

## 💡 技术选型理由

### 为什么选择 Node.js？
1. **高性能异步 I/O**: 适合高并发场景（多账号同时挂机）
2. **生态系统丰富**: npm 拥有大量现成库
3. **前后端统一**: 使用同一种语言（TypeScript/JavaScript）
4. **易于部署**: 可打包为独立二进制文件

### 为什么选择 Vue 3？
1. **Composition API**: 更好的代码组织和类型推导
2. **性能优异**: 虚拟 DOM 优化，打包体积小
3. **生态完善**: Pinia、Vue Router 等官方配套
4. **学习曲线低**: 易于上手和维护

### 为什么选择 Vite？
1. **极速启动**: 基于 ESM 的即时热重载
2. **构建快速**: Rollup 打包，支持代码分割
3. **开箱即用**: 内置 TypeScript、CSS 支持
4. **插件丰富**: 庞大的插件生态系统

### 为什么选择 MySQL/Redis 架构？
1. **高并发支持**: MySQL 处理持久化，Redis 处理缓存
2. **数据可靠性**: ACID 事务保证数据一致性
3. **扩展性强**: 支持主从复制、分库分表
4. **成熟稳定**: 业界广泛使用的成熟方案

### 为什么选择 UnoCSS？
1. **极致性能**: 按需生成，零运行时
2. **高度可定制**: 完全可配置的原子化 CSS
3. **开发效率高**: 无需想类名，直接写样式
4. **体积小**: 相比 Tailwind CSS 更小的打包体积

### 为什么选择 pnpm？
1. **磁盘空间节省**: 硬链接机制，重复依赖只存一份
2. **安装速度快**: 并行安装，缓存命中率高
3. **严格依赖管理**: 避免幽灵依赖和提升依赖问题
4. **Monorepo 支持**: 原生支持工作空间

### 为什么选择 Docker 部署？
1. **环境一致性**: 开发、测试、生产环境完全一致
2. **隔离性好**: 容器间互不干扰
3. **易于扩展**: 支持水平扩展和负载均衡
4. **多平台支持**: 一次构建，多平台运行

---

## 📊 性能指标

### 构建性能
- **前端构建时间**: ~30-45 秒
- **后端打包时间**: ~2-3 分钟
- **Docker 镜像构建**: ~5-8 分钟（多平台）

### 运行性能
- **启动时间**: 
  - SQLite 模式：~3-5 秒
  - MySQL/Redis 模式：~5-8 秒
- **内存占用**: 
  - 单账号：~100-150MB
  - 每增加一个账号：+50-80MB
- **CPU 占用**: 
  - 空闲状态：<5%
  - 高频操作：10-20%

### 响应性能
- **API 响应时间**: 
  - 本地 SQLite: <50ms
  - MySQL + Redis: <100ms
- **WebSocket 延迟**: <20ms
- **页面加载时间**: 
  - 首屏：~1-2 秒
  - 完全加载：~3-5 秒

---

## 🔒 安全考虑

### 密码安全
- **用户密码**: SHA256 哈希 + 盐值
- **账号密码**: AES-256 加密存储
- **API 密钥**: 环境变量隔离

### 网络安全
- **HTTPS 支持**: 反向代理（Nginx/Caddy）
- **CORS 配置**: 限制跨域访问
- **速率限制**: WebSocket 3 QPS 令牌桶限流

### 数据安全
- **SQL 注入防护**: 参数化查询
- **XSS 防护**: 输入验证和输出转义
- **CSRF 防护**: Token 验证

---

## 📚 相关资源

### 官方文档
- [Vue 3 官方文档](https://vuejs.org/)
- [Vite 官方文档](https://vitejs.dev/)
- [Node.js 官方文档](https://nodejs.org/)
- [Express 官方文档](https://expressjs.com/)
- [MySQL 官方文档](https://dev.mysql.com/doc/)
- [Redis 官方文档](https://redis.io/documentation)

### 技术社区
- [Vue.js 中文社区](https://cn.vuejs.org/)
- [Node.js 技术社区](https://nodejs.cn/)
- [GitHub 社区](https://github.com/community)

---

**最后更新**: 2026-03-02  
**维护者**: smdk000  
**版本**: v3.8.0
