import Link from "next/link";
import { requireRestaurant } from "@/lib/restaurant-access";
import { RESTAURANT_ROUTES } from "@/lib/restaurant-routing";
import { requireAuthorizationContext } from "@/lib/authorization";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authorization = await requireAuthorizationContext();
  const salaOnly =
    authorization.roles.includes("SALA") &&
    !authorization.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role),
    );
  await requireRestaurant(salaOnly ? "floor" : "read");
  const routes = salaOnly
    ? [["Sala", "/restaurant/floor"]]
    : Object.entries(RESTAURANT_ROUTES);
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 border-b pb-3 text-sm">
        {routes.map(([label, href]) => (
          <Link
            className="rounded px-3 py-2 hover:bg-slate-100"
            href={href}
            key={href}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
