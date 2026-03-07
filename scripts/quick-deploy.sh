#!/bin/bash

# =====================================================
# QQ 农场智能助手 v4.5.0 - 全架构一键部署脚本
# 自动适配 x86_64 / ARM64，部署完整栈：
#   App + MySQL 8.0 + Redis 7 + ipad860（微信协议）
# =====================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

REPO_BASE="https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main"
DEPLOY_DIR="${DEPLOY_DIR:-${PWD}/qq-farm}"

echo ""
echo "=========================================="
echo "  🌾 QQ 农场智能助手 v4.5.0"
echo "  全架构一键部署（App+MySQL+Redis+微信扫码）"
echo "=========================================="
echo ""

# --------------------------------------------------
# 1. Docker 安装检测
# --------------------------------------------------
print_info "检查 Docker 安装..."
if ! command -v docker &>/dev/null; then
    print_warning "Docker 未安装，正在自动安装..."
    if command -v curl &>/dev/null; then
        curl -fsSL https://get.docker.com | sh
    elif command -v wget &>/dev/null; then
        wget -qO- https://get.docker.com | sh
    else
        print_error "未找到 curl 或 wget，请先安装其中之一"
        exit 1
    fi
    sudo systemctl enable docker 2>/dev/null || true
    sudo systemctl start docker 2>/dev/null || true
    print_success "Docker 安装完成"
fi
print_success "Docker: $(docker --version)"

# --------------------------------------------------
# 2. Docker Compose V2 检测
# --------------------------------------------------
if ! docker compose version &>/dev/null 2>&1; then
    print_error "Docker Compose V2 未安装。请升级 Docker 或手动安装 compose 插件"
    echo "  参考: https://docs.docker.com/compose/install/"
    exit 1
fi
print_success "Docker Compose: $(docker compose version --short)"

# --------------------------------------------------
# 3. 架构检测
# --------------------------------------------------
ARCH=$(uname -m)
print_info "服务器架构: ${ARCH}"

if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    print_warning "ARM64 架构，启用 Redis 内存超分配优化..."
    sudo sysctl -w vm.overcommit_memory=1 2>/dev/null || true
    if ! grep -q "vm.overcommit_memory" /etc/sysctl.conf 2>/dev/null; then
        echo "vm.overcommit_memory=1" | sudo tee -a /etc/sysctl.conf >/dev/null 2>/dev/null || true
    fi
fi

# --------------------------------------------------
# 4. 检测已有容器（MySQL / Redis / ipad860）
# --------------------------------------------------
print_info "检测已有 Docker 服务..."

check_container() {
    local name=$1
    if docker ps -a --format '{{.Names}}' | grep -qi "$name"; then
        print_success "检测到已有 ${name} 容器"
        return 0
    fi
    return 1
}

EXISTING_MYSQL=false
EXISTING_REDIS=false
EXISTING_IPAD=false
check_container "mysql"  && EXISTING_MYSQL=true
check_container "redis"  && EXISTING_REDIS=true
check_container "ipad"   && EXISTING_IPAD=true

# --------------------------------------------------
# 5. 端口冲突检测
# --------------------------------------------------
WEB_PORT=${WEB_PORT:-3080}
MYSQL_PORT=${MYSQL_PORT:-3306}
REDIS_PORT=${REDIS_PORT:-6379}

if ss -tlnp 2>/dev/null | grep -q ":${WEB_PORT} " || \
   lsof -i ":${WEB_PORT}" &>/dev/null 2>&1; then
    print_warning "Web 端口 ${WEB_PORT} 已被占用"
    read -rp "  请输入新端口号（直接回车使用 $((WEB_PORT+1))）: " NEW_PORT
    WEB_PORT=${NEW_PORT:-$((WEB_PORT+1))}
fi
print_success "Web 端口: ${WEB_PORT}"

# --------------------------------------------------
# 6. 管理员密码
# --------------------------------------------------
echo ""
read -rp "设置管理员密码（直接回车使用默认 qq007qq008）: " ADMIN_PWD
ADMIN_PWD=${ADMIN_PWD:-qq007qq008}

# --------------------------------------------------
# 7. 创建部署目录
# --------------------------------------------------
print_info "创建部署目录: ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}/init-db"
cd "${DEPLOY_DIR}"

# --------------------------------------------------
# 8. 下载部署文件
# --------------------------------------------------
print_info "从 GitHub 下载部署文件..."

download_file() {
    local url=$1
    local dest=$2
    if command -v curl &>/dev/null; then
        curl -fsSL "$url" -o "$dest"
    else
        wget -qO "$dest" "$url"
    fi
}

download_file "${REPO_BASE}/deploy/docker-compose.yml" "docker-compose.yml"
download_file "${REPO_BASE}/deploy/.env.example"       ".env"
download_file "${REPO_BASE}/deploy/init-db/01-init.sql" "init-db/01-init.sql"

print_success "部署文件下载完成"

# --------------------------------------------------
# 9. 配置环境变量
# --------------------------------------------------
print_info "写入环境配置..."

update_env() {
    local key=$1
    local val=$2
    if grep -q "^${key}=" .env 2>/dev/null; then
        if [ "$(uname)" = "Darwin" ]; then
            sed -i '' "s|^${key}=.*|${key}=${val}|" .env
        else
            sed -i "s|^${key}=.*|${key}=${val}|" .env
        fi
    else
        echo "${key}=${val}" >> .env
    fi
}

update_env "WEB_PORT"       "$WEB_PORT"
update_env "ADMIN_PASSWORD" "$ADMIN_PWD"
update_env "MYSQL_PORT"     "$MYSQL_PORT"
update_env "REDIS_PORT"     "$REDIS_PORT"

print_success "环境变量已配置"

# --------------------------------------------------
# 10. 拉取镜像并启动
# --------------------------------------------------
echo ""
print_info "拉取 Docker 镜像（首次约需 3~5 分钟）..."
docker compose pull

print_info "启动全部服务..."
docker compose up -d

# --------------------------------------------------
# 11. 等待健康检查
# --------------------------------------------------
print_info "等待服务就绪..."
MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    HEALTHY=$(docker compose ps --format json 2>/dev/null | \
              python3 -c "import sys,json;lines=sys.stdin.read().strip().split('\n');print(sum(1 for l in lines if json.loads(l).get('Health','')=='healthy' or json.loads(l).get('State','')=='running'))" 2>/dev/null || echo "0")
    TOTAL=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$HEALTHY" -ge "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
        break
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo -ne "  已等待 ${ELAPSED}s / ${MAX_WAIT}s ...\r"
done
echo ""

# --------------------------------------------------
# 12. 最终状态
# --------------------------------------------------
echo ""
docker compose ps
echo ""

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo "=========================================="
print_success "🎉 部署完成！"
echo "=========================================="
echo ""
echo "  📌 访问地址:  http://${SERVER_IP}:${WEB_PORT}"
echo "  🔑 管理密码:  ${ADMIN_PWD}"
echo ""
echo "  💡 常用命令（在 ${DEPLOY_DIR} 目录下执行）:"
echo "    查看日志:   docker compose logs -f"
echo "    停止服务:   docker compose down"
echo "    重启服务:   docker compose restart"
echo "    更新版本:   docker compose pull && docker compose up -d"
echo ""
echo "  ⚠️  重要提示："
echo "    - 修改密码:  编辑 .env 中的 ADMIN_PASSWORD，然后 docker compose restart"
echo "    - 数据备份:  docker compose down && tar czf backup-\$(date +%Y%m%d).tar.gz ."
echo "    - 查看日志:  docker compose logs -f --tail 100 app"
echo ""
