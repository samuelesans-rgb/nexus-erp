# Procurement legacy compatibility decision

Decision recorded 2026-10-01. Scope: IP-02 only. No application change,
reconstruction, migration, backfill or production write.

## Historical evidence

The committed Inventory migration `20260801120000_inventory_engine` stores
movement quantity, direction, UOM, warehouse, optional bin, item, tenant,
referenceType/referenceId, reversal and posting metadata.
The Document migration `20260801220000_document_engine` stores line purchase
UOM, quantity, price, warehouse, lot and serial; header warehouse, currency
and exchange rate are persisted too.
The untracked `20260824150000_inventory_procurement_v1` introduces ItemSupplier
and WarehouseItemPolicy; ItemSupplier is mutable and has no revision history.
The untracked `20260824170000_inventory_procurement_snapshots` introduces the
three nullable line snapshots without backfill.

| Information | Historical classification | Limits |
| --- | --- | --- |
| Purchase UOM | PERSISTED_HISTORICALLY | BusinessDocumentLine.unitOfMeasureId, not current supplier UOM |
| Stock UOM | PERSISTED_HISTORICALLY in a proven correlated InventoryMovement; otherwise CURRENT_MASTER_DATA_ONLY/UNKNOWN | Item.unitOfMeasureId is mutable |
| Conversion factor | DERIVABLE_DETERMINISTICALLY only for a proven complete historical operation; otherwise UNKNOWN | A quantity ratio alone is insufficient |
| Warehouse | PERSISTED_HISTORICALLY | Line/header warehouse; movement proves warehouse actually used |
| Bin | PERSISTED_HISTORICALLY in correlated movement; otherwise UNKNOWN | Warehouse bins now existing do not prove past selection |

StockBalance is an aggregate of operations, not historical line evidence.
Neither current ItemSupplier nor current Item, UOM metadata, cost, currency
or bin configuration can reconstruct historical meaning automatically.
A NULL bin snapshot is not itself invalid: the new flow permits no bin.
It nevertheless does not prove that an unreceived historical line intended
no bin rather than a particular bin.

## Classification policy

A — DETERMINISTIC: all necessary evidence and provenance are established.
The test demonstrates a posted legacy base-UOM receipt with one exact,
unreversed, tenant/location/item/warehouse-scoped movement linked to its
unchanged line, same quantity and UOM, and recorded bin. The old committed
posting implementation passed line quantity and UOM directly to Inventory;
Inventory rejected non-base UOM. Together these establish factor 1 for that
specific historical operation. This is not a generic ratio inference and
not evidence for another unreceived document. No automatic reconstruction
is enabled, even for this candidate.

B — PARTIAL: some historical fields or movements exist but full receipt,
quantity coverage, UOM, bin or provenance is not established. FAIL CLOSED.

C — CURRENT-MASTER-ONLY: filling gaps requires today's supplier/item/bin
configuration. FAIL CLOSED even when the current configuration is compatible.

D — UNKNOWN/AMBIGUOUS: no reliable correlation or multiple explanations.
FAIL CLOSED.

Movement references are nullable strings, not a document-line FK or unique
receipt key. Multiple receipts, reversals, changed quantities, incomplete
coverage or an indirect DocumentLink do not justify deriving a factor by
summing/dividing quantities. DocumentLink is document-level, not a reliable
per-line mapping. An already received document can have usable evidence;
a partially correlated document can remain B/D. A never-received document
has no movement evidence. Warehouse/StockBalance/master data do not fill it.

## Production audit and decision

Read-only production audit found 48 migrations, zero Procurement snapshot
columns, and zero purchase documents including soft-deleted records across
PURCHASE_ORDER, GOODS_RECEIPT, PURCHASE_INVOICE, RETURN and CREDIT_NOTE.
There are zero open legacy purchase documents; status/date breakdown is
empty and first/last dates are NULL. No absent snapshot column was queried.
Snapshot-complete versus NULL counts are not applicable before deployment.

Case 1 applies for the observed production state: no operational legacy
purchase document requires compatibility. IP-02 is CLOSED_AS_INTENTIONAL_FAIL_CLOSED.
Existing read/edit/duplicate behavior remains; no supplier fallback is added.
Receive/return requiring missing stock UOM or factor continue to reject.
This closes the audit issue through an explicit policy, not through a backfill.

Before any future deployment recheck legacy counts: new legacy documents may
appear after this audit. If operational documents exist, classify per line
and review explicit remediation separately. Do not automatically enable the
class-A candidate algorithm, infer conversions from current data, or perform
mass backfill. Ambiguous evidence requires STOP_AND_REVIEW.

## Verification

`tests/integration/purchasing-legacy-compatibility.test.ts` covers historical
movement evidence without automatic repair (A), compatible current supplier
(B fixture), changed supplier (C fixture), and absent supplier (D fixture).
The B/C/D fixtures retain NULL snapshots through duplication and reject
receipt without movements or stock changes. The already received A fixture
rejects return with missing snapshots. All existing Procurement regressions
must remain green. Writes are confined to nexus_procurement_test.
