import type { RestaurantReservationStatus } from "@/generated/prisma/client";
import { requireCurrentLocation } from "@/lib/location-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { getAssignableTables, getReservationHistory, getStaffReservation, shouldSuggestNoShow } from "@/lib/restaurant-booking";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignBookingTableAction, transitionBookingAction, unassignBookingTableAction, updateBookingAction } from "../actions";
import { assignCombinedTablesAction } from "../../floor/actions";

const allowed: Partial<Record<RestaurantReservationStatus, RestaurantReservationStatus[]>> = {
  WAITLIST: ["PENDING", "CONFIRMED", "CANCELLED"],
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
};
const actionLabels: Partial<Record<RestaurantReservationStatus, string>> = { PENDING: "Promuovi in attesa", CONFIRMED: "Conferma", CANCELLED: "Annulla", SEATED: "Segna al tavolo", COMPLETED: "Completa", NO_SHOW: "Segna no-show" };
const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" });
const inputDateTime = (value: Date) => {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
};

export default async function ReservationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ id }, messages, context, location] = await Promise.all([
    params,
    searchParams,
    requireRestaurantContext(MODULE_CODES.RESTAURANT_RESERVATIONS),
    requireCurrentLocation(),
  ]);
  const reservation = await getStaffReservation(context.companyId, location.id, id);
  if (!reservation) notFound();
  const [tables, history, noShowSuggested] = await Promise.all([getAssignableTables(context.companyId, location.id), getReservationHistory(context.companyId, id), shouldSuggestNoShow(context.companyId, location.id, id)]);
  const currentTable = reservation.tables[0]?.table;
  const assignedNames = reservation.tables.map(({table})=>table.code+" · "+table.name).join(", ");
  const mutable = !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(reservation.status);

  return <div className="space-y-6">
    <div><Link className="text-sm underline" href="/restaurant/reservations">← Prenotazioni</Link><h1 className="mt-2 text-3xl font-bold">{reservation.code}</h1><p className="text-slate-500">Sede corrente: {location.name}</p></div>
    {messages.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{messages.error}</p>}
    {messages.success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{messages.success}</p>}
    <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4" aria-labelledby="summary-title">
      <h2 id="summary-title" className="sr-only">Riepilogo</h2>
      <div><span className="text-xs uppercase text-slate-500">Cliente</span><p className="font-medium">{reservation.guestName}</p><p className="text-sm">{reservation.phone || "—"}</p><p className="text-sm">{reservation.email || "—"}</p></div>
      <div><span className="text-xs uppercase text-slate-500">Data e ora</span><p className="font-medium">{dateTime.format(reservation.startTime)}</p><p className="text-sm">Durata: {reservation.durationMinutes} min</p></div>
      <div><span className="text-xs uppercase text-slate-500">Prenotazione</span><p className="font-medium">{reservation.partySize} persone</p><p className="text-sm">{reservation.status} · {reservation.source}</p></div>
      <div><span className="text-xs uppercase text-slate-500">Tavolo</span><p className={currentTable ? "font-medium" : "font-medium text-amber-700"}>{assignedNames || "Senza tavolo"}</p></div>
      <div className="sm:col-span-2"><span className="text-xs uppercase text-slate-500">Note cliente</span><p className="whitespace-pre-wrap text-sm">{reservation.notes || "—"}</p></div>
      <div className="sm:col-span-2"><span className="text-xs uppercase text-slate-500">Note interne</span><p className="whitespace-pre-wrap text-sm">{reservation.internalNotes || "—"}</p></div>
    </section>
    {noShowSuggested && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">La soglia no-show è trascorsa. Verifica l’arrivo prima di segnare manualmente NO_SHOW.</p>}
    {(allowed[reservation.status]?.length ?? 0) > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Azioni consentite</h2><div className="flex flex-wrap gap-2">{allowed[reservation.status]?.map((status) => <form action={transitionBookingAction} key={status}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className="rounded-lg border px-3 py-2 text-sm font-medium">{actionLabels[status]}</button></form>)}</div></section>}
    {mutable && <section className="grid gap-6 lg:grid-cols-2">
      <form action={assignBookingTableAction} className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Assegnazione tavolo</h2><input type="hidden" name="id" value={id} /><label className="grid gap-1 text-sm"><span>Tavolo</span><select required name="tableId" defaultValue={currentTable?.id ?? ""} className="rounded-lg border px-3 py-2"><option value="" disabled>Seleziona tavolo</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.code} · {table.name} · {table.maxSeats ?? table.seats} posti</option>)}</select></label><div className="flex flex-wrap gap-2"><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">{currentTable ? "Cambia tavolo" : "Assegna tavolo"}</button>{currentTable && <button formAction={unassignBookingTableAction} className="rounded-lg border px-4 py-2 text-sm">Rimuovi assegnazione</button>}</div></form>
      <form action={assignCombinedTablesAction} className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Assegnazione combinata</h2><input type="hidden" name="reservationId" value={id}/><select className="min-h-40 w-full rounded border p-2" name="tableIds" multiple defaultValue={reservation.tables.map(x=>x.table.id)}>{tables.map(table=><option key={table.id} value={table.id}>{table.code} · {table.name} · {table.maxSeats??table.seats} posti</option>)}</select><button className="rounded bg-slate-900 px-4 py-2 text-white">Assegna tavoli selezionati</button></form>
            <form action={updateBookingAction} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"><h2 className="text-lg font-semibold sm:col-span-2">Modifica prenotazione</h2><input type="hidden" name="id" value={id} /><label className="grid gap-1 text-sm sm:col-span-2"><span>Nome cliente</span><input required name="guestName" defaultValue={reservation.guestName} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Telefono</span><input name="phone" type="tel" defaultValue={reservation.phone ?? ""} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Email</span><input name="email" type="email" defaultValue={reservation.email ?? ""} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm sm:col-span-2"><span>Data e ora</span><input required name="startTime" type="datetime-local" defaultValue={inputDateTime(reservation.startTime)} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Durata (minuti)</span><input required min={15} step={15} name="durationMinutes" type="number" defaultValue={reservation.durationMinutes} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Persone</span><input required min={1} name="partySize" type="number" defaultValue={reservation.partySize} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm sm:col-span-2"><span>Note cliente</span><textarea name="notes" defaultValue={reservation.notes ?? ""} rows={3} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm sm:col-span-2"><span>Note interne</span><textarea name="internalNotes" defaultValue={reservation.internalNotes ?? ""} rows={3} className="rounded-lg border px-3 py-2" /></label><button className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm text-white sm:col-span-2">Salva modifiche</button></form>
    </section>}
    <section className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Cronologia essenziale</h2><ol className="space-y-2 text-sm">{history.map((entry) => <li key={entry.id} className="flex flex-col border-b pb-2 last:border-0 sm:flex-row sm:justify-between"><span>{entry.eventType}</span><time dateTime={entry.occurredAt.toISOString()} className="text-slate-500">{dateTime.format(entry.occurredAt)}</time></li>)}{!history.length && <li className="text-slate-500">Nessun evento registrato.</li>}</ol></section>
  </div>;
}
