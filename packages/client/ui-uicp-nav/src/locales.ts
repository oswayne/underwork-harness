/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'login.brand': 'Underwork Harness',
  'login.title': '登录',
  'login.placeholder': '粘贴平台 Token（JWT）',
  'login.submit': '登录',
  'nav.tenants': '租户',
  'nav.apps': '应用包',
  'nav.app': '应用包',
  'nav.sessions': '会话',
  'nav.open': '打开',
  'nav.newSession': '新建会话',
  'nav.empty': '（空）',
  'nav.logout': '退出',
}

/** English dictionary. */
export type NavKey = keyof typeof zh
export const en: Record<NavKey, string> = {
  'login.brand': 'Underwork Harness',
  'login.title': 'Sign in',
  'login.placeholder': 'Paste platform token (JWT)',
  'login.submit': 'Sign in',
  'nav.tenants': 'Tenants',
  'nav.apps': 'App packages',
  'nav.app': 'App package',
  'nav.sessions': 'Sessions',
  'nav.open': 'Open',
  'nav.newSession': 'New session',
  'nav.empty': '(empty)',
  'nav.logout': 'Sign out',
}
