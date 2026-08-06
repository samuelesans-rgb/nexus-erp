"use client";

import { useActionState, useState } from "react";
import { submitPublicBookingAction, type PublicBookingState } from "./actions";

const initialState: PublicBookingState = {};
const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short" });

export function PublicBookingForm({ locationSlug, partySize, slots }: { locationSlug: string; partySize: number; slots: string[] }) {
  const action = submitPublicBookingAction.bind(null, locationSlug);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (state.confirmation) return <section className="rounded-2xl border bg-white p-6 shadow-sm" aria-labelledby="confirmation-title">
    <p className="text-sm font-medium text-emerald-700">Prenotazione ricevuta</p>
    <h2 id="confirmation-title" className="mt-1 text-2xl font-bold">{state.confirmation.code}</h2>
    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Sede</dt><dd className="font-medium">{state.confirmation.locationName}</dd></div><div><dt className="text-slate-500">Data e ora</dt><dd className="font-medium">{dateTime.format(new Date(state.confirmation.startTime))}</dd></div><div><dt className="text-slate-500">Persone</dt><dd className="font-medium">{state.confirmation.partySize}</dd></div></dl>
    <p className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">{state.confirmation.confirmationMessage}</p>
  </section>;

  return <form action={formAction} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="partySize" value={partySize} />
    <fieldset className="space-y-3"><legend className="text-lg font-semibold">Scegli l’orario</legend>{slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map((slot, index) => <label key={slot} className="cursor-pointer"><input required className="peer sr-only" type="radio" name="startTime" value={slot} defaultChecked={index === 0} /><span className="block rounded-lg border px-3 py-2 text-center text-sm peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white">{new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(slot))}</span></label>)}</div> : <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nessuno slot disponibile. Prova un’altra data o un numero diverso di persone.</p>}</fieldset>
    {slots.length > 0 && <><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm sm:col-span-2"><span>Nome e cognome</span><input required minLength={2} maxLength={120} autoComplete="name" name="guestName" className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Telefono</span><input required minLength={6} maxLength={40} autoComplete="tel" type="tel" name="phone" className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Email</span><input required maxLength={254} autoComplete="email" type="email" name="email" className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm sm:col-span-2"><span>Note (facoltative)</span><textarea maxLength={1000} rows={3} name="notes" className="rounded-lg border px-3 py-2" /></label></div><label className="flex items-start gap-3 text-sm"><input required type="checkbox" name="privacyConsent" className="mt-1 size-4" /><span>Acconsento al trattamento dei dati per la gestione della prenotazione.</span></label>{state.error && <p role="alert" aria-live="polite" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}<button disabled={pending} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Prenotazione in corso…" : "Conferma prenotazione"}</button></>}
  </form>;
}
