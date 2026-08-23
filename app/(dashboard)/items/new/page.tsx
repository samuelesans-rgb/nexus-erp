import { getAuthorizationSessionUser } from "@/lib/authorization";
import { getItemFormOptions } from "@/lib/items";
import { MODULE_CODES } from "@/lib/module-catalog";
import { ModuleNotEnabledError, requireModule } from "@/lib/modules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createItem } from "../actions";
import ItemForm from "../item-form";

export default async function NewItemPage() {
  const session = { user: await getAuthorizationSessionUser() };
  if (!session?.user?.companyId) redirect("/login");
  try {
    await requireModule(session.user.companyId, MODULE_CODES.CORE_PRODUCTS);
  } catch (error) {
    if (error instanceof ModuleNotEnabledError) redirect("/items");
    throw error;
  }
  const options = await getItemFormOptions(session.user.companyId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/items" className="text-sm text-slate-500 hover:underline">
          ← Catalogo Item
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Nuovo Item</h1>
        <p className="text-slate-500">
          Inserisci dati comuni, profilo specifico e componenti.
        </p>
      </div>
      <ItemForm
        action={createItem}
        enabledTypes={options.enabledTypes}
        categories={options.categories}
        units={options.units}
        vatRates={options.vatRates.map((rate) => ({
          ...rate,
          percentage: rate.percentage.toString(),
        }))}
        componentItems={options.componentItems}
        submitLabel="Crea Item"
      />
    </div>
  );
}
