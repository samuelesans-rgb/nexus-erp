import "server-only";

import { prisma } from "@/lib/prisma";

export class MasterDataError extends Error {}
type Common = { code: string; name: string; description?: string | null; active?: boolean };
export type VatRateInput = Common & { percentage: number; natureCode?: string | null };
export type UnitInput = Common & { symbol: string; precision: number };
export type CategoryInput = Common;
const clean = (value?: string | null) => value?.trim() || null;
const base = (input: Common) => {
  const code = input.code.trim().toUpperCase(); const name = input.name.trim();
  if (!code || !name) throw new MasterDataError("Codice e nome sono obbligatori.");
  return { code, name, description: clean(input.description), active: input.active !== false };
};
const duplicate = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
async function safely<T>(operation: () => Promise<T>) { try { return await operation(); } catch (error) { if (duplicate(error)) throw new MasterDataError("Il codice è già utilizzato per questa azienda."); throw error; } }

export async function getMasterData(companyId: string) {
  const [vatRates, units, categories] = await Promise.all([
    prisma.vatRate.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.itemCategory.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: "asc" } }),
  ]);
  return { vatRates, units, categories };
}

export function createVatRate(companyId: string, userId: string, input: VatRateInput) {
  const data = base(input); if (!Number.isFinite(input.percentage) || input.percentage < 0 || input.percentage > 100) throw new MasterDataError("La percentuale IVA deve essere compresa tra 0 e 100.");
  return safely(() => prisma.vatRate.create({ data: { companyId, createdById: userId, updatedById: userId, ...data, percentage: input.percentage, natureCode: clean(input.natureCode) } }));
}
export async function updateVatRate(companyId: string, userId: string, id: string, input: VatRateInput) {
  const data = base(input); if (!Number.isFinite(input.percentage) || input.percentage < 0 || input.percentage > 100) throw new MasterDataError("La percentuale IVA deve essere compresa tra 0 e 100.");
  const result = await safely(() => prisma.vatRate.updateMany({ where: { id, companyId, deletedAt: null }, data: { ...data, percentage: input.percentage, natureCode: clean(input.natureCode), updatedById: userId } }));
  if (result.count !== 1) throw new MasterDataError("Aliquota IVA non trovata.");
}
export function createUnit(companyId: string, userId: string, input: UnitInput) {
  const data = base(input); const symbol = input.symbol.trim(); if (!symbol) throw new MasterDataError("Il simbolo è obbligatorio."); if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 6) throw new MasterDataError("La precisione deve essere un intero tra 0 e 6.");
  return safely(() => prisma.unitOfMeasure.create({ data: { companyId, createdById: userId, updatedById: userId, ...data, symbol, precision: input.precision } }));
}
export async function updateUnit(companyId: string, userId: string, id: string, input: UnitInput) {
  const data = base(input); const symbol = input.symbol.trim(); if (!symbol) throw new MasterDataError("Il simbolo è obbligatorio."); if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 6) throw new MasterDataError("La precisione deve essere un intero tra 0 e 6.");
  const result = await safely(() => prisma.unitOfMeasure.updateMany({ where: { id, companyId, deletedAt: null }, data: { ...data, symbol, precision: input.precision, updatedById: userId } })); if (result.count !== 1) throw new MasterDataError("Unità di misura non trovata.");
}
export function createCategory(companyId: string, userId: string, input: CategoryInput) { return safely(() => prisma.itemCategory.create({ data: { companyId, createdById: userId, updatedById: userId, ...base(input) } })); }
export async function updateCategory(companyId: string, userId: string, id: string, input: CategoryInput) { const result = await safely(() => prisma.itemCategory.updateMany({ where: { id, companyId, deletedAt: null }, data: { ...base(input), updatedById: userId } })); if (result.count !== 1) throw new MasterDataError("Categoria non trovata."); }
