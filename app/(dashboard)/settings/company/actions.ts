"use server";
import { CompanySettingsError, updateCompanySettings } from "@/lib/company-settings";
import { requireCompanyAdmin } from "@/lib/master-data-access";
import { redirect } from "next/navigation";
const value = (data: FormData, key: string) => String(data.get(key) ?? "");
export async function saveCompany(data: FormData) {
  const { companyId } = await requireCompanyAdmin();
  try { await updateCompanySettings(companyId, { name: value(data,"name"), legalName: value(data,"legalName"), vatNumber: value(data,"vatNumber"), taxCode: value(data,"taxCode"), country: value(data,"country"), address: value(data,"address"), city: value(data,"city"), email: value(data,"email"), phone: value(data,"phone"), currency: value(data,"currency"), timezone: value(data,"timezone"), locale: value(data,"locale"), logo: value(data,"logo") }); }
  catch (error) { const message = error instanceof CompanySettingsError ? error.message : "Impossibile salvare l'azienda."; redirect(`/settings/company?error=${encodeURIComponent(message)}`); }
  redirect("/settings/company?success=Dati%20azienda%20aggiornati");
}
