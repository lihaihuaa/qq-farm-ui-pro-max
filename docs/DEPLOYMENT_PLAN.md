# QQ 农场助手 - 部署执行计划

> 基于 [DEPLOYMENT_SOP.md](./DEPLOYMENT_SOP.md) 整理的可执行步骤清单
>
> 注：`github-sync` 自 2026-03-07 起已退役，当前以根目录主仓与 `docs/guides/REPO_ROOT_WORKFLOW_GUIDE.md` 为准。

**当前版本**：v4.0.0  
**执行日期**：2026-03-03

---

## 阶段一：代码与配置修正

### 1.1 修正 Dockerfile 中 Update.log 路径

**文件**：`core/Dockerfile` 第 21 行

**修改**：
```dockerfile
# 原
COPY Update.log ./Update.log

# 改
COPY logs/development/Update.log ./Update.log
```

### 1.2 更新 Update.log（如需要）

- 确认 `logs/development/Update.log` 已包含最新 v4.0.0 变更
- 如有新增部署相关说明，可追加一条记录

---

## 阶段二：Docker 镜像构建与推送

### 2.1 执行构建脚本

```bash
cd /Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本
./scripts/docker/docker-build-multiarch.sh v4.0.0
```

**说明**：
- 选择推送目标（Docker Hub / GHCR / 两者）
- 构建 `linux/amd64` 和 `linux/arm64`
- 镜像：`smdk000/qq-farm-bot-ui:latest`、`smdk000/qq-farm-bot-ui:v4.0.0`

---

## 阶段三：部署脚本与 README 更新

### 3.1 统一部署脚本

- 确认 `scripts/deploy/deploy-arm.sh`、`deploy-x86.sh` 存在且可用
- 确认脚本内镜像拉取地址：`smdk000/qq-farm-bot-ui:latest`
- 确认 GitHub 仓库 URL 与 README 一致

### 3.2 更新 README 部署教程

**需包含**：

1. **单独部署**：Docker Compose 完整栈
   - 使用 `docker-compose.prod.yml`
   - 包含 qq-farm-bot-ui、ipad860、Redis
   - 端口映射：3080 → 3000

2. **一键部署**：ARM / x86 脚本
   ```bash
   # ARM
   curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-arm.sh
   chmod +x deploy-arm.sh && ./deploy-arm.sh

   # x86
   curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-x86.sh
   chmod +x deploy-x86.sh && ./deploy-x86.sh
   ```

3. **本地部署**：开发环境
   - `./dev.sh` 一键启动
   - 微信扫码登录说明：Ipad860 服务配置、扫码流程

4. **更新日志**：引用 `logs/development/Update.log`  
   - 可增加「更新日志」章节，说明最新版本变更

### 3.3 根目录主仓推送准备

```bash
bash scripts/github/check-sensitive-info.sh .
```

---

## 阶段四：Git 主仓推送

### 4.1 增量提交

```bash
git add -A
git status
git commit -m "chore: v4.0.0 部署脚本与文档更新"
git push origin <branch>
```

---

## 阶段五：检查清单

- [ ] Dockerfile 中 Update.log 路径已修正
- [ ] Docker 镜像构建成功（amd64 + arm64）
- [ ] 镜像已推送到 Docker Hub / GHCR
- [ ] README 部署教程已更新
- [ ] 一键脚本 URL 正确
- [ ] 本地部署与微信扫码说明已补充
- [ ] Update.log 引用已添加
- [ ] 部署脚本已在根目录主仓推送
- [ ] 代码已推送到 GitHub

---

## 附录：关键路径

| 项目 | 路径 |
|------|------|
| 工作目录 | `/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本` |
| Dockerfile | `core/Dockerfile` |
| Update.log | `logs/development/Update.log` |
| 生产 Compose | `docker/docker-compose.prod.yml` |
| 构建脚本 | `scripts/docker/docker-build-multiarch.sh` |
| 部署脚本 | `scripts/deploy/deploy-arm.sh`、`deploy-x86.sh` |
| 开发启动 | `dev.sh` |
| 部署 SOP | `docs/DEPLOYMENT_SOP.md` |

---

*最后更新：2026-03-03*
