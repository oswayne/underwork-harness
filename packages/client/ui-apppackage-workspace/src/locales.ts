/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'workspace.tab.preview': '渲染预览',
  'workspace.tab.editor': '可视化编辑',
  'workspace.tab.json': '原始 JSON',
  'workspace.tab.tests': '测试',
  'workspace.tab.versions': '版本',
  'workspace.m3': 'M3 里程碑实现',
  'workspace.noSession': '选择一个会话以预览应用包页面',
  'preview.loading': '正在加载预览…',
}

/** English dictionary. */
export type AppPackageKey = keyof typeof zh
export const en: Record<AppPackageKey, string> = {
  'workspace.tab.preview': 'Preview',
  'workspace.tab.editor': 'Editor',
  'workspace.tab.json': 'JSON',
  'workspace.tab.tests': 'Tests',
  'workspace.tab.versions': 'Versions',
  'workspace.m3': 'Landing in M3',
  'workspace.noSession': 'Select a session to preview the app package page',
  'preview.loading': 'Loading preview…',
}
