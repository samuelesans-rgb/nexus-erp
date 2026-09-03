import { createConnection } from "node:net";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClaimedJob, PrinterAdapter } from "./runtime";

export const FUSION_ACK = "<CE><ACK></ACK></CE>";
const FRAME_END = "</CE>";

export type FusionErrorCode =
  | "FUSION_NACK_1"
  | "FUSION_NACK_2"
  | "FUSION_TIMEOUT"
  | "FUSION_CONNECTION_ERROR"
  | "FUSION_PROTOCOL_ERROR"
  | "FUSION_UNCERTAIN_DELIVERY"
  | "FUSION_MAPPING_ERROR"
  | "FUSION_UNSUPPORTED";
export class FusionXml1745Error extends Error {
  constructor(
    readonly code: FusionErrorCode,
    message: string,
    readonly outcome: "PRE_SEND_FAILURE" | "NACK" | "UNCERTAIN_DELIVERY",
    readonly retryable = false,
  ) {
    super(`${code}: ${message}`);
    this.name = "FusionXml1745Error";
  }
}

export type FusionXml1745Config = {
  driver: "FUSION_XML_1745";
  host: string;
  port: number;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  writeTimeoutMs: number;
  maxResponseBytes: number;
  maxMul: number;
  tableMappings: Record<string, number>;
  productMappings: Record<string, number>;
};
export function validateFusionConfig(value: unknown): FusionXml1745Config {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FusionXml1745Error(
      "FUSION_MAPPING_ERROR",
      "Configurazione assente.",
      "PRE_SEND_FAILURE",
    );
  const input = value as Record<string, unknown>,
    host = String(input.host ?? "").trim();
  if (
    !host ||
    host.length > 253 ||
    host.includes("://") ||
    !/^([a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\d{1,3}(?:\.\d{1,3}){3})$/.test(
      host,
    )
  )
    throw new FusionXml1745Error(
      "FUSION_MAPPING_ERROR",
      "Host non valido: usare un IP o nome DNS puro.",
      "PRE_SEND_FAILURE",
    );
  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const raw = input[name] ?? fallback;
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < min ||
      raw > max
    )
      throw new FusionXml1745Error(
        "FUSION_MAPPING_ERROR",
        `${name} non valido.`,
        "PRE_SEND_FAILURE",
      );
    return raw;
  };
  const mappings = (name: string) => {
    const raw = input[name];
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new FusionXml1745Error(
        "FUSION_MAPPING_ERROR",
        `${name} non valido.`,
        "PRE_SEND_FAILURE",
      );
    const result: Record<string, number> = {};
    for (const [key, mapped] of Object.entries(raw)) {
      if (
        !key ||
        typeof mapped !== "number" ||
        !Number.isInteger(mapped) ||
        mapped <= 0
      )
        throw new FusionXml1745Error(
          "FUSION_MAPPING_ERROR",
          `${name}: mapping non valido.`,
          "PRE_SEND_FAILURE",
        );
      result[key] = mapped;
    }
    return result;
  };
  return {
    driver: "FUSION_XML_1745",
    host,
    port: integer("port", 1745, 1, 65535),
    connectTimeoutMs: integer("connectTimeoutMs", 3000, 1, 60000),
    readTimeoutMs: integer("readTimeoutMs", 7000, 1, 60000),
    writeTimeoutMs: integer("writeTimeoutMs", 3000, 1, 60000),
    maxResponseBytes: integer("maxResponseBytes", 4096, 64, 65536),
    maxMul: integer("maxMul", 1_000_000, 1, 2_147_483_647),
    tableMappings: mappings("tableMappings"),
    productMappings: mappings("productMappings"),
  };
}

export function quantityToMul(quantity: number, maxMul = 1_000_000) {
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new FusionXml1745Error(
      "FUSION_MAPPING_ERROR",
      "Quantità non valida.",
      "PRE_SEND_FAILURE",
    );
  const scaled = quantity * 1000,
    mul = Math.round(scaled);
  if (
    Math.abs(scaled - mul) > 1e-7 ||
    mul <= 0 ||
    mul > maxMul ||
    !Number.isSafeInteger(mul)
  )
    throw new FusionXml1745Error(
      "FUSION_MAPPING_ERROR",
      "Quantità non rappresentabile esattamente in millesimi.",
      "PRE_SEND_FAILURE",
    );
  return mul;
}
const positive = (name: string, value: number, max = 2_147_483_647) => {
  if (!Number.isInteger(value) || value <= 0 || value > max)
    throw new FusionXml1745Error(
      "FUSION_MAPPING_ERROR",
      `${name} non valido.`,
      "PRE_SEND_FAILURE",
    );
  return value;
};
export function buildFusionOrder(table: number, plu: number, mul: number) {
  return `<CE><ORDER><TABLE>${positive("TABLE", table, 199)}<PLU>${positive("PLU", plu)}<MUL>${positive("MUL", mul)}</MUL></PLU></TABLE></ORDER></CE>`;
}
export function parseFusionOrderResponse(frame: string) {
  if (frame === FUSION_ACK) return { kind: "ACK" as const };
  if (frame === "<CE><NACK>1</NACK></CE>")
    throw new FusionXml1745Error(
      "FUSION_NACK_1",
      "NACK1: struttura o input rifiutati.",
      "NACK",
    );
  if (frame === "<CE><NACK>2</NACK></CE>")
    throw new FusionXml1745Error(
      "FUSION_NACK_2",
      "NACK2: errore applicativo o tavolo.",
      "NACK",
    );
  throw new FusionXml1745Error(
    "FUSION_PROTOCOL_ERROR",
    "Risposta ORDER vuota, malformata o sconosciuta.",
    "UNCERTAIN_DELIVERY",
  );
}

export type FusionTransportResult = { outcome: "SEND_CONFIRMED_ACK" };
export async function sendFusionOrder(
  config: FusionXml1745Config,
  payload: string,
): Promise<FusionTransportResult> {
  return new Promise((resolve, reject) => {
    let written = false,
      settled = false,
      data = Buffer.alloc(0),
      readTimer: NodeJS.Timeout | undefined,
      writeTimer: NodeJS.Timeout | undefined;
    const socket = createConnection({ host: config.host, port: config.port });
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(readTimer);
      clearTimeout(writeTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve({ outcome: "SEND_CONFIRMED_ACK" });
    };
    const transportError = (message: string) =>
      new FusionXml1745Error(
        written ? "FUSION_UNCERTAIN_DELIVERY" : "FUSION_CONNECTION_ERROR",
        message,
        written ? "UNCERTAIN_DELIVERY" : "PRE_SEND_FAILURE",
        !written,
      );
    const connectTimer = setTimeout(
      () => finish(transportError("Connect timeout.")),
      config.connectTimeoutMs,
    );
    socket.once("connect", () => {
      clearTimeout(connectTimer);
      writeTimer = setTimeout(
        () => finish(transportError("Write timeout.")),
        config.writeTimeoutMs,
      );
      socket.write(Buffer.from(payload, "utf8"), (error) => {
        clearTimeout(writeTimer);
        if (error) return finish(transportError(error.message));
        written = true;
        readTimer = setTimeout(
          () =>
            finish(
              new FusionXml1745Error(
                "FUSION_UNCERTAIN_DELIVERY",
                "ACK non ricevuto entro il read timeout.",
                "UNCERTAIN_DELIVERY",
              ),
            ),
          config.readTimeoutMs,
        );
      });
    });
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length > config.maxResponseBytes)
        return finish(
          new FusionXml1745Error(
            "FUSION_PROTOCOL_ERROR",
            "Risposta oltre il limite.",
            "UNCERTAIN_DELIVERY",
          ),
        );
      const text = data.toString("utf8");
      const end = text.indexOf(FRAME_END);
      if (end < 0) return;
      if (end + FRAME_END.length !== text.length)
        return finish(
          new FusionXml1745Error(
            "FUSION_PROTOCOL_ERROR",
            "Frame multipli o byte inattesi.",
            "UNCERTAIN_DELIVERY",
          ),
        );
      try {
        parseFusionOrderResponse(text);
        finish();
      } catch (error) {
        finish(error);
      }
    });
    socket.once("error", (error) => finish(transportError(error.message)));
    socket.once("close", () => {
      if (!settled)
        finish(
          transportError("Connessione chiusa prima della risposta completa."),
        );
    });
  });
}

type LedgerLine = { state: "ACKED" | "UNCERTAIN"; updatedAt: string };
type Ledger = { jobs: Record<string, Record<string, LedgerLine>> };
export class FusionDeliveryLedger {
  constructor(readonly path: string) {}
  private async load(): Promise<Ledger> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Ledger;
    } catch {
      return { jobs: {} };
    }
  }
  private async save(value: Ledger) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.${process.pid}.tmp`,
      handle = await open(temp, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, this.path);
  }
  async state(jobId: string, lineId: string) {
    return (await this.load()).jobs[jobId]?.[lineId]?.state;
  }
  async mark(jobId: string, lineId: string, state: LedgerLine["state"]) {
    const ledger = await this.load();
    ledger.jobs[jobId] ??= {};
    ledger.jobs[jobId][lineId] = { state, updatedAt: new Date().toISOString() };
    await this.save(ledger);
  }
}

export class FusionXml1745PrinterAdapter implements PrinterAdapter {
  constructor(
    readonly config: FusionXml1745Config,
    private readonly ledger: FusionDeliveryLedger,
    private readonly audit: (
      event: Record<string, unknown>,
    ) => void = console.info,
  ) {}
  async print(job: ClaimedJob) {
    const order = job.fusionOrder;
    if (job.printType !== "KITCHEN_TICKET" || !order)
      throw new FusionXml1745Error(
        "FUSION_UNSUPPORTED",
        "Solo kitchen ticket strutturati sono supportati.",
        "PRE_SEND_FAILURE",
      );
    if (order.tableIds.length !== 1)
      throw new FusionXml1745Error(
        "FUSION_UNSUPPORTED",
        "V1 richiede esattamente un tavolo.",
        "PRE_SEND_FAILURE",
      );
    const table = this.config.tableMappings[order.tableIds[0]];
    if (!table)
      throw new FusionXml1745Error(
        "FUSION_MAPPING_ERROR",
        "Mapping tavolo FUSION mancante.",
        "PRE_SEND_FAILURE",
      );
    for (const line of order.lines) {
      if (line.hasModifiers || line.quantity <= 0)
        throw new FusionXml1745Error(
          "FUSION_UNSUPPORTED",
          "Modificatori e annulli non sono supportati in V1.",
          "PRE_SEND_FAILURE",
        );
      const prior = await this.ledger.state(job.jobId, line.lineId);
      if (prior === "ACKED" || prior === "UNCERTAIN") continue;
      const plu = line.plu ?? this.config.productMappings[line.itemId];
      if (!plu)
        throw new FusionXml1745Error(
          "FUSION_MAPPING_ERROR",
          `Mapping PLU mancante per ${line.itemId}.`,
          "PRE_SEND_FAILURE",
        );
      const mul = quantityToMul(line.quantity, this.config.maxMul),
        payload = buildFusionOrder(table, plu, mul);
      this.audit({
        jobId: job.jobId,
        adapter: "FUSION_XML_1745",
        host: this.config.host,
        port: this.config.port,
        tableId: table,
        pluId: plu,
        mul,
        attempt: job.attempts ?? 0,
        result: "SENDING",
      });
      try {
        await sendFusionOrder(this.config, payload);
        await this.ledger.mark(job.jobId, line.lineId, "ACKED");
        this.audit({
          jobId: job.jobId,
          lineId: line.lineId,
          adapter: "FUSION_XML_1745",
          result: "ACK",
        });
      } catch (error) {
        if (
          error instanceof FusionXml1745Error &&
          error.outcome === "UNCERTAIN_DELIVERY"
        )
          await this.ledger.mark(job.jobId, line.lineId, "UNCERTAIN");
        this.audit({
          jobId: job.jobId,
          lineId: line.lineId,
          adapter: "FUSION_XML_1745",
          result:
            error instanceof FusionXml1745Error
              ? error.code
              : "FUSION_CONNECTION_ERROR",
          uncertainDelivery:
            error instanceof FusionXml1745Error &&
            error.outcome === "UNCERTAIN_DELIVERY",
        });
        throw error;
      }
    }
  }
  async diagnostics() {
    return {
      status: (await this.healthCheck()) ? "READY" : "UNREACHABLE",
      adapter: "FUSION_XML_1745",
      target: `${this.config.host}:${this.config.port}`,
    };
  }
  async healthCheck() {
    return new Promise<boolean>((resolve) => {
      const socket = createConnection({
        host: this.config.host,
        port: this.config.port,
      });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, this.config.connectTimeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
}
