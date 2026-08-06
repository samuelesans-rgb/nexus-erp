import type { RestaurantReservationStatus } from "@/generated/prisma/client";
import { requireCurrentLocation } from "@/lib/location-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { getStaffReservations } from "@/lib/restaurant-booking";
import Link from "next/link";

const statuses: RestaurantReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ date?: string; q?: string; status?: string }> }) {
  const [context, location, params] = await Promise.all([
    requireRestaurantContext(MODULE_CODES.RESTAURANT_RESERVATIONS),
    requireCurrentLocation(),
    searchParams,
  ]);
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? new Date(`${params.date}T00:00:00`) : new Date();
  const selectedStatus = statuses.includes(params.status as RestaurantReservationStatus) ? params.status as RestaurantReservationStatus : undefined;
  const reservations = await getStaffReservations(context.companyId, location.id, { date: selectedDate, query: params.q, status: selectedStatus });

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="text-3xl font-bold">Prenotazioni</h1><p className="text-slate-500">Sede corrente: {location.name}</p></div>
      <Link className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/restaurant/reservations/new">Nuova prenotazione</Link>
    </div>
    <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto_auto]" aria-label="Filtri prenotazioni">
      <label className="grid gap-1 text-sm"><span>Data</span><input className="rounded-lg border px-3 py-2" type="date" name="date" defaultValue={dateFormatter.format(selectedDate)} /></label>
      <label className="grid gap-1 text-sm"><span>Ricerca</span><input className="rounded-lg border px-3 py-2" name="q" defaultValue={params.q} placeholder="Nome, telefono, email o codice" /></label>
      <label className="grid gap-1 text-sm"><span>Stato</span><select className="rounded-lg border px-3 py-2" name="status" defaultValue={selectedStatus ?? ""}><option value="">Tutti</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <button className="self-end rounded-lg border px-4 py-2 text-sm font-medium">Applica</button>
    </form>
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b bg-slate-50 text-left"><th className="p-4">Ora</th><th className="p-4">Cliente</th><th className="p-4">Persone</th><th className="p-4">Tavolo</th><th className="p-4">Stato</th><th className="p-4">Fonte</th><th className="p-4">Note</th><th className="p-4"><span className="sr-only">Azioni</span></th></tr></thead>
        <tbody>{reservations.map((reservation) => <tr key={reservation.id} className="border-b align-top last:border-0">
          <td className="whitespace-nowrap p-4 font-medium">{timeFormatter.format(reservation.startTime)}</td>
          <td className="p-4"><div className="font-medium">{reservation.guestName}</div><div className="text-xs text-slate-500">{reservation.code}{reservation.phone ? ` · ${reservation.phone}` : ""}{reservation.email ? ` · ${reservation.email}` : ""}</div></td>
          <td className="p-4">{reservation.partySize}</td>
          <td className="p-4">{reservation.tables.length ? reservation.tables.map(({ table }) => table.name).join(", ") : <span className="font-medium text-amber-700">Senza tavolo</span>}</td>
          <td className="p-4">{reservation.status}</td><td className="p-4">{reservation.source}</td>
          <td className="max-w-48 truncate p-4" title={reservation.notes ?? undefined}>{reservation.notes || "—"}</td>
          <td className="p-4 text-right"><Link className="underline" href={`/restaurant/reservations/${reservation.id}`}>Dettaglio</Link></td>
        </tr>)}{!reservations.length && <tr><td className="p-8 text-center text-slate-500" colSpan={8}>Nessuna prenotazione per i filtri selezionati.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
