import { requireRestaurantContext } from "@/lib/restaurant-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { connectorBody, connectorResponse } from "@/lib/kitchen-connector-http";
import { ConnectorError } from "@/lib/kitchen-connector";
import { getPosNetworkDiagnostic, getPosNetworkDiagnosticDevice, requestPosNetworkDiagnostic } from "@/lib/pos-network-diagnostic";

export async function POST(request: Request) {
  try {
    const context = await requireRestaurantContext(MODULE_CODES.RESTAURANT_KITCHEN, "manage");
    // Same-origin browser request; no cross-origin enqueue via session cookies.
    const expectedOrigin = new URL(process.env.AUTH_URL ?? request.url).origin;
    if (request.headers.get("origin") !== expectedOrigin) throw new ConnectorError("Origine non valida.", 403);
    const body = await connectorBody(request, 512);
    if (Object.keys(body).join(",") !== "deviceId" || typeof body.deviceId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.deviceId)) throw new ConnectorError("Payload diagnostico non valido.");
    const record = await requestPosNetworkDiagnostic({ id: body.deviceId, companyId: context.companyId, locationId: context.locationId }, context.userId);
    return Response.json({ id: record.id, status: record.status });
  } catch (error) { return connectorResponse(error); }
}

export async function GET(request: Request) {
  try {
    const context = await requireRestaurantContext(MODULE_CODES.RESTAURANT_KITCHEN, "manage");
    const params = new URL(request.url).searchParams;
    if (params.size !== 1 || !params.has("deviceId")) throw new ConnectorError("Payload diagnostico non valido.");
    const scope = { id: params.get("deviceId")!, companyId: context.companyId, locationId: context.locationId };
    const [connector, diagnostic] = await Promise.all([getPosNetworkDiagnosticDevice(scope), getPosNetworkDiagnostic(scope)]);
    return Response.json({ connector, diagnostic }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return connectorResponse(error); }
}
