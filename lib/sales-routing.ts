import type { DocumentType } from "@/generated/prisma/client";

export const SALES_ROUTES = {
  quotes: { type: "QUOTE", label: "Preventivi", singular: "Preventivo" },
  orders: { type: "SALES_ORDER", label: "Ordini", singular: "Ordine" },
  deliveries: { type: "DELIVERY_NOTE", label: "DDT", singular: "DDT" },
  invoices: { type: "SALES_INVOICE", label: "Fatture", singular: "Fattura" },
} as const satisfies Record<string, { type: DocumentType; label: string; singular: string }>;

export type SalesKind = keyof typeof SALES_ROUTES;
export function salesRoute(kind: string) { return SALES_ROUTES[kind as SalesKind]; }
export function kindForType(type: DocumentType) { return (Object.entries(SALES_ROUTES).find(([, value]) => value.type === type)?.[0] ?? "quotes") as SalesKind; }
