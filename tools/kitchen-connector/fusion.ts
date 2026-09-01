import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { FusionDeliveryLedger, FusionXml1745PrinterAdapter, validateFusionConfig } from "./fusion-xml1745";
import { FusionCatalogReader, FusionCatalogSnapshotStore } from "./fusion-catalog";
import { catalogSyncRuntimeConfig, FusionCatalogSyncController } from "./catalog-sync-runtime";
import { JsonSpool, KitchenConnectorClient } from "./runtime";

const baseUrl=process.env.KITCHEN_CONNECTOR_URL??"http://localhost:3000",credential=process.env.KITCHEN_CONNECTOR_CREDENTIAL,configPath=process.env.FUSION_XML1745_CONFIG;
if(!credential||!configPath)throw new Error("KITCHEN_CONNECTOR_CREDENTIAL and FUSION_XML1745_CONFIG are required");
const spoolDirectory=resolve(process.env.KITCHEN_CONNECTOR_SPOOL??".kitchen-spool");
const config=validateFusionConfig(JSON.parse(await readFile(resolve(configPath),"utf8")));
const client=new KitchenConnectorClient(baseUrl,credential,new JsonSpool(spoolDirectory),new FusionXml1745PrinterAdapter(config,new FusionDeliveryLedger(resolve(spoolDirectory,"fusion-delivery-ledger.json"))));
const catalogConfig=catalogSyncRuntimeConfig(process.env),upperBoundPlu=Number(process.env.FUSION_CATALOG_MAX_PLU);
if(catalogConfig.enabled&&(!Number.isInteger(upperBoundPlu)||upperBoundPlu<1))throw new Error("FUSION_CATALOG_MAX_PLU è obbligatorio quando Catalog Sync è abilitato: il limite massimo non è provato dal protocollo.");
const catalog=new FusionCatalogSyncController(catalogConfig,new FusionCatalogReader({host:config.host,port:config.port,upperBoundPlu,connectTimeoutMs:config.connectTimeoutMs,readTimeoutMs:config.readTimeoutMs,writeTimeoutMs:config.writeTimeoutMs,maxFrameBytes:config.maxResponseBytes,maxItems:upperBoundPlu}),new FusionCatalogSnapshotStore(resolve(process.env.FUSION_CATALOG_SNAPSHOT??resolve(homedir(),".local/state/nexus-kitchen/catalog/fusion.json"))),client);
await client.recover();const heartbeat=await client.heartbeat() as {catalogSyncRequested?:boolean;requestVersion?:number};if(heartbeat.catalogSyncRequested)catalog.request(heartbeat.requestVersion??0);
if(process.argv[2]==="once"){await client.pollOnce();await catalog.tick(true);}else{await client.pollOnce();await catalog.tick(true).catch(error=>void client.heartbeat(String(error)));setInterval(()=>void client.pollOnce(),2_000);setInterval(()=>void client.heartbeat().then(response=>{const command=response as {catalogSyncRequested?:boolean;requestVersion?:number};if(command.catalogSyncRequested){catalog.request(command.requestVersion??0);void catalog.tick(true).catch(error=>void client.heartbeat(String(error)));}}),30_000);setInterval(()=>void catalog.tick().catch(error=>void client.heartbeat(String(error))),catalogConfig.intervalMs);}
