# QQ 农场智能助手 - 开发发布部署 SOP

> 本文档为 AI 编辑器与人工维护的标准操作流程，涵盖打包、推送、GitHub 同步、Docker 构建、发布与服务器部署全流程。

---

## 一、AI 编辑器使用说明

- **SOP 路径**：`docs/maintenance/SOP_DEVELOPMENT_RELEASE_DEPLOY.md`
- **Cursor 规则**：可将本 SOP 或关键片段加入 `.cursor/rules` 或 `AGENTS.md`，便于 AI 按流程执行
- **执行顺序**：按「十、完整发布检查清单」顺序执行，每步完成后检查输出再继续

---

## 二、项目关键信息速查

| 项目 | 值 |
|------|-----|
| 项目名 | QQ 农场智能助手 (qq-farm-bot-ui) |
| 当前版本 | 见 `core/package.json` 的 `version` 字段 |
| GitHub 仓库 | `smdk000/qq-farm-ui-pro-max` |
| Docker 镜像 | `smdk000/qq-farm-bot-ui` |
| 技术栈 | Node.js 20+、pnpm workspace、Vue 3、Vite 7、TypeScript |

---

## 三、开发维护准则

### 3.1 版本号规范

- 遵循语义化版本 `MAJOR.MINOR.PATCH`
- 修改版本号：编辑 `core/package.json` 的 `version` 字段
- 发布前必须与 `CHANGELOG.DEVELOPMENT.md` 中的版本一致

### 3.2 更新日志规范

- 文件路径：`CHANGELOG.DEVELOPMENT.md`
- 格式示例：

```markdown
### vX.Y.Z - 标题 (YYYY-MM-DD)
#### 分类（如：功能 / 修复 / 优化）
- ✅ 变更描述
```

### 3.3 敏感信息

- 禁止提交：`.env`、`data/*.json`、`data/*.db`、`logs/`
- 使用 `.env.example` 作为配置模板

---

## 四、本地打包流程

### 4.1 前置检查

```bash
# 1. 确认在项目根目录
cd /path/to/qq-farm-bot-ui-main_副本

# 2. 安装依赖
pnpm install --frozen-lockfile

# 3. 运行测试（如有）
pnpm test
```

### 4.2 构建前端

```bash
pnpm build:web
```

### 4.3 打包二进制（含前端）

```bash
pnpm package:release
```

输出路径：`core/dist/`

| 平台 | 文件名 |
|------|--------|
| Windows x64 | `qq-farm-bot-win-x64.exe` |
| Linux x64 | `qq-farm-bot-linux-x64` |
| macOS Intel | `qq-farm-bot-macos-x64` |
| macOS Apple Silicon | `qq-farm-bot-macos-arm64` |

### 4.4 仅打包指定平台

```bash
pnpm package:win    # Windows
pnpm package:linux  # Linux
pnpm package:mac    # macOS (Intel + ARM)
```

---

## 五、Git 提交与远程推送

### 5.1 提交前检查

```bash
pnpm lint:web
git status
```

### 5.2 提交与推送

```bash
# 1. 暂存变更
git add .

# 2. 提交（建议使用 conventional commits）
git commit -m "feat: 功能描述"   # 或 fix:, chore:, docs: 等

# 3. 推送到远程
git push origin main
```

### 5.3 打标签发布

```bash
# 1. 确认版本号与 CHANGELOG 一致
VERSION="v3.9.6"  # 替换为实际版本

# 2. 创建并推送标签
git tag -a $VERSION -m "Release $VERSION"
git push origin $VERSION
```

---

## 六、源码推送（根目录主仓）

> `github-sync` 工作流已于 2026-03-07 退役。当前直接在根目录主仓提交、推送和发版；旧同步仓仅保留在本地归档。

### 6.1 敏感信息检查

```bash
# 在项目根目录执行
bash scripts/github/check-sensitive-info.sh .
```

### 6.2 提交并推送当前分支

```bash
git add -A
git status
git commit -m "chore: release vX.Y.Z"
git push origin <branch>
```

### 6.3 合并到主分支

- 通过 PR 或人工合并进入 `main`
- 需要发版时，再在 `main` 上创建 tag 并推送
- 参考：`docs/guides/REPO_ROOT_WORKFLOW_GUIDE.md`

---

## 七、更新记录（CHANGELOG）追加

### 7.1 编辑文件

- 路径：`CHANGELOG.DEVELOPMENT.md`
- 在文件顶部追加新版本块

### 7.2 模板

```markdown
### vX.Y.Z - 简短标题 (YYYY-MM-DD)
#### 功能
- ✅ 新增 xxx
#### 修复
- ✅ 修复 xxx
#### 优化
- ✅ 优化 xxx
```

### 7.3 推送说明

- `CHANGELOG.DEVELOPMENT.md` 现在直接随根目录主仓提交
- 不再维护独立的 `github-sync/SYNC_README.md`

---

## 八、Docker 构建与发布

### 8.1 CI 自动构建（推荐）

- 触发条件：push 到 `main` 或创建 `v*` 标签
- 工作流：`.github/workflows/docker-build-push.yml`
- 构建架构：`linux/amd64`、`linux/arm64`
- 推送目标：Docker Hub、GitHub Container Registry (GHCR)

### 8.2 本地构建 ARM Docker

```bash
# 在项目根目录
docker buildx build --platform linux/arm64 -t smdk000/qq-farm-bot-ui:latest-arm64 -f core/Dockerfile .
```

### 8.3 本地构建 x86 Docker

```bash
docker buildx build --platform linux/amd64 -t smdk000/qq-farm-bot-ui:latest-amd64 -f core/Dockerfile .
```

### 8.4 本地构建多架构并推送

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t smdk000/qq-farm-bot-ui:latest \
  -f core/Dockerfile . --push
```

### 8.5 本地快速启动（开发/测试）

```bash
./docker/start.sh
```

---

## 九、二进制发布（GitHub Releases）

### 9.1 通过 GitHub Actions 发布

1. 打开仓库 → **Actions** → **release**
2. 点击 **Run workflow**
3. 填写输入：
   - `version`：如 `v3.9.6`
   - `latest`：`true`（设为最新发布）
   - `prerelease`：`false`

### 9.2 工作流说明

- 工作流：`.github/workflows/release.yml`
- 构建产物：Win / Linux / Mac x64 / Mac arm64
- 上传到 GitHub Releases 对应标签

---

## 十、服务器一键部署命令

### 10.1 x86 服务器

```bash
curl -O https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy-x86.sh && chmod +x deploy-x86.sh && ./deploy-x86.sh
```

### 10.2 ARM 服务器（如树莓派、Oracle ARM）

```bash
curl -O https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy-arm.sh && chmod +x deploy-arm.sh && ./deploy-arm.sh
```

### 10.3 Docker 方式部署

```bash
# 拉取并运行
docker pull smdk000/qq-farm-bot-ui:latest
docker run -d --name qq-farm-bot -p 3000:3000 smdk000/qq-farm-bot-ui:latest
```

---

## 十一、完整发布检查清单（AI 可执行）

| 步骤 | 命令/操作 | 检查点 |
|------|-----------|--------|
| 1 | 编辑 `core/package.json` 的 `version` | 版本号已更新 |
| 2 | 编辑 `CHANGELOG.DEVELOPMENT.md` 追加更新 | 更新记录已写入 |
| 3 | `pnpm install --frozen-lockfile` | 依赖安装成功 |
| 4 | `pnpm build:web` | 前端构建成功 |
| 5 | `pnpm package:release` | 二进制打包成功 |
| 6 | `git add . && git status` | 变更已暂存 |
| 7 | `git commit -m "chore: release vX.Y.Z"` | 提交成功 |
| 8 | `git tag -a vX.Y.Z -m "Release vX.Y.Z"` | 标签已创建 |
| 9 | `git push origin main && git push origin vX.Y.Z` | 推送成功 |
| 10 | `bash scripts/github/check-sensitive-info.sh .` | 敏感信息检查通过 |
| 11 | `git push origin <branch>` | 分支已推送 |
| 12 | 可选：Actions → release → Run workflow | 二进制已发布 |
| 13 | 可选：Docker 由 tag 推送自动触发 | 镜像已构建并推送 |

---

## 十二、常见问题与故障排除

### 12.1 构建失败

- 检查 Node 版本：`node -v`（需 20+）
- 检查 pnpm：`pnpm -v`（需 10+）
- 清理后重试：`rm -rf node_modules core/node_modules web/node_modules && pnpm install`

### 12.2 Docker 构建失败

- 确认 Dockerfile 路径：`core/Dockerfile`
- 确认构建上下文包含 `web/dist`（需先执行 `pnpm build:web`）

### 12.3 部署脚本 404

- 确认仓库名与分支：`smdk000/qq-farm-ui-pro-max`、`main`
- 确认 `scripts/deploy/` 下存在 `deploy-x86.sh`、`deploy-arm.sh`

---

## 十三、文件路径速查

| 用途 | 路径 |
|------|------|
| 根 package.json | `/package.json` |
| 核心版本号 | `/core/package.json` |
| Dockerfile | `/core/Dockerfile` |
| 开发更新日志 | `/CHANGELOG.DEVELOPMENT.md` |
| Docker 工作流 | `/.github/workflows/docker-build-push.yml` |
| 二进制发布工作流 | `/.github/workflows/release.yml` |
| 敏感信息检查脚本 | `/scripts/github/check-sensitive-info.sh` |
| x86 部署脚本 | `/scripts/deploy/deploy-x86.sh` |
| ARM 部署脚本 | `/scripts/deploy/deploy-arm.sh` |

---

*文档版本：v1.0 | 最后更新：2025-03-03*
