import { useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppPackageKey } from '../locales.ts'
import { PreviewPanel } from './PreviewPanel.tsx'
import { EditorPanel } from './EditorPanel.tsx'
import { JsonPanel } from './JsonPanel.tsx'
import { TestsPanel } from './TestsPanel.tsx'
import { VersionsPanel } from './VersionsPanel.tsx'
import { openEditorWindow } from './editor-window.ts'
import css from './AppPackageWorkspace.module.css'

type TabId = 'preview' | 'editor' | 'json' | 'tests' | 'versions'

const TABS: readonly { id: TabId; key: AppPackageKey }[] = [
  { id: 'preview', key: 'workspace.tab.preview' },
  { id: 'editor', key: 'workspace.tab.editor' },
  { id: 'json', key: 'workspace.tab.json' },
  { id: 'tests', key: 'workspace.tab.tests' },
  { id: 'versions', key: 'workspace.tab.versions' },
]

/** Injected close-details callback for the workspace header. */
export interface AppPackageWorkspaceInjected {
  /** Close the right details column. */
  closeDetails: () => void
}

/**
 * App-package product workspace replacing the upstream details seat: tabs for
 * preview/editor plus the remaining M3 surfaces (JSON / tests / versions).
 * M2 renders the eureka preview with fixture data; M3 edits pages back to the
 * local app-package with re-validation.
 */
export function AppPackageWorkspace(
  props: PropsRuntime<'details'> & AppPackageWorkspaceInjected & PropsLocale<'apppackage'>,
) {
  const { t, closeDetails } = props
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
            onClick={() => {
              if (item.id === 'editor' && cwd !== undefined) openEditorWindow(cwd)
              setTab(item.id)
            }}
          >
            {t(item.key)}
          </button>
        ))}
        <button
          type="button"
          className={css.close}
          aria-label={t('workspace.close')}
          onClick={closeDetails}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className={css.body}>{renderBody()}</div>
    </div>
  )

  function renderBody(): ReactNode {
    if (cwd === undefined) return <div className={css.hint}>{t('workspace.noSession')}</div>
    if (tab === 'preview') return <PreviewPanel cwd={cwd} t={t} />
    if (tab === 'editor') return <EditorPanel cwd={cwd} t={t} />
    if (tab === 'json') return <JsonPanel cwd={cwd} t={t} />
    if (tab === 'tests') return <TestsPanel cwd={cwd} t={t} />
    return <VersionsPanel cwd={cwd} t={t} />
  }
}
