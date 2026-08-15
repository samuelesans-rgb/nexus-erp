import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const PARTNER_PAGE_SIZE = 20;

export type PartnerListParams = {
  q?: string;
  type?: string;
  active?: string;
  category?: string;
  customer?: string;
  supplier?: string;
  lead?: string;
  prospect?: string;
  lifecycle?: string;
  sort?: string;
  direction?: string;
  page?: string;
};

const partnerListSelect = {
  id: true,
  code: true,
  type: true,
  status: true,
  name: true,
  legalName: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  mobile: true,
  city: true,
  category: true,
  vatNumber: true,
  taxCode: true,
  isCustomer: true,
  isSupplier: true,
  isLead: true,
  isProspect: true,
  active: true,
  deletedAt: true,
} satisfies Prisma.PartnerSelect;

function booleanFilter(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function normalizePartnerListParams(params: PartnerListParams) {
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const sort = ["name", "code", "createdAt", "city"].includes(params.sort ?? "")
    ? (params.sort as "name" | "code" | "createdAt" | "city")
    : "name";
  const direction = params.direction === "desc" ? "desc" : "asc";

  return {
    ...params,
    q: params.q?.trim().slice(0, 100) ?? "",
    category: params.category?.trim().slice(0, 80) ?? "",
    page,
    sort,
    direction,
  } as const;
}

export async function getPartnerList(
  companyId: string,
  rawParams: PartnerListParams
) {
  const params = normalizePartnerListParams(rawParams);
  const where: Prisma.PartnerWhereInput = {
    companyId,
    type:
      params.type === "COMPANY" || params.type === "PERSON"
        ? params.type
        : undefined,
    active: booleanFilter(params.active),
    category: params.category
      ? { equals: params.category, mode: "insensitive" }
      : undefined,
    isCustomer: booleanFilter(params.customer),
    isSupplier: booleanFilter(params.supplier),
    isLead: booleanFilter(params.lead),
    isProspect: booleanFilter(params.prospect),
    deletedAt:
      params.lifecycle === "deleted"
        ? { not: null }
        : params.lifecycle === "all"
          ? undefined
          : null,
    OR: params.q
      ? [
          { legalName: { contains: params.q, mode: "insensitive" } },
          { name: { contains: params.q, mode: "insensitive" } },
          { firstName: { contains: params.q, mode: "insensitive" } },
          { lastName: { contains: params.q, mode: "insensitive" } },
          { email: { contains: params.q, mode: "insensitive" } },
          { phone: { contains: params.q, mode: "insensitive" } },
          { mobile: { contains: params.q, mode: "insensitive" } },
          { vatNumber: { contains: params.q, mode: "insensitive" } },
          { taxCode: { contains: params.q, mode: "insensitive" } },
        ]
      : undefined,
  };
  const orderBy: Prisma.PartnerOrderByWithRelationInput = {
    [params.sort]: params.direction,
  };

  const [partners, total, categories] = await prisma.$transaction([
    prisma.partner.findMany({
      where,
      select: partnerListSelect,
      orderBy: [orderBy, { id: "asc" }],
      skip: (params.page - 1) * PARTNER_PAGE_SIZE,
      take: PARTNER_PAGE_SIZE,
    }),
    prisma.partner.count({ where }),
    prisma.partner.findMany({
      where: {
        companyId,
        category: { not: null },
        deletedAt: null,
      },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);

  return {
    partners,
    total,
    categories: categories.flatMap(({ category }) =>
      category ? [category] : []
    ),
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / PARTNER_PAGE_SIZE)),
    params,
  };
}

export async function getPartnerDetail(companyId: string, partnerId: string) {
  return prisma.partner.findFirst({
    where: {
      id: partnerId,
      companyId,
    },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      name: true,
      displayName: true,
      legalName: true,
      firstName: true,
      lastName: true,
      vatNumber: true,
      taxCode: true,
      email: true,
      pec: true,
      phone: true,
      mobile: true,
      website: true,
      address: true,
      zipCode: true,
      city: true,
      province: true,
      country: true,
      category: true,
      priceListId: true,
      paymentMethodId: true,
      paymentTermId: true,
      priceList: { select: { code: true, name: true } },
      paymentMethod: { select: { code: true, name: true } },
      paymentTerm: { select: { code: true, name: true } },
      creditLimit: true,
      discountPercent: true,
      recipientCode: true,
      splitPayment: true,
      reverseCharge: true,
      internalNotes: true,
      isCustomer: true,
      isSupplier: true,
      isLead: true,
      isProspect: true,
      isCollaborator: true,
      isAgent: true,
      isCarrier: true,
      isProfessional: true,
      active: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      agentId: true,
      agent: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      updatedBy: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

export async function getCompanyAgents(companyId: string) {
  return prisma.partner.findMany({
    where: {
      companyId,
      isAgent: true,
      active: true,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function isValidPartnerAgent(
  companyId: string,
  agentId: string,
) {
  const agent = await prisma.partner.findFirst({
    where: {
      id: agentId,
      companyId,
      isAgent: true,
      active: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  return agent !== null;
}
