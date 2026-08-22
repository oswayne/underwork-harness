# Agent Note: UICP user identity and per-user isolation

Status: implemented

English | [中文](2026-08-22-uicp-user-identity.zh.md)

## Problem

The web app is deployed as one server for a team; multiple users enter with different platform JWTs. The preview sandbox was already isolated per credential, but there was no user identity server-side: sessions and workspaces were listed globally and no surface could show who the current user is.

## Decision

The team confirmed the multi-user design (IMPLEMENTATION.md §15, M5):

- **Isolation level**: plan A (client/UI layer) — each user sees only their own workspaces and sessions; the sidebar lists are filtered by ownership. Server-side enforcement stays a deferred optional hardening (P3) because it would fork the upstream api-proxy.
- **App packages**: visible to every user without permission restrictions; each user's work content differs. Entering a workspace snapshots the local state and pulls the latest platform state as session context (P1) so users do not overwrite each other.
- **User info persistence**: an independent append-only JSONL (`$DSH_HOME/uicp-users/users.jsonl`), upsert by user id with compaction, keeping the raw self payload for later display.

P0 ships `packages/uicp/user-identity`: the host plugin validates the JWT against `/user/user/self`, caches per credential (TTL 5 min, keyed by token hash), persists the user record, and answers `GET /uicp/user/me`. P1 (ownership records + client filtering + entry sync) and P2 (user display) follow.

## Alternatives considered

- **Server-side enforcement (plan B)** — deferred: it requires replacing or patching the upstream api-proxy RPC dispatch, widening the merge surface; UI-layer isolation covers the team deployment for now.
- **Reusing `dsh-storage-json` for user records** — rejected by decision: an independent JSONL keeps the user ledger self-contained, append-only, and trivially inspectable.
- **Per-user app-package roots** — rejected: the team model keeps app packages shared; isolation applies to session/workspace visibility and sandbox state, not to the package files.

## Consequences

The identity seam is additive and lives entirely in fork-owned packages, so upstream merges stay conflict-free; the only mechanical shared-file touch is the new `tsconfig.host.json` project reference. Adding the workspace package requires regenerating `pnpm-lock.yaml` from a network-capable machine (the private registry is unreachable from this session). P1 and P2 remain pending.
