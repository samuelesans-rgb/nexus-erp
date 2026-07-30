"use client";

import { useActionState } from "react";
import type { PartnerFormState } from "./actions";

const initialState: PartnerFormState = { status: "idle" };
const inputClassName =
  "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

type PartnerDefaults = {
  type: "COMPANY" | "PERSON";
  status: "ACTIVE" | "SUSPENDED";
  displayName: string | null;
  legalName: string | null;
  firstName: string | null;
  lastName: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  address: string | null;
  zipCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  category: string | null;
  priceListCode: string | null;
  paymentMethod: string | null;
  paymentTerms: string | null;
  creditLimit: string | null;
  discountPercent: string | null;
  recipientCode: string | null;
  splitPayment: boolean;
  reverseCharge: boolean;
  internalNotes: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isLead: boolean;
  isProspect: boolean;
  isCollaborator: boolean;
  isAgent: boolean;
  isCarrier: boolean;
  isProfessional: boolean;
  active: boolean;
  agentId: string | null;
};

export default function PartnerForm({
  action,
  defaults,
  agents,
  submitLabel,
}: {
  action: (
    state: PartnerFormState,
    formData: FormData
  ) => Promise<PartnerFormState>;
  defaults?: PartnerDefaults;
  agents: Array<{ id: string; code: string; name: string }>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </p>
      )}

      <Section title="Generale">
        <SelectField
          name="type"
          label="Tipo partner"
          defaultValue={defaults?.type ?? "COMPANY"}
          error={state.errors?.type}
          options={[
            ["COMPANY", "Azienda"],
            ["PERSON", "Persona fisica"],
          ]}
        />
        <SelectField
          name="status"
          label="Stato"
          defaultValue={defaults?.status ?? "ACTIVE"}
          error={state.errors?.status}
          options={[
            ["ACTIVE", "Attivo"],
            ["SUSPENDED", "Sospeso"],
          ]}
        />
        <Field
          name="displayName"
          label="Nome visualizzato"
          defaultValue={defaults?.displayName}
        />
        <Field
          name="legalName"
          label="Ragione sociale"
          defaultValue={defaults?.legalName}
          error={state.errors?.legalName}
        />
        <Field
          name="firstName"
          label="Nome"
          defaultValue={defaults?.firstName}
          error={state.errors?.firstName}
        />
        <Field name="lastName" label="Cognome" defaultValue={defaults?.lastName} />
        <Field
          name="vatNumber"
          label="Partita IVA"
          defaultValue={defaults?.vatNumber}
        />
        <Field
          name="taxCode"
          label="Codice fiscale"
          defaultValue={defaults?.taxCode}
        />
        <Field
          name="category"
          label="Categoria"
          defaultValue={defaults?.category}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input
            name="active"
            type="checkbox"
            defaultChecked={defaults?.active ?? true}
            className="size-4"
          />
          Operativo
        </label>
      </Section>

      <Section title="Qualifiche">
        {[
          ["isCustomer", "Cliente", defaults?.isCustomer],
          ["isSupplier", "Fornitore", defaults?.isSupplier],
          ["isLead", "Lead", defaults?.isLead],
          ["isProspect", "Prospect", defaults?.isProspect],
          ["isCollaborator", "Collaboratore", defaults?.isCollaborator],
          ["isAgent", "Agente", defaults?.isAgent],
          ["isCarrier", "Trasportatore", defaults?.isCarrier],
          ["isProfessional", "Professionista", defaults?.isProfessional],
        ].map(([name, label, checked]) => (
          <label key={String(name)} className="flex items-center gap-2 text-sm">
            <input
              name={String(name)}
              type="checkbox"
              defaultChecked={Boolean(checked)}
              className="size-4"
            />
            {label}
          </label>
        ))}
      </Section>

      <Section title="Contatti e indirizzo">
        <Field
          name="email"
          label="Email principale"
          type="email"
          defaultValue={defaults?.email}
          error={state.errors?.email}
        />
        <Field name="pec" label="PEC" type="email" defaultValue={defaults?.pec} />
        <Field name="phone" label="Telefono" defaultValue={defaults?.phone} />
        <Field name="mobile" label="Cellulare" defaultValue={defaults?.mobile} />
        <Field name="website" label="Sito web" defaultValue={defaults?.website} />
        <Field name="address" label="Indirizzo" defaultValue={defaults?.address} />
        <Field name="zipCode" label="CAP" defaultValue={defaults?.zipCode} />
        <Field name="city" label="Città" defaultValue={defaults?.city} />
        <Field
          name="province"
          label="Provincia"
          defaultValue={defaults?.province}
        />
        <Field name="country" label="Paese" defaultValue={defaults?.country} />
      </Section>

      <Section title="Commerciale">
        <Field
          name="priceListCode"
          label="Codice listino"
          defaultValue={defaults?.priceListCode}
        />
        <label className="text-sm font-medium">
          Agente
          <select
            name="agentId"
            className={inputClassName}
            defaultValue={defaults?.agentId ?? ""}
          >
            <option value="">Nessun agente</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.code} · {agent.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          name="paymentMethod"
          label="Metodo di pagamento"
          defaultValue={defaults?.paymentMethod}
        />
        <Field
          name="paymentTerms"
          label="Condizioni di pagamento"
          defaultValue={defaults?.paymentTerms}
        />
        <Field
          name="creditLimit"
          label="Fido"
          type="number"
          step="0.01"
          defaultValue={defaults?.creditLimit}
          error={state.errors?.creditLimit}
        />
        <Field
          name="discountPercent"
          label="Sconto %"
          type="number"
          step="0.01"
          defaultValue={defaults?.discountPercent}
          error={state.errors?.discountPercent}
        />
      </Section>

      <Section title="Fiscale">
        <Field
          name="recipientCode"
          label="Codice destinatario"
          defaultValue={defaults?.recipientCode}
        />
        <Checkbox
          name="splitPayment"
          label="Split payment"
          checked={defaults?.splitPayment}
        />
        <Checkbox
          name="reverseCharge"
          label="Reverse charge"
          checked={defaults?.reverseCharge}
        />
      </Section>

      <div className="rounded-xl border bg-white p-5">
        <label className="text-sm font-medium">
          Note interne
          <textarea
            name="internalNotes"
            rows={5}
            defaultValue={defaults?.internalNotes ?? ""}
            className={inputClassName}
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {pending ? "Salvataggio..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  type = "text",
  step,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  defaultValue?: string | null;
  error?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue ?? ""}
        className={inputClassName}
        aria-invalid={Boolean(error)}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
  error,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<[string, string]>;
  error?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select name={name} defaultValue={defaultValue} className={inputClassName}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
      <input
        name={name}
        type="checkbox"
        defaultChecked={checked}
        className="size-4"
      />
      {label}
    </label>
  );
}
