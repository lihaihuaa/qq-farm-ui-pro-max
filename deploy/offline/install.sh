#!/bin/bash

# =====================================================
# QQ 农场智能助手 - 离线安装脚本
# =====================================================
# 使用方法：chmod +x install.sh && ./install.sh
# =====================================================

set -e

echo "=========================================="
echo "  🌾 QQ 农场智能助手 - 离线安装"
echo "=========================================="
echo ""

# 检查 Docker
if ! command -v docker &>/dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker："
    echo "   curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# 加载镜像
echo "📦 加载 Docker 镜像（需要几分钟）..."
echo "   加载主应用 + 协议服务 + Redis..."
docker load < images-part1.tar.gz
echo ""
echo "   加载 MySQL..."
docker load < mysql-8.0.tar.gz
# MySQL 导出时标签是 mysql:8.0-export，需要重新打标签
docker tag mysql:8.0-export mysql:8.0 2>/dev/null || true
echo ""
echo "✅ 镜像加载完成"

# 启动服务
echo ""
echo "🚀 启动所有服务..."
docker compose up -d

# 等待启动
echo ""
echo "⏳ 等待服务启动（约 30 秒）..."
sleep 30

# 检查状态
echo ""
echo "📊 服务状态："
docker compose ps
echo ""

# 获取 IP
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
WEB_PORT=$(grep WEB_PORT .env 2>/dev/null | cut -d= -f2 || echo "3080")

echo "=========================================="
echo "  ✅ 安装完成！"
echo "=========================================="
echo ""
echo "  📌 访问地址: http://${SERVER_IP}:${WEB_PORT}"
echo "  📌 管理密码: 见 .env 文件中的 ADMIN_PASSWORD"
echo ""
echo "  常用命令："
echo "    查看日志:  docker compose logs -f"
echo "    停止服务:  docker compose down"
echo "    重启服务:  docker compose restart"
echo ""
