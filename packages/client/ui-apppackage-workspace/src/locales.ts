/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'workspace.tab.preview': '预览',
  'workspace.tab.editor': '编辑',
  'workspace.tab.json': 'JSON',
  'workspace.tab.tests': '测试',
  'workspace.tab.versions': '版本',
  'workspace.m3': 'M3 里程碑实现',
  'workspace.noSession': '选择一个会话以预览应用包页面',
  'workspace.close': '关闭',
  'preview.action': '预览',
  'preview.page': '页面',
  'preview.loading': '正在加载预览…',
  'editor.save': '保存',
  'editor.saving': '正在保存…',
  'editor.saved': '已保存并通过校验',
  'editor.issues': '校验发现问题',
  'editor.saveFailed': '保存失败',
  'json.parseError': 'JSON 解析失败',
  'json.pageError': '内容必须是 page schema',
}

/** English dictionary. */
export type AppPackageKey = keyof typeof zh
export const en: Record<AppPackageKey, string> = {
  'workspace.tab.preview': 'Preview',
  'workspace.tab.editor': 'Edit',
  'workspace.tab.json': 'JSON',
  'workspace.tab.tests': 'Tests',
  'workspace.tab.versions': 'Versions',
  'workspace.m3': 'Landing in M3',
  'workspace.noSession': 'Select a session to preview the app package page',
  'workspace.close': 'Close',
  'preview.action': 'Preview',
  'preview.page': 'Page',
  'preview.loading': 'Loading preview…',
  'editor.save': 'Save',
  'editor.saving': 'Saving…',
  'editor.saved': 'Saved and validated',
  'editor.issues': 'Validation findings',
  'editor.saveFailed': 'Save failed',
  'json.parseError': 'Invalid JSON',
  'json.pageError': 'Content must be a page schema',
}
