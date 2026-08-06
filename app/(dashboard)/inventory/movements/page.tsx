import { type InventoryMovementType } from "@/generated/prisma/client";
import { getInventoryMovements, getInventoryOptions } from "@/lib/inventory";
import { requireInventoryContext } from "@/lib/inventory-access";
import { requireCurrentLocation } from "@/lib/location-access";
import Link from "next/link";

type Query = { q?: string; page?: string; type?: string; warehouse?: string; item?: string; from?: string; to?: string };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { companyId } = await requireInventoryContext();
  const location = await requireCurrentLocation();
  const query = await searchParams;
  const page = Math.max(Number(query.page ?? "1"), 1);
  const [result, options] = await Promise.all([
    getInventoryMovements(companyId, location.id, { query: query.q, movementType: query.type as InventoryMovementType | undefined, warehouseId: query.warehouse, itemId: query.item, from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(`${query.to}T23:59:59.999`) : undefined }, page),
    getInventoryOptions(companyId, location.id),
  ]);
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return <div className="space-y-5">
    <div className="flex items-end justify-between"><header><h1 className="text-3xl font-bold">Movimenti</h1><p className="text-slate-500">Ledger immutabile delle variazioni di stock.</p></header><Link href="/inventory/movements/new" className="rounded-lg bg-slate-900 px-4 py-2 text-white">Nuovo movimento</Link></div>
    <form className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
      <input name="q" defaultValue={query.q} placeholder="Item o riferimento" className="rounded-lg border px-3 py-2"/>
      <select name="type" defaultValue={query.type} className="rounded-lg border px-3 py-2"><option value="">Tutti i tipi</option>{["OPENING","RECEIPT","ISSUE","TRANSFER_OUT","TRANSFER_IN","ADJUSTMENT_IN","ADJUSTMENT_OUT","INVENTORY_GAIN","INVENTORY_LOSS","CONSUMPTION","PRODUCTION","RETURN_IN","RETURN_OUT","REVERSAL"].map((type) => <option key={type}>{type}</option>)}</select>
      <select name="warehouse" defaultValue={query.warehouse} className="rounded-lg border px-3 py-2"><option value="">Tutti i magazzini</option>{options.warehouses.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select>
      <select name="item" defaultValue={query.item} className="rounded-lg border px-3 py-2"><option value="">Tutti gli Item</option>{options.items.map((row) => <option key={row.id} value={row.id}>{row.code}</option>)}</select>
      <input name="from" type="date" defaultValue={query.from} className="rounded-lg border px-3 py-2" aria-label="Data da"/>
      <input name="to" type="date" defaultValue={query.to} className="rounded-lg border px-3 py-2" aria-label="Data a"/>
      <button className="rounded-lg border px-3 py-2">Filtra</button>
    </form>
    <div className="rounded-xl border bg-white">{result.rows.map((row) => <Link href={`/inventory/movements/${row.id}`} key={row.id} className="grid grid-cols-5 gap-3 border-b p-3 text-sm hover:bg-slate-50"><span>{row.occurredAt.toLocaleString("it-IT")}</span><span>{row.movementType}</span><span>{row.warehouse.code}</span><span>{row.item.code} · {row.item.name}</span><span className={row.direction > 0 ? "text-emerald-700" : "text-red-700"}>{row.direction > 0 ? "+" : "−"}{Number(row.quantity)}</span></Link>)}</div>
    <div className="flex items-center justify-between text-sm text-slate-500"><span>{result.total} risultati · pagina {page}</span><div className="flex gap-2">{page > 1 && <Link href={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page - 1) })}`}>Precedente</Link>}{page * 25 < result.total && <Link href={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page + 1) })}`}>Successiva</Link>}</div></div>
  </div>;
}
