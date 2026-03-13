#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="QQ 农场智能助手"
DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
STACK_NAME="${STACK_NAME:-qq-farm}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
LEGACY_CURRENT_LINK=""
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
MYSQL_CONTAINER_NAME_INPUT="${MYSQL_CONTAINER_NAME:-}"
MYSQL_CONTAINER_NAME="${MYSQL_CONTAINER_NAME_INPUT:-${STACK_NAME}-mysql}"
APP_CONTAINER_NAME_INPUT="${APP_CONTAINER_NAME:-}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME_INPUT:-${STACK_NAME}-bot}"
APP_IMAGE_OVERRIDE="${APP_IMAGE_OVERRIDE:-}"
IMAGE_ARCHIVE_OVERRIDE="${IMAGE_ARCHIVE_OVERRIDE:-${IMAGE_ARCHIVE:-}}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"
SKIP_PREFLIGHT="${SKIP_PREFLIGHT:-0}"
BACKUP_DIR_OVERRIDE="${BACKUP_DIR:-}"
BACKUP_DIR=""
REPORT_FILE=""
LATEST_DB_BACKUP=""
PREFLIGHT_WARNING_COUNT=0
DOCKER=(docker)
SUDO=""
CURRENT_LINK_EXPLICIT=0
MYSQL_CONTAINER_NAME_EXPLICIT=0
APP_CONTAINER_NAME_EXPLICIT=0
STACK_DIR_NAME=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_LAYOUT_PATH="${SCRIPT_DIR}/stack-layout.sh"
if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
    BOOTSTRAP_DIR="${TMPDIR:-/tmp}/qq-farm-deploy-bootstrap/${REPO_SLUG//\//_}/${REPO_REF}"
    mkdir -p "${BOOTSTRAP_DIR}"
    STACK_LAYOUT_PATH="${BOOTSTRAP_DIR}/stack-layout.sh"
    if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
        command -v curl >/dev/null 2>&1 || {
            echo "[ERROR] 缺少 stack-layout.sh 且系统未安装 curl，无法继续执行。" >&2
            exit 1
        }
        curl -fsSL "${RAW_BASE_URL}/scripts/deploy/stack-layout.sh" -o "${STACK_LAYOUT_PATH}"
    fi
fi
# shellcheck source=stack-layout.sh
. "${STACK_LAYOUT_PATH}"

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi
if [ -n "${MYSQL_CONTAINER_NAME_INPUT}" ]; then
    MYSQL_CONTAINER_NAME_EXPLICIT=1
fi
if [ -n "${APP_CONTAINER_NAME_INPUT}" ]; then
    APP_CONTAINER_NAME_EXPLICIT=1
fi

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    STACK_DIR_NAME="$(stack_dir_name "${STACK_NAME}")"
    if [ "${MYSQL_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        MYSQL_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "mysql")"
    fi
    if [ "${APP_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        APP_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "bot")"
    fi
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    fi
    LEGACY_CURRENT_LINK="$(stack_legacy_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
}

handle_error() {
    local exit_code="$?"
    print_error "安全升级失败，请检查备份与巡检报告。"
    if [ -n "${BACKUP_DIR}" ]; then
        echo "部署目录备份: ${BACKUP_DIR}/deploy-dir"
    fi
    if [ -n "${REPORT_FILE}" ]; then
        echo "巡检报告: ${REPORT_FILE}"
    fi
    exit "${exit_code}"
}

trap handle_error ERR

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --deploy-dir)
                DEPLOY_DIR="${2:-}"
                shift 2
                ;;
            --stack-name)
                STACK_NAME="${2:-}"
                shift 2
                ;;
            --image)
                APP_IMAGE_OVERRIDE="${2:-}"
                shift 2
                ;;
            --image-archive)
                IMAGE_ARCHIVE_OVERRIDE="${2:-}"
                shift 2
                ;;
            --backup-dir)
                BACKUP_DIR_OVERRIDE="${2:-}"
                shift 2
                ;;
            --skip-verify)
                SKIP_VERIFY=1
                shift
                ;;
            --skip-preflight)
                SKIP_PREFLIGHT=1
                shift
                ;;
            *)
                print_error "未知参数: $1"
                exit 1
                ;;
        esac
    done

    refresh_stack_layout
}

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    SUDO="sudo"
fi

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_error "未检测到 Docker。"
        exit 1
    fi

    if docker info >/dev/null 2>&1; then
        DOCKER=(docker)
    elif [ -n "${SUDO}" ] && "${SUDO}" docker info >/dev/null 2>&1; then
        DOCKER=("${SUDO}" docker)
    else
        print_error "Docker daemon 不可访问。"
        exit 1
    fi

    "${DOCKER[@]}" compose version >/dev/null 2>&1 || {
        print_error "当前 Docker 缺少 compose v2，请升级 Docker。"
        exit 1
    }
}

canonicalize_dir() {
    local dir="$1"
    if [ -d "${dir}" ]; then
        (cd "${dir}" && pwd -P)
    fi
}

load_deploy_env() {
    local file="$1"
    if [ -f "${file}" ]; then
        set -a
        # shellcheck disable=SC1090
        . "${file}"
        set +a
        if [ -n "${MYSQL_CONTAINER_NAME:-}" ]; then
            MYSQL_CONTAINER_NAME_EXPLICIT=1
        fi
        if [ -n "${APP_CONTAINER_NAME:-}" ]; then
            APP_CONTAINER_NAME_EXPLICIT=1
        fi
        refresh_stack_layout
    fi
}

resolve_deploy_dir() {
    if [ -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${DEPLOY_DIR}")"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/docker-compose.yml" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${CURRENT_LINK}")"
            load_deploy_env "${DEPLOY_DIR}/.env"
            return 0
        fi
    fi

    if [ -n "${LEGACY_CURRENT_LINK}" ] && { [ -L "${LEGACY_CURRENT_LINK}" ] || [ -d "${LEGACY_CURRENT_LINK}" ]; }; then
        if [ -f "${LEGACY_CURRENT_LINK}/docker-compose.yml" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${LEGACY_CURRENT_LINK}")"
            load_deploy_env "${DEPLOY_DIR}/.env"
            return 0
        fi
    fi

    local latest=""
    latest="$(find "${DEPLOY_BASE_DIR}" -mindepth 2 -maxdepth 2 -type d -name "${STACK_DIR_NAME:-$(stack_dir_name "${STACK_NAME}")}" 2>/dev/null | sort | tail -n 1)"
    if [ -n "${latest}" ] && [ -f "${latest}/docker-compose.yml" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${latest}")"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    print_error "未找到可用部署目录。请通过 --deploy-dir 指定，或先执行 fresh-install.sh。"
    exit 1
}

compose_has_service() {
    local service_name="$1"
    if ! "${DOCKER[@]}" compose config --services >/tmp/qq-farm-compose-services.$$ 2>/dev/null; then
        return 1
    fi
    if grep -Fxq "${service_name}" /tmp/qq-farm-compose-services.$$; then
        rm -f /tmp/qq-farm-compose-services.$$
        return 0
    fi
    rm -f /tmp/qq-farm-compose-services.$$
    return 1
}

compose_service_has_container() {
    local service_name="$1"
    local container_id=""

    container_id="$("${DOCKER[@]}" compose ps -q "${service_name}" 2>/dev/null || true)"
    [ -n "${container_id}" ]
}

mysql_cli_exec() {
    local mode="$1"
    shift

    if [ "${mode}" = "compose" ]; then
        "${DOCKER[@]}" compose exec -T "${MYSQL_SERVICE}" "$@"
        return 0
    fi

    "${DOCKER[@]}" exec -i "${MYSQL_CONTAINER_NAME}" "$@"
}

detect_mysql_exec_mode() {
    if compose_has_service "${MYSQL_SERVICE}" && compose_service_has_container "${MYSQL_SERVICE}"; then
        echo "compose"
        return 0
    fi

    if "${DOCKER[@]}" container inspect "${MYSQL_CONTAINER_NAME}" >/dev/null 2>&1; then
        echo "container"
        return 0
    fi

    print_error "未找到可用的 MySQL 服务或容器：service=${MYSQL_SERVICE}, container=${MYSQL_CONTAINER_NAME}"
    exit 1
}

mysql_exec() {
    local sql="$1"
    local exec_mode
    exec_mode="$(detect_mysql_exec_mode)"
    mysql_cli_exec "${exec_mode}" \
        mysql --protocol=TCP -h 127.0.0.1 --default-character-set=utf8mb4 -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" -Nse "${sql}"
}

table_exists() {
    local table_name="$1"
    mysql_exec "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table_name}';"
}

append_report_line() {
    printf '%s\n' "$1" >> "${REPORT_FILE}"
}

query_value() {
    local sql="$1"
    mysql_exec "${sql}" 2>/dev/null | head -n 1 | tr '\n' ' ' | sed 's/[[:space:]]*$//'
}

report_metric() {
    local label="$1"
    local value="$2"
    append_report_line "${label}: ${value}"
}

report_warning() {
    PREFLIGHT_WARNING_COUNT=$((PREFLIGHT_WARNING_COUNT + 1))
    append_report_line "WARN: $1"
}

capture_preflight_report() {
    local app_status="missing"
    local app_health="none"

    REPORT_FILE="${BACKUP_DIR}/preflight-report.txt"
    : > "${REPORT_FILE}"

    app_status="$("${DOCKER[@]}" inspect -f '{{.State.Status}}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"
    app_health="$("${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${APP_CONTAINER_NAME}" 2>/dev/null || true)"

    append_report_line "QQ 农场安全升级巡检报告"
    append_report_line "生成时间: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    append_report_line "实例名称: ${STACK_NAME}"
    append_report_line "部署目录: ${DEPLOY_DIR}"
    append_report_line "应用容器: ${APP_CONTAINER_NAME}"
    append_report_line "应用状态: ${app_status:-missing} / ${app_health:-none}"
    append_report_line "MySQL 容器: ${MYSQL_CONTAINER_NAME}"
    append_report_line "MySQL 数据库: ${MYSQL_DATABASE}"
    append_report_line ""
    append_report_line "[概览]"
    report_metric "mysql_version" "$(query_value 'SELECT VERSION()')"

    if [ "$(table_exists "users")" = "1" ]; then
        report_metric "users_count" "$(query_value 'SELECT COUNT(*) FROM users')"
    else
        report_warning "缺少 users 表"
    fi

    if [ "$(table_exists "accounts")" = "1" ]; then
        report_metric "accounts_count" "$(query_value 'SELECT COUNT(*) FROM accounts')"
        report_metric "blank_account_owner_refs" "$(query_value "SELECT COUNT(*) FROM accounts WHERE username IS NOT NULL AND TRIM(username) = ''")"
        if [ "$(table_exists "users")" = "1" ]; then
            report_metric "orphan_account_owner_refs" "$(query_value "SELECT COUNT(*) FROM accounts WHERE username IS NOT NULL AND TRIM(username) <> '' AND username NOT IN (SELECT username FROM users)")"
        else
            report_warning "accounts 表存在，但缺少 users 表，无法核对账号归属外键风险"
        fi
    else
        report_warning "缺少 accounts 表"
    fi

    if [ "$(table_exists "account_configs")" = "1" ] && [ "$(table_exists "accounts")" = "1" ]; then
        report_metric "accounts_missing_configs" "$(query_value 'SELECT COUNT(*) FROM accounts a LEFT JOIN account_configs c ON c.account_id = a.id WHERE c.account_id IS NULL')"
    fi

    if [ "$(table_exists "refresh_tokens")" = "1" ] && [ "$(table_exists "users")" = "1" ]; then
        report_metric "orphan_refresh_tokens" "$(query_value 'SELECT COUNT(*) FROM refresh_tokens rt LEFT JOIN users u ON u.username = rt.username WHERE u.username IS NOT NULL AND rt.username IS NOT NULL AND u.username IS NULL')"
    fi

    if [ "$(table_exists "ui_settings")" = "1" ]; then
        report_metric "duplicate_ui_settings_users" "$(query_value 'SELECT COUNT(*) FROM (SELECT user_id FROM ui_settings GROUP BY user_id HAVING COUNT(*) > 1) dup')"
    fi

    if [ "$(table_exists "user_preferences")" = "1" ]; then
        report_metric "duplicate_user_preferences_users" "$(query_value 'SELECT COUNT(*) FROM (SELECT user_id FROM user_preferences GROUP BY user_id HAVING COUNT(*) > 1) dup')"
    fi

    append_report_line ""
    append_report_line "[说明]"
    append_report_line "- 本报告只做升级前只读巡检，不改库。"
    append_report_line "- 真正升级时会额外触发 repair-mysql.sh 的数据库备份。"

    if grep -Eq '(^blank_account_owner_refs: [1-9]|^orphan_account_owner_refs: [1-9]|^duplicate_ui_settings_users: [1-9]|^duplicate_user_preferences_users: [1-9]|^accounts_missing_configs: [1-9]|^orphan_refresh_tokens: [1-9])' "${REPORT_FILE}"; then
        report_warning "检测到历史遗留数据异常；本次会先备份，再交给升级/修复脚本处理。"
    fi
}

create_backup_bundle() {
    local timestamp
    timestamp="$(date +%Y%m%d_%H%M%S)"

    if [ -n "${BACKUP_DIR_OVERRIDE}" ]; then
        BACKUP_DIR="${BACKUP_DIR_OVERRIDE}"
    else
        BACKUP_DIR="${DEPLOY_BASE_DIR}/backups/${STACK_DIR_NAME}-safe-update-${timestamp}"
    fi

    mkdir -p "${BACKUP_DIR}"
    print_info "备份当前部署目录到 ${BACKUP_DIR}/deploy-dir"
    cp -a "${DEPLOY_DIR}" "${BACKUP_DIR}/deploy-dir"
}

run_safe_update() {
    local cmd=(bash "${DEPLOY_DIR}/update-app.sh" "--deploy-dir" "${DEPLOY_DIR}")

    if [ -n "${APP_IMAGE_OVERRIDE}" ]; then
        cmd+=("--image" "${APP_IMAGE_OVERRIDE}")
    fi
    if [ -n "${IMAGE_ARCHIVE_OVERRIDE}" ]; then
        cmd+=("--image-archive" "${IMAGE_ARCHIVE_OVERRIDE}")
    fi

    print_info "开始执行带数据库备份的安全升级..."
    BACKUP_BEFORE_REPAIR=1 STACK_NAME="${STACK_NAME}" CURRENT_LINK="${CURRENT_LINK}" "${cmd[@]}"
}

run_verify() {
    if [ "${SKIP_VERIFY}" = "1" ] || [ "${SKIP_VERIFY}" = "true" ]; then
        print_warning "已跳过升级后核验。"
        return 0
    fi

    print_info "执行升级后核验..."
    STACK_NAME="${STACK_NAME}" CURRENT_LINK="${CURRENT_LINK}" bash "${DEPLOY_DIR}/verify-stack.sh" --deploy-dir "${DEPLOY_DIR}"
}

find_latest_db_backup() {
    if [ ! -d "${DEPLOY_DIR}/backups" ]; then
        return 0
    fi
    find "${DEPLOY_DIR}/backups" -maxdepth 1 -type f -name 'mysql-repair-*.sql' 2>/dev/null | sort | tail -n 1
}

main() {
    parse_args "$@"

    echo ""
    echo "=========================================="
    echo "  ${APP_NAME} - 安全升级脚本"
    echo "=========================================="
    echo ""

    ensure_docker
    resolve_deploy_dir
    load_deploy_env "${DEPLOY_DIR}/.env"

    if [ -z "${MYSQL_ROOT_PASSWORD:-}" ] || [ -z "${MYSQL_DATABASE:-}" ]; then
        print_error "部署目录 .env 缺少 MYSQL_ROOT_PASSWORD 或 MYSQL_DATABASE。"
        exit 1
    fi

    if [ ! -x "${DEPLOY_DIR}/update-app.sh" ] && [ ! -f "${DEPLOY_DIR}/update-app.sh" ]; then
        print_error "部署目录缺少 update-app.sh。请先执行 repair-deploy.sh 修复部署包。"
        exit 1
    fi

    create_backup_bundle

    if [ "${SKIP_PREFLIGHT}" = "1" ] || [ "${SKIP_PREFLIGHT}" = "true" ]; then
        print_warning "已跳过升级前巡检。"
    else
        print_info "生成升级前巡检报告..."
        cd "${DEPLOY_DIR}"
        capture_preflight_report
        if [ "${PREFLIGHT_WARNING_COUNT}" -gt 0 ]; then
            print_warning "巡检发现 ${PREFLIGHT_WARNING_COUNT} 项风险提示，详见 ${REPORT_FILE}"
        else
            print_success "巡检通过，未发现明显历史结构风险。"
        fi
    fi

    run_safe_update
    run_verify

    LATEST_DB_BACKUP="$(find_latest_db_backup || true)"

    echo ""
    print_success "安全升级完成。"
    echo "部署目录: ${DEPLOY_DIR}"
    echo "部署目录备份: ${BACKUP_DIR}/deploy-dir"
    if [ -n "${REPORT_FILE}" ]; then
        echo "升级前巡检报告: ${REPORT_FILE}"
    fi
    if [ -n "${LATEST_DB_BACKUP}" ]; then
        echo "数据库备份: ${LATEST_DB_BACKUP}"
    fi
    echo "常规更新脚本: ${DEPLOY_DIR}/update-app.sh"
    echo "安全升级脚本: ${DEPLOY_DIR}/safe-update.sh"
    echo ""
}

main "$@"
