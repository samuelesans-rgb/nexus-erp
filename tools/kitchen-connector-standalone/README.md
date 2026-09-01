# Nexus Kitchen Connector — Termux standalone

This package compiles and runs only the local Kitchen Connector modules. It does not install or start Nexus ERP, Next.js, Prisma, PostgreSQL, Auth.js, React, or bcrypt.

## Install on Termux

```sh
pkg install nodejs-lts git
cd ~/nexus-kitchen/tools/kitchen-connector-standalone
npm ci
npm test
```

Node.js 22 or later is required. The package is tested on Node 22 and Node 26. It has no native runtime dependency and does not invoke `node-gyp` during installation.

## Configuration

Keep secrets outside the repository:

```sh
mkdir -p "$HOME/.config/nexus-kitchen" "$HOME/.local/state/nexus-kitchen"
chmod 700 "$HOME/.config/nexus-kitchen" "$HOME/.local/state/nexus-kitchen"
```

Create `$HOME/.config/nexus-kitchen/fusion.json` with permissions `600`:

```json
{
  "driver": "FUSION_XML_1745",
  "host": "FUSION_LAN_IP",
  "port": 1745,
  "connectTimeoutMs": 3000,
  "readTimeoutMs": 7000,
  "writeTimeoutMs": 3000,
  "maxResponseBytes": 4096,
  "maxMul": 1000000,
  "tableMappings": {
    "NEXUS_TABLE_ID": 199
  },
  "productMappings": {}
}
```

`productMappings` remains the backward-compatible fallback. PLUs supplied by the persistent Nexus mapping take precedence.

Export runtime configuration in the Termux shell. Do not put the device credential in Git:

```sh
export KITCHEN_CONNECTOR_URL="https://erp.frisabistro.com"
export KITCHEN_CONNECTOR_CREDENTIAL="device_REDACTED"
export FUSION_XML1745_CONFIG="$HOME/.config/nexus-kitchen/fusion.json"
export KITCHEN_CONNECTOR_SPOOL="$HOME/.local/state/nexus-kitchen/spool"

# Keep disabled until the first controlled catalog-sync authorization.
export CATALOG_SYNC_ENABLED="false"
export CATALOG_SYNC_INTERVAL_MS="30000"
export CATALOG_SYNC_FULL_INTERVAL_MS="900000"
export CATALOG_SYNC_MAX_BACKOFF_MS="300000"
export FUSION_CATALOG_MAX_PLU="VERIFIED_UPPER_BOUND"
export FUSION_CATALOG_SNAPSHOT="$HOME/.local/state/nexus-kitchen/catalog/fusion.json"
```

`CATALOG_SYNC_INTERVAL_MS` cannot be below 10000. `FUSION_CATALOG_MAX_PLU` is mandatory when catalog sync is enabled because XML1745 provides no proven maximum or modified-since query.

## Run

```sh
npm start
```

For a foreground controlled smoke run only:

```sh
npm start -- once
```

Do not start the connector until the target IP, mappings, credential, and catalog upper bound have been reviewed. Starting with catalog sync enabled performs a DATA_REQ at startup.

The default catalog snapshot is under `$HOME/.local/state/nexus-kitchen/catalog/`; no Linux desktop home path is hardcoded. SIGINT/SIGTERM use Node's normal termination behavior. Atomic spool, delivery ledger, and catalog snapshot files provide restart recovery.

## Future autostart

After controlled live validation, use Termux:Boot or `termux-services` with a small environment-loading launcher. The service should start only after network availability, use exponential restart delay, keep credentials in a mode-600 file, and never run multiple connector processes concurrently. Autostart is intentionally not enabled by this package.
