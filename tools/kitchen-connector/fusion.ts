import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FusionDeliveryLedger, FusionXml1745PrinterAdapter, validateFusionConfig } from "./fusion-xml1745";
import { JsonSpool, KitchenConnectorClient } from "./runtime";

const baseUrl=process.env.KITCHEN_CONNECTOR_URL??"http://localhost:3000",credential=process.env.KITCHEN_CONNECTOR_CREDENTIAL,configPath=process.env.FUSION_XML1745_CONFIG;
if(!credential||!configPath)throw new Error("KITCHEN_CONNECTOR_CREDENTIAL and FUSION_XML1745_CONFIG are required");
const spoolDirectory=resolve(process.env.KITCHEN_CONNECTOR_SPOOL??".kitchen-spool");
const config=validateFusionConfig(JSON.parse(await readFile(resolve(configPath),"utf8")));
const client=new KitchenConnectorClient(baseUrl,credential,new JsonSpool(spoolDirectory),new FusionXml1745PrinterAdapter(config,new FusionDeliveryLedger(resolve(spoolDirectory,"fusion-delivery-ledger.json"))));
await client.recover();await client.heartbeat();
if(process.argv[2]==="once")await client.pollOnce();else{await client.pollOnce();setInterval(()=>void client.pollOnce(),2_000);setInterval(()=>void client.heartbeat(),30_000);}
