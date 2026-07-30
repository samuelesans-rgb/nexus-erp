import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCompanyModuleSettings } from "@/lib/modules";
import { redirect } from "next/navigation";
import { updateCompanyModule } from "./actions";

const moduleAdministrators = new Set(["SUPER_ADMIN", "ADMIN"]);

export default async function CompanyModulesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.companyId) {
    redirect("/login");
  }
  if (!session.user.roles.some((role) => moduleAdministrators.has(role))) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-bold">Accesso negato</h1>
        <p className="mt-2 text-red-900">
          Solo SUPER_ADMIN e ADMIN possono gestire i moduli aziendali.
        </p>
      </div>
    );
  }

  const [modules, feedback] = await Promise.all([
    getCompanyModuleSettings(session.user.companyId),
    searchParams,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Moduli aziendali</h1>
        <p className="text-muted-foreground">
          Attivazioni per {session.user.companyName}. I dati dei moduli
          disattivati vengono conservati.
        </p>
      </div>

      {feedback.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          {feedback.error}
        </p>
      )}
      {feedback.success && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
          {feedback.success}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Catalogo moduli</CardTitle>
          <CardDescription>
            I moduli obbligatori restano sempre attivi; i moduli FUTURE non
            sono ancora attivabili.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-4xl">
            <thead>
              <tr className="border-y bg-slate-50">
                <th className="p-4 text-left">Modulo</th>
                <th className="p-4 text-left">Categoria</th>
                <th className="p-4 text-left">Stato</th>
                <th className="p-4 text-left">Tipo</th>
                <th className="p-4 text-left">Attivazione</th>
                <th className="p-4 text-right">Azione</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => {
                const enabled = module.activation?.enabled ?? false;
                const actionDisabled =
                  module.mandatory || (!enabled && module.status === "FUTURE");

                return (
                  <tr key={module.id} className="border-b last:border-b-0">
                    <td className="p-4">
                      <p className="font-medium">{module.name}</p>
                      <p className="text-xs text-slate-500">{module.code}</p>
                    </td>
                    <td className="p-4">{module.category}</td>
                    <td className="p-4">{module.status}</td>
                    <td className="p-4">
                      {module.mandatory ? "Obbligatorio" : "Opzionale"}
                    </td>
                    <td className="p-4">
                      {enabled ? "Attivo" : "Disattivato"}
                    </td>
                    <td className="p-4 text-right">
                      <form action={updateCompanyModule}>
                        <input type="hidden" name="code" value={module.code} />
                        <input
                          type="hidden"
                          name="enabled"
                          value={enabled ? "false" : "true"}
                        />
                        <Button
                          type="submit"
                          variant={enabled ? "outline" : "default"}
                          disabled={actionDisabled}
                        >
                          {module.mandatory
                            ? "Sempre attivo"
                            : enabled
                              ? "Disattiva"
                              : module.status === "FUTURE"
                                ? "Non disponibile"
                                : "Attiva"}
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
