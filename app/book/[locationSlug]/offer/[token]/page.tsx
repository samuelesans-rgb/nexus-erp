import { acceptPublicWaitlistOffer, getPublicLocation } from "@/lib/public-booking";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locationSlug: string; token: string }> }) {
  const { locationSlug, token } = await params;
  const location = await getPublicLocation(locationSlug);
  if (!location) notFound();
  let result: Awaited<ReturnType<typeof acceptPublicWaitlistOffer>> | null = null;
  let error: string | null = null;
  try {
    result = await acceptPublicWaitlistOffer(locationSlug, token);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Offerta non valida.";
  }
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-bold">{location.name}</h1>
      {result ? (
        <section className="mt-4 rounded-xl border-2 border-emerald-600 bg-emerald-50 p-4">
          <p className="font-black text-emerald-900">Tavolo confermato.</p>
          <p className="mt-1 text-sm text-emerald-900">
            Prenotazione {result.code}. Ti aspettiamo.
          </p>
        </section>
      ) : (
        <section role="alert" className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">{error}</p>
          <p className="mt-1 text-sm text-amber-900">
            Se vuoi ancora un tavolo, contatta direttamente il locale.
          </p>
        </section>
      )}
    </main>
  );
}
