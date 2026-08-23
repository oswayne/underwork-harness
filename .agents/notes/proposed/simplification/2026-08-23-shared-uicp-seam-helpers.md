# Agent Note: Shared UICP seam HTTP and auth helpers

Status: proposed

English | [中文](2026-08-23-shared-uicp-seam-helpers.zh.md)

## Problem

The fork's uicp host plugins hand-roll the same HTTP/auth machinery in each package:

- `bearerToken` exists three times: a private copy in `packages/uicp/preview-backend/src/index.ts:40`, an exported copy in `packages/uicp/user-identity/src/index.ts:67`, and a consumer import in `packages/uicp/project-git`.
- `readJsonBody` is duplicated in `preview-backend` and `project-git`.
- The `json = (status, body)` responder closure is redefined per handler — 7 copies in `preview-backend` alone, plus copies in `user-identity` and `project-git` — with slightly different 401 bodies.
- The defensive `error instanceof Error ? error.message : String(error)` ternary repeats across ~13 lines, each carrying its own `v8 ignore` reason.

All consumers are production routes in fork-owned packages; no upstream file needs to change.

## Proposal

Add one fork-owned helper package (e.g. `packages/uicp/seam-http`) exporting:

- `bearerToken(req)` and `requireUser(req, respond)` returning the per-user key or answering a canonical 401;
- `readJsonBody(req)`;
- `respond(res, status, body)`;
- `errorMessage(error)` with a single `v8 ignore` explaining that only `Error` instances reach these catches.

Rewrite `preview-backend`, `user-identity`, and `project-git` to consume the helpers, delete the local copies, and collapse the duplicated `v8 ignore` reasons into one place.

## Alternatives considered

The copies are small (each 8–15 lines), and the 401 bodies currently differ between packages (`preview-backend` says "missing platform token", others say "platform rejected the token"). Keeping them locally avoids a new workspace package and its lockfile entry. The cost is already visible: 7 identical responder closures, three bearer parsers, and ~13 repeated ignore reasons that drift independently.

## Acceptance criteria

- The three uicp host packages import the helpers and contain no local `bearerToken`/`readJsonBody`/`json` copies.
- All route tests still pass; the 401 response body is unified to one shape across the seam.
- `pnpm run hygiene`, `lint`, and per-package 100% coverage stay green; the new package is registered in `tsconfig.base.json`/`tsconfig.host.json` like the other uicp packages.

## Risks

A new package is more surface for upstream merges, but it sits entirely in fork-owned `packages/uicp/` and follows the existing per-package registration pattern. The 401 body unification is a behavior change only for clients that parse the `msg`; the web client only checks the status code.
