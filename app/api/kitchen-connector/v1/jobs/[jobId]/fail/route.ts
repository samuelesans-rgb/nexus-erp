import { failConnectorJob } from "@/lib/kitchen-connector";
import { connectorBody, connectorFromRequest, connectorResponse } from "@/lib/kitchen-connector-http";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const [device, body] = await Promise.all([connectorFromRequest(request), connectorBody(request)]);
    const outcome = body.outcome === "UNCERTAIN_AFTER_WRITE" ? "UNCERTAIN_AFTER_WRITE" : "FAILED_BEFORE_WRITE";
    const job = await failConnectorJob(device, (await context.params).jobId, String(body.leaseToken ?? ""), body.error ?? "Stampa fallita", outcome);
    return Response.json({ jobId: job.id, status: job.status });
  } catch (error) { return connectorResponse(error); }
}
