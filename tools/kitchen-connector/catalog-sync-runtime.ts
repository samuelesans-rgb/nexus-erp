import { createHash } from "node:crypto";
import type { KitchenConnectorClient } from "./runtime";
import { FusionCatalogReader, FusionCatalogSnapshotStore, reconcileCatalog } from "./fusion-catalog";

export type CatalogSyncRuntimeConfig={enabled:boolean;intervalMs:number;fullIntervalMs:number;maxBackoffMs:number;watchdogMs?:number};
export function catalogSyncRuntimeConfig(env:NodeJS.ProcessEnv):CatalogSyncRuntimeConfig{const integer=(name:string,fallback:number,min:number)=>{const value=Number(env[name]??fallback);if(!Number.isInteger(value)||value<min)throw new Error(`${name} non valido (minimo ${min}).`);return value;};return{enabled:(env.CATALOG_SYNC_ENABLED??"true").toLowerCase()!=="false",intervalMs:integer("CATALOG_SYNC_INTERVAL_MS",30_000,10_000),fullIntervalMs:integer("CATALOG_SYNC_FULL_INTERVAL_MS",900_000,60_000),maxBackoffMs:integer("CATALOG_SYNC_MAX_BACKOFF_MS",300_000,30_000),watchdogMs:integer("CATALOG_SYNC_WATCHDOG_MS",300_000,10_000)};}

export class FusionCatalogSyncController {
  private running=false;private failures=0;private lastAttempt=0;private lastFull=0;private requestVersion=0;
  constructor(private readonly config:CatalogSyncRuntimeConfig,private readonly reader:FusionCatalogReader,private readonly store:FusionCatalogSnapshotStore,private readonly client:KitchenConnectorClient){}
  request(version:number){if(Number.isInteger(version)&&version>this.requestVersion)this.requestVersion=version;}
  async tick(force=false){if(!this.config.enabled||this.running)return false;const now=Date.now(),backoff=Math.min(this.config.maxBackoffMs,this.config.intervalMs*2**this.failures);if(!force&&now-this.lastAttempt<backoff&&this.failures)return false;if(!force&&now-this.lastAttempt<this.config.intervalMs&&now-this.lastFull<this.config.fullIntervalMs)return false;
    this.running=true;this.lastAttempt=now;const watchdog=new AbortController(),timer=setTimeout(()=>watchdog.abort(new Error("CATALOG_SYNC_WATCHDOG_TIMEOUT")),this.config.watchdogMs??300_000);let completed=false,failure:unknown;
    try{await this.client.syncCatalog({status:"SYNCING"},watchdog.signal);const previous=await this.store.load(),current=await this.reader.read(watchdog.signal),diff=reconcileCatalog(previous,current),signature=createHash("sha256").update(JSON.stringify([this.requestVersion,current.map(item=>item.rawFingerprint),diff.missing])).digest("hex");await this.client.syncCatalog({idempotencyKey:`catalog:${signature}`,requestVersion:this.requestVersion,totalCount:current.length,unchangedCount:diff.unchanged,placeholdersSkipped:diff.placeholdersSkipped,items:diff.changed.map(item=>({plu:item.plu,name:item.name,priceCents:item.priceCents,fingerprint:item.rawFingerprint})),missingPlus:diff.missing},watchdog.signal);for(const item of Object.values(diff.snapshot.items))if(item.syncState==="PENDING")item.syncState="SYNCED";await this.store.save(diff.snapshot);this.failures=0;this.lastFull=Date.now();completed=true;return true;}catch(error){failure=error;this.failures=Math.min(this.failures+1,8);throw error;}finally{clearTimeout(timer);if(!completed)await this.client.syncCatalog({status:"ERROR",error:String(failure??"Catalog sync interrotto")}).catch(error=>console.error("[catalog-sync] Impossibile persistere ERROR",error));this.running=false;}}
}

type FusionRuntimeClient={pollOnce():Promise<unknown>;heartbeat(lastError?:string):Promise<unknown>};
type FusionRuntimeCatalog={request(version:number):void;tick(force?:boolean):Promise<boolean>};
export function startFusionRuntime(client:FusionRuntimeClient,catalog:FusionRuntimeCatalog,options:{pollMs?:number;heartbeatMs?:number;catalogMs:number;onError?:(error:unknown)=>void}){
  const onError=options.onError??(error=>console.error("[kitchen-connector]",error));let polling=false,heartbeating=false;
  const poll=async()=>{if(polling)return;polling=true;try{await client.pollOnce();}catch(error){onError(error);}finally{polling=false;}};
  const heartbeat=async()=>{if(heartbeating)return;heartbeating=true;try{const command=await client.heartbeat() as {catalogSyncRequested?:boolean;requestVersion?:number};if(command.catalogSyncRequested){catalog.request(command.requestVersion??0);void catalog.tick(true).catch(onError);}}catch(error){onError(error);}finally{heartbeating=false;}};
  const sync=()=>void catalog.tick().catch(onError);
  const timers=[setInterval(()=>void poll(),options.pollMs??2_000),setInterval(()=>void heartbeat(),options.heartbeatMs??30_000),setInterval(sync,options.catalogMs)];
  void poll();void catalog.tick(true).catch(onError);
  return()=>{for(const timer of timers)clearInterval(timer);};
}
