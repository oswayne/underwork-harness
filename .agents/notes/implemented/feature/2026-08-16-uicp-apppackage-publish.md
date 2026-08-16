# Agent Note: UICP app-package publish tool

Status: implemented

English | [中文](2026-08-16-uicp-apppackage-publish.zh.md)

## Problem

The M3 acceptance requires the full loop "generate → validate → preview → auto-test → adopt → save" with API save as the last step. Without a tool, saving meant hand-running curl sequences against the platform, with no adoption gate and no idempotency.

## Decision

[`@deepseek-ai/dsh-tool-apppackage-publish`](../../../../packages/uicp/tool-apppackage-publish/README.md) registers `apppackage_publish`: it requires `adopted: true`, then upserts App → Entity → fields → funcs → menu → page through a thin HTTP client (`Authorization` + `Tenant` headers), listing first and creating only missing records. Fixture data is never written. The HTTP client is injectable, so tests run against an in-memory platform.

## Alternatives considered

- **Reusing the shell import script from the tool** — rejected: tools must not shell out to curl for platform writes; a typed client keeps errors structured and testable.

## Consequences

The four publication gates stay prerequisites the model runs before this tool; API save is the final step and the platform-side happy-path fallback remains manual.
