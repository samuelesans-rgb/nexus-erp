"use server";

import { requireAuthorizationContext } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { isModuleCode } from "@/lib/module-catalog";
import {
  ModuleConfigurationError,
  setCompanyModuleEnabled,
} from "@/lib/modules";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const moduleAdministrators = new Set(["SUPER_ADMIN", "ADMIN"]);

export async function updateCompanyModule(formData: FormData) {
  const context = await requireAuthorizationContext();
  if (!context.roles.some((role) => moduleAdministrators.has(role))) {
    redirect("/settings/modules?error=Accesso%20negato.");
  }

  const code = String(formData.get("code") ?? "");
  const enabled = formData.get("enabled") === "true";

  if (!isModuleCode(code)) {
    redirect("/settings/modules?error=Codice%20modulo%20non%20valido.");
  }

  let errorMessage: string | null = null;
  try {
    await setCompanyModuleEnabled(context.companyId, code, enabled);
    await writeAuditLog({ companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, action: enabled ? "MODULE_ENABLED" : "MODULE_DISABLED", entityType: "CompanyModule", entityId: code });
  } catch (error) {
    if (error instanceof ModuleConfigurationError) {
      errorMessage = error.message;
    } else {
      throw error;
    }
  }

  if (errorMessage) {
    redirect(`/settings/modules?error=${encodeURIComponent(errorMessage)}`);
  }

  revalidatePath("/settings/modules");
  revalidatePath("/partners");
  redirect("/settings/modules?success=Configurazione%20aggiornata.");
}
