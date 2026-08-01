"use server";

import { confirmDocument, DocumentDomainError, updateDraft } from "@/lib/documents";
import { requireSalesContext } from "@/lib/sales-access";
import { confirmSalesOrder, convertDocument, createQuote, duplicateQuote, postDelivery, postInvoice, SalesDomainError } from "@/lib/sales";
import { kindForType, salesRoute } from "@/lib/sales-routing";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim() || null;
const number = (data: FormData, key: string, fallback = 0) => { const parsed = Number(String(data.get(key) ?? "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : fallback; };
function input(data: FormData) { return { seriesId: text(data, "seriesId")!, partnerId: text(data, "partnerId")!, documentDate: new Date(text(data, "documentDate") ?? new Date()), currency: text(data, "currency") ?? "EUR", exchangeRate: 1, warehouseId: text(data, "warehouseId"), locationId: text(data, "locationId"), paymentMethodId: text(data, "paymentMethodId"), paymentTermId: text(data, "paymentTermId"), priceListId: text(data, "priceListId"), notes: text(data, "notes"), lines: [{ itemId: text(data, "itemId")!, description: text(data, "description"), quantity: number(data, "quantity"), unitOfMeasureId: text(data, "unitOfMeasureId")!, unitPrice: number(data, "unitPrice"), discount: number(data, "discount"), vatRateId: text(data, "vatRateId")!, warehouseId: text(data, "lineWarehouseId") }] }; }
const errorMessage = (error: unknown) => encodeURIComponent(error instanceof SalesDomainError || error instanceof DocumentDomainError || error instanceof Error ? error.message : "Operazione Sales non riuscita.");

export async function saveSalesDocumentAction(data: FormData) {
  const { companyId, userId } = await requireSalesContext(true); const kind = text(data, "kind") ?? "quotes"; const route = salesRoute(kind); if (!route) redirect("/sales");
  const id = text(data, "id"); let result: { id: string };
  try { const parsed = input(data); if (!id && route.type !== "QUOTE") throw new SalesDomainError("I documenti successivi si generano dal documento precedente."); if (id && !(await prisma.businessDocument.count({ where: { id, companyId, documentType: route.type, status: "DRAFT", deletedAt: null } }))) throw new SalesDomainError("Documento Draft non valido per questa area Sales."); result = id ? await updateDraft(companyId, userId, id, parsed) : await createQuote(companyId, userId, parsed); }
  catch (error) { redirect(`/sales/${kind}/${id ? `${id}/edit` : "new"}?error=${errorMessage(error)}`); }
  revalidatePath("/sales"); redirect(`/sales/${kind}/${result.id}`);
}

export async function salesOperationAction(data: FormData) {
  const { companyId, userId } = await requireSalesContext(true); const id = text(data, "id")!; const kind = text(data, "kind") ?? "quotes"; const operation = text(data, "operation"); let targetId = id; let targetKind = kind;
  try {
    if (operation === "confirm") { const type = salesRoute(kind)?.type; if (type === "SALES_ORDER") await confirmSalesOrder(companyId, userId, id); else await confirmDocument(companyId, userId, id); }
    else if (operation === "post-delivery") await postDelivery(companyId, userId, id);
    else if (operation === "post-invoice") await postInvoice(companyId, userId, id);
    else if (operation === "duplicate") { const copy = await duplicateQuote(companyId, userId, id); targetId = copy.id; }
    else { const targetType = operation === "to-order" ? "SALES_ORDER" : operation === "to-delivery" ? "DELIVERY_NOTE" : operation === "to-invoice" ? "SALES_INVOICE" : null; if (!targetType) throw new SalesDomainError("Operazione non valida."); const target = await convertDocument(companyId, userId, id, targetType); targetId = target.id; targetKind = kindForType(targetType); }
  } catch (error) { redirect(`/sales/${kind}/${id}?error=${errorMessage(error)}`); }
  revalidatePath("/sales"); redirect(`/sales/${targetKind}/${targetId}?success=Operazione completata`);
}
