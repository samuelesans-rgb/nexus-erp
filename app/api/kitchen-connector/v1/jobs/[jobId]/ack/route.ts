import { acknowledgeConnectorJob } from "@/lib/kitchen-connector";
import { connectorBody, connectorFromRequest, connectorResponse } from "@/lib/kitchen-connector-http";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const [device, body] = await Promise.all([connectorFromRequest(request), connectorBody(request)]);
    const job = await acknowledgeConnectorJob(device, (await context.params).jobId, String(body.leaseToken ?? ""));
    return Response.json({ jobId: job.id, status: job.status });
  } catch (error) { return connectorResponse(error); }
}
