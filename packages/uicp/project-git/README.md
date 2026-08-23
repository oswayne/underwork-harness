# uicp/project-git — per-user git project workspaces

English | [中文](README.zh.md)

Creates standard-mode project workspaces by cloning a Git repository on the
server into the caller's private project root
(`<projectsRoot>/users/<userId>/projects/<name>`). Private repositories may
carry a username and password, stored through the dsh credential capability
(`$DSH_HOME/.credentials.yaml`, 0600) and injected into git via an askpass
helper — secrets never appear in clone URLs, argv, or logs.

## Routes

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/uicp/projects` | `{ repoUrl, name?, username?, password? }` with `Authorization: Bearer <JWT>`: clones the repository into the user's project root. 401 without a valid token; 400 for a bad URL/name/body; 409 when the project exists. |
| `GET` | `/uicp/projects` | Lists the current user's projects. |
| `POST` | `/uicp/projects/<name>/pull` | Runs `git pull` in the project with the stored credentials. 404 for a missing project or unknown action. |

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `projectsRoot` | `$DSH_HOME/uicp-projects` | Root holding `users/<userId>/projects/<name>`. |
| `platformBase` | `https://api.underwork.cn/uicp` | Platform API base for JWT validation. |
| `selfPath` | `/user/user/self` | Platform endpoint answering the current user. |

## Security

- Credentials are stored per user + project as dsh credential references and
  resolved at clone time; the raw password never enters the repository URL,
  the git argv, or any log line.
- The askpass helper is a fixed template reading `UWA_GIT_USER`/`UWA_GIT_PASS`
  from the process environment, created 0700 for one clone and removed after.
- Project names are validated as single path segments, and a failed clone
  removes the partial directory.
