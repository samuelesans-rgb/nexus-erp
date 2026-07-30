"use server";

import { auth } from "@/auth";
import { isModuleCode } from "@/lib/module-catalog";
import {
  ModuleConfigurationError,
  setCompanyModuleEnabled,
} from "@/lib/modules";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const moduleAdministrators = new Set(["SUPER_ADMIN", "ADMIN"]);

export async function updateCompanyModule(formData: FormData) {
  const session = await auth();

  if (!session?.user?.companyId) {
    redirect("/login");
  }
  if (!session.user.roles.some((role) => moduleAdministrators.has(role))) {
    redirect("/settings/modules?error=Accesso%20negato.");
  }

  const code = String(formData.get("code") ?? "");
  const enabled = formData.get("enabled") === "true";

  if (!isModuleCode(code)) {
    redirect("/settings/modules?error=Codice%20modulo%20non%20valido.");
  }

  let errorMessage: string | null = null;
  try {
    await setCompanyModuleEnabled(session.user.companyId, code, enabled);
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
