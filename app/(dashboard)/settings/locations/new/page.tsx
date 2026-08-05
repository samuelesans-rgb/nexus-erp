import { requireLocationAdmin } from "@/lib/location-access";
import LocationForm from "../location-form";
import { saveLocation } from "../actions";

export default async function NewLocationPage() { await requireLocationAdmin(); return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Nuova sede</h1><p className="text-slate-500">Crea una sede tenant-safe.</p></div><LocationForm action={saveLocation}/></div>; }
