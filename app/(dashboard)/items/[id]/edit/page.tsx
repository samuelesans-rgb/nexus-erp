import { auth } from "@/auth";
import { getItemDetail, getItemFormOptions, isItemTypeEnabled } from "@/lib/items";
import { MODULE_CODES } from "@/lib/module-catalog";
import { ModuleNotEnabledError, requireModule } from "@/lib/modules";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateItem } from "../../actions";
import ItemForm, { type ItemDefaults } from "../../item-form";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  try {
    await requireModule(session.user.companyId, MODULE_CODES.CORE_PRODUCTS);
  } catch (error) {
    if (error instanceof ModuleNotEnabledError) redirect("/items");
    throw error;
  }
  const { id } = await params;
  const [item, options] = await Promise.all([
    getItemDetail(session.user.companyId, id),
    getItemFormOptions(session.user.companyId, id),
  ]);
  if (
    !item ||
    item.deletedAt ||
    !(await isItemTypeEnabled(session.user.companyId, item.type))
  ) {
    notFound();
  }

  const defaults = toDefaults(item);
  const action = updateItem.bind(null, item.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/items/${item.id}`} className="text-sm text-slate-500 hover:underline">
          ← Dettaglio Item
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Modifica {item.name}</h1>
        <p className="text-slate-500">
          Il tipo non è modificabile per preservare la coerenza del profilo.
        </p>
      </div>
      <ItemForm
        action={action}
        defaults={defaults}
        enabledTypes={options.enabledTypes}
        categories={options.categories}
        units={options.units}
        vatRates={options.vatRates.map((rate) => ({
          ...rate,
          percentage: rate.percentage.toString(),
        }))}
        componentItems={options.componentItems}
        submitLabel="Salva modifiche"
      />
    </div>
  );
}

function toDefaults(
  item: NonNullable<Awaited<ReturnType<typeof getItemDetail>>>
): ItemDefaults {
  const profileSource =
    item.productProfile ??
    item.serviceProfile ??
    item.ingredientProfile ??
    item.recipeProfile ??
    item.beautyServiceProfile ??
    item.hotelRoomProfile ??
    item.packageProfile ??
    item.giftCardProfile;
  const profile = Object.fromEntries(
    Object.entries(profileSource ?? {})
      .filter(([key]) => key !== "itemId" && key !== "companyId")
      .map(([key, value]) => [
        key,
        value !== null && typeof value === "object" ? String(value) : value,
      ])
  ) as ItemDefaults["profile"];
  const sourceComponents =
    item.type === "RECIPE" ? item.recipeComponents : item.packageComponents;

  return {
    type: item.type,
    status: item.status,
    code: item.code,
    name: item.name,
    shortName: item.shortName,
    description: item.description,
    internalNotes: item.internalNotes,
    barcode: item.barcode,
    sku: item.sku,
    imageUrl: item.imageUrl,
    categoryId: item.categoryId,
    unitOfMeasureId: item.unitOfMeasureId,
    vatRateId: item.vatRateId,
    salePrice: item.salePrice?.toString() ?? null,
    purchasePrice: item.purchasePrice?.toString() ?? null,
    standardCost: item.standardCost?.toString() ?? null,
    currency: item.currency,
    sellable: item.sellable,
    purchasable: item.purchasable,
    stockManaged: item.stockManaged,
    trackLots: item.trackLots,
    trackSerials: item.trackSerials,
    trackExpiration: item.trackExpiration,
    active: item.active,
    profile,
    components: sourceComponents.map((component) => ({
      componentItemId: component.componentItem.id,
      unitOfMeasureId: component.unitOfMeasure.id,
      quantity: component.quantity.toString(),
      wastePercentage:
        "wastePercentage" in component
          ? component.wastePercentage?.toString() ?? "0"
          : null,
    })),
  };
}
