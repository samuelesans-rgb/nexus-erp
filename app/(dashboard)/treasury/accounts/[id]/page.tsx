import Link from "next/link";
import { notFound } from "next/navigation";
import { getTreasuryAccount } from "@/lib/treasury";
import { requireTreasuryContext } from "@/lib/treasury-access";
import { euro, Header, Notice } from "../../treasury-ui";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string }> }) {
  const { companyId } = await requireTreasuryContext(); const row = await getTreasuryAccount(companyId, (await params).id); if (!row) notFound(); const query = await searchParams;
  return <><Header title={`${row.code} · ${row.name}`} subtitle={`${row.type} · ${row.currency}`} /><Notice success={query.success} /><div className="flex justify-end"><Link className="rounded border px-4 py-2" href={`/treasury/accounts/${row.id}/edit`}>Modifica</Link></div><div className="rounded border bg-white p-6"><p className="text-sm text-slate-500">Saldo derivato</p><p className="text-3xl font-bold">{euro(row.balance)}</p><p>Saldo iniziale: {euro(Number(row.openingBalance))}</p></div><div className="rounded border bg-white p-6"><h2 className="font-semibold">Movimenti</h2>{row.movements.map(m => <p className="flex justify-between border-t py-2" key={m.id}><span>{m.movementType} · {m.occurredAt.toLocaleDateString("it-IT")}</span><span>{m.direction === "IN" ? "+" : "-"}{euro(Number(m.amount))}</span></p>)}</div></>;
}
