# Docker 镜像自动更新指南

> **版本：** v3.3.3  
> **作者：** smdk000  
> **更新时间：** 2026-03-01

---

## 📋 目录

1. [概述](#概述)
2. [手动更新流程](#手动更新流程)
3. [自动更新配置](#自动更新配置)
4. [GitHub Actions 配置](#github-actions 配置)
5. [常见问题](#常见问题)

---

## 🎯 概述

本指南介绍如何在代码更新后，自动构建和推送 Docker 镜像到 Docker Hub。

### 支持的平台

- ✅ **AMD64/x86_64** - Intel/AMD 处理器
- ✅ **ARM64** - ARM 处理器（树莓派、Apple Silicon 等）

### Docker Hub 仓库

- **仓库地址：** https://hub.docker.com/r/smdk000/qq-farm-bot-ui
- **镜像名称：** `smdk000/qq-farm-bot-ui`
- **支持标签：** `latest`, `3.3.3`, `3.3.3-amd64`, `3.3.3-arm64`

---

## 🚀 手动更新流程

### 方法一：使用自动更新脚本（推荐）

```bash
# 1. 更新代码版本（如果需要）
# 修改相关文件和版本号

# 2. 执行自动更新脚本
./scripts/auto-update-docker.sh 3.3.3

# 脚本会自动完成：
# - 检查当前根目录主仓状态
# - 提交并推送到 GitHub
# - 构建多平台 Docker 镜像
# - 推送到 Docker Hub
```

### 方法二：分步执行

#### 步骤 1：检查当前工作区

```bash
bash scripts/github/check-sensitive-info.sh .
git status
```

#### 步骤 2：提交到 GitHub

```bash
# 添加并提交
git add -A
git commit -m "Update to v3.3.3"

# 推送
git push origin <branch>
```

#### 步骤 3：构建 Docker 镜像

```bash
# 执行多平台构建
./scripts/docker/docker-build-multiarch.sh 3.3.3
```

#### 步骤 4：验证推送

访问 Docker Hub 查看镜像：
https://hub.docker.com/r/smdk000/qq-farm-bot-ui

---

## ⚙️ 自动更新配置

### 使用 GitHub Actions 自动构建

#### 1. 配置 Docker Hub Token

在 GitHub 仓库设置中添加 Secret：

1. 访问 https://github.com/smdk000/qq-farm-ui-pro-max/settings/secrets/actions
2. 点击 **New repository secret**
3. 添加以下 Secret：

| Name | Value |
|------|-------|
| `DOCKERHUB_TOKEN` | 你的 Docker Hub Access Token |

#### 2. 创建 Git Tag

```bash
# 创建新版本标签
git tag v3.3.3

# 推送标签
git push origin v3.3.3
```

#### 3. 自动触发构建

推送 Tag 后，GitHub Actions 会自动：
1. 检出代码
2. 设置 Docker Buildx
3. 登录 Docker Hub
4. 构建多平台镜像
5. 推送到 Docker Hub

#### 4. 查看构建进度

访问 GitHub Actions 页面查看构建状态：
https://github.com/smdk000/qq-farm-ui-pro-max/actions

---

## 📝 GitHub Actions 配置说明

### Workflow 文件

`.github/workflows/docker-build.yml`

```yaml
name: Build and Push Docker Image

on:
  push:
    tags:
      - 'v*'    # 推送 v 开头的标签时触发
    branches:
      - main    # 推送到 main 分支时也触发

env:
  DOCKERHUB_USERNAME: smdk000
  IMAGE_NAME: qq-farm-bot-ui

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Login to Docker Hub
      uses: docker/login-action@v3
      with:
        username: ${{ env.DOCKERHUB_USERNAME }}
        password: ${{ secrets.DOCKERHUB_TOKEN }}
    
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=semver,pattern={{version}}
          type=semver,pattern={{major}}.{{minor}}
          type=semver,pattern={{major}}
          type=sha
    
    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        file: ./core/Dockerfile
        platforms: linux/amd64,linux/arm64
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### 自动生成的标签

根据配置，以下标签会自动生成：

| Git 事件 | 生成的标签 | 示例 |
|---------|----------|------|
| Push to main | `main` | `smdk000/qq-farm-bot-ui:main` |
| Tag v3.3.3 | `3.3.3` | `smdk000/qq-farm-bot-ui:3.3.3` |
| Tag v3.3.3 | `3.3` | `smdk000/qq-farm-bot-ui:3.3` |
| Tag v3.3.3 | `3` | `smdk000/qq-farm-bot-ui:3` |
| Any commit | `sha-{short}` | `smdk000/qq-farm-bot-ui:sha-abc123` |

---

## 🔄 下次代码更新时的完整流程

### 场景一：小更新（使用 GitHub Actions）

```bash
# 1. 修改代码
# 编辑相关文件

# 2. 提交当前分支
git add -A
git commit -m "Fix: 修复某个问题"
git push origin <branch>

# 3. GitHub Actions 自动构建
# 访问 https://github.com/smdk000/qq-farm-ui-pro-max/actions 查看进度
```

### 场景二：大版本更新（手动构建）

```bash
# 1. 修改代码并更新版本号
NEW_VERSION="3.4.0"

# 2. 提交到 GitHub
git add -A
git commit -m "Release v${NEW_VERSION}"
git push origin <branch>

# 3. 创建 Git Tag
git tag v${NEW_VERSION}
git push origin v${NEW_VERSION}

# 4. 手动构建（可选，如果 GitHub Actions 未触发）
./scripts/docker/docker-build-multiarch.sh ${NEW_VERSION}
```

> `github-sync` 自 2026-03-07 起已退役，当前流程以根目录主仓为准。详见 `docs/guides/REPO_ROOT_WORKFLOW_GUIDE.md`。

---

## ❓ 常见问题

### Q1: Docker Hub Token 在哪里获取？

**A:** 访问 https://hub.docker.com/settings/security 创建 Access Token

### Q2: 如何验证 Docker 镜像是否推送成功？

**A:** 
```bash
# 查看 Docker Hub 上的镜像
docker pull smdk000/qq-farm-bot-ui:latest

# 查看镜像信息
docker images | grep qq-farm-bot-ui
```

### Q3: 如何只构建特定平台的镜像？

**A:**
```bash
# 只构建 AMD64
docker buildx build --platform linux/amd64 -t smdk000/qq-farm-bot-ui:amd64 --push .

# 只构建 ARM64
docker buildx build --platform linux/arm64 -t smdk000/qq-farm-bot-ui:arm64 --push .
```

### Q4: GitHub Actions 构建失败怎么办？

**A:** 
1. 检查 Docker Hub Token 是否正确
2. 查看 Actions 日志了解详细错误
3. 确认 Dockerfile 路径正确
4. 检查网络连接

### Q5: 如何更新 Docker Hub 上的镜像描述？

**A:** 
方法一：手动在 Docker Hub 网站编辑
方法二：使用 Docker Hub API
```bash
# 需要安装 jq
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"username":"smdk000","password":"YOUR_PASSWORD"}' \
  https://hub.docker.com/v2/users/login/ | jq -r .token)

curl -X PATCH -H "Authorization: JWT ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"full_description":"# 新的描述内容"}' \
  https://hub.docker.com/v2/repositories/smdk000/qq-farm-bot-ui/
```

---

## 📊 最佳实践

### 1. 版本管理

- 使用语义化版本号（SemVer）：`v3.3.3`
- 每次更新都创建 Git Tag
- 保持 `latest` 标签指向最新稳定版

### 2. 构建优化

- 使用 Docker Buildx 进行多平台构建
- 启用 GitHub Actions 缓存加速构建
- 定期清理旧的镜像和缓存

### 3. 安全建议

- 不在代码中硬编码密码
- 使用 GitHub Secrets 管理敏感信息
- 定期更新 Docker Hub Token

### 4. 监控与通知

- 配置 Docker Hub 的 webhook 通知
- 监控 GitHub Actions 构建状态
- 设置构建失败的通知机制

---

## 🔗 相关链接

- **GitHub 仓库:** https://github.com/smdk000/qq-farm-ui-pro-max
- **Docker Hub:** https://hub.docker.com/r/smdk000/qq-farm-bot-ui
- **GitHub Actions:** https://github.com/smdk000/qq-farm-ui-pro-max/actions
- **Docker Buildx:** https://github.com/docker/buildx
- **Docker Hub API:** https://docs.docker.com/docker-hub/api/

---

**文档创建时间：** 2026-03-01  
**维护者：** smdk000  
**QQ 群：** 227916149
