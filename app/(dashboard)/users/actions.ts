"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserAdminContext } from "@/lib/user-access";
import {
  createCompanyUser,
  setCompanyUserActive,
  updateCompanyUser,
} from "@/lib/user-management";

const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();

const userInput = (data: FormData) => ({
  firstName: text(data, "firstName"),
  lastName: text(data, "lastName"),
  email: text(data, "email"),
  roleCodes: data.getAll("roleCodes").map(String),
  locationIds: data.getAll("locationIds").map(String),
  defaultLocationId: text(data, "defaultLocationId") || null,
  active: data.get("active") === "on",
});

function failure(path: string, error: unknown): never {
  const message =
    error instanceof Error ? error.message : "Operazione non riuscita.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createUserAction(data: FormData) {
  const context = await requireUserAdminContext();
  try {
    await createCompanyUser(context.companyId, context.membershipId, {
      ...userInput(data),
      password: text(data, "password"),
    });
  } catch (error) {
    failure("/users/new", error);
  }
  revalidatePath("/users");
  redirect("/users?success=Utente creato");
}

export async function updateUserAction(data: FormData) {
  const context = await requireUserAdminContext();
  const membershipId = text(data, "membershipId");
  try {
    await updateCompanyUser(
      context.companyId,
      context.membershipId,
      membershipId,
      userInput(data),
    );
  } catch (error) {
    failure(`/users/${membershipId}/edit`, error);
  }
  revalidatePath("/users");
  redirect("/users?success=Utente aggiornato");
}

export async function toggleUserActiveAction(data: FormData) {
  const context = await requireUserAdminContext();
  try {
    await setCompanyUserActive(
      context.companyId,
      context.membershipId,
      text(data, "membershipId"),
      text(data, "active") === "true",
    );
  } catch (error) {
    failure("/users", error);
  }
  revalidatePath("/users");
  redirect("/users?success=Stato utente aggiornato");
}
