import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { getCompanyModules } from "@/lib/modules";
import {
  hasPartnerCapability,
  PARTNER_CAPABILITIES,
} from "@/lib/partner-access";
import { hasCrmCapability, CRM_CAPABILITIES } from "@/lib/crm-access";
import SidebarNav from "./sidebar-nav";

export default async function AppSidebar() {
  const session = await auth();
  const companyId = session?.user?.companyId;
  const modules = companyId ? await getCompanyModules(companyId) : [];
  const activeCodes = new Set(
    modules.map(({ moduleDefinition }) => moduleDefinition.code),
  );
  const items = [{ label: "Dashboard", href: "/dashboard" }];
  const salaOnly =
    session?.user?.roles.includes("SALA") &&
    !session.user.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role),
    );
  if (salaOnly)
    items.splice(0, items.length, { label: "Sala", href: "/restaurant/floor" });
  if (
    !salaOnly &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"].includes(role),
    )
  )
    items.push({ label: "Controlling", href: "/management/controlling" });

  if (
    activeCodes.has(MODULE_CODES.CORE_PARTNERS) &&
    session?.user?.roles &&
    hasPartnerCapability(session.user.roles, PARTNER_CAPABILITIES.READ)
  ) {
    items.push({ label: "Partner", href: "/partners" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_CRM) &&
    session?.user?.roles &&
    hasCrmCapability(session.user.roles, CRM_CAPABILITIES.READ)
  ) {
    items.push({ label: "CRM", href: "/crm" });
  }
  if (!salaOnly && activeCodes.has(MODULE_CODES.CORE_PRODUCTS)) {
    items.push({ label: "Catalogo", href: "/items" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_COMPANIES) &&
    session?.user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN"].includes(role))
  ) {
    items.push({ label: "Azienda", href: "/settings/company" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_PRODUCTS) &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role),
    )
  ) {
    items.push({ label: "Dati base", href: "/settings/master-data" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_LOCATIONS) &&
    session?.user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN"].includes(role))
  ) {
    items.push({ label: "Sedi", href: "/settings/locations" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_DOCUMENTS) &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"].includes(role),
    )
  ) {
    items.push({ label: "Documenti", href: "/documents" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_INVENTORY) &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"].includes(role),
    )
  ) {
    items.push({ label: "Inventory", href: "/inventory" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_SALES) &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "WAREHOUSE"].includes(role),
    )
  ) {
    items.push({ label: "Sales", href: "/sales" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_PURCHASES) &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT", "WAREHOUSE"].includes(
        role,
      ),
    )
  ) {
    items.push({ label: "Acquisti", href: "/purchases" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_TREASURY) &&
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT", "SALES"].includes(role),
    )
  ) {
    items.push({
      label: "Tesoreria",
      href: session?.user?.roles.includes("SALES")
        ? "/treasury/receivables"
        : "/treasury",
    });
  }
  if (
    !salaOnly &&
    [
      MODULE_CODES.RESTAURANT_RESERVATIONS,
      MODULE_CODES.RESTAURANT_MENU,
      MODULE_CODES.RESTAURANT_FLOOR,
      MODULE_CODES.RESTAURANT_KITCHEN,
    ].some((code) => activeCodes.has(code)) &&
    session?.user?.roles.some((role) =>
      [
        "SUPER_ADMIN",
        "ADMIN",
        "MANAGER",
        "SALES",
        "WAREHOUSE",
        "ACCOUNTANT",
      ].includes(role),
    )
  ) {
    items.push({ label: "Restaurant", href: "/restaurant" });
  }
  if (
    activeCodes.has(MODULE_CODES.CORE_MODULES) &&
    session?.user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN"].includes(role))
  ) {
    items.push({ label: "Moduli", href: "/settings/modules" });
  }
  if (
    session?.user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN"].includes(role),
    ) &&
    [
      MODULE_CODES.CORE_PRODUCTS,
      MODULE_CODES.CORE_PRICE_LISTS,
      MODULE_CODES.CORE_PAYMENTS,
    ].some((code) => activeCodes.has(code))
  ) {
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
