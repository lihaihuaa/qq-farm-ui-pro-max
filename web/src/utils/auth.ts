import { useStorage } from '@vueuse/core'

/**
 * 统一的 Auth 状态管理
 *
 * 认证令牌存储在 HttpOnly Cookie 中，前端 JS 无法访问。
 * adminToken 仅作为登录状态标识，存储当前登录用户名（非敏感信息）。
 */

export const adminToken = useStorage('admin_token', '')

export const currentAccountId = useStorage('current_account_id', '')

let disconnectRealtimeHook: null | (() => void) = null

export function registerDisconnectRealtimeHook(fn: (() => void) | null) {
  disconnectRealtimeHook = fn
}

/**
 * 仅清除本地认证状态，不发起任何网络请求。
 * 适用于拦截器/守卫等无法安全发起 API 调用的场景。
 */
export function clearLocalAuthState() {
  adminToken.value = ''
  currentAccountId.value = ''
  localStorage.removeItem('current_user')
}

/**
 * 完整注销：调用后端撤销 refresh token + 清理本地状态。
 * 适用于用户主动登出等可以安全发起 API 调用的场景。
 */
export async function clearAuth() {
  try {
    disconnectRealtimeHook?.()
  }
  catch { /* ignore */ }
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
  }
  catch { /* ignore */ }
  clearLocalAuthState()
}
