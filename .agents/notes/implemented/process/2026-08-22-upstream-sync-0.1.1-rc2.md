# Agent Note: Upstream sync to dsh 0.1.1-rc.2

Status: implemented

English | [中文](2026-08-22-upstream-sync-0.1.1-rc2.zh.md)

## Problem

The fork tracked deepseek-harness at 0.1.0-rc.5; upstream advanced 854 commits to `b150a551b8` (0.1.1-rc.2), restructuring the client shell (web-react → ui-renderer, schema-form split, slot-based brand system, client-modules boot facade) and the build gates. The merge had to land the UICP driver on the new base without losing the fork's Underwork branding or the UICP composition.

## Decision

Fast-forward `master` to upstream, merge into `codex/uicp-m0`, and resolve the 17-file conflict surface by taking upstream's newer architecture where it superseded the fork's:

- Branding moves to the new brand slots (`sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark`) as occupants in ui-uicp-nav; upstream's FishLogo/BrandWordmark are restored alongside the fork's AppLogo/AppWordmark.
- The merged `pnpm-lock.yaml` mixed react 18 with react-dom 19 for the root `@testing-library/react` peer resolution (react 19 entered the graph via eureka-preview-host), which made every client component render empty. Root `package.json` now pins react/react-dom 18 devDependencies so the root peer resolution stays coherent.
- `apps/web/dist` held the pre-merge bundle while the server injected the new client-modules boot facade, colliding into "window.__ModuleLoader__ already installed (double boot?)". Rebuilding the frontend restores a coherent boot; the fork's web title is pinned to Underwork Harness in `apps/web/vite.config.ts` (HTML injection + a `process.env.DSH_CLIENT_TITLE` define fallback).
- The fork does not support external CLI product integrations (Codex / Claude Code subagent providers; the uicp preset already disables them), so the real-product suites skip unless `DSH_RUN_CLI_PRODUCT_TESTS=1` is set.

## Alternatives considered

- **Regenerating the lockfile from scratch** — rejected: it would re-resolve every range against the private registry and drift from upstream's pins; a minimal root react/react-dom pin fixes the one broken peer resolution.
- **Preserving the pre-merge `brand` service** — rejected: upstream's slot architecture supersedes it; keeping both would leave dead registrations and type drift.

## Consequences

The fork now compiles and tests against 0.1.1-rc.2 (host + client builds pass; UICP/UI suites and the keyless app-package snapshot are green; the built-boot smoke boots the rebuilt frontend). Shared-file divergences beyond the handbook's original list are root `package.json` (react pins), `apps/web/vite.config.ts` (title), and `apps/web/index.html` (title/icon) — recorded in IMPLEMENTATION.md §12. The full unit suite's remaining failures are environment-limited (parallel-load flakiness passes in isolation; external CLI product suites are now skipped by policy).
