# Agent Note: Per-user Git project workspaces

Status: implemented

English | [中文](2026-08-22-uicp-project-git.zh.md)

## Problem

Standard-mode users on the shared SaaS server have no way to bring their own code into the workspace: the previous model only knew server-side paths, which mean nothing to a remote user. The team confirmed that creating a project should take a Git repository URL, with username/password for private repositories.

## Decision

`packages/uicp/project-git` implements clone-on-create for per-user standard-mode projects:

- `POST /uicp/projects` validates the JWT (through the user-identity resolver), stores optional username/password via the dsh credential capability (`$DSH_HOME/.credentials.yaml`, 0600), and clones into `<projectsRoot>/users/<userId>/projects/<name>`; `GET /uicp/projects` lists the caller's projects.
- Credentials are injected through a fixed askpass helper reading `UWA_GIT_USER`/`UWA_GIT_PASS` from the process environment, created 0700 per clone and removed afterwards — secrets never enter the clone URL, argv, or logs.
- Project names are single path segments; a duplicate answers 409 and a failed clone removes the partial directory.
- The git runner is injectable (`internals.runGit`) so unit tests never need a real repository; the default spawns the system git.

UWA app packages stay auto-created by the server and do not use this seam. The client-side "new project" form and later `pull` reuse of the stored credentials remain pending.

## Alternatives considered

- **Uploading an archive instead of cloning** — rejected for the primary path: Git is the natural transport for code projects and carries version history; upload stays available as a future option.
- **Storing credentials in the clone URL or a project-local git config** — rejected: both leak the secret into durable files; the credential capability plus askpass keeps it out of the repository.

## Consequences

Standard-mode onboarding on the shared server now has a credential-safe clone path and per-user private project roots, consistent with the M5 directory model (shared app packages via ownership mapping, private code via per-user directories). The real git runner is exercised by unit tests with local repositories; the client form and pull endpoint are the next steps.
