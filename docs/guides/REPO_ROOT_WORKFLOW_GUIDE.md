# 根目录主仓工作流说明

日期：2026-03-07

## 1. 现状

- `github-sync` 工作流已退役，不再作为公开仓库的主工作目录。
- 当前直接以项目根目录作为 Git 主仓进行开发、提交、推送。
- 旧 `github-sync` 仅保留在本地归档：`archive/retired-repos/github-sync-main-20260307/`

## 2. 当前源码推送流程

```bash
# 1. 在根目录完成修改
git status

# 2. 检查敏感信息
bash scripts/github/check-sensitive-info.sh .

# 3. 提交并推送当前分支
git add -A
git commit -m "chore: your change"
git push origin <branch>

# 4. 通过 PR 或合并进入 main
```

## 3. Docker 与发布

- 多架构镜像构建脚本：`scripts/docker/docker-build-multiarch.sh`
- ARM / x86 一键部署脚本：`scripts/deploy/deploy-arm.sh`、`scripts/deploy/deploy-x86.sh`
- 宿主机数据挂载：`./data:/app/core/data`
- 宿主机日志挂载：`./logs:/app/logs`

## 4. 数据与日志口径

- 源码逻辑默认数据路径仍兼容 `core/data/`
- 当前整理后的本地工作区将实际数据入口统一在根目录 `data/`
- 日志统一使用根目录 `logs/`
- AI 服务日志、守护进程 PID、开发更新日志均以 `logs/` 为准

## 5. 历史事项

- 如历史文档仍出现 `github-sync`、`/app/core/logs`、旧 `core/data` 说明，应优先以本文件为准。
