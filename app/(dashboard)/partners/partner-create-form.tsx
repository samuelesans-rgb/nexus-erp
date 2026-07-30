"use client";

import { useActionState, useState } from "react";
import { createPartner, type CreatePartnerState } from "./actions";

const initialState: CreatePartnerState = {
  status: "idle",
};

const inputClassName =
  "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export default function PartnerCreateForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createPartner,
    initialState
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="rounded-lg bg-black px-4 py-2 text-white transition hover:bg-slate-800"
          aria-expanded={isOpen}
        >
          {isOpen ? "Chiudi" : "Nuovo Partner"}
        </button>
      </div>

      {isOpen && (
        <form
          action={formAction}
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Nuovo partner</h2>
            <p className="mt-1 text-sm text-slate-500">
              Inserisci i dati del cliente, fornitore o contatto.
            </p>
          </div>

          {state.message && (
            <p
              className={`mb-5 rounded-lg px-4 py-3 text-sm ${
                state.status === "success"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-800"
              }`}
              role="status"
            >
              {state.message}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">
              Tipo
              <select name="type" className={inputClassName} defaultValue="COMPANY">
                <option value="COMPANY">Azienda</option>
                <option value="PERSON">Persona</option>
              </select>
              {state.errors?.type && (
                <span className="mt-1 block text-xs text-red-600">
                  {state.errors.type}
                </span>
              )}
            </label>

            <label className="text-sm font-medium md:col-span-1 lg:col-span-2">
              Nome *
              <input
                name="name"
                required
                className={inputClassName}
                aria-invalid={Boolean(state.errors?.name)}
              />
              {state.errors?.name && (
                <span className="mt-1 block text-xs text-red-600">
                  {state.errors.name}
                </span>
              )}
            </label>

            <Field name="vatNumber" label="Partita IVA" />
            <Field name="taxCode" label="Codice fiscale" />
            <Field
              name="email"
              label="Email"
              type="email"
              error={state.errors?.email}
            />
            <Field name="pec" label="PEC" type="email" />
            <Field name="phone" label="Telefono" type="tel" />
            <Field name="mobile" label="Cellulare" type="tel" />
            <Field name="website" label="Sito web" type="url" />
            <Field name="address" label="Indirizzo" />
            <Field name="zipCode" label="CAP" />
            <Field name="city" label="Città" />
            <Field name="province" label="Provincia" />
            <Field name="country" label="Paese" />
          </div>

          <div className="mt-5 flex flex-wrap gap-6">
            <Checkbox name="isCustomer" label="Cliente" />
            <Checkbox name="isSupplier" label="Fornitore" />
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-black px-5 py-2.5 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Salvataggio..." : "Salva partner"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  error,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        className={inputClassName}
        aria-invalid={Boolean(error)}
      />
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}

function Checkbox({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input name={name} type="checkbox" className="size-4 rounded border" />
      {label}
    </label>
  );
}
