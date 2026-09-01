# Nexus Kitchen Connector — Standalone Termux Package Report

## Result

READY FOR TERMUX INSTALL. The standalone package is in `tools/kitchen-connector-standalone/` and reuses the validated connector sources from commit `5cc781a` without changing ORDER or Catalog protocol semantics.

## Why monorepo `npm ci` fails on Termux

The ERP root dependency graph includes `bcrypt@6`, whose Android/Termux installation can fall back to a `node-gyp rebuild` native compilation path. The local device does not need bcrypt, Next.js, Prisma, React, Auth.js, PostgreSQL tooling, migrations, or any ERP server component. Altering bcrypt would expand scope and risk the server application, so the connector now has an independent npm boundary.

## Architecture

The standalone package compiles these already validated source modules directly:

- `runtime.ts`: HTTPS client, authentication header, heartbeat, job claim, ACK/FAIL, atomic spool and recovery;
- `fusion-xml1745.ts`: ORDER grammar, TCP transport, ACK/NACK classification, persistent delivery ledger and uncertain-delivery protection;
- `fusion-catalog.ts`: read-only DATA_REQ reader, required ACK sequence, canonical model, fingerprint and atomic snapshot;
- `catalog-sync-runtime.ts`: interval/manual scheduling, single-flight lock, bounded backoff and changed-record upload;
- `fusion.ts`: executable runner.

TypeScript emits plain JavaScript under the ignored `dist/` directory. A built-in Node post-build script adds explicit `.js` extensions required by ESM. `postinstall` builds automatically, so the target workflow is `npm ci` followed by `npm start`. The installed runtime uses only Node built-ins: `crypto`, `fs/promises`, `http/fetch`, `net`, `os`, `path`, timers and process APIs.

## Dependency tree

The complete npm tree contains only:

```text
@nexus-erp/kitchen-connector-standalone
├─ @types/node
│  └─ undici-types
└─ typescript
```

There are zero production dependencies and zero audit findings. Lockfile inspection confirms:

- bcrypt: absent;
- node-gyp: absent;
- Prisma: absent;
- Next.js: absent;
- React: absent;
- native compilation install scripts: absent.

## Android and Node compatibility

The package was installed, built and tested in the exact target runtime `Node.js v26.3.1` with `npm 11.17.0`: PASS. It was also tested on Node 22 and Node 26.8.1. No native addon or architecture-specific binary is installed, so aarch64 Termux does not require a compiler toolchain for this package.

Paths use `$HOME`/`homedir()` and remain compatible with `/data/data/com.termux/files/home`. Default state is under `$HOME/.local/state/nexus-kitchen/`; recommended configuration is under `$HOME/.config/nexus-kitchen/`. There is no hardcoded desktop `/home/...` path. Node's default SIGINT/SIGTERM behavior terminates the foreground process; atomic spool, ledger and snapshot writes provide restart recovery.

## Install and run

From the repository clone on the Realme:

```sh
cd ~/nexus-kitchen/tools/kitchen-connector-standalone
npm ci
npm test
```

Create protected configuration/state directories and the FUSION JSON as documented in `tools/kitchen-connector-standalone/README.md`. Export:

- `KITCHEN_CONNECTOR_URL`;
- `KITCHEN_CONNECTOR_CREDENTIAL`;
- `FUSION_XML1745_CONFIG`;
- `KITCHEN_CONNECTOR_SPOOL`;
- `CATALOG_SYNC_ENABLED`;
- `CATALOG_SYNC_INTERVAL_MS`;
- `CATALOG_SYNC_FULL_INTERVAL_MS`;
- `CATALOG_SYNC_MAX_BACKOFF_MS`;
- `FUSION_CATALOG_MAX_PLU`;
- optionally `FUSION_CATALOG_SNAPSHOT`.

Then run `npm start`. Keep `CATALOG_SYNC_ENABLED=false` until the separately authorized first live catalog sync. Starting the runner with catalog sync enabled intentionally performs a reconciliation at startup.

## Tests

Standalone tests use only ephemeral `127.0.0.1` HTTP/TCP simulators and temporary directories. They cover:

- connector bearer authentication header, heartbeat and manual command response;
- polling, claim and ACK;
- persistent spool and restart recovery;
- byte-exact FUSION ORDER with persistent mapping precedence and JSON fallback;
- ACK ledger duplicate suppression;
- timeout classified and persisted as UNCERTAIN;
- DATA_REQ, DATA_SEND, per-record ACK and DB_END ACK;
- canonical fingerprint, unchanged detection and atomic snapshot;
- Catalog status/upload and manual request version propagation.

Results:

- standalone `npm ci`, build and 3 aggregated tests on Node 22: PASS;
- exact Node 26.3.1 / npm 11.17.0 `npm ci`, build and 3 tests: PASS;
- existing Catalog Reader suite: 5/5 PASS;
- existing FUSION XML1745/ORDER suite: 5/5 PASS;
- existing connector simulator E2E: 1/1 PASS;
- `git diff --check`: PASS.

Total executed test cases across the standalone compatibility matrix and regressions: 17 pass, 0 fail.

## Security and operations

Credentials must remain outside Git in a mode-600 file or exported environment. The connector only derives company/location scope through its Nexus device credential. Configuration never accepts raw XML; ORDER and DATA_REQ builders remain typed and closed. Logs do not contain credentials or full catalog XML. HTTPS certificate verification uses Node defaults and must not be disabled.

Future autostart may use Termux:Boot or `termux-services` after live validation. It should wait for network availability, use bounded restart delay, load protected environment values and ensure one process only. No autostart is enabled in this delivery.

## Rollback

Stop the connector, check out the prior commit, run `npm ci` in the standalone directory if present, or resume the previously validated Chromebook connector. Preserve the state directory for reconciliation; do not delete UNCERTAIN ledger entries or retry their ORDER blindly.

## Safety confirmation

No production file, container, database or configuration was changed. No connection was made to `192.168.1.77`, and no live DATA_REQ, ORDER, print or fiscal operation was executed.
