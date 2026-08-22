# Agent Note: URL jwt handoff for the web app token

Status: implemented

English | [中文](2026-08-22-url-jwt-handoff.zh.md)

## Problem

The web app requires a platform JWT before it can list tenants or open a workspace, and the token lives in browser localStorage (`uicp.platform.token`). Other pages need a way to navigate into the app with a fresh credential instead of forcing the user to paste the JWT into the sign-in form.

## Decision

The app accepts a `jwt` query parameter on the page URL as the token handoff. The effective token resolves URL `jwt` first, then the stored token, then the in-memory value (`getToken` in `packages/client/ui-uicp-nav/src/client/token.ts`). On `refreshAuth`:

- A valid URL token is adopted into localStorage before the parameter is dropped from the URL, so a reload without the handoff URL stays signed in.
- An invalid URL token clears the stored token and the parameter, so the sign-in form can take over without the stale parameter bouncing the user back.

The `jwt` parameter is removed from the URL through `history.replaceState` after it is consumed, keeping the credential out of the address bar and history.

## Alternatives considered

- **Only preferring the URL token for the current session without persisting it** — rejected: a reload without the handoff parameter would fall back to the previous stored token and sign the user out of the intended credential.
- **Keeping the `jwt` parameter in the URL after consumption** — rejected: the credential would linger in the address bar and history; the parameter is a handoff, not durable state.

## Consequences

Cross-page navigation can carry `?jwt=<token>` and the app signs in directly; the priority order is URL jwt, local token, in-memory token. The token is validated against `/user/user/self` exactly once per effective token because `refreshAuth` shares its in-flight validation. The parameter cleanup runs only in browsers, so headless and test runs without a `window` are unaffected.
