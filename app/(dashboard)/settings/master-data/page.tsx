import { getMasterData } from "@/lib/master-data";
import { hasMasterDataCapability, requireMasterDataContext } from "@/lib/master-data-access";
import { saveCategory, saveUnit, saveVat, toggleCategory, toggleUnit, toggleVat } from "./actions";

const input = "rounded border px-2 py-1 text-sm";
type Row = { id: string; code: string; name: string; description: string | null; active: boolean };

function CommonFields({ row }: { row?: Row }) {
  return <><input type="hidden" name="id" value={row?.id ?? ""}/><input className={input} name="code" placeholder="Codice" defaultValue={row?.code} required/><input className={input} name="name" placeholder="Nome" defaultValue={row?.name} required/><input className={input} name="description" placeholder="Descrizione" defaultValue={row?.description ?? ""}/></>;
}

function Status({ active }: { active: boolean }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{active ? "Attiva" : "Non attiva"}</span>;
}

function Lifecycle({ row, action }: { row: Row; action: (data: FormData) => Promise<void> }) {
  return <form action={action}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="active" value={String(!row.active)}/><button className="rounded border px-3 py-1 text-sm">{row.active ? "Disattiva" : "Attiva"}</button></form>;
}

function Shell({ row, lifecycle, children }: { row: Row; lifecycle: React.ReactNode; children: React.ReactNode }) {
  return <article className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><b>{row.code} · {row.name}</b><div className="mt-1"><Status active={row.active}/></div></div>{lifecycle}</div>{children}</article>;
}

export default async function MasterDataPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const context = await requireMasterDataContext();
  const data = await getMasterData(context.companyId);
  const writable = hasMasterDataCapability(context.roles, "write");
  const query = await searchParams;
  return <div className="space-y-8"><div><h1 className="text-3xl font-bold">Dati base prodotto</h1><p className="text-slate-500">Aliquote IVA, unità di misura e categorie della società corrente.</p></div>{query.success && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{query.success}</p>}{query.error && <p className="rounded bg-red-50 p-3 text-red-800">{query.error}</p>}
    <Section title="Aliquote IVA" note="Le aliquote già usate conservano importi storici, ma codice, percentuale e natura restano bloccati: disattiva l'aliquota e creane una nuova.">
      {writable && <form action={saveVat} className="grid gap-2 md:grid-cols-6"><CommonFields/><input className={input} name="percentage" type="number" min="0" max="100" step="0.01" placeholder="Percentuale" required/><input className={input} name="natureCode" placeholder="Natura/esenzione"/><button className="rounded bg-slate-900 px-3 py-1 text-white">Crea</button></form>}
      {data.vatRates.map((row) => <Shell key={row.id} row={row} lifecycle={writable ? <Lifecycle row={row} action={toggleVat}/> : null}>{writable ? <details><summary className="cursor-pointer text-sm underline">Modifica</summary><form action={saveVat} className="mt-3 grid gap-2 md:grid-cols-6"><CommonFields row={row}/><input className={input} name="percentage" type="number" min="0" max="100" step="0.01" defaultValue={Number(row.percentage)} required/><input className={input} name="natureCode" defaultValue={row.natureCode ?? ""} placeholder="Natura/esenzione"/><button className="rounded border px-3 py-1">Salva modifiche</button></form></details> : <Read row={row} extra={`${Number(row.percentage)}%${row.natureCode ? ` · ${row.natureCode}` : ""}`}/>}</Shell>)}
    </Section>
    <Section title="Unità di misura" note="La precisione non può cambiare dopo che l'unità è stata utilizzata; nome, codice, simbolo, descrizione e stato restano gestibili.">
      {writable && <form action={saveUnit} className="grid gap-2 md:grid-cols-6"><CommonFields/><input className={input} name="symbol" placeholder="Simbolo" required/><input className={input} name="precision" type="number" min="0" max="6" defaultValue="2" required/><button className="rounded bg-slate-900 px-3 py-1 text-white">Crea</button></form>}
      {data.units.map((row) => <Shell key={row.id} row={row} lifecycle={writable ? <Lifecycle row={row} action={toggleUnit}/> : null}>{writable ? <details><summary className="cursor-pointer text-sm underline">Modifica</summary><form action={saveUnit} className="mt-3 grid gap-2 md:grid-cols-6"><CommonFields row={row}/><input className={input} name="symbol" defaultValue={row.symbol} required/><input className={input} name="precision" type="number" min="0" max="6" defaultValue={row.precision} required/><button className="rounded border px-3 py-1">Salva modifiche</button></form></details> : <Read row={row} extra={`${row.symbol} · ${row.precision} decimali`}/>}</Shell>)}
    </Section>
    <Section title="Categorie prodotto" note="Le categorie utilizzate non vengono eliminate: possono essere modificate o disattivate senza rompere i riferimenti esistenti.">
      {writable && <form action={saveCategory} className="grid gap-2 md:grid-cols-4"><CommonFields/><button className="rounded bg-slate-900 px-3 py-1 text-white">Crea</button></form>}
      {data.categories.map((row) => <Shell key={row.id} row={row} lifecycle={writable ? <Lifecycle row={row} action={toggleCategory}/> : null}>{writable ? <details><summary className="cursor-pointer text-sm underline">Modifica</summary><form action={saveCategory} className="mt-3 grid gap-2 md:grid-cols-4"><CommonFields row={row}/><button className="rounded border px-3 py-1">Salva modifiche</button></form></details> : <Read row={row}/>}</Shell>)}
    </Section>
  </div>;
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) { return <section className="space-y-4 rounded-xl border bg-white p-5"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-slate-500">{note}</p></div>{children}</section>; }
function Read({ row, extra }: { row: Row; extra?: string }) { return <p className="text-sm text-slate-600">{row.description || "Nessuna descrizione"}{extra ? ` · ${extra}` : ""}</p>; }
