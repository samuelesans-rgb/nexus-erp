import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import PartnerCreateForm from "./partner-create-form";

export default async function PartnersPage() {
  const session = await auth();

  if (!session?.user?.companyId) {
    redirect("/login");
  }

  const partners = await prisma.partner.findMany({
    where: {
      companyId: session.user.companyId,
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Partner</h1>
        <p className="text-muted-foreground">
          Clienti, fornitori e contatti di {session.user.companyName}.
        </p>
      </div>

      <PartnerCreateForm />

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-2xl">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="p-4 text-left">Nome</th>
              <th className="p-4 text-left">Tipo</th>
              <th className="p-4 text-left">Cliente</th>
              <th className="p-4 text-left">Fornitore</th>
              <th className="p-4 text-left">Città</th>
              <th className="p-4 text-left">Contatti</th>
            </tr>
          </thead>

          <tbody>
            {partners.map((partner) => (
              <tr key={partner.id} className="border-b last:border-b-0">
                <td className="p-4 font-medium">{partner.name}</td>
                <td className="p-4">
                  {partner.type === "COMPANY" ? "Azienda" : "Persona"}
                </td>
                <td className="p-4">{partner.isCustomer ? "Sì" : "—"}</td>
                <td className="p-4">{partner.isSupplier ? "Sì" : "—"}</td>
                <td className="p-4">{partner.city || "—"}</td>
                <td className="p-4">
                  <div>{partner.email}</div>
                  <div className="text-sm text-slate-500">
                    {partner.phone || partner.mobile}
                  </div>
                </td>
              </tr>
            ))}

            {partners.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-500">
                  Nessun partner presente per questa azienda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
