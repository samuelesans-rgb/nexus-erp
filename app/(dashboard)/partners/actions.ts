"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type CreatePartnerState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: {
    name?: string;
    email?: string;
    type?: string;
  };
};

function optionalText(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return value || null;
}

export async function createPartner(
  _previousState: CreatePartnerState,
  formData: FormData
): Promise<CreatePartnerState> {
  const session = await auth();

  if (!session?.user?.companyId) {
    return {
      status: "error",
      message: "Sessione scaduta. Accedi nuovamente per continuare.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "COMPANY");
  const email = optionalText(formData, "email");
  const errors: NonNullable<CreatePartnerState["errors"]> = {};

  if (!name) {
    errors.name = "Il nome è obbligatorio.";
  }

  if (type !== "COMPANY" && type !== "PERSON") {
    errors.type = "Seleziona un tipo di partner valido.";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Inserisci un indirizzo email valido.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Controlla i campi evidenziati.",
      errors,
    };
  }

  try {
    await prisma.partner.create({
      data: {
        companyId: session.user.companyId,
        type: type === "PERSON" ? "PERSON" : "COMPANY",
        name,
        vatNumber: optionalText(formData, "vatNumber"),
        taxCode: optionalText(formData, "taxCode"),
        email,
        pec: optionalText(formData, "pec"),
        phone: optionalText(formData, "phone"),
        mobile: optionalText(formData, "mobile"),
        website: optionalText(formData, "website"),
        address: optionalText(formData, "address"),
        zipCode: optionalText(formData, "zipCode"),
        city: optionalText(formData, "city"),
        province: optionalText(formData, "province"),
        country: optionalText(formData, "country"),
        isCustomer: formData.get("isCustomer") === "on",
        isSupplier: formData.get("isSupplier") === "on",
      },
    });
  } catch {
    return {
      status: "error",
      message:
        "Non è stato possibile salvare il partner. Riprova tra qualche istante.",
    };
  }

  revalidatePath("/partners");

  return {
    status: "success",
    message: "Partner creato correttamente.",
  };
}
