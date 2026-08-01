import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  GIFT_CARD_MODULES,
  ITEM_TYPES,
  ITEM_TYPE_REQUIRED_MODULES,
  type CatalogItemType,
} from "@/lib/item-types";
import { prisma } from "@/lib/prisma";

export const ITEM_PAGE_SIZE = 20;

export type ItemListParams = {
  q?: string;
  type?: string;
  active?: string;
  category?: string;
  sellable?: string;
  purchasable?: string;
  stockManaged?: string;
  lifecycle?: string;
  sort?: string;
  direction?: string;
  page?: string;
};

const itemListSelect = {
  id: true,
  code: true,
  type: true,
  status: true,
  name: true,
  shortName: true,
  sku: true,
  barcode: true,
  salePrice: true,
  currency: true,
  sellable: true,
  purchasable: true,
  stockManaged: true,
  active: true,
  deletedAt: true,
  category: { select: { id: true, name: true } },
  unitOfMeasure: { select: { id: true, code: true, symbol: true } },
} satisfies Prisma.ItemSelect;

function booleanFilter(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function normalizeItemListParams(params: ItemListParams) {
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const sort = ["name", "code", "createdAt", "salePrice"].includes(
    params.sort ?? ""
  )
    ? (params.sort as "name" | "code" | "createdAt" | "salePrice")
    : "name";
  const direction = params.direction === "desc" ? "desc" : "asc";

  return {
    ...params,
    q: params.q?.trim().slice(0, 100) ?? "",
    category: params.category?.trim().slice(0, 100) ?? "",
    page,
    sort,
    direction,
  } as const;
}

export async function getEnabledItemTypes(companyId: string) {
  const modules = await prisma.companyModule.findMany({
    where: { companyId, enabled: true },
    select: { moduleDefinition: { select: { code: true } } },
  });
  const activeCodes = new Set(
    modules.map(({ moduleDefinition }) => moduleDefinition.code)
  );

  return ITEM_TYPES.filter((type) => {
    const baseEnabled = ITEM_TYPE_REQUIRED_MODULES[type].every((code) =>
      activeCodes.has(code)
    );
    if (!baseEnabled) return false;
    if (type !== "GIFT_CARD") return true;
    return GIFT_CARD_MODULES.some((code) => activeCodes.has(code));
  });
}

export async function isItemTypeEnabled(
  companyId: string,
  type: CatalogItemType
) {
  const enabledTypes = await getEnabledItemTypes(companyId);
  return enabledTypes.includes(type);
}

export async function getItemList(
  companyId: string,
  rawParams: ItemListParams,
  enabledTypes: CatalogItemType[]
) {
  const params = normalizeItemListParams(rawParams);
  const requestedType = ITEM_TYPES.includes(params.type as CatalogItemType)
    ? (params.type as CatalogItemType)
    : undefined;
  const visibleTypes = requestedType
    ? enabledTypes.includes(requestedType)
      ? [requestedType]
      : []
    : enabledTypes;
  const where: Prisma.ItemWhereInput = {
    companyId,
    type: { in: visibleTypes },
    active: booleanFilter(params.active),
    categoryId: params.category || undefined,
    sellable: booleanFilter(params.sellable),
    purchasable: booleanFilter(params.purchasable),
    stockManaged: booleanFilter(params.stockManaged),
    deletedAt:
      params.lifecycle === "deleted"
        ? { not: null }
        : params.lifecycle === "all"
          ? undefined
          : null,
    OR: params.q
      ? [
          { name: { contains: params.q, mode: "insensitive" } },
          { shortName: { contains: params.q, mode: "insensitive" } },
          { code: { contains: params.q, mode: "insensitive" } },
          { sku: { contains: params.q, mode: "insensitive" } },
          { barcode: { contains: params.q, mode: "insensitive" } },
          { description: { contains: params.q, mode: "insensitive" } },
        ]
      : undefined,
  };
  const orderBy: Prisma.ItemOrderByWithRelationInput = {
    [params.sort]: params.direction,
  };

  const [items, total, categories] = await prisma.$transaction([
    prisma.item.findMany({
      where,
      select: itemListSelect,
      orderBy: [orderBy, { id: "asc" }],
      skip: (params.page - 1) * ITEM_PAGE_SIZE,
      take: ITEM_PAGE_SIZE,
    }),
    prisma.item.count({ where }),
    prisma.itemCategory.findMany({
      where: { companyId, active: true, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    items,
    total,
    categories,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / ITEM_PAGE_SIZE)),
    params,
  };
}

export async function getItemFormOptions(companyId: string, itemId?: string) {
  const [categories, units, vatRates, componentItems, enabledTypes] =
    await Promise.all([
      prisma.itemCategory.findMany({
        where: { companyId, active: true, deletedAt: null },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.unitOfMeasure.findMany({
        where: { companyId, active: true },
        select: { id: true, code: true, name: true, symbol: true },
        orderBy: { code: "asc" },
      }),
      prisma.vatRate.findMany({
        where: { companyId, active: true },
        select: { id: true, code: true, name: true, percentage: true },
        orderBy: { percentage: "asc" },
      }),
      prisma.item.findMany({
        where: {
          companyId,
          id: itemId ? { not: itemId } : undefined,
          active: true,
          deletedAt: null,
        },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { name: "asc" },
      }),
      getEnabledItemTypes(companyId),
    ]);

  return { categories, units, vatRates, componentItems, enabledTypes };
}

export async function getItemDetail(companyId: string, itemId: string) {
  return prisma.item.findFirst({
    where: { id: itemId, companyId },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      active: true,
      name: true,
      shortName: true,
      description: true,
      internalNotes: true,
      barcode: true,
      sku: true,
      imageUrl: true,
      categoryId: true,
      unitOfMeasureId: true,
      vatRateId: true,
      salePrice: true,
      purchasePrice: true,
      standardCost: true,
      currency: true,
      sellable: true,
      purchasable: true,
      stockManaged: true,
      trackLots: true,
      trackSerials: true,
      trackExpiration: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { code: true, name: true } },
      unitOfMeasure: {
        select: { code: true, name: true, symbol: true },
      },
      vatRate: {
        select: { code: true, name: true, percentage: true, natureCode: true },
      },
      createdBy: { select: { firstName: true, lastName: true } },
      updatedBy: { select: { firstName: true, lastName: true } },
      productProfile: true,
      serviceProfile: true,
      ingredientProfile: true,
      recipeProfile: true,
      beautyServiceProfile: true,
      hotelRoomProfile: true,
      packageProfile: true,
      giftCardProfile: true,
      recipeComponents: {
        where: { deletedAt: null },
        select: {
          id: true,
          quantity: true,
          wastePercentage: true,
          sortOrder: true,
          componentItem: {
            select: { id: true, code: true, name: true, type: true },
          },
          unitOfMeasure: { select: { id: true, code: true, symbol: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      packageComponents: {
        where: { deletedAt: null },
        select: {
          id: true,
          quantity: true,
          sortOrder: true,
          componentItem: {
            select: { id: true, code: true, name: true, type: true },
          },
          unitOfMeasure: { select: { id: true, code: true, symbol: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}
