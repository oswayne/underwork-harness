# Agent Note: UWA 模式 agent name

Status: implemented

English | [中文](2026-08-22-uwa-agent-name.zh.md)

## Problem

The fork's UICP agent preset (`apps/cli/config/agent-presets/uicp/`) displayed and introduced itself as "UICP 低代码平台生成驱动器"; the persona and the headless example repeated the generic driver title. The product needed a stable, short product identity for the agent users select and the model answers to.

## Decision

The agent is named **UWA 模式** everywhere a user or the model sees the agent's own name:

- `apps/cli/config/agent-presets/uicp/preset.yml` carries `name: UWA 模式`; the preset picker and preset metadata surface this name.
- The persona in `apps/cli/config/agent-presets/uicp/agent.cordis.yml` opens with "You are UWA 模式, the UICP low-code platform generation driver …", so the model identifies itself by the product name.
- The headless example's inline persona in `examples/uicp-agent/cordis.yml` mirrors the same opening.

The technical driver name ("UICP low-code platform driver") and the `uicp` preset id stay unchanged; the rename covers the agent's product identity only. The fork's Underwork branding context is recorded in the [upstream sync note](../process/2026-08-22-upstream-sync-0.1.1-rc2.md).

## Alternatives considered

- **Renaming the preset id/directory `uicp` → `uwa`** — rejected: the id is an internal mount key referenced by profiles and docs; the decision names the agent, not the composition key.
- **Changing the driver naming in package READMEs** — rejected: those name the technical driver seam, which keeps its contract name.

## Consequences

Users select "UWA 模式" in the preset picker and the model receives its product name in the system prompt. No keyless snapshot pins the persona text, so the rename does not churn golden files; a later rebrand needs only `preset.yml` and the two persona lines.
