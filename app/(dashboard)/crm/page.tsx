import Link from "next/link";
import { requireCrmContext } from "@/lib/crm-access";
import { getCrmDashboard } from "@/lib/crm";

const eur = (value: string) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value));

export default async function CrmDashboardPage() {
  const actor = await requireCrmContext();
  const data = await getCrmDashboard(actor);
  const cards = [["Opportunità aperte", data.summary.openCount], ["Pipeline", eur(data.summary.pipelineValue)], ["Valore pesato", eur(data.summary.weightedValue)], ["Conversione", `${data.summary.conversionRate}%`], ["Attività scadute", data.activities.overdue], ["Attività oggi", data.activities.today]];
  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">CRM</h1><p className="text-slate-500">Pipeline e follow-up commerciali</p></div><Link className="rounded-lg bg-slate-900 px-4 py-2 text-white" href="/crm/opportunities/new">Nuova opportunità</Link></div><nav className="flex gap-2 text-sm"><Link className="rounded border px-3 py-2" href="/crm/opportunities">Pipeline</Link><Link className="rounded border px-3 py-2" href="/crm/activities">Attività</Link><Link className="rounded border px-3 py-2" href="/crm/pipelines">Configurazione</Link></nav><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label,value]) => <div key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section><section className="grid gap-4 lg:grid-cols-2"><Breakdown title="Per stage" rows={data.stages}/><Breakdown title="Per assegnatario" rows={data.owners}/></section></div>;
}
function Breakdown({ title, rows }: { title: string; rows: Array<{ id: string; name: string; count: number; value: string }> }) { return <section className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">{title}</h2>{rows.map(row => <div key={row.id} className="flex justify-between border-b py-2 text-sm"><span>{row.name}</span><span>{row.count} · {eur(row.value)}</span></div>)}</section>; }
