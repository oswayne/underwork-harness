/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'login.brand': 'Underwork Harness',
  'login.title': '登录',
  'login.checking': '正在验证 Token…',
  'login.invalid': 'Token 无效，请重新输入',
  'login.placeholder': '粘贴平台 Token（JWT）',
  'login.submit': '登录',
  'nav.projects': '项目',
  'nav.loading': '加载中…',
  'nav.sessions': '会话',
  'nav.newSession': '新建会话',
  'nav.empty': '（空）',
  'nav.logout': '退出',
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
  'nav.projects': 'Projects',
  'nav.loading': 'Loading…',
  'nav.sessions': 'Sessions',
  'nav.newSession': 'New session',
  'nav.empty': '(empty)',
  'nav.logout': 'Sign out',
}
