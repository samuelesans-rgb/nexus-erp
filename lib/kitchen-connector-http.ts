import "server-only";

import { authenticateConnector, ConnectorError } from "@/lib/kitchen-connector";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function consumeConnectorRateLimit(key: string, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new ConnectorError("Troppe richieste.", 429);
  current.count += 1;
}

export function requestKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function connectorFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, credential] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !credential) throw new ConnectorError("Autenticazione richiesta.", 401);
  consumeConnectorRateLimit(`device:${credential.slice(0, 20)}`);
  return authenticateConnector(credential);
}

export async function connectorBody(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > maxBytes) throw new ConnectorError("Richiesta troppo grande.", 413);
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new ConnectorError("JSON non valido.");
  }
}

export function connectorResponse(error: unknown) {
  const status = error instanceof ConnectorError ? error.status : 500;
  return Response.json({ error: error instanceof ConnectorError ? error.message : "Errore connector." }, { status });
}
