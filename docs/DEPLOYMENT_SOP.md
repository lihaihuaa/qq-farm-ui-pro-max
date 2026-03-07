# QQ 农场助手 - 部署 SOP（标准操作流程）

> 本文档定义 Docker 镜像构建、推送、根目录主仓提交、README 更新及部署教程维护的完整流程。

---

## 一、前置条件

- Docker 20.10+（含 Buildx）
- 已登录 Docker Hub：`docker login`
- 已配置 GitHub 仓库与推送权限
- 本地 `logs/development/Update.log` 已更新

---

## 二、Docker 镜像构建与推送

### 2.1 修正 Dockerfile 中 Update.log 路径

**文件**：`core/Dockerfile`

**问题**：当前使用 `COPY Update.log ./Update.log`，实际文件位于 `logs/development/Update.log`。

**修正**：
```dockerfile
# 原：COPY Update.log ./Update.log
# 改：COPY logs/development/Update.log ./Update.log
```

### 2.2 构建 ARM + x86 双架构镜像

**脚本**：`scripts/docker/docker-build-multiarch.sh`

**执行**：
```bash
cd /path/to/qq-farm-bot-ui-main_副本
./scripts/docker/docker-build-multiarch.sh v4.0.0
```

**说明**：
- 版本号参数可选，默认 `v3.6.0`，建议使用当前版本（如 `v4.0.0`）
- 支持 `linux/amd64`、`linux/arm64`
- 可选推送到 Docker Hub、GHCR 或两者

**镜像**：
- Docker Hub: `smdk000/qq-farm-bot-ui:latest` / `smdk000/qq-farm-bot-ui:v4.0.0`
- GHCR: `ghcr.io/smdk000/qq-farm-bot-ui:latest` / `ghcr.io/smdk000/qq-farm-bot-ui:v4.0.0`

---

## 三、Git 主仓推送

### 3.1 增量同步准备

1. 检查敏感信息：
   ```bash
   bash scripts/github/check-sensitive-info.sh .
   ```

2. 确认当前分支构建和部署脚本已更新：
   ```bash
   git status
   ```

### 3.2 推送到 GitHub

```bash
git add -A
git status
git commit -m "chore: 更新 v4.0.0 - 部署脚本与文档更新"
git push origin <branch>
```

**说明**：若实际仓库名非 `qq-farm-bot-ui`，需在 README 中统一为实际仓库名。

---

## 四、README 更新

### 4.1 部署教程章节

需包含以下内容：

| 章节 | 内容 |
|------|------|
| 单独部署 | Docker Compose 完整栈（qq-farm-bot-ui + ipad860 + Redis） |
| 一键部署 | ARM / x86 脚本使用说明及 curl 下载地址 |
| 本地部署 | 开发环境启动（dev.sh）、微信扫码登录说明 |

### 4.2 部署方式说明

| 方式 | 适用场景 | 关键文件 |
|------|----------|----------|
| Docker Compose 完整栈 | 生产环境，含微信扫码 | `docker-compose.prod.yml` |
| 一键脚本 | 快速部署单容器 | `scripts/deploy-arm.sh`、`scripts/deploy-x86.sh` |
| 本地开发 | 开发调试、微信扫码 | `dev.sh`、`start.sh` |

### 4.3 脚本链接统一

- 一键脚本示例中的 URL 需与 GitHub 仓库一致，例如：
  ```bash
  curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-arm.sh
  curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-x86.sh
  ```

### 4.4 Update.log 引用

- 在 README 中引用更新日志：`logs/development/Update.log`
- 可增加「更新日志」章节，说明最新版本变更内容

---

## 五、本地部署与微信扫码

### 5.1 本地开发启动

```bash
./dev.sh
```

**流程**：关闭占用端口 → 编译前端 → 启动后端，访问 http://localhost:3000

### 5.2 微信扫码登录说明

- 需配置 Ipad860 微信协议服务（本地或 Docker）
- 环境变量：`IPAD860_URL=http://ipad860:8058`（Docker 内网）或 `http://localhost:8058`（本地）
- 扫码流程：管理后台 → 账号管理 → 添加账号 → 选择微信/QQ 扫码

### 5.3 完整栈 Docker 部署（含微信扫码）

```bash
docker-compose -f docker-compose.prod.yml up -d
```

包含：qq-farm-bot-ui、ipad860、Redis。

---

## 六、部署脚本维护

### 6.1 脚本目录

| 脚本 | 路径 | 用途 |
|------|------|------|
| deploy-arm.sh | `scripts/deploy/` | ARM 一键部署 |
| deploy-x86.sh | `scripts/deploy/` | x86 一键部署 |
| docker-build-and-push.sh | `scripts/docker/` | 多架构构建与推送 |

### 6.2 脚本统一

- 直接维护 `scripts/deploy/` 中的部署脚本
- 根目录主仓工作流见：`docs/guides/REPO_ROOT_WORKFLOW_GUIDE.md`

---

## 七、Update.log 维护

| 项目 | 说明 |
|------|------|
| 路径 | `logs/development/Update.log` |
| 格式 | 日期 + 标题 + 变更点列表 |
| 更新时机 | 每次发版或重大功能变更后 |
| README 引用 | 在「更新日志」章节说明或链接 |

---

## 八、执行顺序

1. 修正 Dockerfile 中 Update.log 路径
2. 更新 `logs/development/Update.log`（如需要）
3. 执行 Docker 构建与推送
4. 更新 README（部署教程、脚本链接、Update.log 引用）
5. 更新部署脚本（确保与 README 一致）
6. 执行敏感信息检查
7. 增量提交并推送当前分支到 GitHub

---

## 九、检查清单

- [ ] Dockerfile 中 Update.log 路径正确
- [ ] Docker 镜像构建成功（amd64 + arm64）
- [ ] 镜像已推送到 Docker Hub / GHCR
- [ ] README 部署教程与当前部署方式一致
- [ ] 一键脚本 URL 指向正确 GitHub 仓库
- [ ] 本地部署与微信扫码说明已补充
- [ ] Update.log 已更新且 README 有引用
- [ ] 部署脚本已在根目录主仓推送
- [ ] 代码已增量推送到 GitHub

---

*最后更新：2026-03-03*
