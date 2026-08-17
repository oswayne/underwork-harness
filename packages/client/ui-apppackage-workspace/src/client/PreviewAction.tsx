import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AppPackageWorkspace.module.css'

/** Injected open-details callback for the preview header action. */
export interface PreviewActionInjected {
  /** Open the right details column, which hosts the app-package workspace. */
  openDetails: () => void
}

/**
 * Session-header action opening the app-package workspace (eureka preview).
 * @param props - the injected open callback and copy.
 * @returns the preview button.
 */
export function PreviewAction(
  props: PropsRuntime<'conversation.session.header.utilities'>
    & PreviewActionInjected
    & PropsLocale<'apppackage'>,
) {
  const { t, openDetails } = props
  return (
    <button
      type="button"
      className={css.previewAction}
      aria-label={t('preview.action')}
      onClick={openDetails}
    >
      {t('preview.action')}
    </button>
  )
}
