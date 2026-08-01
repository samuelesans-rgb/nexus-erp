import { auth } from "@/auth";
import { getConfigurationDefinition } from "@/lib/configuration-catalog";
import { getConfigurationFormOptions, getConfigurationList, getConfigurationRecord, type ConfigurationListParams } from "@/lib/configurations";
import { requireModule } from "@/lib/modules";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveConfiguration, setConfigurationLifecycle } from "../actions";
import ConfigurationForm from "../configuration-form";

function pageHref(params: Pick<ConfigurationListParams, "q" | "active" | "lifecycle">, page: number) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.active) query.set("active", params.active);
  if (params.lifecycle) query.set("lifecycle", params.lifecycle);
  query.set("page", String(page));
  return `?${query}`;
}

export default async function ConfigurationPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<ConfigurationListParams & { edit?: string; success?: string }> }) {
  const session = await auth(); if (!session?.user?.companyId) redirect("/login");
  if (!session.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN")) redirect("/dashboard");
  const { key } = await params; const definition = getConfigurationDefinition(key); if (!definition) notFound();
  await requireModule(session.user.companyId, definition.requiredModule);
  const query = await searchParams;
  const [list, record, options] = await Promise.all([getConfigurationList(session.user.companyId, definition.key, query), query.edit ? getConfigurationRecord(session.user.companyId, definition.key, query.edit) : null, getConfigurationFormOptions(session.user.companyId, definition.key, query.edit)]);
  const defaults = record ? JSON.parse(JSON.stringify(record)) : undefined;
  const action = saveConfiguration.bind(null, definition.key, record?.id ?? null);
  return <div className="space-y-6"><div><Link href="/settings/configurations" className="text-sm text-slate-500">← Configurazioni</Link><h1 className="mt-2 text-3xl font-bold">{definition.label}</h1><p className="text-slate-500">{definition.description}</p></div>
    {query.success && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{query.success}</p>}
    <ConfigurationForm key={record?.id ?? "new"} action={action} kind={definition.kind} defaults={defaults} categories={options.categories} items={options.items}/>
    <form className="flex flex-wrap gap-3 rounded-xl border bg-white p-4"><input name="q" defaultValue={list.params.q} placeholder="Cerca codice, nome, descrizione" className="min-w-64 flex-1 rounded-lg border px-3 py-2 text-sm"/><select name="active" defaultValue={list.params.active ?? ""} className="rounded-lg border px-3 py-2 text-sm"><option value="">Tutti gli stati</option><option value="true">Attivi</option><option value="false">Non attivi</option></select><select name="lifecycle" defaultValue={list.params.lifecycle ?? ""} className="rounded-lg border px-3 py-2 text-sm"><option value="">Operativi</option><option value="deleted">Eliminati</option><option value="all">Tutti</option></select><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Filtra</button></form>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full"><thead><tr className="border-b bg-slate-50 text-left text-sm"><th className="p-3">Codice</th><th className="p-3">Nome</th><th className="p-3">Dettaglio</th><th className="p-3">Stato</th><th className="p-3 text-right">Azioni</th></tr></thead><tbody>{list.rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-3 font-mono text-xs">{row.code}</td><td className="p-3"><p className="font-medium">{row.name}</p><p className="text-xs text-slate-500">{row.description}</p></td><td className="p-3 text-sm">{row.detail ?? "—"}</td><td className="p-3 text-sm">{row.deletedAt ? "Eliminato" : row.active ? "Attivo" : "Non attivo"}</td><td className="p-3"><div className="flex justify-end gap-2">{!row.deletedAt && <Link href={`?edit=${row.id}`} className="rounded-lg border px-3 py-1.5 text-sm">Modifica</Link>}<form action={setConfigurationLifecycle}><input type="hidden" name="key" value={definition.key}/><input type="hidden" name="id" value={row.id}/><input type="hidden" name="restore" value={row.deletedAt ? "true" : "false"}/><button className="rounded-lg border px-3 py-1.5 text-sm">{row.deletedAt ? "Ripristina" : "Elimina"}</button></form></div></td></tr>)}</tbody></table>{list.rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nessun risultato.</p>}</div>
    <div className="flex items-center justify-between text-sm"><span>{list.total} risultati</span><div className="flex gap-2">{list.page > 1 && <Link className="rounded border px-3 py-1" href={pageHref(list.params, list.page - 1)}>Precedente</Link>}<span>Pagina {list.page} di {list.pageCount}</span>{list.page < list.pageCount && <Link className="rounded border px-3 py-1" href={pageHref(list.params, list.page + 1)}>Successiva</Link>}</div></div>
  </div>;
}
