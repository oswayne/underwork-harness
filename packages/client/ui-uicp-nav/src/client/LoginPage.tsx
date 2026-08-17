import { useEffect } from 'react'
import { useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LoginView } from './LoginView.tsx'
import { authSnapshot, refreshAuth, setToken, subscribeAuth } from './token.ts'
import css from './LoginPage.module.css'

/**
 * Full-window sign-in gate (shell.overlay entry): covers the whole frame with
 * the JWT form until a token exists, then renders nothing. Login state lives
 * in the shared auth store so the sidebar browser reacts to sign-in/logout.
 */
export function LoginPage({ t }: PropsLocale<'nav'>) {
  const token = useSyncExternalStore(subscribeAuth, authSnapshot)
  useEffect(() => {
    refreshAuth()
  }, [])
  if (token !== undefined) return null
  return (
    <div className={css.page}>
      <div className={css.card}>
        <LoginView
          t={t}
          onSignIn={(value) => {
            void setToken(value)
          }}
        />
      </div>
    </div>
  )
}
