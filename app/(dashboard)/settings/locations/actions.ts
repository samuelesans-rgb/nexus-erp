"use server";

import { LocationDomainError, archiveLocation, createLocation, restoreLocation, setCurrentLocation, setHeadquarters, updateLocation } from "@/lib/locations";
import { requireLocationAdmin, requireLocationContext } from "@/lib/location-access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || undefined;
}

function input(formData: FormData) {
  return {
    slug: value(formData, "slug"),
    code: value(formData, "code") ?? "",
    name: value(formData, "name") ?? "",
    description: value(formData, "description"),
    email: value(formData, "email"),
    phone: value(formData, "phone"),
    address: value(formData, "address"),
    city: value(formData, "city"),
    province: value(formData, "province"),
    postalCode: value(formData, "postalCode"),
    country: value(formData, "country"),
    timezone: value(formData, "timezone"),
    currency: value(formData, "currency"),
    active: formData.get("active") === "on",
  };
}

function message(error: unknown) {
  return error instanceof LocationDomainError || error instanceof Error ? error.message : "Operazione sede non riuscita.";
}

export async function saveLocation(formData: FormData) {
  const context = await requireLocationAdmin();
  const id = value(formData, "id");
  try {
    if (id) await updateLocation(context.companyId, context.userId, id, input(formData));
    else await createLocation(context.companyId, context.userId, input(formData));
  } catch (error) {
    redirect(`/settings/locations${id ? `/${id}/edit` : "/new"}?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/settings/locations");
  redirect("/settings/locations?success=Sede salvata");
}

export async function setLocationLifecycle(formData: FormData) {
  const context = await requireLocationAdmin();
  const id = value(formData, "id");
  const restore = formData.get("restore") === "true";
  if (!id) redirect("/settings/locations");
  try {
    if (restore) await restoreLocation(context.companyId, context.userId, id);
    else await archiveLocation(context.companyId, context.userId, id);
  } catch (error) {
    redirect(`/settings/locations/${id}?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/settings/locations");
  redirect(`/settings/locations/${id}?success=${restore ? "Sede ripristinata" : "Sede archiviata"}`);
}

export async function promoteHeadquarters(formData: FormData) {
  const context = await requireLocationAdmin();
  const id = value(formData, "id");
  if (!id) redirect("/settings/locations");
  try { await setHeadquarters(context.companyId, context.userId, id); }
  catch (error) { redirect(`/settings/locations/${id}?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/settings/locations");
  redirect(`/settings/locations/${id}?success=Headquarters aggiornata`);
}

export async function changeCurrentLocation(formData: FormData) {
  const context = await requireLocationContext();
  const locationId = value(formData, "locationId");
  if (!locationId) redirect("/dashboard");
  try { await setCurrentLocation(context.companyId, context.membershipId, locationId); }
  catch { redirect("/dashboard"); }
  revalidatePath("/");
  redirect("/dashboard");
}
