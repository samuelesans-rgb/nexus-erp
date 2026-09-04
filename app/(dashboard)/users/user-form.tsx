import Link from "next/link";

type Option = { id: string; code: string; name: string };

export function UserForm({
  action,
  roles,
  locations,
  user,
}: {
  action: (data: FormData) => void | Promise<void>;
  roles: Option[];
  locations: Option[];
  user?: {
    membershipId: string;
    firstName: string;
    lastName: string;
    email: string;
    roleCodes: string[];
    locationIds: string[];
    defaultLocationId: string | null;
    active: boolean;
  };
}) {
  const selectedRoles = new Set(user?.roleCodes ?? ["SALA"]);
  const selectedLocations = new Set(user?.locationIds ?? []);
  const inputClass =
    "mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3";
  return (
    <form
      action={action}
      className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm"
    >
      {user && (
        <input type="hidden" name="membershipId" value={user.membershipId} />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Nome
          <input
            className={inputClass}
            name="firstName"
            required
            defaultValue={user?.firstName}
            autoComplete="given-name"
          />
        </label>
        <label className="text-sm font-medium">
          Cognome
          <input
            className={inputClass}
            name="lastName"
            required
            defaultValue={user?.lastName}
            autoComplete="family-name"
          />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Email / login
          <input
            className={inputClass}
            name="email"
            type="email"
            required
            defaultValue={user?.email}
            autoComplete="email"
          />
        </label>
        {!user && (
          <label className="text-sm font-medium md:col-span-2">
            Password iniziale
            <input
              className={inputClass}
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Almeno 12 caratteri. Comunicarla al dipendente con un canale
              sicuro.
            </span>
          </label>
        )}
      </div>

      <fieldset>
        <legend className="font-bold">Ruoli</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <label
              key={role.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
            >
              <input
                type="checkbox"
                name="roleCodes"
                value={role.code}
                defaultChecked={selectedRoles.has(role.code)}
              />
              <span>
                <b>{role.code}</b>
                <small className="block text-slate-500">{role.name}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-bold">Sedi autorizzate</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {locations.map((location) => (
            <label
              key={location.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
            >
              <input
                type="checkbox"
                name="locationIds"
                value={location.id}
                defaultChecked={
                  selectedLocations.has(location.id) ||
                  (!user && locations.length === 1)
                }
              />
              <span>
                {location.name}{" "}
                <small className="text-slate-500">({location.code})</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-medium">
        Sede predefinita
        <select
          className={inputClass}
          name="defaultLocationId"
          defaultValue={user?.defaultLocationId ?? locations[0]?.id ?? ""}
          required
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 px-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={user?.active ?? true}
        />
        Utente attivo in questa azienda
      </label>

      <div className="flex flex-wrap gap-3">
        <button className="min-h-11 rounded-lg bg-slate-900 px-5 font-semibold text-white">
          Salva utente
        </button>
        <Link className="min-h-11 rounded-lg border px-5 py-2.5" href="/users">
          Annulla
        </Link>
      </div>
    </form>
  );
}
