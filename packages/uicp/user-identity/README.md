# uicp/user-identity — platform user identity seam

English | [中文](README.zh.md)

Validates the platform JWT against the platform self endpoint
(`/user/user/self`), caches the result per credential, and persists user
records in an append-only JSONL so later surfaces can display user info
without re-validating. The credential hash keys the cache; the raw token never
touches the store or logs.

## Route

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/uicp/user/me` | Resolves `Authorization: Bearer <JWT>` to the platform user and answers `{ status: 0, data: { user } }`; 401 when the token is missing or the platform rejects it. |

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `platformBase` | `https://api.underwork.cn/uicp` | Platform API base for the self check. |
| `selfPath` | `/user/user/self` | Platform endpoint answering the current user. |
| `usersFile` | `$DSH_HOME/uicp-users/users.jsonl` | Append-only JSONL holding user records. |
| `cacheTtlMs` | `300000` | How long a validated credential is trusted before re-checking. |

## Storage

One JSON record per line: `{ userId, name?, profile, seenAt }`, last write per
user id wins on read. The file compacts itself once it grows past 512 lines,
rewriting only the latest record per user. `profile` keeps the raw platform
self payload so display surfaces can evolve without a migration.
