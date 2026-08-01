import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ConfigurationKey } from "@/lib/configuration-catalog";
import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { MODULE_CODES } from "@/lib/module-catalog";

export const CONFIGURATION_PAGE_SIZE = 20;

export type ConfigurationListParams = { q?: string; active?: string; lifecycle?: string; page?: string };

export type ConfigurationRow = {
  id: string; code: string; name: string; description: string | null;
  active: boolean; deletedAt: Date | null; detail: string | null;
};

function normalize(params: ConfigurationListParams) {
  const parsed = Number.parseInt(params.page ?? "1", 10);
  return { q: params.q?.trim().slice(0, 100) ?? "", active: params.active, lifecycle: params.lifecycle, page: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 };
}

function commonWhere(companyId: string, params: ReturnType<typeof normalize>) {
  return {
    companyId,
    active: params.active === "true" ? true : params.active === "false" ? false : undefined,
    deletedAt: params.lifecycle === "deleted" ? { not: null } : params.lifecycle === "all" ? undefined : null,
    OR: params.q ? [{ code: { contains: params.q, mode: "insensitive" as const } }, { name: { contains: params.q, mode: "insensitive" as const } }, { description: { contains: params.q, mode: "insensitive" as const } }] : undefined,
  };
}

export async function getConfigurationList(companyId: string, key: ConfigurationKey, raw: ConfigurationListParams) {
  const params = normalize(raw);
  const where = commonWhere(companyId, params);
  const skip = (params.page - 1) * CONFIGURATION_PAGE_SIZE;
  let rows: ConfigurationRow[] = [];
  let total = 0;
  if (key === "item-categories") {
    const [records, count] = await prisma.$transaction([prisma.itemCategory.findMany({ where, select: { id: true, code: true, name: true, description: true, active: true, deletedAt: true, parent: { select: { name: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: CONFIGURATION_PAGE_SIZE }), prisma.itemCategory.count({ where })]);
    rows = records.map(({ parent, ...record }) => ({ ...record, detail: parent ? `Sottocategoria di ${parent.name}` : "Categoria radice" })); total = count;
  } else if (key === "units-of-measure") {
    const [records, count] = await prisma.$transaction([prisma.unitOfMeasure.findMany({ where, select: { id: true, code: true, name: true, description: true, active: true, deletedAt: true, symbol: true, precision: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: CONFIGURATION_PAGE_SIZE }), prisma.unitOfMeasure.count({ where })]);
    rows = records.map(({ symbol, precision, ...record }) => ({ ...record, detail: `${symbol} · ${precision} decimali` })); total = count;
  } else if (key === "vat-rates") {
    const [records, count] = await prisma.$transaction([prisma.vatRate.findMany({ where, select: { id: true, code: true, name: true, description: true, active: true, deletedAt: true, percentage: true, natureCode: true }, orderBy: [{ percentage: "asc" }, { id: "asc" }], skip, take: CONFIGURATION_PAGE_SIZE }), prisma.vatRate.count({ where })]);
    rows = records.map(({ percentage, natureCode, ...record }) => ({ ...record, detail: `${percentage}%${natureCode ? ` · ${natureCode}` : ""}` })); total = count;
  } else if (key === "price-lists") {
    const [records, count] = await prisma.$transaction([prisma.priceList.findMany({ where, select: { id: true, code: true, name: true, description: true, active: true, deletedAt: true, currency: true, _count: { select: { items: { where: { deletedAt: null } } } } }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: CONFIGURATION_PAGE_SIZE }), prisma.priceList.count({ where })]);
    rows = records.map(({ currency, _count, ...record }) => ({ ...record, detail: `${currency} · ${_count.items} prezzi` })); total = count;
  } else if (key === "payment-methods") {
    const [records, count] = await prisma.$transaction([prisma.paymentMethod.findMany({ where, select: { id: true, code: true, name: true, description: true, active: true, deletedAt: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: CONFIGURATION_PAGE_SIZE }), prisma.paymentMethod.count({ where })]); rows = records.map((record) => ({ ...record, detail: null })); total = count;
  } else {
    const [records, count] = await prisma.$transaction([prisma.paymentTerm.findMany({ where, select: { id: true, code: true, name: true, description: true, active: true, deletedAt: true, dueDays: true, endOfMonth: true, installments: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: CONFIGURATION_PAGE_SIZE }), prisma.paymentTerm.count({ where })]);
    rows = records.map(({ dueDays, endOfMonth, installments, ...record }) => ({ ...record, detail: Array.isArray(installments) ? `${installments.length} rate` : `${dueDays ?? 0} giorni${endOfMonth ? " fine mese" : ""}` })); total = count;
  }
  return { rows, total, page: params.page, pageCount: Math.max(1, Math.ceil(total / CONFIGURATION_PAGE_SIZE)), params };
}

export async function getConfigurationRecord(companyId: string, key: ConfigurationKey, id: string) {
  const where = { id, companyId };
  if (key === "item-categories") return prisma.itemCategory.findFirst({ where, include: { parent: { select: { id: true, name: true } } } });
  if (key === "units-of-measure") return prisma.unitOfMeasure.findFirst({ where });
  if (key === "vat-rates") return prisma.vatRate.findFirst({ where });
  if (key === "price-lists") return prisma.priceList.findFirst({ where, include: { items: { where: { deletedAt: null }, select: { itemId: true, price: true, item: { select: { code: true, name: true } } }, orderBy: { item: { name: "asc" } } } } });
  if (key === "payment-methods") return prisma.paymentMethod.findFirst({ where });
  return prisma.paymentTerm.findFirst({ where });
}

export async function getConfigurationFormOptions(companyId: string, key: ConfigurationKey, excludedId?: string) {
  const [categories, items] = await Promise.all([
    key === "item-categories" ? prisma.itemCategory.findMany({ where: { companyId, id: excludedId ? { not: excludedId } : undefined, active: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }) : [],
    key === "price-lists" ? prisma.item.findMany({ where: { companyId, active: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return { categories, items };
}

export async function getPartnerConfigurationOptions(companyId: string) {
  const [priceListsEnabled, paymentsEnabled] = await Promise.all([
    isModuleEnabled(companyId, MODULE_CODES.CORE_PRICE_LISTS),
    isModuleEnabled(companyId, MODULE_CODES.CORE_PAYMENTS),
  ]);
  const [priceLists, paymentMethods, paymentTerms] = await Promise.all([
    priceListsEnabled ? prisma.priceList.findMany({ where: { companyId, active: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }) : [],
    paymentsEnabled ? prisma.paymentMethod.findMany({ where: { companyId, active: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }) : [],
    paymentsEnabled ? prisma.paymentTerm.findMany({ where: { companyId, active: true, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return { priceLists, paymentMethods, paymentTerms };
}

export async function validateConfigurationReferences(companyId: string, values: { priceListId?: string | null; paymentMethodId?: string | null; paymentTermId?: string | null }) {
  const [priceListsEnabled, paymentsEnabled] = await Promise.all([
    isModuleEnabled(companyId, MODULE_CODES.CORE_PRICE_LISTS),
    isModuleEnabled(companyId, MODULE_CODES.CORE_PAYMENTS),
  ]);
  if ((values.priceListId && !priceListsEnabled) || ((values.paymentMethodId || values.paymentTermId) && !paymentsEnabled)) return false;
  const checks = await Promise.all([
    values.priceListId ? prisma.priceList.count({ where: { id: values.priceListId, companyId, active: true, deletedAt: null } }) : 1,
    values.paymentMethodId ? prisma.paymentMethod.count({ where: { id: values.paymentMethodId, companyId, active: true, deletedAt: null } }) : 1,
    values.paymentTermId ? prisma.paymentTerm.count({ where: { id: values.paymentTermId, companyId, active: true, deletedAt: null } }) : 1,
  ]);
  return checks.every(Boolean);
}

export type ConfigurationTransaction = Prisma.TransactionClient;
