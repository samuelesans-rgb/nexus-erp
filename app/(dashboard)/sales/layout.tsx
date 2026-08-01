import { requireSalesContext } from "@/lib/sales-access";
export default async function SalesLayout({ children }: { children: React.ReactNode }) { await requireSalesContext(); return children; }
