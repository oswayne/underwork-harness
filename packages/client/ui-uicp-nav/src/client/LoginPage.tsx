import { useEffect } from 'react'
import { useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LoginView } from './LoginView.tsx'
import { authSnapshot, refreshAuth, setToken, subscribeAuth } from './token.ts'
import css from './LoginPage.module.css'

/**
 * Full-window sign-in gate (shell.overlay entry): while a stored token is
 * being validated it shows a progress bar; an invalid or absent token shows
 * the JWT form; a valid token renders nothing. Login state lives in the
 * shared auth store so the sidebar browser reacts to sign-in/logout.
 */
export function LoginPage({ t }: PropsLocale<'nav'>) {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot)
  useEffect(() => {
    refreshAuth()
  }, [])
  if (auth.status === 'authenticated') return null
  return (
    <div className={css.page}>
      {auth.status === 'checking'
        ? (
          <div className={css.progress} role="progressbar">
            <div className={css.progressBar} />
          </div>
        )
        : (
          <>
            <LoginView
              t={t}
              onSignIn={(value) => {
                void setToken(value)
              }}
            />
            {auth.invalid ? <div className={css.error}>{t('login.invalid')}</div> : null}
          </>
        )}
    </div>
  )
}
