import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { runPosNetworkDiagnostic, validateDiagnosticJob, validateDiagnosticResult, type DiagnosticResult } from "./pos-network-diagnostic";

type Transport = { networkDiagnostic(body: unknown): Promise<Record<string, unknown>> };

export class PosNetworkDiagnosticController {
  private running = false;
  constructor(private readonly client: Transport, private readonly configuredHost: string, private readonly spoolDirectory: string, private readonly run = runPosNetworkDiagnostic) {}

  async tick() {
    if (this.running) return;
    this.running = true;
    const directory = join(this.spoolDirectory, "pos-network-diagnostic-v1");
    const resultPath = join(directory, "result.json");
    const save = async (value: unknown) => {
      const file = await open(`${resultPath}.tmp`, "w", 0o600);
      try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
      await rename(`${resultPath}.tmp`, resultPath);
    };
    try {
      // A persisted result may be delivered again, but sockets are never reopened.
      let previous: { job: unknown; result: DiagnosticResult; reported: boolean } | undefined;
      try { previous = JSON.parse(await readFile(resultPath, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (previous) {
        if (!previous.reported) {
          const job = validateDiagnosticJob(previous.job), result = validateDiagnosticResult(previous.result);
          await this.client.networkDiagnostic({ operation: "complete", job, result });
          await save({ job, result, reported: true });
        }
        return;
      }
      const response = await this.client.networkDiagnostic({ operation: "claim" });
      if (!response.job) return;
      const job = validateDiagnosticJob(response.job);
      await mkdir(this.spoolDirectory, { recursive: true, mode: 0o700 });
      try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return; throw error; }
      // Permanent sentinel: interrupted runs require review, never automatic retry.
      const result = await this.run(job, this.configuredHost);
      await save({ job, result, reported: false });
      await this.client.networkDiagnostic({ operation: "complete", job, result });
      await save({ job, result, reported: true });
    } finally { this.running = false; }
  }
}
