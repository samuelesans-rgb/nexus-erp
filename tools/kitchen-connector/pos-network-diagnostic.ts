import { Socket } from "node:net";

export const DIAGNOSTIC_TYPE = "POS_NETWORK_DIAGNOSTIC";
export const DIAGNOSTIC_PORTS = [22, 21, 23, 80, 443, 445, 139, 873, 1745] as const;
export const DIAGNOSTIC_HOST = "192.168.1.77";
export const DIAGNOSTIC_TIMEOUT_MS = 1500;
export type PortResult = { port: number; status: "OPEN" | "CLOSED" | "TIMEOUT" | "ERROR"; banner?: string };
export type DiagnosticJob = { type: typeof DIAGNOSTIC_TYPE; id: string };
export type DiagnosticResult = { host: string; ports: PortResult[] };

export function validateDiagnosticJob(value: unknown): DiagnosticJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid diagnostic job");
  const job = value as Record<string, unknown>;
  if (Object.keys(job).sort().join(",") !== "id,type" || job.type !== DIAGNOSTIC_TYPE || typeof job.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(job.id)) throw new Error("Invalid diagnostic job");
  return { type: DIAGNOSTIC_TYPE, id: job.id };
}

// No writes, TLS handshakes, protocol requests, credentials or redirects.
// The injectable socket factory is a local test seam, never part of the job/API.
export function probeDiagnosticPort(host: string, port: number, socketFactory = () => new Socket()): Promise<PortResult> {
  if (host !== DIAGNOSTIC_HOST || !DIAGNOSTIC_PORTS.includes(port as typeof DIAGNOSTIC_PORTS[number])) throw new Error("Diagnostic target denied");
  return new Promise((resolve) => {
    const socket = socketFactory();
    let connected = false, finished = false;
    const finish = (status: PortResult["status"], banner?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ port, status, ...(banner ? { banner } : {}) });
    };
    const timer = setTimeout(() => finish(connected ? "OPEN" : "TIMEOUT"), DIAGNOSTIC_TIMEOUT_MS);
    socket.once("connect", () => {
      connected = true;
      if (![22, 21, 23].includes(port)) finish("OPEN");
    });
    socket.once("data", (data: Buffer) => finish("OPEN", data.subarray(0, 512).toString("ascii").replace(/[^\x20-\x7e]/g, " ").trim()));
    socket.once("error", (error: NodeJS.ErrnoException) => finish(connected ? "OPEN" : error.code === "ECONNREFUSED" ? "CLOSED" : error.code === "ETIMEDOUT" ? "TIMEOUT" : "ERROR"));
    socket.once("close", () => finish(connected ? "OPEN" : "ERROR"));
    try { socket.connect(port, host); } catch { finish("ERROR"); }
  });
}

export async function runPosNetworkDiagnostic(job: unknown, configuredHost: string): Promise<DiagnosticResult> {
  validateDiagnosticJob(job);
  if (configuredHost !== DIAGNOSTIC_HOST) throw new Error("Configured POS denied");
  const ports: PortResult[] = [];
  for (const port of DIAGNOSTIC_PORTS) ports.push(await probeDiagnosticPort(configuredHost, port));
  return { host: configuredHost, ports };
}

export function validateDiagnosticResult(value: unknown): DiagnosticResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid diagnostic result");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join(",") !== "host,ports" || result.host !== DIAGNOSTIC_HOST || !Array.isArray(result.ports) || result.ports.length !== DIAGNOSTIC_PORTS.length) throw new Error("Invalid diagnostic result");
  const ports = result.ports.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid port result");
    const row = entry as Record<string, unknown>;
    if (Object.keys(row).some(key => !["port", "status", "banner"].includes(key)) || row.port !== DIAGNOSTIC_PORTS[index] || !["OPEN", "CLOSED", "TIMEOUT", "ERROR"].includes(String(row.status)) || (row.banner !== undefined && (typeof row.banner !== "string" || row.banner.length > 512 || /[^\x20-\x7e]/.test(row.banner) || row.status !== "OPEN" || ![22, 21, 23].includes(Number(row.port))))) throw new Error("Invalid port result");
    return { port: row.port, status: row.status, ...(row.banner ? { banner: row.banner } : {}) } as PortResult;
  });
  return { host: DIAGNOSTIC_HOST, ports };
}
