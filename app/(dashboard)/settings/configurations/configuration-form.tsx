"use client";

import { useActionState, useState } from "react";
import type { ConfigurationFormState } from "./actions";

type SimpleOption = { id: string; code: string; name: string };
type Defaults = Record<string, unknown> & { id?: string; code?: string; name?: string; description?: string | null; active?: boolean; items?: Array<{ itemId: string; price: string }> };
const input = "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm";

export default function ConfigurationForm({ action, kind, defaults, categories, items }: { action: (state: ConfigurationFormState, formData: FormData) => Promise<ConfigurationFormState>; kind: string; defaults?: Defaults; categories: SimpleOption[]; items: SimpleOption[] }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return <form action={formAction} className="space-y-4 rounded-xl border bg-white p-5">
    {state.message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
    <div className="grid gap-4 md:grid-cols-2"><Field name="code" label="Codice" value={defaults?.code} error={state.errors?.code}/><Field name="name" label="Nome" value={defaults?.name} error={state.errors?.name}/></div>
    <label className="block text-sm font-medium">Descrizione<textarea name="description" rows={2} className={input} defaultValue={String(defaults?.description ?? "")}/></label>
    {kind === "category" && <Select name="parentId" label="Categoria padre" value={String(defaults?.parentId ?? "")} options={categories}/>}
    {kind === "unit" && <div className="grid gap-4 md:grid-cols-2"><Field name="symbol" label="Simbolo" value={defaults?.symbol} error={state.errors?.symbol}/><Field name="precision" label="Decimali" type="number" value={defaults?.precision ?? 2} error={state.errors?.precision}/></div>}
    {kind === "vat" && <div className="grid gap-4 md:grid-cols-2"><Field name="percentage" label="Percentuale" type="number" step="0.01" value={defaults?.percentage} error={state.errors?.percentage}/><Field name="natureCode" label="Codice natura" value={defaults?.natureCode}/></div>}
    {kind === "price-list" && <><Field name="currency" label="Valuta" value={defaults?.currency ?? "EUR"}/><PriceRows items={items} defaults={defaults?.items ?? []}/></>}
    {kind === "payment-term" && <div className="grid gap-4 md:grid-cols-2"><Field name="dueDays" label="Giorni scadenza" type="number" value={defaults?.dueDays} error={state.errors?.dueDays}/><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="endOfMonth" defaultChecked={Boolean(defaults?.endOfMonth)}/> Fine mese</label><label className="block text-sm font-medium md:col-span-2">Rate personalizzate (giorni:percentuale)<textarea name="installments" rows={4} className={input} defaultValue={installmentsText(defaults?.installments)}/>{state.errors?.installments && <span className="text-xs text-red-600">{state.errors.installments}</span>}</label></div>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={defaults?.active ?? true}/> Attivo</label>
    <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "Salvataggio..." : defaults?.id ? "Salva modifiche" : "Crea"}</button>
  </form>;
}

function Field({ name, label, value, type = "text", step, error }: { name: string; label: string; value?: unknown; type?: string; step?: string; error?: string }) { return <label className="block text-sm font-medium">{label}<input name={name} type={type} step={step} defaultValue={String(value ?? "")} className={input}/>{error && <span className="text-xs text-red-600">{error}</span>}</label>; }
function Select({ name, label, value, options }: { name: string; label: string; value: string; options: SimpleOption[] }) { return <label className="block text-sm font-medium">{label}<select name={name} defaultValue={value} className={input}><option value="">Nessuna</option>{options.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}</select></label>; }
function installmentsText(value: unknown) { return Array.isArray(value) ? value.map((row) => { const item = row as { days: number; percentage: number }; return `${item.days}:${item.percentage}`; }).join("\n") : ""; }
function PriceRows({ items, defaults }: { items: SimpleOption[]; defaults: Array<{ itemId: string; price: string }> }) {
  const initial = Object.fromEntries(defaults.map(({ itemId, price }) => [itemId, price]));
  const [prices, setPrices] = useState<Record<string, string>>(initial);
  return <fieldset><legend className="text-sm font-semibold">Prezzi Item</legend><div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">{items.map((item) => { const selected = item.id in prices; return <div key={item.id} className="grid grid-cols-[1fr_8rem] items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected} onChange={(event) => setPrices((current) => { const next = { ...current }; if (event.target.checked) next[item.id] = "0"; else delete next[item.id]; return next; })}/>{item.code} · {item.name}</label>{selected && <><input type="hidden" name="itemId" value={item.id}/><input name="itemPrice" type="number" min="0" step="0.01" value={prices[item.id]} onChange={(event) => setPrices((current) => ({ ...current, [item.id]: event.target.value }))} className="rounded-lg border px-2 py-1 text-sm" aria-label={`Prezzo ${item.name}`}/></>}</div>; })}</div></fieldset>;
}
