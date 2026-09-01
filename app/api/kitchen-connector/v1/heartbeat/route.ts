import { heartbeatConnector } from "@/lib/kitchen-connector";
import { getFusionCatalogCommand } from "@/lib/fusion-catalog-sync";
import { connectorBody, connectorFromRequest, connectorResponse } from "@/lib/kitchen-connector-http";

export async function POST(request: Request) {
  try {
    const [device, body] = await Promise.all([connectorFromRequest(request), connectorBody(request)]);
    const [,catalog]=await Promise.all([heartbeatConnector(device.id, { printerOnline: body.printerOnline === true, queueDepth: Number(body.queueDepth) || 0, failedJobs: Number(body.failedJobs) || 0, connectorVersion: typeof body.connectorVersion === "string" ? body.connectorVersion : undefined, lastError: typeof body.lastError === "string" ? body.lastError : null, diagnostics: body.diagnostics }),getFusionCatalogCommand(device)]);
    return Response.json({ ok: true, serverTime: new Date().toISOString(), ...catalog });
  } catch (error) { return connectorResponse(error); }
}
