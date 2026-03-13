import api from '@/api'

export interface CardsViewState {
  keyword: string
  type: string
  status: string
  source: string
  batchNo: string
  createdBy: string
  page: number
  pageSize: number
}

export interface SystemLogsViewState {
  level: string
  accountId: string
  keyword: string
  page: number
  pageSize: number
}

export interface AccountsViewState {
  viewMode: 'standard' | 'compact' | 'table'
  tableSortKey: 'account' | 'owner' | 'platform' | 'activity' | 'mode' | 'state'
  tableSortDirection: 'asc' | 'desc'
  tableColumnVisibility: {
    owner: boolean
    platform: boolean
    activity: boolean
    mode: boolean
    state: boolean
    actions: boolean
  }
}

export type AccountsActionHistoryStatus = 'success' | 'warning' | 'error'

export interface AccountsActionHistoryItem {
  id: string
  actionLabel: string
  status: AccountsActionHistoryStatus
  timestamp: number
  totalCount: number
  successCount: number
  failedCount: number
  skippedCount: number
  affectedNames: string[]
  failedNames: string[]
  targetLabel?: string
}

export interface DashboardViewState {
  module: string
  event: string
  keyword: string
  isWarn: '' | 'info' | 'warn'
}

export interface AnalyticsViewState {
  sortKey: 'exp' | 'fert' | 'profit' | 'fert_profit' | 'level'
  strategyPanelCollapsed: boolean
}

export interface ReportHistoryViewState {
  mode: 'all' | 'test' | 'hourly' | 'daily'
  status: 'all' | 'success' | 'failed'
  keyword: string
  sortOrder: 'asc' | 'desc'
  pageSize: 3
}

export interface ViewPreferencesPayload {
  announcementDismissedId?: string | null
  appSeenVersion?: string | null
  accountsActionHistory?: Partial<AccountsActionHistoryItem>[] | null
  accountsViewState?: Partial<AccountsViewState> | null
  analyticsViewState?: Partial<AnalyticsViewState> | null
  cardsViewState?: Partial<CardsViewState> | null
  dashboardViewState?: Partial<DashboardViewState> | null
  notificationLastReadDate?: string | null
  reportHistoryViewState?: Partial<ReportHistoryViewState> | null
  systemLogsViewState?: Partial<SystemLogsViewState> | null
}

export type ServerBackedStringPreferenceKey = 'announcementDismissedId' | 'notificationLastReadDate' | 'appSeenVersion'

const CARD_PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100])
const SYSTEM_LOG_PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100])
const ACCOUNTS_VIEW_MODE_OPTIONS = new Set(['standard', 'compact', 'table'])
const ACCOUNTS_TABLE_SORT_KEY_OPTIONS = new Set(['account', 'owner', 'platform', 'activity', 'mode', 'state'])
const ACCOUNTS_TABLE_SORT_DIRECTION_OPTIONS = new Set(['asc', 'desc'])
const DASHBOARD_MODULE_OPTIONS = new Set(['', 'farm', 'friend', 'warehouse', 'task', 'system'])
const DASHBOARD_LOG_LEVEL_OPTIONS = new Set(['', 'info', 'warn'])
const ANALYTICS_SORT_KEY_OPTIONS = new Set(['exp', 'fert', 'profit', 'fert_profit', 'level'])
const REPORT_HISTORY_MODE_OPTIONS = new Set(['all', 'test', 'hourly', 'daily'])
const REPORT_HISTORY_STATUS_OPTIONS = new Set(['all', 'success', 'failed'])
const SORT_ORDER_OPTIONS = new Set(['asc', 'desc'])
const REPORT_PAGE_SIZE_OPTIONS = new Set([3])
const ACTION_HISTORY_STATUS_OPTIONS = new Set(['success', 'warning', 'error'])
const ACTION_HISTORY_LIMIT = 8
const ACTION_HISTORY_NAME_LIMIT = 6

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean')
    return value
  return fallback
}

export const DEFAULT_CARDS_VIEW_STATE: CardsViewState = {
  keyword: '',
  type: 'all',
  status: 'all',
  source: 'all',
  batchNo: 'all',
  createdBy: 'all',
  page: 1,
  pageSize: 20,
}

export const DEFAULT_SYSTEM_LOGS_VIEW_STATE: SystemLogsViewState = {
  level: '',
  accountId: '',
  keyword: '',
  page: 1,
  pageSize: 20,
}

export const DEFAULT_ACCOUNTS_VIEW_STATE: AccountsViewState = {
  viewMode: 'standard',
  tableSortKey: 'activity',
  tableSortDirection: 'desc',
  tableColumnVisibility: {
    owner: true,
    platform: true,
    activity: true,
    mode: true,
    state: true,
    actions: true,
  },
}

export const DEFAULT_DASHBOARD_VIEW_STATE: DashboardViewState = {
  module: '',
  event: '',
  keyword: '',
  isWarn: '',
}

export const DEFAULT_ANALYTICS_VIEW_STATE: AnalyticsViewState = {
  sortKey: 'exp',
  strategyPanelCollapsed: false,
}

export const DEFAULT_REPORT_HISTORY_VIEW_STATE: ReportHistoryViewState = {
  mode: 'all',
  status: 'all',
  keyword: '',
  sortOrder: 'desc',
  pageSize: 3,
}

function clampPositiveInteger(value: unknown, fallback: number) {
  const num = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(num) || num < 1)
    return fallback
  return num
}

function clampNonNegativeInteger(value: unknown, fallback: number, max = 999999) {
  const num = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(num) || num < 0)
    return fallback
  return Math.min(max, num)
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  return String(value ?? fallback).trim().slice(0, maxLength)
}

export function normalizeAnnouncementDismissedId(value: unknown, fallback = '') {
  const normalized = normalizeText(value, fallback, 32)
  if (!normalized)
    return ''
  return /^\d+$/.test(normalized) ? normalized : ''
}

export function normalizeNotificationLastReadDate(value: unknown, fallback = '') {
  return normalizeText(value, fallback, 32)
}

export function normalizeAppSeenVersion(value: unknown, fallback = '') {
  return normalizeText(value, fallback, 64)
}

function normalizeActionHistoryNames(value: unknown) {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => normalizeText(item, '', 60))
    .filter(Boolean)
    .slice(0, ACTION_HISTORY_NAME_LIMIT)
}

function resolveAccountsActionHistoryStatus(
  successCount: number,
  failedCount: number,
  skippedCount: number,
  fallback: AccountsActionHistoryStatus = 'warning',
): AccountsActionHistoryStatus {
  if (successCount > 0 && failedCount === 0)
    return 'success'
  if (successCount > 0 || skippedCount > 0)
    return 'warning'
  return ACTION_HISTORY_STATUS_OPTIONS.has(fallback) ? fallback : 'error'
}

function normalizeCardsPageSize(value: unknown, fallback: number) {
  const next = clampPositiveInteger(value, fallback)
  return CARD_PAGE_SIZE_OPTIONS.has(next) ? next : fallback
}

function normalizeSystemLogsPageSize(value: unknown, fallback: number) {
  const next = clampPositiveInteger(value, fallback)
  return SYSTEM_LOG_PAGE_SIZE_OPTIONS.has(next) ? next : fallback
}

function normalizeReportPageSize(value: unknown, fallback: ReportHistoryViewState['pageSize']) {
  const next = clampPositiveInteger(value, fallback)
  return REPORT_PAGE_SIZE_OPTIONS.has(next)
    ? next as ReportHistoryViewState['pageSize']
    : fallback
}

export function normalizeCardsViewState(input: Partial<CardsViewState> | null | undefined, fallback: CardsViewState = DEFAULT_CARDS_VIEW_STATE): CardsViewState {
  const source = input && typeof input === 'object' ? input : {}
  return {
    keyword: normalizeText(source.keyword, fallback.keyword, 120),
    type: normalizeText(source.type, fallback.type, 32) || 'all',
    status: normalizeText(source.status, fallback.status, 32) || 'all',
    source: normalizeText(source.source, fallback.source, 64) || 'all',
    batchNo: normalizeText(source.batchNo, fallback.batchNo, 128) || 'all',
    createdBy: normalizeText(source.createdBy, fallback.createdBy, 120) || 'all',
    page: clampPositiveInteger(source.page, fallback.page),
    pageSize: normalizeCardsPageSize(source.pageSize, fallback.pageSize),
  }
}

export function normalizeSystemLogsViewState(input: Partial<SystemLogsViewState> | null | undefined, fallback: SystemLogsViewState = DEFAULT_SYSTEM_LOGS_VIEW_STATE): SystemLogsViewState {
  const source = input && typeof input === 'object' ? input : {}
  const level = normalizeText(source.level, fallback.level, 16).toLowerCase()
  return {
    level: new Set(['', 'info', 'warn', 'error']).has(level) ? level : fallback.level,
    accountId: normalizeText(source.accountId, fallback.accountId, 128),
    keyword: normalizeText(source.keyword, fallback.keyword, 120),
    page: clampPositiveInteger(source.page, fallback.page),
    pageSize: normalizeSystemLogsPageSize(source.pageSize, fallback.pageSize),
  }
}

export function normalizeAccountsViewState(input: Partial<AccountsViewState> | null | undefined, fallback: AccountsViewState = DEFAULT_ACCOUNTS_VIEW_STATE): AccountsViewState {
  const source = input && typeof input === 'object' ? input : {}
  const columnSource: Partial<AccountsViewState['tableColumnVisibility']> = source.tableColumnVisibility && typeof source.tableColumnVisibility === 'object'
    ? source.tableColumnVisibility
    : {}

  const viewMode = normalizeText(source.viewMode, fallback.viewMode, 16)
  const tableSortKey = normalizeText(source.tableSortKey, fallback.tableSortKey, 32)
  const tableSortDirection = normalizeText(source.tableSortDirection, fallback.tableSortDirection, 8)

  return {
    viewMode: ACCOUNTS_VIEW_MODE_OPTIONS.has(viewMode) ? viewMode as AccountsViewState['viewMode'] : fallback.viewMode,
    tableSortKey: ACCOUNTS_TABLE_SORT_KEY_OPTIONS.has(tableSortKey) ? tableSortKey as AccountsViewState['tableSortKey'] : fallback.tableSortKey,
    tableSortDirection: ACCOUNTS_TABLE_SORT_DIRECTION_OPTIONS.has(tableSortDirection) ? tableSortDirection as AccountsViewState['tableSortDirection'] : fallback.tableSortDirection,
    tableColumnVisibility: {
      owner: normalizeBoolean(columnSource.owner, fallback.tableColumnVisibility.owner),
      platform: normalizeBoolean(columnSource.platform, fallback.tableColumnVisibility.platform),
      activity: normalizeBoolean(columnSource.activity, fallback.tableColumnVisibility.activity),
      mode: normalizeBoolean(columnSource.mode, fallback.tableColumnVisibility.mode),
      state: normalizeBoolean(columnSource.state, fallback.tableColumnVisibility.state),
      actions: normalizeBoolean(columnSource.actions, fallback.tableColumnVisibility.actions),
    },
  }
}

export function normalizeAccountsActionHistory(
  input: Partial<AccountsActionHistoryItem>[] | null | undefined,
  fallback: AccountsActionHistoryItem[] = [],
): AccountsActionHistoryItem[] {
  const source = Array.isArray(input) ? input : fallback
  return source
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const timestamp = clampPositiveInteger(item.timestamp, 0)
      const successCount = clampNonNegativeInteger(item.successCount, 0)
      const affectedNames = normalizeActionHistoryNames(item.affectedNames)
      const failedNames = normalizeActionHistoryNames(item.failedNames)
      const failedCount = Math.max(clampNonNegativeInteger(item.failedCount, failedNames.length), failedNames.length)
      const skippedCount = clampNonNegativeInteger(item.skippedCount, 0)
      const totalCount = Math.max(
        clampNonNegativeInteger(item.totalCount, successCount + failedCount + skippedCount),
        successCount + failedCount + skippedCount,
      )
      const actionLabel = normalizeText(item.actionLabel, '批量操作', 60) || '批量操作'
      const targetLabel = normalizeText(item.targetLabel, '', 120)
      const rawStatus = normalizeText(item.status, 'warning', 16)

      return {
        id: normalizeText(item.id, `${actionLabel}-${timestamp || Date.now()}-${index}`, 96),
        actionLabel,
        status: resolveAccountsActionHistoryStatus(
          successCount,
          failedCount,
          skippedCount,
          ACTION_HISTORY_STATUS_OPTIONS.has(rawStatus) ? rawStatus as AccountsActionHistoryStatus : 'warning',
        ),
        timestamp,
        totalCount,
        successCount,
        failedCount,
        skippedCount,
        affectedNames,
        failedNames,
        targetLabel: targetLabel || undefined,
      }
    })
    .filter(item => item.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, ACTION_HISTORY_LIMIT)
}

export function normalizeDashboardViewState(input: Partial<DashboardViewState> | null | undefined, fallback: DashboardViewState = DEFAULT_DASHBOARD_VIEW_STATE): DashboardViewState {
  const source = input && typeof input === 'object' ? input : {}
  const module = normalizeText(source.module, fallback.module, 32)
  const event = normalizeText(source.event, fallback.event, 64)
  const keyword = normalizeText(source.keyword, fallback.keyword, 120)
  const isWarn = normalizeText(source.isWarn, fallback.isWarn, 16)
  return {
    module: DASHBOARD_MODULE_OPTIONS.has(module) ? module as DashboardViewState['module'] : fallback.module,
    event,
    keyword,
    isWarn: DASHBOARD_LOG_LEVEL_OPTIONS.has(isWarn) ? isWarn as DashboardViewState['isWarn'] : fallback.isWarn,
  }
}

export function normalizeAnalyticsViewState(input: Partial<AnalyticsViewState> | null | undefined, fallback: AnalyticsViewState = DEFAULT_ANALYTICS_VIEW_STATE): AnalyticsViewState {
  const source = input && typeof input === 'object' ? input : {}
  const sortKey = normalizeText(source.sortKey, fallback.sortKey, 16)
  return {
    sortKey: ANALYTICS_SORT_KEY_OPTIONS.has(sortKey) ? sortKey as AnalyticsViewState['sortKey'] : fallback.sortKey,
    strategyPanelCollapsed: normalizeBoolean(source.strategyPanelCollapsed, fallback.strategyPanelCollapsed),
  }
}

export function normalizeReportHistoryViewState(input: Partial<ReportHistoryViewState> | null | undefined, fallback: ReportHistoryViewState = DEFAULT_REPORT_HISTORY_VIEW_STATE): ReportHistoryViewState {
  const source = input && typeof input === 'object' ? input : {}
  const mode = normalizeText(source.mode, fallback.mode, 16)
  const status = normalizeText(source.status, fallback.status, 16)
  const sortOrder = normalizeText(source.sortOrder, fallback.sortOrder, 8)
  return {
    mode: REPORT_HISTORY_MODE_OPTIONS.has(mode) ? mode as ReportHistoryViewState['mode'] : fallback.mode,
    status: REPORT_HISTORY_STATUS_OPTIONS.has(status) ? status as ReportHistoryViewState['status'] : fallback.status,
    keyword: normalizeText(source.keyword, fallback.keyword, 100),
    sortOrder: SORT_ORDER_OPTIONS.has(sortOrder) ? sortOrder as ReportHistoryViewState['sortOrder'] : fallback.sortOrder,
    pageSize: normalizeReportPageSize(source.pageSize, fallback.pageSize),
  }
}

export async function fetchViewPreferences(): Promise<ViewPreferencesPayload | null> {
  const res = await api.get('/api/view-preferences')
  return res.data?.ok ? (res.data.data || null) as ViewPreferencesPayload | null : null
}

export async function saveViewPreferences(payload: ViewPreferencesPayload): Promise<ViewPreferencesPayload | null> {
  const res = await api.post('/api/view-preferences', payload)
  return res.data?.ok ? (res.data.data || null) as ViewPreferencesPayload | null : null
}

function readLocalStringPreference(localKey: string) {
  if (typeof window === 'undefined')
    return ''
  try {
    return String(window.localStorage.getItem(localKey) || '')
  }
  catch {
    return ''
  }
}

function writeLocalStringPreference(localKey: string, value: string) {
  if (typeof window === 'undefined')
    return
  try {
    if (value)
      window.localStorage.setItem(localKey, value)
    else
      window.localStorage.removeItem(localKey)
  }
  catch {
    // ignore browser storage failures
  }
}

export async function hydrateServerBackedStringPreference(options: {
  payloadKey: ServerBackedStringPreferenceKey
  localKey: string
  normalize: (value: unknown, fallback?: string) => string
}): Promise<string> {
  const localValue = options.normalize(readLocalStringPreference(options.localKey), '')
  try {
    const payload = await fetchViewPreferences()
    const remoteValue = options.normalize(payload?.[options.payloadKey], '')
    if (remoteValue) {
      if (remoteValue !== localValue)
        writeLocalStringPreference(options.localKey, remoteValue)
      return remoteValue
    }
    if (localValue) {
      await saveViewPreferences({ [options.payloadKey]: localValue } as ViewPreferencesPayload)
    }
    return localValue
  }
  catch {
    return localValue
  }
}

export async function persistServerBackedStringPreference(options: {
  payloadKey: ServerBackedStringPreferenceKey
  localKey: string
  value: unknown
  normalize: (value: unknown, fallback?: string) => string
}): Promise<string> {
  const nextValue = options.normalize(options.value, '')
  writeLocalStringPreference(options.localKey, nextValue)
  try {
    await saveViewPreferences({ [options.payloadKey]: nextValue } as ViewPreferencesPayload)
  }
  catch {
    // ignore remote persistence errors and keep local fallback
  }
  return nextValue
}
