import { pairConnector } from "@/lib/kitchen-connector";
import { connectorBody, connectorResponse, consumeConnectorRateLimit, requestKey } from "@/lib/kitchen-connector-http";

export async function POST(request: Request) {
  try {
    consumeConnectorRateLimit(`pair:${requestKey(request)}`, 10, 10 * 60_000);
    const body = await connectorBody(request);
    return Response.json(await pairConnector(String(body.pairingToken ?? ""), { name: String(body.name ?? ""), serialConfig: body.serialConfig }), { status: 201 });
  } catch (error) { return connectorResponse(error); }
}
