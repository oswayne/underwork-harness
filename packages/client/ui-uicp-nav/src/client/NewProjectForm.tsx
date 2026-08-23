import { useState, type FormEvent } from 'react'
import { useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { createSession } from './nav.ts'
import { authSnapshot, subscribeAuth } from './token.ts'
import css from './NewProjectForm.module.css'

/**
 * Sidebar-foot Git project creation: asks for the repository URL and optional
 * credentials, creates the server-side clone through `/uicp/projects`, and
 * opens a standard-mode session on the resulting workspace.
 */
export function NewProjectForm({ t }: PropsLocale<'nav'>) {
  const auth = useSyncExternalStore(subscribeAuth, authSnapshot)
  const [open, setOpen] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const token = auth.status === 'authenticated' ? auth.token : undefined
    if (token === undefined || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await fetch('/uicp/projects', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoUrl,
          name: name === '' ? undefined : name,
          username: username === '' ? undefined : username,
          password: password === '' ? undefined : password,
        }),
      })
      const body = (await res.json()) as { status?: number; data?: { path?: string }; msg?: string }
      if (body.status !== 0 || body.data?.path === undefined) throw new Error(body.msg ?? 'create project failed')
      await createSession(body.data.path)
      setOpen(false)
      setRepoUrl('')
      setName('')
      setUsername('')
      setPassword('')
    } catch (reason) {
      /* v8 ignore next -- only Error instances reach this catch; the String arm is a defensive backstop */
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button className={css.trigger} type="button" onClick={() => { setOpen(true) }}>{t('newProject.open')}</button>
  }
  return (
    <form className={css.form} onSubmit={(event) => { void submit(event) }}>
      <input
        value={repoUrl}
        onChange={(event) => { setRepoUrl(event.target.value) }}
        placeholder={t('newProject.repoUrl')}
        required
      />
      <input
        value={name}
        onChange={(event) => { setName(event.target.value) }}
        placeholder={t('newProject.name')}
      />
      <input
        value={username}
        onChange={(event) => { setUsername(event.target.value) }}
        placeholder={t('newProject.username')}
        autoComplete="username"
      />
      <input
        value={password}
        onChange={(event) => { setPassword(event.target.value) }}
        placeholder={t('newProject.password')}
        type="password"
        autoComplete="current-password"
      />
      <div className={css.actions}>
        <button type="submit" disabled={busy}>{busy ? t('newProject.creating') : t('newProject.create')}</button>
        <button type="button" onClick={() => { setOpen(false) }}>{t('newProject.cancel')}</button>
      </div>
      {error !== undefined ? <div className={css.error}>{error}</div> : null}
    </form>
  )
}
