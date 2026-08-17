import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppPackageKey } from '../locales.ts'
import { PreviewPanel } from './PreviewPanel.tsx'
import css from './AppPackageWorkspace.module.css'

type TabId = 'preview' | 'editor' | 'json' | 'tests' | 'versions'

const TABS: readonly { id: TabId; key: AppPackageKey }[] = [
  { id: 'preview', key: 'workspace.tab.preview' },
  { id: 'editor', key: 'workspace.tab.editor' },
  { id: 'json', key: 'workspace.tab.json' },
  { id: 'tests', key: 'workspace.tab.tests' },
  { id: 'versions', key: 'workspace.tab.versions' },
]

/**
 * App-package product workspace replacing the upstream details seat: tabs for
 * preview and the M3 surfaces (editor / JSON / tests / versions). M2 renders
 * the eureka preview with fixture data; the other tabs are placeholders.
 */
export function AppPackageWorkspace(
  props: PropsRuntime<'details'> & PropsLocale<'apppackage'>,
) {
  const { t } = props
  const current = props.useSessions(s => s.current)
  const row = props.useSessions(s => current === undefined ? undefined : s.byId[current])
  const cwd = row?.cwd
  const [tab, setTab] = useState<TabId>('preview')

  return (
    <div className={css.root}>
      <div className={css.tabs} role="tablist" aria-label={t('workspace.tab.preview')}>
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? css.tabActive : css.tab}
            disabled={item.id !== 'preview'}
            title={item.id === 'preview' ? undefined : t('workspace.m3')}
            onClick={() => { setTab(item.id) }}
          >
            {t(item.key)}
          </button>
        ))}
      </div>
      <div className={css.body}>
        {tab === 'preview'
          ? cwd === undefined
            ? <div className={css.hint}>{t('workspace.noSession')}</div>
            : <PreviewPanel cwd={cwd} t={t} />
          : <div className={css.hint}>{t('workspace.m3')}</div>}
      </div>
    </div>
  )
}
