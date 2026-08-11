import { requireCurrentLocation } from "@/lib/location-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { canManageBookingSettings, getRestaurantBookingSettings } from "@/lib/restaurant-booking-settings";
import { redirect } from "next/navigation";
import { saveBookingSettingsAction } from "./actions";

const days = [["1", "Lunedì"], ["2", "Martedì"], ["3", "Mercoledì"], ["4", "Giovedì"], ["5", "Venerdì"], ["6", "Sabato"], ["0", "Domenica"]] as const;
const defaults = { enabled: false, openingHours: {} as Record<string, Array<[string, string]>>, slotIntervalMinutes: 30, defaultDurationMinutes: 120, minAdvanceMinutes: 60, maxAdvanceDays: 90, maxCoversPerSlot: 0, internalNotificationEmail: "", confirmationMessage: "" };
const input = "rounded-lg border px-3 py-2";

function storedHours(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults.openingHours;
  return value as typeof defaults.openingHours;
}

export default async function BookingSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [context, location, messages] = await Promise.all([
    requireRestaurantContext(MODULE_CODES.RESTAURANT_RESERVATIONS, "manage"),
    requireCurrentLocation(),
    searchParams,
  ]);
  if (!canManageBookingSettings(context.roles) || context.companyId !== location.companyId) redirect("/dashboard");
  const stored = await getRestaurantBookingSettings(context.companyId, location.id);
  const settings = { ...defaults, ...stored, openingHours: storedHours(stored?.openingHours) };

  return <div className="space-y-6">
    <header><h1 className="text-3xl font-bold">Impostazioni prenotazioni</h1><p className="text-slate-500">Sede corrente: {location.name} · timezone {location.timezone}</p></header>
    {messages.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{messages.error}</p>}
    {messages.success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{messages.success}</p>}
    <form action={saveBookingSettingsAction} className="space-y-6 rounded-xl border bg-white p-6">
      <label className="flex items-center gap-3 font-medium"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Prenotazioni pubbliche attive</label>
      <section className="space-y-3"><div><h2 className="text-xl font-semibold">Orari settimanali</h2><p className="text-sm text-slate-500">Gli orari sono interpretati nella timezone {location.timezone}. Inserisci un intervallo per riga, ad esempio 12:00-14:30.</p></div>
        {days.map(([key, label]) => { const intervals = settings.openingHours[key] ?? []; return <div key={key} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[10rem_1fr]"><label className="flex items-start gap-2 font-medium"><input type="checkbox" name={`day-${key}-enabled`} defaultChecked={intervals.length > 0} /> {label}</label><textarea className={input} rows={Math.max(2, intervals.length)} name={`day-${key}-intervals`} defaultValue={intervals.map(([start, end]) => `${start}-${end}`).join("\n")} placeholder={"12:00-14:30\n19:00-23:00"} /><p className="text-xs text-slate-500 md:col-start-2">Disattiva il giorno per impostarlo come chiuso.</p></div>; })}
      </section>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <NumberField name="slotIntervalMinutes" label="Intervallo slot (minuti)" value={settings.slotIntervalMinutes} min={5} max={240} />
        <NumberField name="defaultDurationMinutes" label="Durata standard (minuti)" value={settings.defaultDurationMinutes} min={15} max={1440} />
        <NumberField name="minAdvanceMinutes" label="Anticipo minimo (minuti)" value={settings.minAdvanceMinutes} min={0} max={525600} />
        <NumberField name="maxAdvanceDays" label="Anticipo massimo (giorni)" value={settings.maxAdvanceDays} min={1} max={730} />
        <label className="grid gap-1 text-sm font-medium">Coperti massimi per slot<input className={input} name="maxCoversPerSlot" type="number" min="0" max="10000" required defaultValue={settings.maxCoversPerSlot} /><span className="font-normal text-slate-500">0 significa nessun limite globale.</span></label>
        <label className="grid gap-1 text-sm font-medium">Email notifiche interne<input className={input} name="internalNotificationEmail" type="email" maxLength={254} defaultValue={settings.internalNotificationEmail ?? ""} /></label>
        <label className="grid gap-1 text-sm font-medium md:col-span-2 lg:col-span-3">Messaggio di conferma<textarea className={input} name="confirmationMessage" maxLength={1000} rows={4} defaultValue={settings.confirmationMessage ?? ""} /><span className="font-normal text-slate-500">Testo semplice, senza HTML.</span></label>
      </section>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La disponibilità dipende anche dai tavoli attivi e dalla loro capienza.</p>
      <button className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white">Salva</button>
    </form>
  </div>;
}

function NumberField({ name, label, value, min, max }: { name: string; label: string; value: number; min: number; max: number }) {
  return <label className="grid gap-1 text-sm font-medium">{label}<input className={input} name={name} type="number" min={min} max={max} required defaultValue={value} /></label>;
}
