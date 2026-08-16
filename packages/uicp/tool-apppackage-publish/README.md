# @deepseek-ai/dsh-tool-apppackage-publish

English | [中文](README.zh.md)

Model-facing API save for UICP app packages. After the user explicitly adopts the package (`adopted: true`), the tool upserts the directory onto the platform idempotently in App → Entity → fields → funcs → menu → page order, reusing existing records by identifier/path. Fixture data is never written to the platform.

## Tool

`apppackage_publish(directory, baseUrl, token, tenantId, adopted)`:

- refuses without `adopted: true` (the user's explicit adoption gate);
- lists first and only creates missing records, so re-runs are idempotent;
- never writes `data/` fixtures (local sandbox only);
- returns `{ ok, appId, created: { app, entities, fields, funcs, menu, page } }`.

The four publication gates (static validation, automated tests, sandbox-platform contract consistency, user adoption) are prerequisites run by the model before this tool.

## Model Experience

The tool description tells the model that API save is the last step and requires the user's adoption; the terminal render reports what was created versus reused.

## Known Limitations and Deferred Work

- Platform-side rollback is out of scope (handled by the platform); publication order hints for cross-app dependencies are surfaced by `apppackage_validate`.
