/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'login.brand': 'Underwork Harness',
  'login.title': '登录',
  'login.checking': '正在验证 Token…',
  'login.invalid': 'Token 无效，请重新输入',
  'login.placeholder': '粘贴平台 Token（JWT）',
  'login.submit': '登录',
  'nav.tenant': '当前租户',
  'nav.rootUnavailable': '应用包目录不可用（{root}）',
  'nav.rootMissing': '无法获取应用包根目录',
  'nav.notSynced': '该租户暂无已同步到本地的应用包，请先在 app-packages 目录同步后重试',
  'nav.sessions': '会话',
}

/** English dictionary. */
export type NavKey = keyof typeof zh
export const en: Record<NavKey, string> = {
  'login.brand': 'Underwork Harness',
  'login.title': 'Sign in',
  'login.checking': 'Checking token…',
  'login.invalid': 'Token is invalid, please sign in again',
  'login.placeholder': 'Paste platform token (JWT)',
  'login.submit': 'Sign in',
  'nav.tenant': 'Tenant',
  'nav.rootUnavailable': 'App package directory unavailable ({root})',
  'nav.rootMissing': 'Cannot resolve the app-package root',
  'nav.notSynced': 'No app packages synced locally for this tenant yet; sync them under app-packages and retry',
  'nav.sessions': 'Sessions',
}
