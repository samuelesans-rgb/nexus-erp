"use server";

import {
  createCategory,
  createUnit,
  createVatRate,
  MasterDataError,
  setCategoryActive,
  setUnitActive,
  setVatRateActive,
  updateCategory,
  updateUnit,
  updateVatRate,
} from "@/lib/master-data";
import { requireMasterDataContext } from "@/lib/master-data-access";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { redirect } from "next/navigation";

const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const common = (data: FormData, active?: boolean) => ({ code: text(data, "code"), name: text(data, "name"), description: text(data, "description"), active });

async function run(operation: (companyId: string, userId: string) => Promise<unknown>, audit: { action: string; entityType: string; entityId?: string }) {
  const { companyId, membershipId, userId } = await requireMasterDataContext("write");
  try { await operation(companyId, userId); }
  catch (error) { const message = error instanceof MasterDataError ? error.message : "Salvataggio non riuscito."; redirect(`/settings/master-data?error=${encodeURIComponent(message)}`); }
  await writeAuditLog({ companyId, membershipId, userId, action: audit.action, entityType: audit.entityType, entityId: audit.entityId });
  revalidatePath("/settings/master-data");
  redirect("/settings/master-data?success=Configurazione%20salvata");
}

export async function saveVat(data: FormData) {
  const id = text(data, "id");
  return run((companyId, userId) => { const input = { ...common(data, id ? undefined : true), percentage: Number(text(data, "percentage")), natureCode: text(data, "natureCode") }; return id ? updateVatRate(companyId, userId, id, input) : createVatRate(companyId, userId, input); }, { action: id ? "VAT_RATE_UPDATED" : "VAT_RATE_CREATED", entityType: "VatRate", entityId: id || undefined });
}
export async function saveUnit(data: FormData) {
  const id = text(data, "id");
  return run((companyId, userId) => { const input = { ...common(data, id ? undefined : true), symbol: text(data, "symbol"), precision: Number(text(data, "precision")) }; return id ? updateUnit(companyId, userId, id, input) : createUnit(companyId, userId, input); }, { action: id ? "UNIT_UPDATED" : "UNIT_CREATED", entityType: "UnitOfMeasure", entityId: id || undefined });
}
export async function saveCategory(data: FormData) {
  const id = text(data, "id");
  return run((companyId, userId) => { const input = common(data, id ? undefined : true); return id ? updateCategory(companyId, userId, id, input) : createCategory(companyId, userId, input); }, { action: id ? "ITEM_CATEGORY_UPDATED" : "ITEM_CATEGORY_CREATED", entityType: "ItemCategory", entityId: id || undefined });
}

async function toggle(data: FormData, operation: (companyId: string, userId: string, id: string, active: boolean) => Promise<unknown>) {
  const id = text(data, "id");
  const active = text(data, "active") === "true";
  if (!id) redirect("/settings/master-data?error=Record%20non%20valido");
  return run((companyId, userId) => operation(companyId, userId, id, active), { action: active ? "MASTER_DATA_ACTIVATED" : "MASTER_DATA_DEACTIVATED", entityType: "MasterData", entityId: id });
}

export async function toggleVat(data: FormData) { return toggle(data, setVatRateActive); }
export async function toggleUnit(data: FormData) { return toggle(data, setUnitActive); }
export async function toggleCategory(data: FormData) { return toggle(data, setCategoryActive); }
