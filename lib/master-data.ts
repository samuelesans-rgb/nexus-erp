import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export class MasterDataError extends Error {}
type Common = { code: string; name: string; description?: string | null; active?: boolean };
export type VatRateInput = Common & { percentage: number; natureCode?: string | null };
export type UnitInput = Common & { symbol: string; precision: number };
export type CategoryInput = Common;
const clean = (value?: string | null) => value?.trim() || null;
function commonData(input: Common) { const code = input.code.trim().toUpperCase(); const name = input.name.trim(); if (!code || !name) throw new MasterDataError("Codice e nome sono obbligatori."); return { code, name, description: clean(input.description) }; }
function vatData(input: VatRateInput) { if (!Number.isFinite(input.percentage) || input.percentage < 0 || input.percentage > 100) throw new MasterDataError("La percentuale IVA deve essere compresa tra 0 e 100."); return { ...commonData(input), percentage: input.percentage, natureCode: clean(input.natureCode) }; }
function unitData(input: UnitInput) { const symbol = input.symbol.trim(); if (!symbol) throw new MasterDataError("Il simbolo è obbligatorio."); if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 6) throw new MasterDataError("La precisione deve essere un intero tra 0 e 6."); return { ...commonData(input), symbol, precision: input.precision }; }
function isDuplicate(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
async function safely<T>(operation: () => Promise<T>) { try { return await operation(); } catch (error) { if (isDuplicate(error)) throw new MasterDataError("Il codice è già utilizzato per questa azienda."); throw error; } }

export async function getMasterData(companyId: string) {
  const [vatRates, units, categories] = await Promise.all([
    prisma.vatRate.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.itemCategory.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: "asc" } }),
  ]);
  return { vatRates, units, categories };
}

export function createVatRate(companyId: string, userId: string, input: VatRateInput) { return safely(() => prisma.vatRate.create({ data: { companyId, createdById: userId, updatedById: userId, ...vatData(input), active: input.active !== false } })); }
export async function updateVatRate(companyId: string, userId: string, id: string, input: VatRateInput) {
  const data = vatData(input);
  await safely(() => prisma.$transaction(async (tx) => {
    const current = await tx.vatRate.findFirst({ where: { id, companyId, deletedAt: null }, select: { code: true, percentage: true, natureCode: true, _count: { select: { businessDocumentLines: true, restaurantOrderLines: true } } } });
    if (!current) throw new MasterDataError("Aliquota IVA non trovata.");
    const historicallyUsed = current._count.businessDocumentLines > 0 || current._count.restaurantOrderLines > 0;
    const fiscalDataChanged = current.code !== data.code || Number(current.percentage) !== data.percentage || current.natureCode !== data.natureCode;
    if (historicallyUsed && fiscalDataChanged) throw new MasterDataError("Aliquota già utilizzata: codice, percentuale e natura fiscale non sono modificabili. Disattivala e creane una nuova.");
    await tx.vatRate.update({ where: { id }, data: { ...data, active: input.active, updatedById: userId } });
  }));
}
export async function setVatRateActive(companyId: string, userId: string, id: string, active: boolean) { const result = await prisma.vatRate.updateMany({ where: { id, companyId, deletedAt: null }, data: { active, updatedById: userId } }); if (result.count !== 1) throw new MasterDataError("Aliquota IVA non trovata."); }

export function createUnit(companyId: string, userId: string, input: UnitInput) { return safely(() => prisma.unitOfMeasure.create({ data: { companyId, createdById: userId, updatedById: userId, ...unitData(input), active: input.active !== false } })); }
export async function updateUnit(companyId: string, userId: string, id: string, input: UnitInput) {
  const data = unitData(input);
  await safely(() => prisma.$transaction(async (tx) => {
    const current = await tx.unitOfMeasure.findFirst({ where: { id, companyId, deletedAt: null }, select: { precision: true, _count: { select: { items: true, recipeComponents: true, packageComponents: true, inventoryMovements: true, inventoryTransferLines: true, inventoryCountLines: true, businessDocumentLines: true } } } });
    if (!current) throw new MasterDataError("Unità di misura non trovata.");
    if (Object.values(current._count).some((count) => count > 0) && current.precision !== data.precision) throw new MasterDataError("Unità di misura già utilizzata: la precisione non è modificabile.");
    await tx.unitOfMeasure.update({ where: { id }, data: { ...data, active: input.active, updatedById: userId } });
  }));
}
export async function setUnitActive(companyId: string, userId: string, id: string, active: boolean) { const result = await prisma.unitOfMeasure.updateMany({ where: { id, companyId, deletedAt: null }, data: { active, updatedById: userId } }); if (result.count !== 1) throw new MasterDataError("Unità di misura non trovata."); }

export function createCategory(companyId: string, userId: string, input: CategoryInput) { return safely(() => prisma.itemCategory.create({ data: { companyId, createdById: userId, updatedById: userId, ...commonData(input), active: input.active !== false } })); }
export async function updateCategory(companyId: string, userId: string, id: string, input: CategoryInput) { const result = await safely(() => prisma.itemCategory.updateMany({ where: { id, companyId, deletedAt: null }, data: { ...commonData(input), active: input.active, updatedById: userId } })); if (result.count !== 1) throw new MasterDataError("Categoria non trovata."); }
export async function setCategoryActive(companyId: string, userId: string, id: string, active: boolean) { const result = await prisma.itemCategory.updateMany({ where: { id, companyId, deletedAt: null }, data: { active, updatedById: userId } }); if (result.count !== 1) throw new MasterDataError("Categoria non trovata."); }
