"use client";

import {
  ITEM_TYPE_LABELS,
  type CatalogItemType,
} from "@/lib/item-types";
import { useActionState, useState } from "react";
import type { ItemFormState } from "./actions";

const initialState: ItemFormState = { status: "idle" };
const inputClassName =
  "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

type Option = { id: string; code: string; name: string };
type UnitOption = Option & { symbol: string };
type ComponentDefault = {
  componentItemId: string;
  unitOfMeasureId: string;
  quantity: string;
  wastePercentage?: string | null;
};

export type ItemDefaults = {
  type: CatalogItemType;
  status: "ACTIVE" | "SUSPENDED";
  code: string;
  name: string;
  shortName: string | null;
  description: string | null;
  internalNotes: string | null;
  barcode: string | null;
  sku: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  unitOfMeasureId: string | null;
  vatRateId: string | null;
  salePrice: string | null;
  purchasePrice: string | null;
  standardCost: string | null;
  currency: string;
  sellable: boolean;
  purchasable: boolean;
  stockManaged: boolean;
  trackLots: boolean;
  trackSerials: boolean;
  trackExpiration: boolean;
  active: boolean;
  profile: Record<string, string | number | boolean | null>;
  components: ComponentDefault[];
};

export default function ItemForm({
  action,
  defaults,
  enabledTypes,
  categories,
  units,
  vatRates,
  componentItems,
  submitLabel,
}: {
  action: (
    state: ItemFormState,
    formData: FormData
  ) => Promise<ItemFormState>;
  defaults?: ItemDefaults;
  enabledTypes: CatalogItemType[];
  categories: Option[];
  units: UnitOption[];
  vatRates: Array<Option & { percentage: string }>;
  componentItems: Array<Option & { type: CatalogItemType }>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [type, setType] = useState<CatalogItemType>(
    defaults?.type ?? enabledTypes[0] ?? "PRODUCT"
  );
  const [components, setComponents] = useState<ComponentDefault[]>(
    defaults?.components.length
      ? defaults.components
      : [{ componentItemId: "", unitOfMeasureId: "", quantity: "1" }]
  );
  const profile = defaults?.profile ?? {};

  function profileValue(name: string) {
    const value = profile[name];
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : "";
  }

  function profileChecked(name: string, fallback = false) {
    return typeof profile[name] === "boolean"
      ? Boolean(profile[name])
      : fallback;
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </p>
      )}

      <Section title="Generale">
        <label className="text-sm font-medium">
          Tipo Item
          {defaults && <input type="hidden" name="type" value={type} />}
          <select
            name={defaults ? undefined : "type"}
            value={type}
            disabled={Boolean(defaults)}
            onChange={(event) =>
              setType(event.target.value as CatalogItemType)
            }
            className={inputClassName}
          >
            {enabledTypes.map((itemType) => (
              <option key={itemType} value={itemType}>
                {ITEM_TYPE_LABELS[itemType]}
              </option>
            ))}
          </select>
          <ErrorText text={state.errors?.type} />
        </label>
        <SelectField
          name="status"
          label="Stato"
          defaultValue={defaults?.status ?? "ACTIVE"}
          options={[
            ["ACTIVE", "Attivo"],
            ["SUSPENDED", "Sospeso"],
          ]}
          error={state.errors?.status}
        />
        <Field
          name="code"
          label="Codice (automatico se vuoto)"
          defaultValue={defaults?.code}
        />
        <Field
          name="name"
          label="Nome"
          defaultValue={defaults?.name}
          error={state.errors?.name}
          required
        />
        <Field
          name="shortName"
          label="Nome breve"
          defaultValue={defaults?.shortName}
        />
        <Field name="sku" label="SKU" defaultValue={defaults?.sku} />
        <Field
          name="barcode"
          label="Codice a barre"
          defaultValue={defaults?.barcode}
        />
        <Field
          name="imageUrl"
          label="URL immagine"
          type="url"
          defaultValue={defaults?.imageUrl}
        />
        <SelectOptionField
          name="categoryId"
          label="Categoria"
          defaultValue={defaults?.categoryId}
          options={categories}
        />
        <SelectOptionField
          name="unitOfMeasureId"
          label="Unità di misura"
          defaultValue={defaults?.unitOfMeasureId}
          options={units}
        />
        <SelectOptionField
          name="vatRateId"
          label="Aliquota IVA"
          defaultValue={defaults?.vatRateId}
          options={vatRates}
        />
        <Checkbox
          name="active"
          label="Operativo"
          checked={defaults?.active ?? true}
        />
      </Section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Descrizione</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea
            name="description"
            label="Descrizione commerciale"
            defaultValue={defaults?.description}
          />
          <TextArea
            name="internalNotes"
            label="Note interne"
            defaultValue={defaults?.internalNotes}
          />
        </div>
      </section>

      <Section title="Commerciale">
        <Field
          name="salePrice"
          label="Prezzo vendita"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaults?.salePrice}
          error={state.errors?.salePrice}
        />
        <Field
          name="purchasePrice"
          label="Prezzo acquisto"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaults?.purchasePrice}
          error={state.errors?.purchasePrice}
        />
        <Field
          name="standardCost"
          label="Costo standard"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaults?.standardCost}
          error={state.errors?.standardCost}
        />
        <Field
          name="currency"
          label="Valuta"
          maxLength={3}
          defaultValue={defaults?.currency ?? "EUR"}
        />
        <Checkbox
          name="sellable"
          label="Vendibile"
          checked={defaults?.sellable ?? true}
        />
        <Checkbox
          name="purchasable"
          label="Acquistabile"
          checked={defaults?.purchasable}
        />
      </Section>

      <Section title="Magazzino">
        <Checkbox
          name="stockManaged"
          label="Gestione stock"
          checked={defaults?.stockManaged}
          error={state.errors?.stockManaged}
        />
        <Checkbox
          name="trackLots"
          label="Traccia lotti"
          checked={defaults?.trackLots}
        />
        <Checkbox
          name="trackSerials"
          label="Traccia seriali"
          checked={defaults?.trackSerials}
        />
        <Checkbox
          name="trackExpiration"
          label="Traccia scadenze"
          checked={defaults?.trackExpiration}
        />
        <p className="self-end pb-2 text-xs text-slate-500">
          Lo stock è ammesso solo per PRODUCT e INGREDIENT. Il catalogo non
          implementa ancora movimenti o disponibilità.
        </p>
      </Section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">
          Profilo {ITEM_TYPE_LABELS[type]}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {type === "PRODUCT" && (
            <>
              <Field name="weight" label="Peso" type="number" step="0.001" min="0" defaultValue={profileValue("weight")} error={state.errors?.weight} />
              <Field name="dimensions" label="Dimensioni (testo/JSON)" defaultValue={profileValue("dimensions")} />
              <Field name="manufacturer" label="Produttore" defaultValue={profileValue("manufacturer")} />
              <Field name="brand" label="Marca" defaultValue={profileValue("brand")} />
              <Field name="reorderPoint" label="Punto riordino" type="number" step="0.001" min="0" defaultValue={profileValue("reorderPoint")} error={state.errors?.reorderPoint} />
              <Field name="minimumStock" label="Scorta minima" type="number" step="0.001" min="0" defaultValue={profileValue("minimumStock")} error={state.errors?.minimumStock} />
            </>
          )}
          {type === "SERVICE" && (
            <>
              <Field name="durationMinutes" label="Durata (minuti)" type="number" min="1" defaultValue={profileValue("durationMinutes")} error={state.errors?.durationMinutes} />
              <Field name="defaultCapacity" label="Capacità predefinita" type="number" min="1" defaultValue={profileValue("defaultCapacity")} error={state.errors?.defaultCapacity} />
              <Checkbox name="requiresAppointment" label="Richiede appuntamento" checked={profileChecked("requiresAppointment")} />
            </>
          )}
          {type === "INGREDIENT" && (
            <>
              <Field name="yieldPercentage" label="Resa %" type="number" step="0.01" min="0" max="100" defaultValue={profileValue("yieldPercentage")} error={state.errors?.yieldPercentage} />
              <Field name="perishabilityDays" label="Deperibilità (giorni)" type="number" min="1" defaultValue={profileValue("perishabilityDays")} error={state.errors?.perishabilityDays} />
              <Field name="storageInstructions" label="Conservazione" defaultValue={profileValue("storageInstructions")} />
              <Field name="allergenNotes" label="Note allergeni" defaultValue={profileValue("allergenNotes")} />
            </>
          )}
          {type === "RECIPE" && (
            <>
              <Field name="preparationMinutes" label="Preparazione (minuti)" type="number" min="1" defaultValue={profileValue("preparationMinutes")} error={state.errors?.preparationMinutes} />
              <Field name="portions" label="Porzioni" type="number" step="0.001" min="0" defaultValue={profileValue("portions")} error={state.errors?.portions} />
              <Field name="yieldQuantity" label="Quantità resa" type="number" step="0.001" min="0" defaultValue={profileValue("yieldQuantity")} error={state.errors?.yieldQuantity} />
              <Field name="foodCostTarget" label="Food cost target %" type="number" step="0.01" min="0" max="100" defaultValue={profileValue("foodCostTarget")} error={state.errors?.foodCostTarget} />
              <TextArea name="instructions" label="Istruzioni" defaultValue={profileValue("instructions")} />
            </>
          )}
          {type === "BEAUTY_SERVICE" && (
            <>
              <Field name="beautyDurationMinutes" label="Durata (minuti)" type="number" min="1" required defaultValue={profileValue("durationMinutes")} error={state.errors?.beautyDurationMinutes} />
              <Field name="cleanupMinutes" label="Riassetto (minuti)" type="number" min="1" defaultValue={profileValue("cleanupMinutes")} error={state.errors?.cleanupMinutes} />
              <Field name="recommendedRepeatDays" label="Ripetizione consigliata (giorni)" type="number" min="1" defaultValue={profileValue("recommendedRepeatDays")} error={state.errors?.recommendedRepeatDays} />
              <Checkbox name="requiresCabin" label="Richiede cabina" checked={profileChecked("requiresCabin")} />
              <Checkbox name="requiresOperator" label="Richiede operatore" checked={profileChecked("requiresOperator", true)} />
              <Checkbox name="consentRequired" label="Richiede consenso" checked={profileChecked("consentRequired")} />
            </>
          )}
          {type === "HOTEL_ROOM" && (
            <>
              <Field name="capacityAdults" label="Capacità adulti" type="number" min="1" defaultValue={profileValue("capacityAdults") || "1"} error={state.errors?.capacityAdults} />
              <Field name="capacityChildren" label="Capacità bambini" type="number" min="0" defaultValue={profileValue("capacityChildren") || "0"} error={state.errors?.capacityChildren} />
              <Field name="roomTypeCode" label="Codice tipologia" defaultValue={profileValue("roomTypeCode")} />
              <Field name="physicalRoomCode" label="Codice camera fisica" defaultValue={profileValue("physicalRoomCode")} />
              <Field name="floor" label="Piano" defaultValue={profileValue("floor")} />
              <Checkbox name="sellableUnit" label="Unità vendibile" checked={profileChecked("sellableUnit", true)} />
              <Checkbox name="housekeepingRequired" label="Richiede housekeeping" checked={profileChecked("housekeepingRequired", true)} />
            </>
          )}
          {type === "PACKAGE" && (
            <>
              <Field name="validityDays" label="Validità (giorni)" type="number" min="1" defaultValue={profileValue("validityDays")} error={state.errors?.validityDays} />
              <Field name="usageLimit" label="Limite utilizzi" type="number" min="1" defaultValue={profileValue("usageLimit")} error={state.errors?.usageLimit} />
            </>
          )}
          {type === "GIFT_CARD" && (
            <>
              <Field name="defaultValidityDays" label="Validità predefinita (giorni)" type="number" min="1" required defaultValue={profileValue("defaultValidityDays")} error={state.errors?.defaultValidityDays} />
              <Field name="fixedValue" label="Valore fisso" type="number" step="0.01" min="0" defaultValue={profileValue("fixedValue")} error={state.errors?.fixedValue} />
              <Checkbox name="reusable" label="Riutilizzabile" checked={profileChecked("reusable")} />
              <Checkbox name="transferable" label="Trasferibile" checked={profileChecked("transferable", true)} />
            </>
          )}
        </div>
      </section>

      {(type === "RECIPE" || type === "PACKAGE") && (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Componenti</h2>
              <p className="text-sm text-slate-500">
                Gli Item e le unità sono verificati nella Company attiva.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setComponents((current) => [
                  ...current,
                  {
                    componentItemId: "",
                    unitOfMeasureId: "",
                    quantity: "1",
                  },
                ])
              }
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Aggiungi riga
            </button>
          </div>
          <ErrorText text={state.errors?.components} />
          {components.map((component, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-4"
            >
              <label className="text-sm font-medium">
                Item
                <select
                  name="componentItemId"
                  value={component.componentItemId}
                  onChange={(event) =>
                    updateComponent(
                      setComponents,
                      index,
                      "componentItemId",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                >
                  <option value="">Seleziona...</option>
                  {componentItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Unità
                <select
                  name="componentUnitId"
                  value={component.unitOfMeasureId}
                  onChange={(event) =>
                    updateComponent(
                      setComponents,
                      index,
                      "unitOfMeasureId",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                >
                  <option value="">Seleziona...</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} · {unit.symbol}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="componentQuantity"
                label="Quantità"
                type="number"
                step="0.001"
                min="0.001"
                value={component.quantity}
                onChange={(value) =>
                  updateComponent(setComponents, index, "quantity", value)
                }
              />
              {type === "RECIPE" ? (
                <Field
                  name="componentWaste"
                  label="Scarto %"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={component.wastePercentage ?? "0"}
                  onChange={(value) =>
                    updateComponent(
                      setComponents,
                      index,
                      "wastePercentage",
                      value
                    )
                  }
                />
              ) : (
                <input type="hidden" name="componentWaste" value="0" />
              )}
              <button
                type="button"
                onClick={() =>
                  setComponents((current) =>
                    current.filter((_, rowIndex) => rowIndex !== index)
                  )
                }
                className="justify-self-start text-sm text-red-700"
              >
                Rimuovi riga
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || enabledTypes.length === 0}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {pending ? "Salvataggio..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function updateComponent(
  setComponents: React.Dispatch<React.SetStateAction<ComponentDefault[]>>,
  index: number,
  field: keyof ComponentDefault,
  value: string
) {
  setComponents((current) =>
    current.map((component, rowIndex) =>
      rowIndex === index ? { ...component, [field]: value } : component
    )
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
  min,
  max,
  maxLength,
  defaultValue,
  value,
  onChange,
  error,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  maxLength?: number;
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        min={min}
        max={max}
        maxLength={maxLength}
        defaultValue={value === undefined ? defaultValue ?? "" : undefined}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required={required}
        className={inputClassName}
        aria-invalid={Boolean(error)}
      />
      <ErrorText text={error} />
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
      <ErrorText text={error} />
    </label>
  );
}

function SelectOptionField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  options: Option[];
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className={inputClassName}
      >
        <option value="">Nessuna</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.code} · {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({
  name,
  label,
  checked,
  error,
}: {
  name: string;
  label: string;
  checked?: boolean;
  error?: string;
}) {
  return (
    <label className="flex flex-col self-end pb-2 text-sm font-medium">
      <span className="flex items-center gap-2">
        <input
          name={name}
          type="checkbox"
          defaultChecked={checked}
          className="size-4"
        />
        {label}
      </span>
      <ErrorText text={error} />
    </label>
  );
}

function TextArea({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <textarea
        name={name}
        rows={5}
        defaultValue={defaultValue ?? ""}
        className={inputClassName}
      />
    </label>
  );
}

function ErrorText({ text }: { text?: string }) {
  return text ? (
    <span className="mt-1 block text-xs text-red-600">{text}</span>
  ) : null;
}
