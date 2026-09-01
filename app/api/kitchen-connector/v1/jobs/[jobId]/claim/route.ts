import { claimConnectorJob } from "@/lib/kitchen-connector";
import { connectorFromRequest, connectorResponse } from "@/lib/kitchen-connector-http";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try { return Response.json(await claimConnectorJob(await connectorFromRequest(request), (await context.params).jobId)); }
  catch (error) { return connectorResponse(error); }
}
