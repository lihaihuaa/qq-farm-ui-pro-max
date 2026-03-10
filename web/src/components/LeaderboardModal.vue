<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import api from '@/api'

import BaseButton from '@/components/ui/BaseButton.vue'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const leaderboardData = ref<any[]>([])
const loading = ref(false)
const sortBy = ref('level') // 默认按等级

const sortOptions = [
  { label: '按等级', value: 'level' },
  { label: '按金币', value: 'gold' },
  { label: '按点券', value: 'coupon' },
  { label: '按挂机时长', value: 'uptime' },
]

const sortHintMap: Record<string, string> = {
  level: '在线账号始终前置，其余账号按等级排序。',
  gold: '在线账号始终前置，其余账号按金币排序。',
  coupon: '在线账号始终前置，其余账号按点券排序。',
  uptime: '在线账号始终前置，其余账号按挂机时长排序。',
}

async function fetchLeaderboard() {
  loading.value = true
  try {
    const res = await api.get('/api/leaderboard', {
      params: {
        sort_by: sortBy.value,
        limit: 50,
      },
    })
    if (res.data.ok && res.data.data && Array.isArray(res.data.data.accounts)) {
      leaderboardData.value = res.data.data.accounts
    }
  }
  catch (error) {
    console.error('获取排行榜失败', error)
  }
  finally {
    loading.value = false
  }
}
watch(() => props.show, (newVal) => {
  if (newVal) {
    fetchLeaderboard()
  }
})

/** 根据平台和 uin 返回头像 URL，仅 QQ 有公开头像 API，微信返回 undefined 使用占位图 */
function formatAvatar(item?: { uin?: string | number, platform?: string }): string | undefined {
  if (!item?.uin)
    return undefined
  const platform = item.platform || 'qq'
  if (platform === 'qq') {
    return `https://q1.qlogo.cn/g?b=qq&nk=${item.uin}&s=100`
  }
  return undefined
}

/** 平台显示标签 */
function getPlatformLabel(platform?: string): string {
  const p = platform || 'qq'
  if (p === 'qq')
    return 'QQ'
  if (p === 'wx')
    return '微信'
  if (p === 'wx_ipad')
    return 'iPad微信'
  if (p === 'wx_car')
    return '车机微信'
  return 'QQ'
}

/** 根据平台显示 UIN 文案 */
function getUinLabel(item?: { uin?: string | number, platform?: string }): string {
  if (!item)
    return '未绑定'
  const uin = item.uin ? String(item.uin) : '未绑定'
  const platform = item.platform || 'qq'
  if (platform === 'qq')
    return `QQ: ${uin}`
  return `微信: ${uin}`
}

function getPlatformBadgeClass(platform?: string) {
  const normalized = String(platform || 'qq').trim().toLowerCase()
  if (normalized === 'qq')
    return 'leaderboard-platform-badge leaderboard-platform-badge-qq'
  return 'leaderboard-platform-badge leaderboard-platform-badge-wx'
}

function getLevelBadgeClass(level?: number) {
  return Number(level || 0) > 0
    ? 'leaderboard-level-badge leaderboard-level-badge-active'
    : 'leaderboard-level-badge leaderboard-level-badge-empty'
}

function handleClose() {
  emit('close')
}

// 排名样式计算
function getRankingClass(rank: number) {
  if (rank === 1)
    return 'ranking-gold leaderboard-ranking-medal shadow-lg' // 金
  if (rank === 2)
    return 'ranking-silver leaderboard-ranking-medal shadow-md' // 银
  if (rank === 3)
    return 'ranking-bronze leaderboard-ranking-medal shadow-md' // 铜
  return 'ranking-normal leaderboard-ranking-normal'
}

function formatNumber(num: number) {
  if (!num && num !== 0)
    return '0'
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}w`
  }
  return num ? num.toLocaleString() : '0'
}

function formatUptime(seconds: number) {
  if (!seconds)
    return '0m'
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours > 0)
    return `${hours}h ${mins}m`
  return `${mins}m`
}

function isAccountOnline(item: any) {
  return !!item?.connected
}

function hasSnapshot(item: any) {
  if (!item)
    return false
  if (Number(item.lastStatusAt || 0) > 0)
    return true
  return ['level', 'gold', 'exp', 'coupon', 'uptime'].some(key => Number(item[key] || 0) > 0)
}

function getLevelText(item: any) {
  const level = Number(item?.level || 0)
  return level > 0 ? `Lv.${level}` : 'Lv.--'
}

function formatMetricValue(value: number, item: any) {
  if (isAccountOnline(item) || hasSnapshot(item))
    return formatNumber(Number(value) || 0)
  return '-'
}

function formatUptimeValue(item: any) {
  if (isAccountOnline(item) || hasSnapshot(item))
    return formatUptime(Number(item?.uptime) || 0)
  return '-'
}

function getMetricTextClass(item: any, tone: 'warning' | 'default') {
  if (isAccountOnline(item))
    return tone === 'warning' ? 'leaderboard-metric-online-warning' : 'leaderboard-metric-online'
  if (hasSnapshot(item))
    return tone === 'warning' ? 'leaderboard-metric-snapshot-warning' : 'leaderboard-metric-snapshot'
  return 'leaderboard-metric-offline'
}

function getStatusText(item: any) {
  if (isAccountOnline(item))
    return '在线'
  if (hasSnapshot(item))
    return '离线快照'
  return '离线'
}

function getStatusClass(item: any) {
  if (isAccountOnline(item))
    return 'leaderboard-status leaderboard-status-online'
  if (hasSnapshot(item))
    return 'leaderboard-status leaderboard-status-snapshot'
  return 'leaderboard-status leaderboard-status-offline'
}

function getStatusDotClass(item: any) {
  if (isAccountOnline(item))
    return 'leaderboard-status-dot leaderboard-status-dot-online'
  if (hasSnapshot(item))
    return 'leaderboard-status-dot leaderboard-status-dot-snapshot'
  return 'leaderboard-status-dot leaderboard-status-dot-offline'
}

function formatSnapshotTime(timestamp: number) {
  if (!timestamp)
    return ''
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function getStatusTitle(item: any) {
  if (isAccountOnline(item))
    return '实时在线数据'
  const snapshotAt = Number(item?.lastStatusAt || 0)
  const lastOnlineAt = Number(item?.lastOnlineAt || 0)
  if (!snapshotAt)
    return '暂无可用快照'
  if (lastOnlineAt)
    return `最近同步：${formatSnapshotTime(snapshotAt)}，最近在线：${formatSnapshotTime(lastOnlineAt)}`
  return `最近同步：${formatSnapshotTime(snapshotAt)}`
}

onMounted(() => {
  if (props.show) {
    fetchLeaderboard()
  }
})
</script>

<template>
  <Transition name="modal">
    <div
      v-if="show"
      class="leaderboard-modal fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6"
    >
      <!-- 背景遮罩层 -->
      <div
        class="leaderboard-backdrop absolute inset-0 backdrop-blur-sm transition-opacity"
        @click="handleClose"
      />

      <!-- 主体内容 -->
      <div
        class="leaderboard-panel glass-panel relative max-h-full max-w-4xl w-full flex flex-col transform overflow-hidden rounded-2xl shadow-2xl transition-all"
        @click.stop
      >
        <!-- 头部 -->
        <div class="leaderboard-header flex items-center justify-between px-6 py-4 backdrop-blur-md">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 flex items-center justify-center rounded-xl bg-primary-500/10 text-xl text-primary-500 dark:bg-primary-500/20">
              <div class="i-carbon-trophy" />
            </div>
            <div>
              <h3 class="glass-text-main text-xl font-bold">
                平台排行榜
              </h3>
              <p class="glass-text-muted mt-0.5 text-[10px] tracking-tight">
                在线账号始终前置，离线账号展示最近一次快照
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="relative w-36">
              <select
                v-model="sortBy"
                class="leaderboard-select block w-full cursor-pointer appearance-none rounded-lg px-4 py-2 pr-8 text-sm shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                @change="fetchLeaderboard"
              >
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <div class="glass-text-muted pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
                <div class="i-carbon-chevron-down opacity-80" />
              </div>
            </div>

            <BaseButton
              variant="secondary"
              class="rounded-lg shadow-sm !p-2"
              title="刷新"
              @click="fetchLeaderboard"
            >
              <div class="i-carbon-renew text-lg" :class="{ 'animate-spin': loading }" />
            </BaseButton>

            <button
              class="leaderboard-close glass-text-muted hover:glass-text-main ml-2 h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
              @click="handleClose"
            >
              <div class="i-carbon-close text-xl" />
            </button>
          </div>
        </div>

        <!-- 列表容器 -->
        <div class="custom-scrollbar flex-1 overflow-y-auto px-6 py-4">
          <div class="leaderboard-hint glass-text-muted mb-3 flex items-center justify-between rounded-2xl px-4 py-2 text-[11px]">
            <span>{{ sortHintMap[sortBy] || sortHintMap.level }}</span>
            <span class="leaderboard-hint-pill rounded-full px-2 py-0.5 text-[10px]">
              离线显示快照
            </span>
          </div>

          <div v-if="loading && leaderboardData.length === 0" class="glass-text-muted h-64 flex flex-col items-center justify-center">
            <div class="i-svg-spinners-90-ring-with-bg mb-4 text-4xl text-primary-500/50" />
            <p>正在加载风云榜...</p>
          </div>

          <div v-else-if="leaderboardData.length === 0" class="glass-text-muted h-64 flex flex-col items-center justify-center">
            <div class="i-carbon-list mb-4 text-6xl opacity-30" />
            <p>暂无账号排行数据</p>
          </div>

          <div v-else class="w-full">
            <!-- 表头 -->
            <div class="leaderboard-head glass-text-muted sticky top-0 z-10 grid grid-cols-12 mb-2 gap-4 px-3 pb-3 pt-2 text-[11px] font-bold tracking-wider uppercase backdrop-blur-xl">
              <div class="col-span-1 text-center font-black">
                #
              </div>
              <div class="col-span-5">
                账号信息
              </div>
              <div class="col-span-2 text-right">
                财富/资产
              </div>
              <div class="col-span-1 text-right">
                点券
              </div>
              <div class="col-span-2 text-center">
                累计时长
              </div>
              <div class="col-span-1 text-center">
                状态
              </div>
            </div>

            <!-- 数据行 -->
            <div class="space-y-2">
              <div
                v-for="item in leaderboardData"
                :key="item.id"
                class="group grid grid-cols-12 items-center gap-4 border border-transparent rounded-2xl p-3 transition-all duration-300 hover:border-primary-500/20 hover:bg-primary-500/5 dark:hover:bg-primary-500/10"
                :class="item.ranking <= 3 ? 'bg-primary-500/5 dark:bg-primary-500/10' : ''"
              >
                <!-- 排名 -->
                <div class="col-span-1 flex justify-center">
                  <div
                    class="h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold"
                    :class="getRankingClass(item.ranking)"
                  >
                    {{ item.ranking }}
                  </div>
                </div>

                <!-- 账号信息 -->
                <div class="col-span-5 flex items-center gap-3 truncate">
                  <div class="leaderboard-avatar h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-transparent transition-all group-hover:ring-primary-500/30">
                    <img v-if="formatAvatar(item)" :src="formatAvatar(item) as string" class="h-full w-full object-cover">
                    <div v-else class="leaderboard-avatar-fallback i-carbon-user h-full w-full flex items-center justify-center" />
                  </div>
                  <div class="truncate">
                    <div class="leaderboard-name flex items-center gap-2 truncate pr-2 font-bold">
                      {{ item.name || item.nick || item.id }}
                      <span
                        class="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        :class="getPlatformBadgeClass(item.platform)"
                      >
                        {{ getPlatformLabel(item.platform) }}
                      </span>
                    </div>
                    <div class="glass-text-muted flex items-center gap-2 truncate text-xs">
                      <span class="truncate">
                        {{ getUinLabel(item) }}
                      </span>
                      <span
                        class="inline-flex shrink-0 items-center border rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        :class="getLevelBadgeClass(item.level)"
                      >
                        {{ getLevelText(item) }}
                      </span>
                      <span v-if="!isAccountOnline(item) && hasSnapshot(item)" class="leaderboard-snapshot-pill inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px]">
                        快照
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 金币 -->
                <div
                  class="col-span-2 truncate text-right font-medium"
                  :class="getMetricTextClass(item, 'warning')"
                >
                  {{ formatMetricValue(item.gold, item) }}
                </div>

                <!-- 点券 -->
                <div
                  class="col-span-1 truncate text-right"
                  :class="getMetricTextClass(item, 'default')"
                >
                  {{ formatMetricValue(item.coupon, item) }}
                </div>

                <!-- 时长 -->
                <div
                  class="col-span-2 text-center text-sm"
                  :class="getMetricTextClass(item, 'default')"
                >
                  {{ formatUptimeValue(item) }}
                </div>

                <!-- 状态 -->
                <div class="col-span-1 flex justify-center">
                  <span
                    :title="getStatusTitle(item)"
                    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold leading-none"
                    :class="getStatusClass(item)"
                  >
                    <span class="h-1.5 w-1.5 rounded-full" :class="[getStatusDotClass(item), { 'animate-pulse': isAccountOnline(item) }]" />
                    {{ getStatusText(item) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .glass-panel,
.modal-leave-to .glass-panel {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--ui-brand-500) 20%, transparent);
  border-radius: 10px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--ui-brand-500) 40%, transparent);
}

/* 奖牌样式定义 */
.ranking-gold {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-status-warning) 45%, var(--ui-text-on-brand) 55%) 0%,
    var(--ui-status-warning) 100%
  );
  border: 1.5px solid color-mix(in srgb, var(--ui-text-on-brand) 40%, transparent);
}
.ranking-silver {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-text-on-brand) 62%, var(--ui-text-3) 38%) 0%,
    var(--ui-text-2) 100%
  );
  border: 1.5px solid color-mix(in srgb, var(--ui-text-on-brand) 40%, transparent);
}
.ranking-bronze {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-status-warning) 70%, var(--ui-text-on-brand) 30%) 0%,
    color-mix(in srgb, var(--ui-status-warning) 88%, var(--ui-status-danger) 12%) 100%
  );
  border: 1.5px solid color-mix(in srgb, var(--ui-text-on-brand) 40%, transparent);
}
.ranking-normal {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
}

.leaderboard-modal {
  color: var(--ui-text-1);
}

.leaderboard-backdrop {
  background: var(--ui-overlay-backdrop) !important;
}

.leaderboard-panel,
.leaderboard-header,
.leaderboard-select,
.leaderboard-close,
.leaderboard-hint,
.leaderboard-hint-pill,
.leaderboard-head,
.leaderboard-avatar,
.leaderboard-avatar-fallback,
.leaderboard-platform-badge,
.leaderboard-level-badge,
.leaderboard-snapshot-pill,
.leaderboard-status {
  border: 1px solid var(--ui-border-subtle) !important;
}

.leaderboard-panel {
  border-radius: 1rem;
}

.leaderboard-header,
.leaderboard-hint,
.leaderboard-head,
.leaderboard-avatar,
.leaderboard-avatar-fallback,
.leaderboard-close {
  background: color-mix(in srgb, var(--ui-bg-surface) 68%, transparent) !important;
}

.leaderboard-name {
  color: var(--ui-text-1) !important;
}

.leaderboard-ranking-medal {
  color: var(--ui-text-on-brand) !important;
}

.leaderboard-select {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 86%, transparent) !important;
}

.leaderboard-close:hover {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent) !important;
}

.leaderboard-hint {
  border-radius: 1rem;
  background: var(--ui-brand-soft-05) !important;
}

.leaderboard-hint-pill,
.leaderboard-level-badge-active,
.leaderboard-status-online {
  background: var(--ui-brand-soft-12) !important;
  color: color-mix(in srgb, var(--ui-brand-700) 76%, var(--ui-text-1)) !important;
}

.leaderboard-ranking-normal,
.leaderboard-level-badge-empty,
.leaderboard-status-offline {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent) !important;
  color: var(--ui-text-2) !important;
}

.leaderboard-platform-badge-qq {
  background: color-mix(in srgb, var(--ui-status-info) 10%, transparent) !important;
  color: color-mix(in srgb, var(--ui-status-info) 78%, var(--ui-text-1)) !important;
}

.leaderboard-platform-badge-wx {
  background: color-mix(in srgb, var(--ui-status-success) 10%, transparent) !important;
  color: color-mix(in srgb, var(--ui-status-success) 78%, var(--ui-text-1)) !important;
}

.leaderboard-snapshot-pill,
.leaderboard-status-snapshot,
.leaderboard-status-dot-snapshot {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, transparent) !important;
  color: color-mix(in srgb, var(--ui-status-warning) 80%, var(--ui-text-1)) !important;
}

.leaderboard-status {
  border-radius: 999px;
}

.leaderboard-status-dot {
  display: inline-flex;
}

.leaderboard-status-dot-online {
  background: var(--ui-brand-500) !important;
}

.leaderboard-status-dot-offline {
  background: color-mix(in srgb, var(--ui-text-2) 42%, transparent) !important;
}

.leaderboard-metric-online-warning {
  color: color-mix(in srgb, var(--ui-status-warning) 80%, var(--ui-text-1)) !important;
}

.leaderboard-metric-snapshot-warning {
  color: color-mix(in srgb, var(--ui-status-warning) 64%, var(--ui-text-1)) !important;
}

.leaderboard-metric-online {
  color: var(--ui-text-1) !important;
}

.leaderboard-metric-snapshot {
  color: var(--ui-text-2) !important;
}
</style>
