# Git consolidation plan

Evidence: initial pre-FUSION `git status`/diff captured in the mission transcript, current files, V1/FUSION migrations and tests, `docs/KITCHEN_CONNECTOR_V1.md`, `FUSION_XML1745_IMPLEMENTATION_REPORT.md`, and backup `/home/ubuntu/nexus-erp-pre-git-consolidation-backup-20260901T111056Z`.

## A — Kitchen Connector V1 baseline

- `app/api/kitchen-connector/**`
- `app/(dashboard)/restaurant/settings/kitchen/connector-actions.ts`
- `app/(dashboard)/restaurant/settings/kitchen/connector-panel.tsx`
- V1 portions of `app/(dashboard)/restaurant/settings/kitchen/page.tsx`
- `app/(dashboard)/restaurant/kitchen/print-queue/page.tsx`
- `lib/kitchen-connector.ts` excluding the later FUSION claim projection
- `lib/kitchen-connector-http.ts`
- `tools/kitchen-connector/runtime.ts` excluding the later FUSION structured claim fields
- `tools/kitchen-connector/simulator.ts`
- `docs/KITCHEN_CONNECTOR_V1.md`
- `prisma/migrations/20260826233000_kitchen_connector_v1/migration.sql`
- V1 connector models/enums/relations in `prisma/schema.prisma`, excluding FUSION and Sprint 4
- V1 connector scripts in `package.json`
- `tests/integration/kitchen-connector-v1.test.ts`
- `tests/integration/kitchen-connector-spool.test.ts`
- `tests/e2e/kitchen-connector-simulator-flow.test.ts`

## B — FUSION_XML_1745

- `tools/kitchen-connector/fusion-xml1745.ts`
- `tools/kitchen-connector/fusion.ts`
- FUSION structured claim projection in `lib/kitchen-connector.ts`
- FUSION structured job fields in `tools/kitchen-connector/runtime.ts`
- FUSION/TCP options in `app/(dashboard)/restaurant/settings/kitchen/page.tsx`
- FUSION/TCP enum values in `prisma/schema.prisma`
- `prisma/migrations/20260901120000_fusion_xml1745/migration.sql`
- FUSION scripts in `package.json`
- `tests/integration/fusion-xml1745.test.ts`
- `tests/integration/fusion-xml1745-db.test.ts`
- `docs/kitchen/fusion-xml1745.md`
- `FUSION_XML1745_IMPLEMENTATION_REPORT.md`
- `GIT_CONSOLIDATION_PLAN.md`

## C — Sprint 4 Inventory/Procurement (preserve, never stage)

- `app/(dashboard)/inventory/actions.ts`
- `app/(dashboard)/inventory/layout.tsx`
- `app/(dashboard)/inventory/lots/page.tsx`
- `app/(dashboard)/inventory/opening/**`
- `app/(dashboard)/items/[id]/page.tsx`
- `app/(dashboard)/items/[id]/suppliers/**`
- `app/(dashboard)/purchasing/**`
- `lib/documents.ts`
- `lib/inventory.ts`
- `lib/inventory-procurement.ts`
- `lib/purchasing.ts`
- `prisma/migrations/20260824150000_inventory_procurement_v1/**`
- `prisma/migrations/20260824170000_inventory_procurement_snapshots/**`
- Sprint 4 models/fields/relations in `prisma/schema.prisma`

## D — Other pre-existing changes (preserve, never stage)

- `.gitignore`
- `tests/integration/crm-phase2.test.ts`

## E — Not determinable

- None. The initial pre-FUSION audit identifies every current path, and the five overlapping files have direct before/after evidence.

## Index strategy

Build Commit 1 through an external temporary worktree/index derived from `HEAD`, adding only the evidenced V1 files and semantic schema changes. The live working tree remains untouched. After Commit 1, verify the five critical SHA256 values still match the snapshot. Then stage only the remaining FUSION delta for Commit 2. Sprint 4 and category D remain unstaged throughout.
