"use server";

import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { ModuleNotEnabledError, requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
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

async function requirePartnerSession() {
  const session = await auth();

  if (!session?.user?.companyId) {
    return { error: "Sessione scaduta. Accedi nuovamente per continuare." } as const;
  }

  try {
    await requireModule(session.user.companyId, MODULE_CODES.CORE_PARTNERS);
  } catch (error) {
    if (error instanceof ModuleNotEnabledError) {
      return {
        error: "Il modulo Partner non è attivo per questa azienda.",
      } as const;
    }
    throw error;
  }

  return { session } as const;
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
      priceListCode: optionalText(formData, "priceListCode", 80),
      paymentMethod: optionalText(formData, "paymentMethod", 100),
      paymentTerms: optionalText(formData, "paymentTerms", 200),
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
  const context = await requirePartnerSession();
  if ("error" in context) return { status: "error", message: context.error };

  const parsed = parsePartnerForm(formData);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      status: "error",
      message: "Controlla i campi evidenziati.",
      errors: parsed.errors,
    };
  }

  if (parsed.data.agentId) {
    const validAgent = await prisma.partner.findFirst({
      where: {
        id: parsed.data.agentId,
        companyId: context.session.user.companyId,
        isAgent: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!validAgent) {
      return { status: "error", message: "L'agente selezionato non è valido." };
    }
  }

  const partner = await prisma.partner.create({
    data: {
      ...parsed.data,
      companyId: context.session.user.companyId,
      createdById: context.session.user.id,
      updatedById: context.session.user.id,
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
  const context = await requirePartnerSession();
  if ("error" in context) return { status: "error", message: context.error };

  const parsed = parsePartnerForm(formData);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      status: "error",
      message: "Controlla i campi evidenziati.",
      errors: parsed.errors,
    };
  }
  if (parsed.data.agentId === partnerId) {
    return { status: "error", message: "Un Partner non può essere agente di sé stesso." };
  }
  if (parsed.data.agentId) {
    const validAgent = await prisma.partner.findFirst({
      where: {
        id: parsed.data.agentId,
        companyId: context.session.user.companyId,
        isAgent: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!validAgent) {
      return { status: "error", message: "L'agente selezionato non è valido." };
    }
  }

  const result = await prisma.partner.updateMany({
    where: {
      id: partnerId,
      companyId: context.session.user.companyId,
    },
    data: {
      ...parsed.data,
      updatedById: context.session.user.id,
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
  const context = await requirePartnerSession();
  if ("error" in context) redirect("/partners");
  const partnerId = String(formData.get("partnerId") ?? "");

  await prisma.partner.updateMany({
    where: {
      id: partnerId,
      companyId: context.session.user.companyId,
      deletedAt: null,
    },
    data: {
      active: false,
      deletedAt: new Date(),
      updatedById: context.session.user.id,
    },
  });
  revalidatePath("/partners");
  redirect("/partners");
}

export async function restorePartner(formData: FormData) {
  const context = await requirePartnerSession();
  if ("error" in context) redirect("/partners");
  const partnerId = String(formData.get("partnerId") ?? "");

  await prisma.partner.updateMany({
    where: {
      id: partnerId,
      companyId: context.session.user.companyId,
      deletedAt: { not: null },
    },
    data: {
      active: true,
      deletedAt: null,
      updatedById: context.session.user.id,
    },
  });
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
  redirect(`/partners/${partnerId}`);
}
