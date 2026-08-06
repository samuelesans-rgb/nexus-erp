import { getPublicLocation } from "@/lib/public-booking";
import { notFound } from "next/navigation";
import { cancelPublicBookingAction } from "./actions";

export default async function PublicBookingCancellationPage({ params, searchParams }: { params: Promise<{ locationSlug: string; token: string }>; searchParams: Promise<{ error?: string; cancelled?: string }> }) {
  const [{ locationSlug, token }, query] = await Promise.all([params, searchParams]);
  const location = await getPublicLocation(locationSlug);
  if (!location) notFound();
  const action = cancelPublicBookingAction.bind(null, locationSlug, token);
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4"><section className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm"><h1 className="text-2xl font-bold">Cancella prenotazione</h1><p className="mt-2 text-slate-600">{location.name}</p>{query.cancelled ? <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-4 text-emerald-900">La prenotazione {query.cancelled} è stata annullata.</p> : <><p className="mt-6">Confermi di voler annullare la prenotazione?</p>{query.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">{query.error}</p>}<form action={action} className="mt-6"><button className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white">Conferma cancellazione</button></form></>}</section></main>;
}
