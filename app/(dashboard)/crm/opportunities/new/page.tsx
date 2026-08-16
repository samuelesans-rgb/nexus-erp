import { CRM_CAPABILITIES, requireCrmContext } from "@/lib/crm-access";
import { getCrmOptions } from "@/lib/crm";
import { createOpportunityAction } from "../../actions";

type FormDefaults = Partial<Record<"partnerId" | "pipelineId" | "stageId" | "ownerMembershipId" | "locationId" | "expectedCloseDate" | "title" | "description" | "source" | "estimatedValue" | "probability" | "currency" | "lostReason", string>>;

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<{ partnerId?: string | string[] }> }) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  const options = await getCrmOptions(actor);
  const query = await searchParams;
  const requestedPartnerId = typeof query.partnerId === "string" ? query.partnerId : undefined;
  const partnerId = options.partners.some((partner) => partner.id === requestedPartnerId) ? requestedPartnerId : undefined;
  const pipeline = options.pipelines.find((row) => row.isDefault) ?? options.pipelines[0];
  const stage = (pipeline?.stages as Array<{ id: string; probability: number }> | undefined)?.[0];
  return <div className="max-w-3xl space-y-5"><h1 className="text-3xl font-bold">Nuova opportunità</h1><OpportunityForm options={options} action={createOpportunityAction} defaults={{ partnerId, pipelineId: pipeline?.id, stageId: stage?.id, ownerMembershipId: actor.membershipId, probability: String(stage?.probability ?? 10) }}/></div>;
}

export function OpportunityForm({ options, action, defaults = {} }: { options: Awaited<ReturnType<typeof getCrmOptions>>; action: (data: FormData) => Promise<void>; defaults?: FormDefaults }) {
  const pipelineId = defaults.pipelineId ?? options.pipelines.find((row) => row.isDefault)?.id ?? options.pipelines[0]?.id;
  const stages = (options.pipelines.find((row) => row.id === pipelineId)?.stages ?? []) as Array<{ id: string; name: string; probability: number }>;
  return <form action={action} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
    <Field name="title" label="Titolo" value={defaults.title}/>
    <Select name="partnerId" label="Partner" rows={options.partners} value={defaults.partnerId}/>
    <Select name="pipelineId" label="Pipeline" rows={options.pipelines} value={pipelineId}/>
    <Select name="stageId" label="Stage" rows={stages} value={defaults.stageId}/>
    <Select name="ownerMembershipId" label="Assegnatario" rows={options.memberships} value={defaults.ownerMembershipId}/>
    <Select name="locationId" label="Contesto sede" rows={options.locations} value={defaults.locationId ?? ""} optional/>
    <Field name="estimatedValue" label="Valore" value={defaults.estimatedValue ?? "0"}/>
    <Field name="currency" label="Valuta" value={defaults.currency ?? "EUR"}/>
    <Field name="probability" label="Probabilità" value={defaults.probability ?? "10"}/>
    <Field name="expectedCloseDate" label="Chiusura prevista" type="date" value={defaults.expectedCloseDate}/>
    <Field name="source" label="Origine" value={defaults.source}/>
    <Field name="lostReason" label="Motivo perdita" value={defaults.lostReason}/>
    <label className="md:col-span-2">Descrizione<textarea name="description" defaultValue={defaults.description} className="mt-1 block w-full rounded border p-2"/></label>
    <button className="rounded bg-slate-900 px-4 py-2 text-white md:col-span-2">Salva</button>
  </form>;
}

function Field({ name, label, value, type = "text" }: { name: string; label: string; value?: string; type?: string }) {
  return <label>{label}<input required={name === "title"} type={type} name={name} defaultValue={value} className="mt-1 block w-full rounded border p-2"/></label>;
}

function Select({ name, label, rows, value, optional }: { name: string; label: string; rows: Array<{ id: string; name: string }>; value?: string; optional?: boolean }) {
  return <label>{label}<select name={name} defaultValue={value} className="mt-1 block w-full rounded border p-2">{optional && <option value="">Company-wide</option>}{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>;
}
