import { connectorBody, connectorFromRequest, connectorResponse } from "@/lib/kitchen-connector-http";
import { claimPosNetworkDiagnostic, completePosNetworkDiagnostic } from "@/lib/pos-network-diagnostic";
import { ConnectorError } from "@/lib/kitchen-connector";
import { validateDiagnosticJob, validateDiagnosticResult } from "@/tools/kitchen-connector/pos-network-diagnostic";

export async function POST(request: Request) {
  try {
    const device = await connectorFromRequest(request);
    const body = await connectorBody(request, 8192);
    const keys = Object.keys(body).sort().join(",");
    if (keys === "operation" && body.operation === "claim") return Response.json({ job: await claimPosNetworkDiagnostic(device) });
    if (keys !== "job,operation,result" || body.operation !== "complete") throw new ConnectorError("Payload diagnostico non valido.");
    let job, result;
    try { job = validateDiagnosticJob(body.job); result = validateDiagnosticResult(body.result); } catch { throw new ConnectorError("Payload diagnostico non valido."); }
    await completePosNetworkDiagnostic(device, job.id, result);
    return Response.json({ ok: true });
  } catch (error) { return connectorResponse(error); }
}
