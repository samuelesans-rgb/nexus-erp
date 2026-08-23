import { auth, signOut } from "@/auth";
import { getAuthorizedLocations, getCurrentLocation } from "@/lib/locations";
import { getAuthorizationContext } from "@/lib/authorization";
import { changeCurrentLocation } from "@/app/(dashboard)/settings/locations/actions";

export default async function AppHeader() {
  const [session, context] = await Promise.all([auth(), getAuthorizationContext()]);
  const userName = session?.user?.name ?? session?.user?.email ?? "Utente";
  const [currentLocation, locations] = await Promise.all([
    getCurrentLocation(context.companyId, context.membershipId),
    getAuthorizedLocations(context.companyId, context.membershipId),
  ]);

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h2 className="text-lg font-semibold">
        Dashboard
      </h2>

        <div className="flex items-center gap-3">
          {currentLocation && (
            <form action={changeCurrentLocation} className="flex items-center gap-2">
              <label className="sr-only" htmlFor="current-location">Sede corrente</label>
              <select id="current-location" name="locationId" defaultValue={currentLocation.id} className="rounded-lg border px-2 py-1 text-sm">
                {locations.filter((location) => location.active && !location.deletedAt).map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
              </select>
              <button type="submit" className="rounded-lg border px-2 py-1 text-xs">Cambia sede</button>
            </form>
          )}
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="leading-tight">
            <p className="font-medium">{userName}</p>
            <p className="text-xs text-slate-500">
              {context.companyName}
            </p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="ml-3 rounded-lg border px-3 py-2 text-sm transition hover:bg-slate-100"
            >
              Esci
            </button>
          </form>
        </div>
    </header>
  );
}
