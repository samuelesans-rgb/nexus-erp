import { resolve } from "node:path";
import { JsonSpool, KitchenConnectorClient, pair, SimulatorPrinterAdapter } from "./runtime";

const baseUrl = process.env.KITCHEN_CONNECTOR_URL ?? "http://localhost:3000";
const command = process.argv[2] ?? "run";

if (command === "pair") {
  const pairingToken = process.argv[3];
  if (!pairingToken) throw new Error("Usage: simulator.ts pair <pairing-token> [name]");
  console.log(JSON.stringify(await pair(baseUrl, pairingToken, process.argv[4] ?? "Kitchen simulator"), null, 2));
} else {
  const credential = process.env.KITCHEN_CONNECTOR_CREDENTIAL;
  if (!credential) throw new Error("KITCHEN_CONNECTOR_CREDENTIAL is required");
  const client = new KitchenConnectorClient(baseUrl, credential, new JsonSpool(resolve(process.env.KITCHEN_CONNECTOR_SPOOL ?? ".kitchen-spool")), new SimulatorPrinterAdapter(console.log));
  await client.recover();
  await client.heartbeat();
  if (command === "once") await client.pollOnce();
  else {
    await client.pollOnce();
    setInterval(() => void client.pollOnce(), 2_000);
    setInterval(() => void client.heartbeat(), 30_000);
  }
}
