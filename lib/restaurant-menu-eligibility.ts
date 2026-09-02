export type RestaurantMenuCandidate = { name: string; active?: boolean; sellable?: boolean; deletedAt?: Date | null };

export function isRestaurantMenuNameEligible(name: string) {
  return name.trim().length > 0 && !/PLU/i.test(name);
}

export function isRestaurantMenuItemEligible(item: RestaurantMenuCandidate) {
  return item.active !== false && item.sellable !== false && item.deletedAt == null && isRestaurantMenuNameEligible(item.name);
}

export const restaurantMenuEligibleItemWhere = {
  active: true,
  sellable: true,
  deletedAt: null,
  NOT: { name: { contains: "PLU", mode: "insensitive" as const } },
};

export function restaurantMenuPrice(value: { salePrice: unknown; priceOverride?: unknown; fusionManaged: boolean }) {
  return Number(value.fusionManaged ? value.salePrice ?? 0 : value.priceOverride ?? value.salePrice ?? 0);
}
