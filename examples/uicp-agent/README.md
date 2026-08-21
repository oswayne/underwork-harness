# uicp-agent

English | [中文](README.zh.md)

This directory owns the replay and real-model test composition for the UICP low-code platform driver's headless tool surface: one root agent over `apppackage_validate`, `apppackage_test`, and `apppackage_version`, plus JSONL persistence. It explicitly mounts the shared agent spine, one root agent, persistence, checkpoint policy, and the local filesystem stack; it is not a second product entry point.

## Snapshot suite

[`tests/uicp.snapshot.ts`](tests/uicp.snapshot.ts) boots the replay composition ([`uicp.cordis.snapshot.yml`](uicp.cordis.snapshot.yml)), scripts one model call per tool through `llm-replay`, runs the real tools against a copied `sre-w` demo package, and pins the normalized stream and persisted session log. The scenario covers the keyless "validate → test → version" loop of the AppPackage driver.

```sh
# keyless replay
pnpm run test:snapshot -t 'uicp app-package'

# re-record goldens after an intended change
DSH_SNAPSHOT=refresh pnpm run test:snapshot -t 'uicp app-package'
```

## Run with a real model

The composition is a normal Cordis app; drive it with the same fixture driver after exporting `DEEPSEEK_API_KEY`:

```sh
pnpm exec tsx examples/uicp-agent/tests/fixtures/headless-driver.ts \
  examples/uicp-agent/cordis.yml "validate the app package at app-packages/cszh/sre-w"
```

The stream emitted by the driver is test infrastructure, not a supported CLI output format.
