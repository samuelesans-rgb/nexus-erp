"use server";

import {
  PARTNER_CAPABILITIES,
  requirePartnerContext,
} from "@/lib/partner-access";
import { prisma } from "@/lib/prisma";
import { isValidPartnerAgent } from "@/lib/partners";
import { validateConfigurationReferences } from "@/lib/configurations";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type PartnerFormState = {
  status: "idle" | "error";
  message?: string;
  errors?: Record<string, string>;
};

const allowedTypes = new Set(["COMPANY", "PERSON"]);
const allowedStatuses = new Set(["ACTIVE", "SUSPENDED"]);

function optionalText(formData: FormData, field: string, max = 255) {
  const value = String(formData.get(field) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function optionalDecimal(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim().replace(",", ".");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? value : undefined;
}

function parsePartnerForm(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const status = String(formData.get("status") ?? "");
  const legalName = optionalText(formData, "legalName");
  const firstName = optionalText(formData, "firstName");
  const lastName = optionalText(formData, "lastName");
  const displayName = optionalText(formData, "displayName");
  const email = optionalText(formData, "email");
  const creditLimit = optionalDecimal(formData, "creditLimit");
  const discountPercent = optionalDecimal(formData, "discountPercent");
  const errors: Record<string, string> = {};

  if (!allowedTypes.has(type)) errors.type = "Seleziona un tipo valido.";
  if (!allowedStatuses.has(status)) errors.status = "Seleziona uno stato valido.";
  if (type === "COMPANY" && !legalName) {
    errors.legalName = "La ragione sociale è obbligatoria.";
  }
  if (type === "PERSON" && !firstName && !lastName) {
    errors.firstName = "Inserisci almeno nome o cognome.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Inserisci un indirizzo email valido.";
  }
  if (creditLimit === undefined) errors.creditLimit = "Inserisci un importo valido.";
  if (
    discountPercent === undefined ||
    (discountPercent !== null && Number(discountPercent) > 100)
  ) {
    errors.discountPercent = "Inserisci una percentuale tra 0 e 100.";
  }

  const name =
    displayName ||
    (type === "COMPANY"
      ? legalName
      : [firstName, lastName].filter(Boolean).join(" ")) ||
    "";

  return {
    errors,
    data: {
      type: (type === "PERSON" ? "PERSON" : "COMPANY") as
        | "PERSON"
        | "COMPANY",
      status: (status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE") as
        | "SUSPENDED"
        | "ACTIVE",
      name,
      displayName,
      legalName,
      firstName,
      lastName,
      vatNumber: optionalText(formData, "vatNumber"),
      taxCode: optionalText(formData, "taxCode"),
      email,
      pec: optionalText(formData, "pec"),
      phone: optionalText(formData, "phone"),
      mobile: optionalText(formData, "mobile"),
      website: optionalText(formData, "website"),
      address: optionalText(formData, "address"),
      zipCode: optionalText(formData, "zipCode", 20),
      city: optionalText(formData, "city"),
      province: optionalText(formData, "province", 10),
      country: optionalText(formData, "country", 100),
      category: optionalText(formData, "category", 80),
      priceListId: optionalText(formData, "priceListId"),
      paymentMethodId: optionalText(formData, "paymentMethodId"),
      paymentTermId: optionalText(formData, "paymentTermId"),
      creditLimit,
      discountPercent,
      recipientCode: optionalText(formData, "recipientCode", 20),
      splitPayment: formData.get("splitPayment") === "on",
      reverseCharge: formData.get("reverseCharge") === "on",
      internalNotes: optionalText(formData, "internalNotes", 5000),
      isCustomer: formData.get("isCustomer") === "on",
      isSupplier: formData.get("isSupplier") === "on",
      isLead: formData.get("isLead") === "on",
      isProspect: formData.get("isProspect") === "on",
      isCollaborator: formData.get("isCollaborator") === "on",
      isAgent: formData.get("isAgent") === "on",
      isCarrier: formData.get("isCarrier") === "on",
      isProfessional: formData.get("isProfessional") === "on",
      active: formData.get("active") === "on",
      agentId: optionalText(formData, "agentId"),
    },
  };
}

export async function createPartner(
  _previousState: PartnerFormState,
  formData: FormData
): Promise<PartnerFormState> {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.WRITE);

  const parsed = parsePartnerForm(formData);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      status: "error",
      message: "Controlla i campi evidenziati.",
      errors: parsed.errors,
    };
  }
  if (!(await validateConfigurationReferences(context.companyId, parsed.data))) {
    return { status: "error", message: "Una configurazione commerciale selezionata non è valida." };
  }

  if (parsed.data.agentId) {
    if (!(await isValidPartnerAgent(context.companyId, parsed.data.agentId))) {
      return { status: "error", message: "L'agente selezionato non è valido." };
    }
  }

  const partner = await prisma.partner.create({
    data: {
      ...parsed.data,
      companyId: context.companyId,
      createdById: context.userId,
      updatedById: context.userId,
    },
    select: { id: true },
  });

  revalidatePath("/partners");
  redirect(`/partners/${partner.id}`);
}

export async function updatePartner(
  partnerId: string,
  _previousState: PartnerFormState,
  formData: FormData
): Promise<PartnerFormState> {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.WRITE);

  const parsed = parsePartnerForm(formData);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      status: "error",
      message: "Controlla i campi evidenziati.",
      errors: parsed.errors,
    };
  }
  if (!(await validateConfigurationReferences(context.companyId, parsed.data))) {
    return { status: "error", message: "Una configurazione commerciale selezionata non è valida." };
  }
  if (parsed.data.agentId === partnerId) {
    return { status: "error", message: "Un Partner non può essere agente di sé stesso." };
  }
  if (parsed.data.agentId) {
    if (!(await isValidPartnerAgent(context.companyId, parsed.data.agentId))) {
      return { status: "error", message: "L'agente selezionato non è valido." };
    }
  }

  const result = await prisma.partner.updateMany({
    where: {
      id: partnerId,
      companyId: context.companyId,
    },
    data: {
      ...parsed.data,
      updatedById: context.userId,
    },
  });
  if (result.count === 0) {
    return { status: "error", message: "Partner non trovato." };
  }

  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
  redirect(`/partners/${partnerId}`);
}

export async function archivePartner(formData: FormData) {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.ARCHIVE);
  const partnerId = String(formData.get("partnerId") ?? "");

  await prisma.partner.updateMany({
    where: {
      id: partnerId,
      companyId: context.companyId,
      deletedAt: null,
    },
    data: {
      active: false,
      deletedAt: new Date(),
      updatedById: context.userId,
    },
  });
  revalidatePath("/partners");
  redirect("/partners");
}

export async function restorePartner(formData: FormData) {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.ARCHIVE);
  const partnerId = String(formData.get("partnerId") ?? "");

  await prisma.partner.updateMany({
    where: {
      id: partnerId,
      companyId: context.companyId,
      deletedAt: { not: null },
    },
    data: {
      active: true,
      deletedAt: null,
      updatedById: context.userId,
    },
  });
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
  redirect(`/partners/${partnerId}`);
}
