import { useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './LoginView.module.css'

/** JWT input seat rendered by the tenant browser when no token is stored. */
export function LoginView({
  t,
  onSignIn,
}: PropsLocale<'nav'> & { onSignIn?: (token: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className={css.form}
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = value.trim()
        if (trimmed !== '' && onSignIn !== undefined) onSignIn(trimmed)
      }}
    >
      <div className={css.brand}>
        <img className={css.logo} src="/uicp-logo.jpg" alt="" />
        <span className={css.title}>{t('login.brand')}</span>
      </div>
      <Input
        id="uicp-jwt"
        type="password"
        aria-label={t('login.title')}
        value={value}
        onChange={(event) => { setValue(event.target.value) }}
        placeholder={t('login.placeholder')}
      />
      <Button type="submit" variant="primary" disabled={value.trim() === ''}>
        {t('login.submit')}
      </Button>
    </form>
  )
}
