import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { getCompanyModules } from "@/lib/modules";
import SidebarNav from "./sidebar-nav";

export default async function AppSidebar() {
  const session = await auth();
  const companyId = session?.user?.companyId;
  const modules = companyId ? await getCompanyModules(companyId) : [];
  const activeCodes = new Set(
    modules.map(({ moduleDefinition }) => moduleDefinition.code)
  );
  const items = [{ label: "Dashboard", href: "/dashboard" }];

  if (activeCodes.has(MODULE_CODES.CORE_PARTNERS)) {
    items.push({ label: "Partner", href: "/partners" });
  }
  if (activeCodes.has(MODULE_CODES.CORE_PRODUCTS)) {
    items.push({ label: "Catalogo", href: "/items" });
  }
  if (activeCodes.has(MODULE_CODES.CORE_DOCUMENTS) && session?.user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"].includes(role))) {
    items.push({ label: "Documenti", href: "/documents" });
  }
  if (activeCodes.has(MODULE_CODES.CORE_INVENTORY) && session?.user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"].includes(role))) {
    items.push({ label: "Inventory", href: "/inventory" });
  }
  if (activeCodes.has(MODULE_CODES.CORE_SALES) && session?.user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "WAREHOUSE"].includes(role))) {
    items.push({ label: "Sales", href: "/sales" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_MODULES) &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN"].includes(role)
    )
  ) {
    items.push({ label: "Moduli", href: "/settings/modules" });
  }
  if (session?.user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN"].includes(role)) && [MODULE_CODES.CORE_PRODUCTS, MODULE_CODES.CORE_PRICE_LISTS, MODULE_CODES.CORE_PAYMENTS].some((code) => activeCodes.has(code))) {
    items.push({ label: "Configurazioni", href: "/settings/configurations" });
  }

  return (
    <aside className="w-64 border-r bg-slate-900 text-white">
      <div className="border-b border-slate-800 p-6">
        <h1 className="text-xl font-bold">Nexus ERP</h1>
        <p className="mt-1 text-sm text-slate-400">Business Platform</p>
      </div>

      <SidebarNav items={items} />
    </aside>
  );
}
