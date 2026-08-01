import { requireInventoryContext } from "@/lib/inventory-access";
import Link from "next/link";
import { redirect } from "next/navigation";

const links = [["Dashboard", "/inventory"], ["Giacenze", "/inventory/stock"], ["Movimenti", "/inventory/movements"], ["Trasferimenti", "/inventory/transfers"], ["Inventari", "/inventory/counts"], ["Magazzini", "/inventory/warehouses"], ["Lotti", "/inventory/lots"]];

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  try { await requireInventoryContext(); } catch { redirect("/dashboard"); }
  return <div className="space-y-6"><nav className="flex flex-wrap gap-2 border-b pb-3">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">{label}</Link>)}</nav>{children}</div>;
}
