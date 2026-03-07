#!/bin/bash

# QQ 农场助手 - x86 服务器一键部署脚本
# 适用于 Intel、AMD 等 x86_64 架构服务器

set -e

VERSION="latest"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-qq007qq008}"
PORT="${PORT:-3080}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "========================================"
echo "  QQ 农场助手 - x86 服务器一键部署"
echo "  版本：${VERSION}"
echo "  架构：x86_64 (AMD64)"
echo "========================================"
echo ""

# 1. 检查 Docker
print_info "检查 Docker 安装..."
if ! command -v docker &> /dev/null; then
    print_error "Docker 未安装，请先安装 Docker"
    echo ""
    echo "安装命令 (Ubuntu/Debian):"
    echo "  curl -fsSL https://get.docker.com | sh"
    echo ""
    exit 1
fi
print_success "Docker 已安装：$(docker --version)"

# 2. 检查架构
print_info "检查服务器架构..."
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    print_error "当前架构为 $ARCH，此脚本仅适用于 x86_64 架构"
    print_info "如果是 ARM64 架构，请使用 deploy-arm.sh 脚本"
    exit 1
fi
print_success "服务器架构：$ARCH (x86_64)"

# 3. 停止旧容器
print_info "停止旧容器（如果存在）..."
docker stop qq-farm-bot-ui 2>/dev/null || true
docker rm qq-farm-bot-ui 2>/dev/null || true
print_success "旧容器已清理"

# 4. 拉取最新镜像
print_info "拉取最新镜像..."
docker pull smdk000/qq-farm-bot-ui:latest
print_success "镜像拉取完成"

# 5. 创建数据目录
print_info "创建数据目录..."
mkdir -p ./data ./logs ./backup
print_success "数据目录已创建"

# 6. 启动容器
print_info "启动容器..."
docker run -d \
  --name qq-farm-bot-ui \
  --restart unless-stopped \
  -p ${PORT}:3000 \
  -v ./data:/app/core/data \
  -v ./logs:/app/logs \
  -v ./backup:/app/core/backup \
  -e ADMIN_PASSWORD=${ADMIN_PASSWORD} \
  -e TZ=Asia/Shanghai \
  -e LOG_LEVEL=info \
  smdk000/qq-farm-bot-ui:latest
print_success "容器已启动"

# 7. 等待启动
print_info "等待服务启动..."
sleep 5

# 8. 检查状态
if docker ps | grep -q qq-farm-bot-ui; then
    echo ""
    echo "========================================"
    print_success "部署成功！"
    echo "========================================"
    echo ""
    echo "📊 访问地址：http://localhost:${PORT}"
    echo "🔑 管理密码：${ADMIN_PASSWORD}"
    echo ""
    echo "💡 常用命令:"
    echo "  查看日志：docker logs -f qq-farm-bot-ui"
    echo "  停止服务：docker stop qq-farm-bot-ui"
    echo "  重启服务：docker restart qq-farm-bot-ui"
    echo "  查看状态：docker ps"
    echo ""
    echo "📝 数据目录:"
    echo "  数据库：./data/farm-bot.db"
    echo "  日志：  ./logs/"
    echo "  备份：  ./backup/"
    echo ""
    echo "⚠️  重要提醒:"
    echo "  - 不要删除 ./data 目录，否则数据将丢失"
    echo "  - 定期备份数据：tar -czf backup.tar.gz ./data"
    echo "  - 升级前先备份数据"
    echo ""
else
    echo ""
    print_error "部署失败，请查看日志"
    docker logs qq-farm-bot-ui
    exit 1
fi
