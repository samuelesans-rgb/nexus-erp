# FUSION XML1745 kitchen adapter V1

`FUSION_XML_1745` is a non-fiscal Kitchen Connector adapter for the proven PT15/FUSION TCP protocol. It opens one TCP connection per order line, writes one complete frame, reads through the first `</CE>`, validates the complete response, and closes the connection. It never exposes raw XML and never implements payment, totals, account closing, commercial documents, returns, cancellations, DGFE, RT, lottery, or daily closing.

## Proven ORDER subset

The exact V1 frame is:

```text
<CE><ORDER><TABLE>TABLE_ID<PLU>PLU_ID<MUL>QUANTITY_MILLESIMAL</MUL></PLU></TABLE></ORDER></CE>
```

`TABLE` and `PLU` are positive integer mappings. FUSION accepts tables 1–199. `MUL` is quantity multiplied by 1000 and rounded only when the result is already an exact integer within floating-point tolerance: `1 → 1000`, `2 → 2000`, `.5 → 500`. V1 omits `PRICE`, so FUSION uses its catalog price. The live-validated frame was `<CE><ORDER><TABLE>199<PLU>2<MUL>1000</MUL></PLU></TABLE></ORDER></CE>` and returned `<CE><ACK></ACK></CE>`, producing a kitchen ticket without a commercial document or payment.

Responses are a closed set: ACK succeeds, NACK1 becomes `FUSION_NACK_1`, and NACK2 becomes `FUSION_NACK_2`. Empty, malformed, unknown, DATA_SEND, DB_END, oversized, or concatenated responses are protocol errors. NACK1 and NACK2 are deterministic failures and are never retried automatically.

## Configuration and mappings

Run the local connector with `npm run kitchen-connector:fusion -- once` or without `once` for polling. Set `KITCHEN_CONNECTOR_URL`, `KITCHEN_CONNECTOR_CREDENTIAL`, `KITCHEN_CONNECTOR_SPOOL`, and `FUSION_XML1745_CONFIG`. The last variable names an owner-readable JSON file:

```json
{
  "driver": "FUSION_XML_1745",
  "host": "fusion-host.local",
  "port": 1745,
  "connectTimeoutMs": 3000,
  "readTimeoutMs": 7000,
  "writeTimeoutMs": 3000,
  "maxResponseBytes": 4096,
  "maxMul": 1000000,
  "tableMappings": { "nexus-restaurant-table-id": 199 },
  "productMappings": { "nexus-item-id": 2 }
}
```

Host must be a plain IPv4/DNS name without a URL scheme or shell syntax; port is 1–65535 and all timeouts are positive and bounded. Mapping values must be positive integers. Missing mappings fail before XML construction or socket connection. The claim API derives Nexus table IDs, item IDs, quantities, notes, and modifier presence from the tenant-scoped ticket; it does not trust connector-supplied business data.

V1 requires exactly one Nexus table per ticket and sends one ORDER per ticket line because multi-PLU framing has not been sufficiently proven. Notes, modifiers, negative/cancellation lines, test prints, prebills, non-fiscal formatted receipts, and fiscal receipts fail closed as unsupported.

## Delivery safety and retries

The existing database lease prevents concurrent claims. A durable local `fusion-delivery-ledger.json` records each `jobId/lineId` as `ACKED` or `UNCERTAIN`. ACKed lines are not sent again. If a write may have reached the socket but ACK is lost through timeout, reset, early close, oversized/unknown response, or malformed framing, the line becomes `UNCERTAIN` and is also suppressed. Operators must reconcile it manually with FUSION before deciding on an explicit reprint.

Only a failure before the payload write is confirmed is classified `PRE_SEND_FAILURE` and retryable. The ERP queue does not automatically retry `FAILED` jobs. NACK and UNCERTAIN remain terminal until explicit operator action. The spool also marks a process crash found in `PRINTING` as uncertain and never prints it automatically on recovery.

Audit output is structured and limited to job/line ID, adapter, host/port, TABLE, PLU, MUL, attempt, result, and uncertain flag; raw XML and credentials are omitted. Health checks are TCP connect-only and report reachable/unreachable. They do not send ORDER or DATA_REQ and do not claim that a table or PLU is valid.

## Local verification

All protocol tests bind only to `127.0.0.1`. The fake TCP server covers exact XML, fragmented ACK, NACK1, NACK2, connect refusal, post-write close, read timeout, and durable duplicate suppression. No live POS connection is part of the suite.

## Deployment boundary

The migration adding `FUSION_XML_1745` and `TCP` enum values must be reviewed and applied through the normal production migration process. Configure mappings from actual Nexus IDs and verified FUSION IDs, secure the config and spool files to the connector account, and perform operational reconciliation procedures before enabling polling. No production deploy or POS test is performed by this implementation.
