import { requireLocationAdmin } from "@/lib/location-access";
import { getLocation } from "@/lib/locations";
import { notFound } from "next/navigation";
import { saveLocation } from "../../actions";
import LocationForm from "../../location-form";

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) { const context = await requireLocationAdmin(); const { id } = await params; const location = await getLocation(context.companyId, id); if (!location) notFound(); return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Modifica sede</h1><p className="text-slate-500">{location.code} · {location.name}</p></div><LocationForm action={saveLocation} defaults={location}/></div>; }
