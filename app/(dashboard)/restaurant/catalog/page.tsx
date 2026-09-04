import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import {
  getItemAllergens,
  getRestaurantCatalog,
} from "@/lib/restaurant-catalog";
import { prisma } from "@/lib/prisma";
import {
  ensureEuAllergensAction,
  saveAllergenAction,
  saveCatalogCategoryAction,
  saveModifierAction,
  saveModifierGroupAction,
  saveRecipeImpactAction,
  saveVariantAction,
  setItemAllergensAction,
} from "../actions";

const field = "min-h-11 rounded border px-3";
export default async function Page() {
  const { companyId } = await requireRestaurantContext(
    MODULE_CODES.RESTAURANT_MENU,
    "manage",
  );
  const [catalog, categories, allergens, components, units] = await Promise.all(
    [
      getRestaurantCatalog(companyId),
      prisma.itemCategory.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.allergen.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.item.findMany({
        where: { companyId, stockManaged: true, active: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.unitOfMeasure.findMany({
        where: { companyId, active: true, deletedAt: null },
        select: { id: true, name: true, symbol: true },
        orderBy: { name: "asc" },
      }),
    ],
  );
  const allergenViews = new Map(
    await Promise.all(
      catalog.map(
        async (item) =>
          [item.id, await getItemAllergens(companyId, item.id)] as const,
      ),
    ),
  );
  const variants = catalog.flatMap((item) =>
    item.restaurantVariants.map((variant) => ({
      id: variant.id,
      label: item.name + " · " + variant.name,
    })),
  );
  const modifiers = catalog.flatMap((item) =>
    item.restaurantModifierGroups.flatMap((group) =>
      group.modifiers.map((modifier) => ({
        id: modifier.id,
        label: item.name + " · " + group.name + ": " + modifier.name,
      })),
    ),
  );
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Catalogo vendibile Restaurant</h1>
        <p className="text-sm text-slate-600">
          Categorie, allergeni, varianti, modificatori e impatti ricetta
          configurabili senza SQL.
        </p>
      </div>
      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">Categorie</h2>
        <form
          action={saveCatalogCategoryAction}
          className="grid gap-2 md:grid-cols-5"
        >
          <input className={field} name="code" placeholder="Codice" required />
          <input className={field} name="name" placeholder="Nome" required />
          <select className={field} name="purpose">
            <option>SELLABLE</option>
            <option>INVENTORY</option>
            <option>BOTH</option>
          </select>
          <label>
            <input name="active" type="checkbox" defaultChecked /> Attiva
          </label>
          <button className={field}>Crea categoria</button>
        </form>
        {categories.map((category) => (
          <form
            action={saveCatalogCategoryAction}
            className="grid gap-2 border-t py-2 md:grid-cols-5"
            key={category.id}
          >
            <input type="hidden" name="id" value={category.id} />
            <input className={field} name="code" defaultValue={category.code} />
            <input className={field} name="name" defaultValue={category.name} />
            <select
              className={field}
              name="purpose"
              defaultValue={category.purpose}
            >
              <option>SELLABLE</option>
              <option>INVENTORY</option>
              <option>BOTH</option>
            </select>
            <label>
              <input
                name="active"
                type="checkbox"
                defaultChecked={category.active}
              />{" "}
              Attiva
            </label>
            <button className={field}>Aggiorna</button>
          </form>
        ))}
      </section>
      <section className="space-y-3 rounded border p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Allergeni</h2>
          <form action={ensureEuAllergensAction}>
            <button className={field}>
              Installa/aggiorna i 14 allergeni UE
            </button>
          </form>
        </div>
        <form action={saveAllergenAction} className="grid gap-2 md:grid-cols-4">
          <input className={field} name="code" placeholder="Codice" required />
          <input className={field} name="name" placeholder="Nome" required />
          <label>
            <input name="active" type="checkbox" defaultChecked /> Attivo
          </label>
          <button className={field}>Crea allergene</button>
        </form>
        {allergens.map((allergen) => (
          <form
            action={saveAllergenAction}
            className="grid gap-2 border-t py-2 md:grid-cols-4"
            key={allergen.id}
          >
            <input type="hidden" name="id" value={allergen.id} />
            <input className={field} name="code" defaultValue={allergen.code} />
            <input className={field} name="name" defaultValue={allergen.name} />
            <label>
              <input
                name="active"
                type="checkbox"
                defaultChecked={allergen.active}
              />{" "}
              Attivo
            </label>
            <button className={field}>Aggiorna</button>
          </form>
        ))}
      </section>
      {catalog.map((item) => {
        const view = allergenViews.get(item.id)!;
        return (
          <section className="space-y-4 rounded border p-4" key={item.id}>
            <h2 className="text-xl font-semibold">
              {item.name} · {Number(item.salePrice ?? 0).toFixed(2)} €
            </h2>
            <p>
              Categoria: {item.category?.name ?? "—"} · IVA:{" "}
              {item.vatRate?.name ?? "—"} ·{" "}
              {item.active ? "attivo" : "inattivo"}
            </p>
            <form action={setItemAllergensAction} className="space-y-2">
              <input type="hidden" name="itemId" value={item.id} />
              <label className="block">Allergeni espliciti</label>
              <select
                className={field}
                name="allergenIds"
                multiple
                defaultValue={view.explicit.map((row) => row.id)}
              >
                {allergens
                  .filter((row) => row.active)
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
              <button className={field}>Salva allergeni</button>
              <p className="text-sm">
                Derivati dalla ricetta:{" "}
                {view.derived.map((row) => row.name).join(", ") || "nessuno"}
              </p>
            </form>
            <div>
              <h3 className="font-semibold">Varianti</h3>
              {item.restaurantVariants.map((variant) => (
                <form
                  action={saveVariantAction}
                  className="grid gap-2 border-t py-2 md:grid-cols-7"
                  key={variant.id}
                >
                  <input type="hidden" name="id" value={variant.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input
                    className={field}
                    name="name"
                    defaultValue={variant.name}
                  />
                  <input
                    className={field}
                    name="sku"
                    defaultValue={variant.sku ?? ""}
                  />
                  <input
                    className={field}
                    name="priceOverride"
                    type="number"
                    step="0.01"
                    defaultValue={
                      variant.priceOverride == null
                        ? ""
                        : Number(variant.priceOverride)
                    }
                  />
                  <input
                    className={field}
                    name="priceDelta"
                    type="number"
                    step="0.01"
                    defaultValue={Number(variant.priceDelta)}
                  />
                  <label>
                    <input
                      name="available"
                      type="checkbox"
                      defaultChecked={variant.available}
                    />{" "}
                    Disponibile
                  </label>
                  <label>
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={variant.active}
                    />{" "}
                    Attiva
                  </label>
                  <button className={field}>Aggiorna</button>
                  <small className="md:col-span-7">
                    Impatti:{" "}
                    {variant.recipeImpacts
                      .map(
                        (impact) =>
                          impact.componentItem.name +
                          " " +
                          Number(impact.quantityDelta) +
                          " " +
                          impact.unitOfMeasure.symbol,
                      )
                      .join(", ") || "nessuno"}
                  </small>
                </form>
              ))}
              <form
                action={saveVariantAction}
                className="grid gap-2 md:grid-cols-7"
              >
                <input type="hidden" name="itemId" value={item.id} />
                <input
                  className={field}
                  name="name"
                  placeholder="Nome"
                  required
                />
                <input className={field} name="sku" placeholder="SKU" />
                <input
                  className={field}
                  name="priceOverride"
                  type="number"
                  step="0.01"
                  placeholder="Override"
                />
                <input
                  className={field}
                  name="priceDelta"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
                <label>
                  <input name="available" type="checkbox" defaultChecked />{" "}
                  Disponibile
                </label>
                <label>
                  <input name="active" type="checkbox" defaultChecked /> Attiva
                </label>
                <button className={field}>Aggiungi</button>
              </form>
            </div>
            <div>
              <h3 className="font-semibold">Gruppi modificatori</h3>
              {item.restaurantModifierGroups.map((group) => (
                <div className="ml-3 border-l p-3" key={group.id}>
                  <form
                    action={saveModifierGroupAction}
                    className="grid gap-2 md:grid-cols-7"
                  >
                    <input type="hidden" name="id" value={group.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input
                      className={field}
                      name="name"
                      defaultValue={group.name}
                    />
                    <label>
                      <input
                        name="required"
                        type="checkbox"
                        defaultChecked={group.required}
                      />{" "}
                      Obbligatorio
                    </label>
                    <input
                      className={field}
                      name="minSelections"
                      type="number"
                      min="0"
                      defaultValue={group.minSelections}
                    />
                    <input
                      className={field}
                      name="maxSelections"
                      type="number"
                      min="1"
                      defaultValue={group.maxSelections}
                    />
                    <input
                      className={field}
                      name="sortOrder"
                      type="number"
                      defaultValue={group.sortOrder}
                    />
                    <label>
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={group.active}
                      />{" "}
                      Attivo
                    </label>
                    <button className={field}>Aggiorna gruppo</button>
                  </form>
                  {group.modifiers.map((modifier) => (
                    <form
                      action={saveModifierAction}
                      className="grid gap-2 border-t py-2 md:grid-cols-8"
                      key={modifier.id}
                    >
                      <input type="hidden" name="id" value={modifier.id} />
                      <input type="hidden" name="groupId" value={group.id} />
                      <input
                        className={field}
                        name="name"
                        defaultValue={modifier.name}
                      />
                      <input
                        className={field}
                        name="kitchenLabel"
                        aria-label="Etichetta cucina"
                        defaultValue={modifier.kitchenLabel}
                      />
                      <input
                        className={field}
                        name="priceDelta"
                        type="number"
                        step="0.01"
                        defaultValue={Number(modifier.priceDelta)}
                      />
                      <input
                        className={field}
                        name="fusionPluId"
                        aria-label="PLU FUSION modifier"
                        type="number"
                        min="1"
                        placeholder="PLU FUSION"
                        defaultValue={modifier.fusionPluId ?? ""}
                      />
                      <label>
                        <input
                          name="fusionPlateVariation"
                          type="checkbox"
                          defaultChecked={modifier.fusionPlateVariation}
                        />{" "}
                        Plate variation
                      </label>
                      <select
                        className={field}
                        name="itemId"
                        defaultValue={modifier.itemId ?? ""}
                      >
                        <option value="">Nessun Item collegato</option>
                        {components.map((component) => (
                          <option value={component.id} key={component.id}>
                            {component.name}
                          </option>
                        ))}
                      </select>
                      <label>
                        <input
                          name="active"
                          type="checkbox"
                          defaultChecked={modifier.active}
                        />{" "}
                        Attivo
                      </label>
                      <button className={field}>Aggiorna modifier</button>
                      <small className="md:col-span-8">
                        Impatti:{" "}
                        {modifier.recipeImpacts
                          .map(
                            (impact) =>
                              impact.componentItem.name +
                              " " +
                              Number(impact.quantityDelta) +
                              " " +
                              impact.unitOfMeasure.symbol,
                          )
                          .join(", ") || "nessuno"}
                      </small>
                    </form>
                  ))}
                  <form
                    action={saveModifierAction}
                    className="grid gap-2 md:grid-cols-8"
                  >
                    <input type="hidden" name="groupId" value={group.id} />
                    <input
                      className={field}
                      name="name"
                      placeholder="Modifier"
                      required
                    />
                    <input
                      className={field}
                      name="kitchenLabel"
                      placeholder="Etichetta cucina"
                    />
                    <input
                      className={field}
                      name="priceDelta"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                    />
                    <input
                      className={field}
                      name="fusionPluId"
                      type="number"
                      min="1"
                      placeholder="PLU FUSION"
                    />
                    <label>
                      <input name="fusionPlateVariation" type="checkbox" />{" "}
                      Plate variation
                    </label>
                    <select className={field} name="itemId">
                      <option value="">Nessun Item collegato</option>
                      {components.map((component) => (
                        <option value={component.id} key={component.id}>
                          {component.name}
                        </option>
                      ))}
                    </select>
                    <label>
                      <input name="active" type="checkbox" defaultChecked />{" "}
                      Attivo
                    </label>
                    <button className={field}>Aggiungi modifier</button>
                  </form>
                </div>
              ))}
              <form
                action={saveModifierGroupAction}
                className="grid gap-2 md:grid-cols-7"
              >
                <input type="hidden" name="itemId" value={item.id} />
                <input
                  className={field}
                  name="name"
                  placeholder="Nome gruppo"
                  required
                />
                <label>
                  <input name="required" type="checkbox" /> Obbligatorio
                </label>
                <input
                  className={field}
                  name="minSelections"
                  type="number"
                  min="0"
                  defaultValue="0"
                />
                <input
                  className={field}
                  name="maxSelections"
                  type="number"
                  min="1"
                  defaultValue="1"
                />
                <input
                  className={field}
                  name="sortOrder"
                  type="number"
                  defaultValue="0"
                />
                <label>
                  <input name="active" type="checkbox" defaultChecked /> Attivo
                </label>
                <button className={field}>Aggiungi gruppo</button>
              </form>
            </div>
          </section>
        );
      })}
      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-semibold">
          Impatto ricetta varianti/modifier
        </h2>
        <form
          action={saveRecipeImpactAction}
          className="grid gap-2 md:grid-cols-6"
        >
          <select className={field} name="owner">
            {variants.map((row) => (
              <option value={"variant:" + row.id} key={row.id}>
                Variante · {row.label}
              </option>
            ))}
            {modifiers.map((row) => (
              <option value={"modifier:" + row.id} key={row.id}>
                Modifier · {row.label}
              </option>
            ))}
          </select>
          <select className={field} name="componentItemId">
            {components.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <select className={field} name="unitOfMeasureId">
            {units.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name} ({row.symbol})
              </option>
            ))}
          </select>
          <input
            className={field}
            name="quantityDelta"
            type="number"
            step="0.001"
            placeholder="Delta (+/-)"
            required
          />
          <button className={field}>Salva impatto</button>
        </form>
      </section>
    </div>
  );
}
