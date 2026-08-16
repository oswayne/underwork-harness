# Agent Note: UICP eureka schema sync script

Status: implemented

English | [中文](2026-08-16-uicp-eureka-schema-sync.zh.md)

## Problem

`tool-apppackage-validate` validates Eureka page JSON against a vendored `data/eureka-schema.json` snapshot. Without a sync path, the snapshot drifts from the installed `eureka` release and validation silently gates against an outdated contract.

## Decision

[`scripts/uicp-sync-eureka-schema.ts`](../../../../scripts/uicp-sync-eureka-schema.ts) compares the vendored schema with the installed pinned `eureka` package's `schema.json` export and either copies it (`pnpm run sync:eureka-schema`) or reports drift in check mode (`--check`, for CI). The source of truth is the workspace-installed package version, not a second URL or a local repo path.

## Alternatives considered

- **Fetching the schema from the private registry at check time** — rejected: CI may lack registry access; the installed package is already pinned and verified by the install.

## Consequences

Schema bumps ride the package update: bump `eureka`, run the sync script, and commit the vendored snapshot with the same change. `--check` makes drift a gate failure.
