import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { setToken } from './token.ts'

/** JWT input seat rendered by the tenant browser when no token is stored. */
export function LoginView({ t }: PropsLocale<'nav'>) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = value.trim()
        if (trimmed !== '') void setToken(trimmed)
      }}
    >
      <label htmlFor="uicp-jwt">{t('login.title')}</label>
      <input
        id="uicp-jwt"
        type="password"
        value={value}
        onChange={(event) => { setValue(event.target.value) }}
        placeholder={t('login.placeholder')}
      />
      <button type="submit">{t('login.submit')}</button>
    </form>
  )
}
