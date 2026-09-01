# Kitchen Connector V1

## Architecture and authority

Nexus ERP remains authoritative for `KitchenPrintJob`. The local Node.js connector has no database access: it pairs once, authenticates with a device credential, polls jobs assigned to its company/location/printer, claims one with a lease, persists it locally, prints through an adapter, then reports ACK or FAIL. Kitchen tickets and explicit test prints use the same queue. Retry resets the same failed intention; reprint remains a new, audited `REPRINT` job in Kitchen Printing V1.

## Security and API

An administrator creates a cryptographically random, hashed, single-use pairing token scoped to Company, Location, and printer. It expires after 1–30 minutes. Pairing returns a device credential once; only its SHA-256 hash and short prefix are stored. Rotation invalidates the previous credential and revoke disables the connector. Tokens and credentials are never returned by diagnostics or logs.

Device endpoints under `/api/kitchen-connector/v1` are `POST /pair`, `POST /heartbeat`, `GET /jobs`, and `POST /jobs/:jobId/{claim,ack,fail}`. Bearer authentication derives tenant/location/printer scope from the stored device, never from request data. Request bodies are bounded, errors are sanitized, and an in-process rate limiter provides basic abuse control (a shared deployment should replace it with a shared limiter).

Claim uses a conditional PostgreSQL update from `PENDING`, or from `PROCESSING` with an expired lease, to `PROCESSING`. It stores connector ownership, a hashed random lease token, timestamps, expiry, and increments attempts. Competing claims cannot both update the row. ACK and FAIL require the same connector and lease token and accept duplicate reports already in their terminal state. Expired leases can be reclaimed safely; stale lease tokens then fail.

## Local spool and recovery

`tools/kitchen-connector/runtime.ts` implements a persistent JSON spool with `RECEIVED`, `PRINTING`, `PRINTED`, and `FAILED`. Each update writes a mode-0600 temporary file, fsyncs it, atomically renames it, and fsyncs the directory. Invalid JSON is quarantined rather than discarded silently. Completed records are retained as `.done.json`; failures as `.failed.json`.

After restart, `RECEIVED` is safe to print, `PRINTED` retries only ERP ACK, and `FAILED` retries only ERP FAIL. A record found in `PRINTING` is the unavoidable crash window after a printer write may have succeeded; it is marked `UNCERTAIN_PRINT_OUTCOME` and is not printed again automatically. Without a printer-provided durable job identifier/status ACK, physical exactly-once printing cannot be guaranteed. An operator can inspect and explicitly reprint if required.

## Simulator and diagnostics

Run `npm run kitchen-connector:simulator -- pair <token> [name]`, store the returned credential securely, then set `KITCHEN_CONNECTOR_URL`, `KITCHEN_CONNECTOR_CREDENTIAL`, and optionally `KITCHEN_CONNECTOR_SPOOL` before `npm run kitchen-connector:simulator -- once` or `-- run`. The deterministic adapter supports success, delayed acknowledgement, timeout, disconnect/reconnect, paper out, busy, malformed response, duplicate ACK behavior, failed print, restart recovery, network failure, retry, and reprint workflows. Heartbeats report connector/runtime version, spool depth, printer state, failed count, last successful print on the ERP record, and sanitized errors/diagnostics.

The Kitchen settings page shows tenant/location-scoped connector and printer status, pairing, one-time credential rotation, revoke, diagnostics, station/printer assignment, and test print. `FRISÀ BISTRÒ / TEST STAMPANTE` creates a non-fiscal queued `TEST` print; it never bypasses claim/spool/ACK.

## Serial and Custom/Kube boundary

`SerialTransport` defines `open`, timed `write`, timed `read`, `close`, `reconnect`, and diagnostics. `SerialConfiguration` has device path/COM, baud rate, data bits, parity, stop bits, flow control, and read/write timeouts. No native serial dependency is mandatory on the VPS.

No authoritative Custom/Kube protocol or SDK was found locally. `CustomKubePrinterAdapter` therefore always fails closed with `HARDWARE_PROTOCOL_REQUIRED`; it emits no guessed ESC/POS or proprietary bytes. Fiscal jobs are also rejected with `FISCAL_PROTOCOL_REQUIRED`. The simulator is the only adapter allowed to simulate success.

## Installation

Build the repository normally and run the connector as an unprivileged account with a private writable spool directory. On Linux, a future systemd unit should use `ExecStart=/usr/bin/npm run kitchen-connector:simulator -- run`, `WorkingDirectory` set to the release, an owner-only environment file, `Restart=always`, and `UMask=0077`. On Windows, run the same Node command under an administrator-selected service wrapper or Task Scheduler; no wrapper is bundled. Keep credentials out of command-line arguments and logs. Back up neither active spool files nor credentials to shared locations.

## Hardware information still required

Before implementing and validating a real adapter, collect exactly:

1. Exact Custom/Kube model.
2. Firmware version, if available.
3. Physical connection type.
4. Serial device path / COM port.
5. Baud rate.
6. Data bits.
7. Parity.
8. Stop bits.
9. Flow control.
10. Installed vendor driver/software.
11. Verified ESC/POS support.
12. Official Custom protocol/SDK documentation and licensing.
13. ACK/status capabilities and retry semantics.
14. Paper width.
15. Cutter capabilities and commands.
16. Codepage/encoding.
17. POS operating system.

Physical validation must occur on a non-production printer/POS or vendor-certified emulator. The VPS must never probe `/dev/tty*`, COM ports, or restaurant hardware.
