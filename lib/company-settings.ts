import "server-only";

import { prisma } from "@/lib/prisma";

export class CompanySettingsError extends Error {}

export type CompanySettingsInput = {
  name: string; legalName?: string | null; vatNumber?: string | null; taxCode?: string | null;
  country?: string | null; address?: string | null; city?: string | null; email?: string | null;
  phone?: string | null; currency: string; timezone: string; locale: string; logo?: string | null;
};

const clean = (value?: string | null) => value?.trim() || null;

export function getCompanySettings(companyId: string) {
  return prisma.company.findUnique({ where: { id: companyId } });
}

export async function updateCompanySettings(companyId: string, input: CompanySettingsInput) {
  const name = input.name.trim();
  const currency = input.currency.trim().toUpperCase();
  const country = clean(input.country)?.toUpperCase() ?? null;
  if (!name) throw new CompanySettingsError("Il nome azienda è obbligatorio.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new CompanySettingsError("La valuta deve essere un codice ISO di 3 lettere.");
  if (country && !/^[A-Z]{2}$/.test(country)) throw new CompanySettingsError("Il paese deve essere un codice ISO di 2 lettere.");
  if (!input.timezone.trim() || !input.locale.trim()) throw new CompanySettingsError("Timezone e locale sono obbligatori.");
  const email = clean(input.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CompanySettingsError("L’indirizzo email non è valido.");
  const logo = clean(input.logo);
  if (logo) { try { const url = new URL(logo); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); } catch { throw new CompanySettingsError("Il logo deve essere un URL HTTP o HTTPS valido."); } }
  const result = await prisma.company.updateMany({
    where: { id: companyId },
    data: { name, legalName: clean(input.legalName), vatNumber: clean(input.vatNumber), taxCode: clean(input.taxCode), country, address: clean(input.address), city: clean(input.city), email, phone: clean(input.phone), currency, timezone: input.timezone.trim(), locale: input.locale.trim(), logo },
  });
  if (result.count !== 1) throw new CompanySettingsError("Azienda non trovata.");
  return prisma.company.findUniqueOrThrow({ where: { id: companyId } });
}
