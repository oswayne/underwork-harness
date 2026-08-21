import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeSessionLog,
  normalizeStdout,
  scrubRequestHeaders,
  type NormalizeContext,
} from '@deepseek-ai/dsh-acp-snapshot'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const snapshotsDir = join(dirname(fileURLToPath(import.meta.url)), 'snapshots')
const scenarioDir = join(snapshotsDir, 'uicp-apppackage')
const streamExpected = join(scenarioDir, 'stream-json.expected.jsonl')
const sessionExpected = join(scenarioDir, 'session.expected.jsonl')
const configPath = fileURLToPath(new URL('../uicp.cordis.snapshot.yml', import.meta.url))
const binScript = fileURLToPath(new URL('./fixtures/headless-driver.ts', import.meta.url))
const demoPackageDir = fileURLToPath(new URL('../../../app-packages/cszh/sre-w', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

interface JsonObject {
  [key: string]: unknown
}

interface PersistedLog {
  readonly content: string
  readonly header: JsonObject
}

function parseJsonl(content: string): JsonObject[] {
  return content.split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as JsonObject)
}

function contextFromLogs(contents: readonly string[]): NormalizeContext {
  const headers = contents.map(content => parseJsonl(content)[0])
  return {
    sessionIds: headers.flatMap(header => typeof header?.id === 'string' ? [header.id] : []),
    cwd: typeof headers[0]?.cwd === 'string' ? headers[0].cwd : '\0no-cwd\0',
  }
}

function normalizeHeadlessStream(rawStdout: string, cwd: string): string {
  const records = parseJsonl(rawStdout)
  if (records.length === 0) throw new Error('uicp snapshot emitted no stream-json records')
  const final = records.at(-1)
  if (final?.type !== 'result') throw new Error('uicp snapshot did not end with a result record')
  if (records.slice(0, -1).some(record => record.type !== 'session_event')) {
    throw new Error('uicp snapshot emitted a non-event record before its result')
  }

  const sessionIds = [...new Set(records.flatMap(record => typeof record.sessionId === 'string' ? [record.sessionId] : []))]
  if (sessionIds.length !== 1) throw new Error(`uicp snapshot streamed ${sessionIds.length} main session ids`)
  const context: NormalizeContext = { sessionIds, cwd }
  const events = records.slice(0, -1).map((record) => {
    if (record.event === null || typeof record.event !== 'object' || Array.isArray(record.event)) {
      throw new Error('uicp snapshot emitted an invalid session event')
    }
    return record.event as JsonObject
  })
  const normalizedEvents = parseJsonl(scrubRequestHeaders(normalizeSessionLog(
    `${events.map(event => JSON.stringify(event)).join('\n')}\n`,
    context,
  )))
  const normalizedRecords = records.map((record, index) => index < normalizedEvents.length
    ? { ...record, event: normalizedEvents[index] }
    : record)
  return normalizeStdout(`${normalizedRecords.map(record => JSON.stringify(record)).join('\n')}\n`, context)
}

async function scenarioPrompt(dir: string, label: string): Promise<string> {
  const input = JSON.parse(await readFile(join(dir, 'input.json'), 'utf8')) as {
    steps?: { op?: unknown; text?: unknown }[]
  }
  const prompt = input.steps?.find(step => step.op === 'prompt')?.text
  if (typeof prompt !== 'string') throw new Error(`${label} input has no prompt step`)
  return prompt
}

async function persistedLogs(cwd: string, root: string = join(cwd, '.sessions')): Promise<PersistedLog[]> {
  const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('.jsonl'))
  return Promise.all(files.map(async (file) => {
    const content = await readFile(join(root, file), 'utf8')
    return { content, header: parseJsonl(content)[0] ?? {} }
  }))
}

/** Extract every text block from one tool-result message's content list. */
function toolResultText(record: JsonObject): string {
  const data = record.data as JsonObject | undefined
  const message = data?.message as JsonObject | undefined
  const blocks = message?.content as JsonObject[] | undefined
  const parts: string[] = []
  for (const block of blocks ?? []) {
    const content = block.content
    if (Array.isArray(content)) {
      for (const inner of content) {
        if (typeof inner === 'object' && inner !== null && typeof (inner as JsonObject).text === 'string') {
          parts.push(String((inner as JsonObject).text))
        }
      }
    } else if (typeof content === 'string') {
      parts.push(content)
    }
  }
  return parts.join('\n')
}

describe('uicp app-package driver snapshots', () => {
  it('replays validate/test/version through the assembled UICP driver', async () => {
    const prompt = await scenarioPrompt(scenarioDir, 'uicp-apppackage')
    let runCwd = ''
    const result = await runLoaderSmoke({
      label: 'uicp apppackage headless stream-json snapshot',
      tempDirPrefix: 'uicp-snapshot-apppackage-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, prompt],
      tsconfigPath,
      env: {
        DSH_SNAPSHOT: 'replay',
        DSH_SNAPSHOT_FILE: join(scenarioDir, 'session.jsonl'),
        DSH_SNAPSHOT_OVERRIDE: join(scenarioDir, 'replay.override.json'),
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--disable-warning=ExperimentalWarning'].filter(Boolean).join(' '),
      },
      prepare: async (cwd) => {
        runCwd = cwd
        const packageDir = join(cwd, 'app-packages', 'cszh', 'sre-w')
        await cp(demoPackageDir, packageDir, { recursive: true })
        // The demo package carries no functions; seed one so the sandbox test
        // tool has a funcs/ tree to load and validation reports no empty-funcs
        // warning.
        const funcDir = join(packageDir, 'funcs', 'sre-work-work-order')
        await mkdir(funcDir, { recursive: true })
        await writeFile(join(funcDir, 'snapshot-hello.js'), "return { status: 0, data: { message: 'snapshot-ok' } }\n")
        await writeFile(
          join(funcDir, 'snapshot-hello.meta.json'),
          `${JSON.stringify({ identifier: 'snapshot-hello', name: '快照探针', type: 'static' }, null, 2)}\n`,
        )
      },
      inspect: async (cwd) => {
        const logs = await persistedLogs(cwd)
        expect(logs).toHaveLength(1)
        const log = logs[0]
        if (log === undefined) throw new Error('uicp snapshot did not persist its session')
        const records = parseJsonl(log.content)
        const calls = records.filter(record => record.type === 'tool/call')
          .map(record => (record.data as JsonObject | undefined)?.name)
        expect(calls).toEqual(['apppackage_validate', 'apppackage_test', 'apppackage_version'])

        const toolResults = records.filter(record => record.type === 'tool/result')
        expect(toolResults).toHaveLength(3)
        const validateText = toolResultText(toolResults[0] as JsonObject)
        expect(validateText).toContain('apppackage_validate: OK')
        expect(validateText).not.toContain('[error]')
        const testText = toolResultText(toolResults[1] as JsonObject)
        expect(testText).toContain('apppackage_test: PASS (37/37)')
        const versionText = toolResultText(toolResults[2] as JsonObject)
        expect(versionText).toContain('apppackage_version: snapshot')
        expect(versionText).toContain('version: v1')

        // The version snapshot materialized product files and excluded the
        // tests/ and versions/ trees.
        const versionRoot = join(cwd, 'app-packages', 'cszh', 'sre-w', 'versions', 'v1')
        const versionFiles = await readdir(versionRoot, { recursive: true })
        for (const file of [
          'app.json',
          'tenant.json',
          'menus.json',
          'entities/sre-work-work-order.json',
          'funcs/sre-work-work-order/snapshot-hello.js',
          'pages/preserve-list.json',
          'data/sre-work-work-order.json',
        ]) {
          expect(versionFiles).toContain(file)
        }
        expect(versionFiles).not.toContain('tests/apppackage.cases.json')

        // The final assistant message carries the pinned marker.
        const finalAssistant = [...records].reverse().find(record => record.type === 'assistant/message')
        expect(JSON.stringify(finalAssistant)).toContain('UICP_APP_PACKAGE_OK')

        const context = contextFromLogs([log.content])
        const session = scrubRequestHeaders(normalizeSessionLog(log.content, context))
        if (refreshing) await writeFile(sessionExpected, session)
        expect(session).toBe(await readFile(sessionExpected, 'utf8'))
        expect(session).toContain('apppackage_validate')
        expect(session).toContain('apppackage_test')
        expect(session).toContain('apppackage_version')
        expect(session).toContain('UICP_APP_PACKAGE_OK')
      },
    })

    expect(result.stderr).toBe('')
    const normalized = normalizeHeadlessStream(result.stdout, runCwd)
    if (refreshing) await writeFile(streamExpected, normalized)
    expect(normalized).toBe(await readFile(streamExpected, 'utf8'))
    expect(normalized).toContain('UICP_APP_PACKAGE_OK')
    expect(normalized).toContain('apppackage_validate')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
