import { getPublicLocation, getPublicSlots } from "@/lib/public-booking";
import { notFound } from "next/navigation";
import { PublicBookingForm } from "./booking-form";

const dateValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ locationSlug: string }>; searchParams: Promise<{ date?: string; people?: string }> }) {
  const [{ locationSlug }, query] = await Promise.all([params, searchParams]);
  const location = await getPublicLocation(locationSlug);
  if (!location) notFound();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? new Date(`${query.date}T00:00:00`) : today;
  const partySize = Math.min(50, Math.max(1, Number.parseInt(query.people ?? "2", 10) || 2));
  const slots = await getPublicSlots(locationSlug, selectedDate, partySize);
  if (!slots) notFound();

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12"><div className="mx-auto max-w-2xl space-y-6">
    <header className="text-center"><p className="text-sm font-medium uppercase tracking-wide text-slate-500">Prenota un tavolo</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">{location.name}</h1>{(location.address || location.city) && <p className="mt-2 text-slate-600">{[location.address, location.city].filter(Boolean).join(", ")}</p>}</header>
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6" aria-labelledby="availability-title"><h2 id="availability-title" className="mb-4 text-lg font-semibold">Data e persone</h2><form className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"><label className="grid gap-1 text-sm"><span>Data</span><input required min={dateValue(today)} type="date" name="date" defaultValue={dateValue(selectedDate)} className="rounded-lg border px-3 py-2" /></label><label className="grid gap-1 text-sm"><span>Persone</span><input required min={1} max={50} type="number" name="people" defaultValue={partySize} className="rounded-lg border px-3 py-2" /></label><button className="self-end rounded-lg border px-4 py-2 font-medium">Mostra orari</button></form></section>
    <PublicBookingForm locationSlug={locationSlug} partySize={partySize} slots={slots.map((slot) => slot.toISOString())} />
  </div></main>;
}
