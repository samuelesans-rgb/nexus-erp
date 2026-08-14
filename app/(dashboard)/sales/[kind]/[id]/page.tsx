import { getSalesDocument } from "@/lib/sales";
import { requireSalesContext } from "@/lib/sales-access";
import { kindForType, salesRoute } from "@/lib/sales-routing";
import Link from "next/link";
import { notFound } from "next/navigation";
import { salesOperationAction } from "../../actions";

export default async function SalesDetailPage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ kind, id }, query] = await Promise.all([params, searchParams]); const route = salesRoute(kind); if (!route) notFound();
  const { companyId, locationId, roles } = await requireSalesContext(); const document = await getSalesDocument(companyId, locationId, id); if (!document || document.documentType !== route.type) notFound();
  const canWrite = roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"].includes(role));
  const links = [
    ...document.targetLinks.map((link) => ({ id: link.id, label: `Origine: ${link.sourceDocument.documentType} ${link.sourceDocument.documentNumber}`, href: `/sales/${kindForType(link.sourceDocument.documentType)}/${link.sourceDocument.id}` })),
    ...document.sourceLinks.map((link) => ({ id: link.id, label: `Generato: ${link.targetDocument.documentType} ${link.targetDocument.documentNumber}`, href: `/sales/${kindForType(link.targetDocument.documentType)}/${link.targetDocument.id}` })),
  ];
  return <div className="space-y-5">
    <div className="flex justify-between"><header><h1 className="text-3xl font-bold">{route.singular} {document.series.code}/{document.documentNumber}</h1><p>{document.partner.displayName ?? document.partner.name} · <b>{document.status}</b></p></header>{canWrite && document.status === "DRAFT" && <Link href={`/sales/${kind}/${id}/edit`} className="rounded-lg border px-4 py-2">Modifica Draft</Link>}</div>
    {query.error && <p className="bg-red-50 p-3 text-red-700">{query.error}</p>}{query.success && <p className="bg-emerald-50 p-3 text-emerald-700">{query.success}</p>}
    <section className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-3"><Data label="Data" value={document.documentDate.toLocaleDateString("it-IT")}/><Data label="Totale" value={`${Number(document.total).toFixed(2)} ${document.currency}`}/><Data label="Stato" value={document.status}/></section>
    <div className="rounded-xl border bg-white">{document.lines.map((line) => <div key={line.id} className="grid grid-cols-5 gap-2 border-b p-3 text-sm"><span>{line.item.code}</span><span>{line.description}</span><span>{Number(line.quantity)} {line.unitOfMeasure.symbol}</span><span>{Number(line.unitPrice).toFixed(2)}</span><span>{Number(line.lineTotal).toFixed(2)}</span></div>)}</div>
    {canWrite && <div className="flex flex-wrap gap-2">{document.status === "DRAFT" && <Action id={id} kind={kind} operation="confirm" label="Conferma"/>}{route.type === "QUOTE" && document.status === "CONFIRMED" && <Action id={id} kind={kind} operation="to-order" label="Genera Ordine"/>}{route.type === "QUOTE" && <Action id={id} kind={kind} operation="duplicate" label="Duplica Preventivo"/>}{route.type === "SALES_ORDER" && document.status === "CONFIRMED" && <><Action id={id} kind={kind} operation="to-delivery" label="Genera DDT"/><Action id={id} kind={kind} operation="to-invoice" label="Genera Fattura"/></>}{route.type === "DELIVERY_NOTE" && document.status === "CONFIRMED" && <Action id={id} kind={kind} operation="post-delivery" label="Post DDT"/>}{route.type === "DELIVERY_NOTE" && document.status === "POSTED" && <Action id={id} kind={kind} operation="to-invoice" label="Genera Fattura"/>}{route.type === "SALES_INVOICE" && document.status === "CONFIRMED" && <Action id={id} kind={kind} operation="post-invoice" label="Post Fattura"/>}</div>}
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Tracciabilità</h2>{links.map((link) => <Link key={link.id} href={link.href} className="mt-2 block text-sm underline">{link.label}</Link>)}</section>
  </div>;
}
function Data({ label, value }: { label: string; value: React.ReactNode }) { return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd className="font-medium">{value}</dd></div>; }
function Action({ id, kind, operation, label }: { id: string; kind: string; operation: string; label: string }) { return <form action={salesOperationAction}><input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="operation" value={operation}/><button className="rounded-lg bg-slate-900 px-4 py-2 text-white">{label}</button></form>; }
