# 项目目录结构说明

> 本文档解释各目录的用途与维护规则。  
> 目录凌乱时，请参考 `DIRECTORY_MAINTENANCE_SOP.md` 进行整理。

---

## 根目录

| 文件/目录 | 用途 | 是否提交 |
|-----------|------|----------|
| `package.json` | 根 workspace 配置 | ✅ |
| `pnpm-workspace.yaml` | pnpm 工作区 | ✅ |
| `pnpm-lock.yaml` | 依赖锁定 | ✅ |
| `README.md` | 项目说明 | ✅ |
| `CHANGELOG.md` | 发布变更 | ✅ |
| `CHANGELOG.DEVELOPMENT.md` | 开发版变更 | ✅ |
| `LICENSE` | 许可证 | ✅ |
| `.gitignore` | Git 忽略规则 | ✅ |
| `.dockerignore` | Docker 忽略规则 | ✅ |
| `.env` | 本地配置（含密钥） | ❌ |

---

## 核心目录

### `core/`

后端核心代码（Node.js）。

- `src/`：业务逻辑
- `__tests__/`：单元测试
- `config/`：配置
- `data/`：运行时数据（不提交）
- `package.json`：后端依赖
- `Dockerfile`：容器构建

### `web/`

前端界面（Vue + Vite）。

- `src/`：组件、页面、路由
- `public/`：静态资源
- `dist/`：构建产物（不提交）
- `package.json`：前端依赖

### `services/`

外部/独立服务。

- `ipad860/`：私有服务（不同步 GitHub）
- `openviking/`：OpenViking 服务

---

## 脚本与工具

### `scripts/`

按用途分子目录：

| 子目录 | 用途 |
|--------|------|
| `deploy/` | 部署脚本 |
| `docker/` | Docker 镜像构建、推送 |
| `github/` | Git 安全检查与历史同步脚本（check-sensitive-info.sh 等） |
| `service/` | 服务管理（ai-autostart 等） |
| `utils/` | 通用工具脚本 |

---

## 文档

### `docs/`

| 子目录 | 用途 |
|--------|------|
| `guides/` | 用户指南、快速上手 |
| `api/` | API 文档 |
| `architecture/` | 架构文档 |
| `deployment/` | 部署说明 |
| `plans/` | 计划文档（按日期 YYYY-MM-DD 归档） |
| `archive/` | 归档（reports、legacy） |
| `dev-notes/` | 开发笔记 |
| `maintenance/` | 维护 SOP、规范 |
| `drafts/` | 草稿 |
| `pic/` | 文档配图 |

---

## 日志与数据

### `logs/`

- 根目录：运行日志（ai-autostart.log 等）
- `development/`：开发日志（原 log开发日志）

### `data/`

运行时数据（SQLite、JSON 等），不提交。

---

## 部署与 Docker

### `deploy-to-server/`

部署相关脚本与说明。`.tar.gz` 构建包不提交。

### `docker/`

- `docker-compose.yml`：开发环境
- `docker-compose.prod.yml`：生产环境
- `start.sh`：启动脚本

---

## Git 工作流

### 根目录主仓

当前以项目根目录为唯一 Git 主仓。  
旧 `github-sync` 仅保留在本地归档 `archive/retired-repos/github-sync-main-20260307/`，不再参与日常提交流程。

---

## 禁止事项

- 根目录放 `.tar`、`.zip`、大二进制
- 使用 `mv` 而非 `git mv` 移动文件
- 中文目录名放 `docs/` 顶层
- 将 `.env`、`data/*.db` 提交到 GitHub
