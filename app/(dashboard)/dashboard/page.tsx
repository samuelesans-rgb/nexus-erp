import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Benvenuto in Nexus ERP.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Incassi oggi</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">€ 0,00</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ordini aperti</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clienti</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prodotti</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}