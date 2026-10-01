import assert from "node:assert/strict";
import { mock, test } from "node:test";

class RedirectSignal extends Error {
  digest = "NEXT_REDIRECT";
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}

let applicationError: Error | undefined;
let authorizationError: Error | undefined;
async function operation() { if (applicationError) throw applicationError; return { id: "order-1", documentIds: ["order-1"], lineCount: 1 }; }
async function context() { if (authorizationError) throw authorizationError; return { companyId: "company-1", locationId: "location-1", userId: "user-1" }; }

mock.module("next/navigation", {
  namedExports: {
    redirect: (url: string) => {
      throw new RedirectSignal(url);
    },
  },
});
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/prisma", { namedExports: { prisma: { businessDocument: { count: async () => 1 } } } });
mock.module("@/lib/purchasing-access", {
  namedExports: {
    requirePurchasingContext: context,
  },
});
mock.module("@/lib/purchasing", {
  namedExports: {
    createPurchaseOrder: operation,
    confirmPurchaseOrder: operation,
    convertPurchaseDocument: async () => ({ id: "converted-1" }),
    duplicatePurchaseOrder: async () => ({ id: "dup-1" }),
    postGoodsReceipt: async () => {},
    postPurchaseInvoice: async () => {},
    postPurchaseReturn: async () => {},
    PurchasingDomainError: class PurchasingDomainError extends Error {},
  },
});

mock.module("@/lib/documents", { namedExports: { updateDraft: operation, confirmDocument: operation } });
mock.module("@/lib/inventory-procurement", { namedExports: {
  createPurchaseOrdersFromReorder: operation, saveWarehouseItemPolicy: operation, saveItemSupplier: operation,
  confirmOpening: operation, parseOpeningCsv: () => [], previewOpening: async () => { await operation(); return { valid: true, errors: [] }; },
} });
mock.module("@/lib/inventory-access", { namedExports: { requireInventoryContext: context } });
mock.module("@/lib/location-access", { namedExports: { requireCurrentLocation: async () => ({ id: "location-1" }) } });

const { savePurchaseAction, purchaseOperationAction } = await import("../../app/(dashboard)/purchases/actions");

test("purchases actions: il redirect di successo su creazione ordine non è intercettato come errore", async () => {
  const form = new FormData();
  form.set("seriesId", "series-1");
  form.set("partnerId", "partner-1");
  form.set("documentDate", "2026-01-01");
  form.set("itemId", "item-1");
  form.set("unitOfMeasureId", "unit-1");
  form.set("vatRateId", "vat-1");
  form.set("quantity", "1");
  form.set("unitPrice", "10");

  await assert.rejects(savePurchaseAction(form), (error: unknown) => {
    assert.ok(error instanceof RedirectSignal, `attesa una redirect, arrivato: ${(error as Error).message}`);
    assert.equal(error.url, "/purchases/orders/order-1");
    return true;
  });
});

test("purchases actions: il redirect di successo su conferma ordine non è intercettato come errore", async () => {
  const form = new FormData();
  form.set("id", "order-1");
  form.set("kind", "orders");
  form.set("operation", "confirm");

  await assert.rejects(purchaseOperationAction(form), (error: unknown) => {
    assert.ok(error instanceof RedirectSignal, `attesa una redirect, arrivato: ${(error as Error).message}`);
    assert.equal(error.url, "/purchases/orders/order-1?success=Operazione completata");
    return true;
  });
});

const { createProposalAction, savePolicyAction } = await import("../../app/(dashboard)/purchasing/reorder/actions");
const { saveSupplierAction } = await import("../../app/(dashboard)/items/[id]/suppliers/actions");
const { openingAction } = await import("../../app/(dashboard)/inventory/opening/actions");
function form() { const d = new FormData(); d.set("itemId", "item-1"); d.set("idempotencyKey", "key-1"); return d; }
async function expectRedirect(run: () => Promise<unknown>, expected: string) {
  await assert.rejects(run(), (error: unknown) => { assert.ok(error instanceof RedirectSignal); assert.equal(error.url, expected); return true; });
}
test("Purchase update success redirect remains outside catch", async () => {
  const d = form(); d.set("id", "order-1"); await expectRedirect(() => savePurchaseAction(d), "/purchases/orders/order-1");
});
for (const [name, run, success, failure] of [
  ["create", (d: FormData) => savePurchaseAction(d), "/purchases/orders/order-1", "/purchases/orders/new"],
  ["update", (d: FormData) => { d.set("id", "order-1"); return savePurchaseAction(d); }, "/purchases/orders/order-1", "/purchases/orders/order-1/edit"],
  ["operation", (d: FormData) => { d.set("id", "order-1"); d.set("kind", "orders"); d.set("operation", "confirm"); return purchaseOperationAction(d); }, "/purchases/orders/order-1?success=Operazione completata", "/purchases/orders/order-1"],
  ["reorder", (d: FormData) => createProposalAction(d), "/purchases/orders/order-1?success=Ordini di acquisto creati", "/purchasing/reorder"],
  ["policy", (d: FormData) => savePolicyAction(d), "/purchasing/reorder?success=Policy salvata", "/purchasing/reorder"],
  ["supplier", (d: FormData) => saveSupplierAction(d), "/items/item-1/suppliers?success=Supplier salvato", "/items/item-1/suppliers"],
] as const) {
  test(`${name}: success redirect propagates`, async () => { await expectRedirect(() => run(form()), success); });
  for (const kind of ["VALIDATION_ERROR", "DATABASE_ERROR"]) test(`${name}: ${kind} keeps error destination`, async () => {
    applicationError = new Error(kind);
    try { await expectRedirect(() => run(form()), `${failure}?error=${kind}`); } finally { applicationError = undefined; }
  });
  test(`${name}: authorization error propagates before mutation`, async () => {
    authorizationError = new Error("AUTHORIZATION_ERROR");
    try { await assert.rejects(run(form()), /AUTHORIZATION_ERROR/); } finally { authorizationError = undefined; }
  });
}
for (const kind of ["VALIDATION_ERROR", "DATABASE_ERROR"]) test(`opening action: ${kind} returns state`, async () => {
  applicationError = new Error(kind);
  try { const result = await openingAction({ message: "" }, form()); assert.equal(result.valid, false); assert.equal(result.message, kind); }
  finally { applicationError = undefined; }
});
test("opening action: success returns state without redirect", async () => {
  const d = form(); d.set("mode", "confirm"); const result = await openingAction({ message: "" }, d); assert.equal(result.completed, true);
});
test("opening action: authorization error propagates", async () => {
  authorizationError = new Error("AUTHORIZATION_ERROR");
  try { await assert.rejects(openingAction({ message: "" }, form()), /AUTHORIZATION_ERROR/); } finally { authorizationError = undefined; }
});
