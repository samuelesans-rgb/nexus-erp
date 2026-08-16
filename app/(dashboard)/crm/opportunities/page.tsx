import Link from "next/link";
import { hasCrmCapability, CRM_CAPABILITIES, requireCrmContext } from "@/lib/crm-access";
import { getCrmOpportunities, getCrmPipelines } from "@/lib/crm";
import { moveOpportunityAction } from "../actions";

export default async function OpportunitiesPage() {
  const actor = await requireCrmContext();
  const [opportunities, pipelines] = await Promise.all([getCrmOpportunities(actor), getCrmPipelines(actor)]);
  const stages = pipelines.flatMap(p => p.stages as Array<{id:string;name:string;sortOrder:number;type:string}>).sort((a,b)=>a.sortOrder-b.sortOrder);
  const canWrite = hasCrmCapability(actor.roles, CRM_CAPABILITIES.WRITE);
  return <div className="space-y-5"><div className="flex justify-between"><h1 className="text-3xl font-bold">Opportunità</h1>{canWrite && <Link href="/crm/opportunities/new" className="rounded bg-slate-900 px-4 py-2 text-white">Nuova</Link>}</div><div className="grid gap-4 overflow-x-auto" style={{gridTemplateColumns:`repeat(${Math.max(stages.length,1)}, minmax(260px,1fr))`}}>{stages.map(stage => <section key={stage.id} className="rounded-xl bg-slate-100 p-3"><h2 className="mb-3 font-semibold">{stage.name}</h2>{opportunities.filter(o=>o.stageId===stage.id).map(o=><article key={o.id} className="mb-3 rounded-lg border bg-white p-3"><Link href={`/crm/opportunities/${o.id}`} className="font-medium">{o.title}</Link><p className="text-sm text-slate-500">{o.partnerName} · {o.estimatedValue} {o.currency}</p><p className="text-xs text-slate-500">{o.ownerName}</p>{canWrite && <form action={moveOpportunityAction} className="mt-2"><input type="hidden" name="opportunityId" value={o.id}/><select name="stageId" defaultValue={o.stageId} className="w-full rounded border p-1 text-xs">{stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input name="lostReason" placeholder="Motivo se persa" className="mt-1 w-full rounded border p-1 text-xs"/><button className="mt-1 text-xs underline">Sposta</button></form>}</article>)}</section>)}</div></div>;
}
