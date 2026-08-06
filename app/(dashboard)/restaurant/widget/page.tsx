import { requireCurrentLocation } from "@/lib/location-access";
import { requireRestaurant } from "@/lib/restaurant-access";
import { getWidgetAdminConfig } from "@/lib/restaurant-booking-widget";
import { CopySnippet } from "./copy-snippet";
import { regenerateBookingWidgetKeyAction, saveBookingWidgetAction } from "./actions";

const defaults = { enabled: false, allowedDomains: [] as string[], mode: "INLINE", theme: "LIGHT", primaryColor: "#0f172a", secondaryColor: "#ffffff", accentColor: "#059669", borderRadius: 16, fontFamily: "system-ui", buttonLabel: "Prenota ora", heading: "Prenota un tavolo", description: "", privacyUrl: "", successMessage: "Prenotazione ricevuta.", requirePhone: true, requireEmail: true, showNotes: true, locale: "it-IT" };

export default async function RestaurantWidgetPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [context, location, query] = await Promise.all([requireRestaurant("manage"), requireCurrentLocation(), searchParams]);
  const stored = await getWidgetAdminConfig(context.companyId, location.id);
  const widget = { ...defaults, ...stored };
  const origin = process.env.AUTH_URL ?? "http://localhost:3000";
  const snippet = stored ? `<script async src="${origin}/widget/v1/widget.js" data-nexus-booking="${stored.publicKey}"></script>` : "Salva la configurazione per generare lo snippet.";
  const input = "rounded-lg border px-3 py-2";
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Widget prenotazioni</h1><p className="text-slate-500">Sede corrente: {location.name}</p></div>
    {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{query.error}</p>}{query.success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{query.success}</p>}
    <form action={saveBookingWidgetAction} className="grid gap-5 rounded-xl border bg-white p-5 lg:grid-cols-2">
      <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={widget.enabled} /> Widget abilitato</label><div />
      <label className="grid gap-1 text-sm lg:col-span-2">Domini consentiti<textarea className={input} rows={3} name="allowedDomains" defaultValue={widget.allowedDomains.join("\n")} placeholder="example.com" /><span className="text-xs text-slate-500">Uno per riga. Vuoto consente qualsiasi dominio.</span>{widget.allowedDomains.length === 0 && <span className="rounded-lg bg-amber-50 p-3 font-medium text-amber-900">Nessun dominio configurato: il widget può essere incorporato da qualsiasi sito.</span>}</label>
      <label className="grid gap-1 text-sm">Modalità<select className={input} name="mode" defaultValue={widget.mode}><option>INLINE</option><option>MODAL</option></select></label><label className="grid gap-1 text-sm">Tema<select className={input} name="theme" defaultValue={widget.theme}><option>LIGHT</option><option>DARK</option><option>AUTO</option></select></label>
      <label className="grid gap-1 text-sm">Colore primario<input className={input} type="color" name="primaryColor" defaultValue={widget.primaryColor} /></label><label className="grid gap-1 text-sm">Colore secondario<input className={input} type="color" name="secondaryColor" defaultValue={widget.secondaryColor} /></label><label className="grid gap-1 text-sm">Colore accento<input className={input} type="color" name="accentColor" defaultValue={widget.accentColor} /></label><label className="grid gap-1 text-sm">Raggio bordi<input className={input} type="number" min="0" max="40" name="borderRadius" defaultValue={widget.borderRadius} /></label>
      <label className="grid gap-1 text-sm">Font<input className={input} name="fontFamily" defaultValue={widget.fontFamily} /></label><label className="grid gap-1 text-sm">Locale<input className={input} name="locale" defaultValue={widget.locale} /></label><label className="grid gap-1 text-sm">Etichetta pulsante<input className={input} name="buttonLabel" defaultValue={widget.buttonLabel} /></label><label className="grid gap-1 text-sm">Titolo<input className={input} name="heading" defaultValue={widget.heading} /></label>
      <label className="grid gap-1 text-sm lg:col-span-2">Descrizione<textarea className={input} name="description" defaultValue={widget.description ?? ""} /></label><label className="grid gap-1 text-sm">URL privacy<input className={input} type="url" name="privacyUrl" defaultValue={widget.privacyUrl ?? ""} /></label><label className="grid gap-1 text-sm">Messaggio successo<input className={input} name="successMessage" defaultValue={widget.successMessage} /></label>
      <div className="flex flex-wrap gap-4 lg:col-span-2"><label><input type="checkbox" name="requirePhone" defaultChecked={widget.requirePhone} /> Telefono obbligatorio</label><label><input type="checkbox" name="requireEmail" defaultChecked={widget.requireEmail} /> Email obbligatoria</label><label><input type="checkbox" name="showNotes" defaultChecked={widget.showNotes} /> Mostra note</label></div><button className="rounded-lg bg-slate-900 px-4 py-3 font-medium text-white lg:col-span-2">Salva configurazione</button>
    </form>
    <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Installazione</h2><code className="block overflow-x-auto rounded bg-slate-950 p-4 text-sm text-white">{snippet}</code><div className="flex gap-3">{stored && <CopySnippet snippet={snippet} />}{stored && <form action={regenerateBookingWidgetKeyAction}><button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700">Rigenera chiave</button></form>}</div></section>
    {stored?.enabled && <section className="space-y-3"><h2 className="text-xl font-semibold">Anteprima</h2><iframe className="h-[720px] w-full rounded-xl border" title="Anteprima widget prenotazioni" src={`/embed/booking/${stored.publicKey}`} /></section>}
  </div>;
}
