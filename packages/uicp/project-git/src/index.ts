/**
 * UICP git project seam: creates per-user project workspaces by cloning a
 * Git repository on the server. Private repositories may carry a username
 * and password, stored through the dsh credential capability and injected
 * into git through an askpass helper so secrets never appear in URLs,
 * argv, or logs.
 * @module @deepseek-ai/dsh-uicp-project-git
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { bearerToken, createUserResolver } from '@deepseek-ai/dsh-uicp-user-identity'

export const name = 'uicp-project-git'
export const inject = ['webServer', 'credentials']

/** Git project seam configuration. */
export interface Config {
  /** Root holding `users/<userId>/projects/<name>`; defaults under the dsh home. */
  projectsRoot?: string
  /** Platform API base for JWT validation; defaults to the production UICP endpoint. */
  platformBase?: string
  /** Platform self-check path; defaults to `/user/user/self`. */
  selfPath?: string
}

/** One per-user project row in the listing. */
export interface ProjectInfo {
  name: string
  path: string
}

/** Options for one git invocation. */
interface GitRunOptions {
  cwd: string
  env: Record<string, string>
}

/** Git runner signature, injectable so tests never need a real repository. */
export type GitRunner = (args: string[], options: GitRunOptions) => Promise<void>

/** Test/extension seam for the git binary. */
export const internals: { runGit: GitRunner } = {
  runGit: async (args, options) => {
    const result = await new Promise<{ code: number | null; stderr: string }>((resolvePromise, reject) => {
      const child = spawn('git', args, { cwd: options.cwd, env: { ...process.env, ...options.env } })
      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => { stderr += String(chunk) })
      /* v8 ignore next -- a missing git binary surfaces as an error event; CI and the built smoke run with git present */
      child.on('error', reject)
      child.on('close', (code) => { resolvePromise({ code, stderr }) })
    })
    if (result.code !== 0) {
      throw new Error(`git ${args[0]} failed (${String(result.code)}): ${result.stderr.trim()}`)
    }
  },
}

/** A project name must be one safe path segment. */
function safeProjectName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..'
    && !name.includes('/') && !name.includes('\\')
    && !/[\u0000-\u001f]/.test(name)
}

/** Default project name from a repository URL (last path segment without `.git`). */
function projectNameFromUrl(repoUrl: string): string {
  const trimmed = repoUrl.replace(/\/+$/, '')
  const name = basename(trimmed).replace(/\.git$/, '')
  return safeProjectName(name) ? name : ''
}

/** A repository URL must be non-empty and free of control characters. */
function validRepoUrl(repoUrl: unknown): repoUrl is string {
  return typeof repoUrl === 'string'
    && repoUrl.trim() !== ''
    && !/[\u0000-\u001f]/.test(repoUrl)
}

/** Fixed askpass helper; secrets come from the environment, never the script. */
const ASKPASS_SCRIPT = `#!/bin/sh
case "$1" in
  *[Uu]sername*) printf '%s\\n' "$UWA_GIT_USER" ;;
  *[Pp]assword*) printf '%s\\n' "$UWA_GIT_PASS" ;;
  *) exit 1 ;;
esac
`

/** Git environment for one operation, with an askpass helper when credentials are present. */
async function gitEnv(
  projectsRoot: string,
  values: { username?: string; password?: string },
): Promise<Record<string, string>> {
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' }
  if (values.username !== undefined) env.UWA_GIT_USER = values.username
  if (values.password !== undefined) env.UWA_GIT_PASS = values.password
  if (env.UWA_GIT_USER !== undefined || env.UWA_GIT_PASS !== undefined) {
    env.GIT_ASKPASS = await writeAskpass(projectsRoot)
  }
  return env
}

/** Deterministic credential reference names for one user + project. */
function gitCredentialRefs(userId: string, project: string): { user: string; password: string } {
  const digest = createHash('sha256').update(`${userId}/${project}`).digest('hex').slice(0, 16)
  return {
    user: `UWA_GIT_USER_${digest}`,
    password: `UWA_GIT_PASS_${digest}`,
  }
}

/**
 * Register the per-user git project routes:
 * `POST /uicp/projects` clones a repository, `GET /uicp/projects` lists them.
 * @param ctx - host context with the webserver and credential capability.
 * @param config - seam configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const projectsRoot = config.projectsRoot ?? dshHomePath('uicp-projects')
  const resolveUser = createUserResolver(config)
  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const userIdOf = async (req: IncomingMessage, res: ServerResponse): Promise<string | undefined> => {
    const token = bearerToken(req)
    if (token === undefined) {
      json(res, 401, { status: 401, msg: 'missing platform token', data: null })
      return undefined
    }
    try {
      return (await resolveUser(token)).userId
    } catch {
      json(res, 401, { status: 401, msg: 'platform rejected the token', data: null })
      return undefined
    }
  }
  const userProjectsRoot = (userId: string): string => join(projectsRoot, 'users', userId, 'projects')

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: '/uicp/projects',
      handler: async (req, res) => {
        const userId = await userIdOf(req, res)
        if (userId === undefined) return
        if (req.method === 'GET') {
          const root = userProjectsRoot(userId)
          let entries: string[] = []
          try {
            entries = await readdir(root)
          } catch {
            // No projects yet: an empty listing, not an error.
          }
          const projects: ProjectInfo[] = entries.map(entry => ({ name: entry, path: join(root, entry) }))
          json(res, 200, { status: 0, data: { projects } })
          return
        }
        if (req.method !== 'POST') {
          json(res, 405, { status: 405, msg: 'method not allowed', data: null })
          return
        }
        let body: { repoUrl?: unknown; name?: unknown; username?: unknown; password?: unknown }
        try {
          const parsed = await readJsonBody(req)
          if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be an object')
          body = parsed
        } catch (error) {
          /* v8 ignore next -- only Error instances reach this catch; the String arm is a defensive backstop */
          json(res, 400, { status: 400, msg: error instanceof Error ? error.message : String(error), data: null })
          return
        }
        const repoUrl = body.repoUrl
        if (!validRepoUrl(repoUrl)) {
          json(res, 400, { status: 400, msg: 'repoUrl is required', data: null })
          return
        }
        const requestedName = typeof body.name === 'string' ? body.name : projectNameFromUrl(repoUrl)
        if (!safeProjectName(requestedName)) {
          json(res, 400, { status: 400, msg: 'project name must be a single path segment', data: null })
          return
        }
        const projectDir = join(userProjectsRoot(userId), requestedName)
        try {
          if (existsSync(projectDir)) {
            json(res, 409, { status: 409, msg: 'project already exists', data: null })
            return
          }
          await mkdir(join(userProjectsRoot(userId)), { recursive: true })
          const refs = gitCredentialRefs(userId, requestedName)
          const values: { username?: string; password?: string } = {}
          if (typeof body.username === 'string' && body.username !== '') {
            await ctx.credentials.set(credentialRef(refs.user), body.username)
            values.username = body.username
          }
          if (typeof body.password === 'string' && body.password !== '') {
            await ctx.credentials.set(credentialRef(refs.password), body.password)
            values.password = body.password
          }
          const env = await gitEnv(projectsRoot, values)
          try {
            await internals.runGit(['clone', repoUrl, projectDir], { cwd: projectsRoot, env })
          } finally {
            if (env.GIT_ASKPASS !== undefined) await rmAskpass(env.GIT_ASKPASS)
          }
          json(res, 200, { status: 0, data: { name: requestedName, path: projectDir } })
        } catch (error) {
          await rm(projectDir, { recursive: true, force: true })
          /* v8 ignore next -- only Error instances reach this catch; the String arm is a defensive backstop */
          json(res, 500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
        }
      },
    }),
    'uicp-project-git: project routes',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: '/uicp/projects/',
      handler: async (req, res) => {
        const userId = await userIdOf(req, res)
        if (userId === undefined) return
        const url = new URL(req.url ?? '/', 'http://project.local')
        const segments = url.pathname.split('/').filter(segment => segment !== '')
        const name = segments[2] ?? ''
        const action = segments[3]
        if (!safeProjectName(name) || action !== 'pull' || req.method !== 'POST') {
          json(res, 404, { status: 404, msg: 'project action not found', data: null })
          return
        }
        const projectDir = join(userProjectsRoot(userId), name)
        if (!existsSync(projectDir)) {
          json(res, 404, { status: 404, msg: 'project not found', data: null })
          return
        }
        try {
          const refs = gitCredentialRefs(userId, name)
          const username = await ctx.credentials.resolve(credentialRef(refs.user))
          const password = await ctx.credentials.resolve(credentialRef(refs.password))
          const values: { username?: string; password?: string } = {}
          if (username !== undefined) values.username = username.value
          if (password !== undefined) values.password = password.value
          const env = await gitEnv(projectsRoot, values)
          try {
            await internals.runGit(['pull'], { cwd: projectDir, env })
          } finally {
            if (env.GIT_ASKPASS !== undefined) await rmAskpass(env.GIT_ASKPASS)
          }
          json(res, 200, { status: 0, data: { name, ok: true } })
        } catch (error) {
          /* v8 ignore next -- only Error instances reach this catch; the String arm is a defensive backstop */
          json(res, 500, { status: 500, msg: error instanceof Error ? error.message : String(error), data: null })
        }
      },
    }),
    'uicp-project-git: pull route',
  )
}

/** Write the askpass helper next to the projects root and make it executable. */
async function writeAskpass(projectsRoot: string): Promise<string> {
  const script = join(projectsRoot, `.askpass-${process.pid}`)
  await writeFile(script, ASKPASS_SCRIPT, { mode: 0o700 })
  await chmod(script, 0o700)
  return script
}

/** Remove a consumed askpass helper. */
async function rmAskpass(script: string): Promise<void> {
  await rm(script, { force: true })
}

/** Read the JSON request body; rejects non-JSON payloads. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let text = ''
    req.on('data', (chunk) => { text += String(chunk) })
    req.on('end', () => {
      try {
        resolveBody(text === '' ? undefined : JSON.parse(text) as unknown)
      } catch {
        reject(new Error('request body must be JSON'))
      }
    })
    req.on('error', reject)
  })
}
