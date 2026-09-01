# FUSION_XML1745 implementation report

## 1. Summary

Implemented the non-fiscal `FUSION_XML_1745` Kitchen Connector adapter. It generates the live-proven byte-exact ORDER grammar, sends one PLU per TCP connection, recognizes ACK/NACK1/NACK2, distinguishes pre-send failure from uncertain delivery, persists per-line outcomes, suppresses duplicates, and performs connect-only health checks. No POS/LAN connection, production database operation, deploy, or push was performed.

## 2. Files changed by this mission

- `tools/kitchen-connector/fusion-xml1745.ts`: configuration validation, XML builder, parser, TCP transport, health check, durable line ledger, adapter.
- `tools/kitchen-connector/fusion.ts`: local connector entry point.
- `tools/kitchen-connector/runtime.ts`: optional structured FUSION order data in claimed jobs.
- `lib/kitchen-connector.ts`: tenant-derived table/item/quantity/modifier data in the claim response.
- `prisma/schema.prisma`: `FUSION_XML_1745` printer type and `TCP` connection type.
- `prisma/migrations/20260901120000_fusion_xml1745/migration.sql`: enum migration, applied only to `nexus_erp_test`.
- `app/(dashboard)/restaurant/settings/kitchen/page.tsx`: driver and connection choices.
- `package.json`: connector and test scripts.
- `tests/integration/fusion-xml1745.test.ts`: localhost-only protocol and safety tests.
- `docs/kitchen/fusion-xml1745.md`: operating and protocol documentation.
- `FUSION_XML1745_IMPLEMENTATION_REPORT.md`: this report.

The Kitchen Connector V1 files were untracked before this mission. Inventory/Procurement Sprint 4 and unrelated files were preserved. `prisma format` reformatted the already-modified shared schema as required by the repository workflow; the only semantic FUSION schema changes are the two enum members above.

## 3. Architecture

The implementation reuses `PrinterAdapter`, `KitchenConnectorClient`, JSON spool, HTTP claim/ACK/FAIL API, PostgreSQL lease, and existing KitchenPrintJob idempotency. The connector remains DB-less. Nexus derives structured order data from the claimed tenant-scoped KitchenTicket. Installation mappings remain in a local owner-readable connector config file keyed by Nexus table/item IDs.

## 4. XML builder

The typed numeric builder emits exactly `<CE><ORDER><TABLE>199<PLU>2<MUL>1000</MUL></PLU></TABLE></ORDER></CE>` for TABLE 199, PLU 2, quantity 1. TABLE is 1–199; PLU and MUL are positive bounded integers. Quantity is multiplied by 1000 and accepted only when exactly representable in millesimals. PRICE and all unproven/fiscal fields are absent. No raw-XML API exists.

## 5. Transport

Node TCP uses one connection per line, separate connect/write/read timeouts, complete write callback, fragmented accumulation through `</CE>`, a configurable 4096-byte default ceiling, immediate close after response, and rejection of trailing/multiple frames. Early close, reset, timeout, oversized response, and malformed/unknown post-write response are handled without waiting for EOF.

## 6. ACK/NACK parser

The parser accepts only exact ACK, NACK1, and NACK2 frames. NACK1 maps to `FUSION_NACK_1`; NACK2 maps to `FUSION_NACK_2`. Empty, malformed, DATA_SEND, DB_END, and unknown frames map to protocol/uncertain failure.

## 7. Uncertain delivery

Before confirmed socket write, failures are `PRE_SEND_FAILURE` and may be retried by explicit policy. After write, missing or ambiguous ACK is `FUSION_UNCERTAIN_DELIVERY`. The affected line is durably marked `UNCERTAIN` and never resent by the adapter. Existing spool crash recovery also converts an interrupted `PRINTING` record to uncertain failure.

## 8. Idempotency and duplicate suppression

Database claim uses the existing conditional lease, preventing concurrent senders. Existing KitchenPrintJob IDs/idempotency keys suppress duplicate intentions. The local ledger records `jobId/lineId` as `ACKED` or `UNCERTAIN`; either state suppresses subsequent adapter sends across process restarts. ERP ACK is persisted atomically through the existing endpoint.

## 9. Retry policy

Only definitely pre-send failures are flagged retryable. NACK1, NACK2, and uncertain outcomes are terminal and never automatically requeued. Existing job polling excludes FAILED jobs. Any later retry/reprint requires explicit operator action and reconciliation.

## 10. Product/table mapping

Config requires positive-integer `tableMappings` and `productMappings`; missing mappings fail before XML or network use. No value is hardcoded. The claim supplies Nexus IDs from the server-side ticket/order graph, scoped by company, location, printer, connector, and lease. V1 rejects zero/multiple tables, notes, modifiers, cancellation/negative lines, and non-kitchen print types.

## 11. Health check

Health check performs connect/close only and reports READY/UNREACHABLE. It sends neither ORDER nor DATA_REQ and does not infer PLU/table validity.

## 12–14. Tests and build

- Prisma format: passed.
- Prisma validate: passed.
- Prisma generate: passed (generated output is ignored and not staged).
- TypeScript `npx tsc --noEmit`: passed.
- ESLint: passed with 6 pre-existing warnings and 0 errors.
- FUSION protocol tests: 5/5 passed. Covers exact XML/MUL, invalid values/config, ACK/NACK, fragmented response, refused connection, post-write close, timeout, ACK/UNCERTAIN duplicate suppression.
- Existing connector spool tests: 2/2 passed.
- FUSION DB tests: 2/2 passed on `nexus_erp_test` (enum/config, concurrent lease, ACK persistence, duplicate suppression, NACK1/NACK2/UNCERTAIN terminal persistence, scheduler exclusion).
- Existing connector DB/spool tests: 3/3 passed on `nexus_erp_test`.
- Restaurant location regression: 7/7 passed on `nexus_erp_test`.
- Kitchen Printing V1 regression: 34/34 passed on `nexus_erp_test`.
- Existing connector local end-to-end simulator: 1/1 passed.
- Next.js production build: passed (75 static pages generated; TypeScript passed).
- `git diff --check`: passed.

All TCP fake servers bound exclusively to `127.0.0.1`.

## 15. Migration

`20260901120000_fusion_xml1745` was applied successfully only to `nexus_erp_test`, after explicit target verification and confirmation that it was the sole pending migration. **PROD MIGRATION PENDING.** It only adds the `FUSION_XML_1745` and `TCP` PostgreSQL enum values.

## 16. Known limitations

V1 supports one table and one ORDER per line. It intentionally omits PRICE, notes, variants/modifiers, cancellation syntax, multi-PLU batches, DATA_REQ, raw XML, and all fiscal commands. FUSION has no proven native idempotency key, so an uncertain physical outcome requires human reconciliation.

## 17. Production steps pending

Review/apply the migration through normal release controls; create the FUSION printer/device; install a protected connector JSON config with verified mappings; secure spool/config permissions; define operator reconciliation; deploy connector under an unprivileged service account. A controlled on-site test is outside this implementation and was not attempted.

## 18. Git status summary

Mission files are listed in section 2. Kitchen Connector V1 was consolidated first as an independently tested baseline. Pre-existing Sprint 4 includes inventory, purchasing, item supplier/opening pages/services and its two migrations; it remains uncommitted. Other pre-existing changes include `.gitignore` and the CRM test. Nothing was pushed, merged, tagged, or deployed.

RESULT: READY FOR CONTROLLED DEPLOY REVIEW

LIVE_POS_CONTACT: NONE

GIT: TWO SELECTIVE LOCAL COMMITS / NO PUSH / NO DEPLOY
