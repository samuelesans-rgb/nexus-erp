"use server";

import { getAuthorizationContext } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@/generated/prisma/client";
import { getConfigurationDefinition } from "@/lib/configuration-catalog";
import { createUnit, createVatRate, MasterDataError, updateUnit, updateVatRate } from "@/lib/master-data";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ConfigurationFormState = { status: "idle" | "error"; message?: string; errors?: Record<string, string> };
const administrators = new Set(["SUPER_ADMIN", "ADMIN"]);

async function requireConfigurationContext(key: string) {
  const definition = getConfigurationDefinition(key);
  if (!definition) return null;
  let context;
  try { context = await getAuthorizationContext(); } catch { return null; }
  if (!context.roles.some((role) => administrators.has(role))) return null;
  await requireModule(context.companyId, definition.requiredModule);
  return { definition, companyId: context.companyId, membershipId: context.membershipId, userId: context.userId };
}

function text(formData: FormData, name: string, max = 255) {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function parseInstallments(value: string | null) {
  if (!value) return null;
  const installments = value.split(/\r?\n/).filter(Boolean).map((line) => {
    const [days, percentage] = line.split(":").map(Number);
    return { days, percentage };
  });
  if (installments.some(({ days, percentage }) => !Number.isInteger(days) || days < 0 || !Number.isFinite(percentage) || percentage <= 0) || Math.abs(installments.reduce((sum, row) => sum + row.percentage, 0) - 100) > 0.001) return undefined;
  return installments;
}

function parse(formData: FormData, kind: string) {
  const code = text(formData, "code", 80)?.toUpperCase();
  const name = text(formData, "name", 200);
  const description = text(formData, "description", 2000);
  const errors: Record<string, string> = {};
  if (!code || !/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) errors.code = "Usa lettere, numeri, _ o -.";
  if (!name) errors.name = "Il nome è obbligatorio.";
  const data: Record<string, unknown> = { code, name, description, active: formData.get("active") === "on" };
  if (kind === "category") data.parentId = text(formData, "parentId");
  if (kind === "unit") {
    data.symbol = text(formData, "symbol", 20);
    data.precision = Number(formData.get("precision"));
    if (!data.symbol) errors.symbol = "Il simbolo è obbligatorio.";
    if (!Number.isInteger(data.precision) || Number(data.precision) < 0 || Number(data.precision) > 6) errors.precision = "Inserisci da 0 a 6 decimali.";
  }
  if (kind === "vat") {
    const percentage = Number(String(formData.get("percentage") ?? "").replace(",", "."));
    data.percentage = percentage;
    data.natureCode = text(formData, "natureCode", 20);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) errors.percentage = "Inserisci una percentuale tra 0 e 100.";
  }
  if (kind === "price-list") data.currency = (text(formData, "currency", 3) ?? "EUR").toUpperCase();
  if (kind === "payment-term") {
    const dueDays = text(formData, "dueDays");
    data.dueDays = dueDays === null ? null : Number(dueDays);
    data.endOfMonth = formData.get("endOfMonth") === "on";
    data.installments = parseInstallments(text(formData, "installments", 4000));
    if (data.dueDays !== null && (!Number.isInteger(data.dueDays) || Number(data.dueDays) < 0)) errors.dueDays = "Inserisci giorni interi non negativi.";
    if (data.installments === undefined) errors.installments = "Usa una rata per riga nel formato giorni:percentuale; il totale deve essere 100.";
  }
  return { data, errors };
}

async function validateParent(companyId: string, id: string | null, parentId: unknown) {
  if (!parentId) return true;
  let current: string | null = String(parentId);
  while (current) {
    if (current === id) return false;
    const parent: { parentId: string | null } | null = await prisma.itemCategory.findFirst({ where: { id: current, companyId, deletedAt: null }, select: { parentId: true } });
    if (!parent) return false;
    current = parent.parentId;
  }
  return true;
}

async function syncPrices(tx: Prisma.TransactionClient, companyId: string, userId: string, priceListId: string, formData: FormData) {
  const itemIds = formData.getAll("itemId").map(String).filter(Boolean);
  const prices = formData.getAll("itemPrice").map((value) => Number(String(value).replace(",", ".")));
  if (new Set(itemIds).size !== itemIds.length || prices.some((price) => !Number.isFinite(price) || price < 0)) throw new Error("Prezzi listino non validi.");
  const validItems = await tx.item.count({ where: { companyId, id: { in: itemIds }, deletedAt: null } });
  if (validItems !== itemIds.length) throw new Error("Uno o più Item non appartengono alla Company.");
  await tx.priceListItem.updateMany({ where: { companyId, priceListId, itemId: { notIn: itemIds }, deletedAt: null }, data: { active: false, deletedAt: new Date(), updatedById: userId } });
  for (let index = 0; index < itemIds.length; index += 1) {
    await tx.priceListItem.upsert({ where: { companyId_priceListId_itemId: { companyId, priceListId, itemId: itemIds[index] } }, create: { companyId, priceListId, itemId: itemIds[index], price: prices[index], createdById: userId, updatedById: userId }, update: { price: prices[index], active: true, deletedAt: null, updatedById: userId } });
  }
}

export async function saveConfiguration(key: string, id: string | null, _state: ConfigurationFormState, formData: FormData): Promise<ConfigurationFormState> {
  const context = await requireConfigurationContext(key);
  if (!context) return { status: "error", message: "Accesso non autorizzato." };
  const parsed = parse(formData, context.definition.kind);
  if (Object.keys(parsed.errors).length) return { status: "error", message: "Controlla i campi evidenziati.", errors: parsed.errors };
  if (context.definition.kind === "category" && !(await validateParent(context.companyId, id, parsed.data.parentId))) return { status: "error", message: "La categoria padre non è valida o creerebbe un ciclo." };
  if (key === "units-of-measure" || key === "vat-rates") {
    const common = { code: String(parsed.data.code), name: String(parsed.data.name), description: parsed.data.description ? String(parsed.data.description) : null, active: Boolean(parsed.data.active) };
    try {
      if (key === "units-of-measure") {
        const input = { ...common, symbol: String(parsed.data.symbol), precision: Number(parsed.data.precision) };
        if (id) await updateUnit(context.companyId, context.userId, id, input); else await createUnit(context.companyId, context.userId, input);
      } else {
        const input = { ...common, percentage: Number(parsed.data.percentage), natureCode: parsed.data.natureCode ? String(parsed.data.natureCode) : null };
        if (id) await updateVatRate(context.companyId, context.userId, id, input); else await createVatRate(context.companyId, context.userId, input);
      }
    } catch (error) {
      return { status: "error", message: error instanceof MasterDataError ? error.message : "Salvataggio non riuscito." };
    }
    await writeAuditLog({ companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, action: id ? "CONFIGURATION_UPDATED" : "CONFIGURATION_CREATED", entityType: context.definition.kind, entityId: id });
    revalidatePath("/settings/configurations/" + key);
    redirect("/settings/configurations/" + key + "?success=Configurazione salvata");
  }
  const audit = { updatedById: context.userId };
  try {
    await prisma.$transaction(async (tx) => {
      let recordId = id;
      const where = id ? { id, companyId: context.companyId } : null;
      if (key === "item-categories") recordId = id ? (await tx.itemCategory.updateMany({ where: where!, data: { ...parsed.data, ...audit } }), id) : (await tx.itemCategory.create({ data: { ...parsed.data as Prisma.ItemCategoryUncheckedCreateInput, companyId: context.companyId, createdById: context.userId, ...audit }, select: { id: true } })).id;
      else if (key === "units-of-measure" || key === "vat-rates") throw new Error("Flusso master data non instradato.");
      else if (key === "price-lists") recordId = id ? (await tx.priceList.updateMany({ where: where!, data: { ...parsed.data, ...audit } }), id) : (await tx.priceList.create({ data: { ...parsed.data as Prisma.PriceListUncheckedCreateInput, companyId: context.companyId, createdById: context.userId, ...audit }, select: { id: true } })).id;
      else if (key === "payment-methods") recordId = id ? (await tx.paymentMethod.updateMany({ where: where!, data: { ...parsed.data, ...audit } }), id) : (await tx.paymentMethod.create({ data: { ...parsed.data as Prisma.PaymentMethodUncheckedCreateInput, companyId: context.companyId, createdById: context.userId, ...audit }, select: { id: true } })).id;
      else recordId = id ? (await tx.paymentTerm.updateMany({ where: where!, data: { ...parsed.data, ...audit } }), id) : (await tx.paymentTerm.create({ data: { ...parsed.data as Prisma.PaymentTermUncheckedCreateInput, companyId: context.companyId, createdById: context.userId, ...audit }, select: { id: true } })).id;
      if (context.definition.kind === "price-list" && recordId) await syncPrices(tx, context.companyId, context.userId, recordId, formData);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { status: "error", message: "Il codice è già utilizzato in questa Company." };
    return { status: "error", message: error instanceof Error ? error.message : "Salvataggio non riuscito." };
  }
  await writeAuditLog({ companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, action: id ? "CONFIGURATION_UPDATED" : "CONFIGURATION_CREATED", entityType: context.definition.kind, entityId: id });
  revalidatePath(`/settings/configurations/${key}`);
  redirect(`/settings/configurations/${key}?success=Configurazione salvata`);
}

export async function setConfigurationLifecycle(formData: FormData) {
  const key = String(formData.get("key") ?? ""); const id = String(formData.get("id") ?? ""); const restore = formData.get("restore") === "true";
  const context = await requireConfigurationContext(key); if (!context || !id) redirect("/settings/configurations");
  const data = { active: restore, deletedAt: restore ? null : new Date(), updatedById: context.userId };
  const where = { id, companyId: context.companyId };
  if (key === "item-categories") await prisma.itemCategory.updateMany({ where, data: { active: restore, updatedById: context.userId } });
  else if (key === "units-of-measure") await prisma.unitOfMeasure.updateMany({ where, data: { active: restore, updatedById: context.userId } });
  else if (key === "vat-rates") await prisma.vatRate.updateMany({ where, data: { active: restore, updatedById: context.userId } });
  else if (key === "price-lists") await prisma.priceList.updateMany({ where, data });
  else if (key === "payment-methods") await prisma.paymentMethod.updateMany({ where, data });
  else await prisma.paymentTerm.updateMany({ where, data });
  await writeAuditLog({ companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, action: restore ? "CONFIGURATION_RESTORED" : "CONFIGURATION_ARCHIVED", entityType: context.definition.kind, entityId: id });
  revalidatePath(`/settings/configurations/${key}`);
  redirect(`/settings/configurations/${key}`);
}
