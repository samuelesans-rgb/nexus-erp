"use client";

type LocationDefaults = Record<string, unknown>;

const input = "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm";

export default function LocationForm({ action, defaults }: { action: (formData: FormData) => void | Promise<void>; defaults?: LocationDefaults }) {
  const hasId = typeof defaults?.id === "string";
  return <form action={action} className="space-y-5 rounded-xl border bg-white p-5">
    {hasId && <input type="hidden" name="id" value={String(defaults.id)} />}
    <div className="grid gap-4 md:grid-cols-2"><Field name="code" label="Codice" value={defaults?.code}/><Field name="name" label="Nome" value={defaults?.name}/></div>
    <Field name="description" label="Descrizione" value={defaults?.description}/>
    <div className="grid gap-4 md:grid-cols-2"><Field name="email" label="Email" type="email" value={defaults?.email}/><Field name="phone" label="Telefono" value={defaults?.phone}/></div>
    <Field name="address" label="Indirizzo" value={defaults?.address}/>
    <div className="grid gap-4 md:grid-cols-3"><Field name="city" label="Città" value={defaults?.city}/><Field name="province" label="Provincia" value={defaults?.province}/><Field name="postalCode" label="CAP" value={defaults?.postalCode}/></div>
    <div className="grid gap-4 md:grid-cols-3"><Field name="country" label="Paese" value={defaults?.country ?? "IT"}/><Field name="timezone" label="Fuso orario" value={defaults?.timezone ?? "Europe/Rome"}/><Field name="currency" label="Valuta" value={defaults?.currency ?? "EUR"}/></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={defaults?.active !== false}/> Attiva</label>
    <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{hasId ? "Salva modifiche" : "Crea sede"}</button>
  </form>;
}

function Field({ name, label, value, type = "text" }: { name: string; label: string; value?: unknown; type?: string }) {
  return <label className="block text-sm font-medium">{label}<input name={name} type={type} required={name === "code" || name === "name"} defaultValue={typeof value === "string" ? value : ""} className={input}/></label>;
}
