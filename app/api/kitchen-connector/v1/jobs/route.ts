import { fetchConnectorJobs } from "@/lib/kitchen-connector";
import { connectorFromRequest, connectorResponse } from "@/lib/kitchen-connector-http";

export async function GET(request: Request) {
  try {
    const device = await connectorFromRequest(request);
    const take = Number(new URL(request.url).searchParams.get("take")) || 20;
    return Response.json({ jobs: await fetchConnectorJobs(device, take) });
  } catch (error) { return connectorResponse(error); }
}
