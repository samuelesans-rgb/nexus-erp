import { createHash, randomUUID } from "node:crypto";
import type { KitchenConnectorClient } from "./runtime";
import { isFatalConnectorError } from "./runtime";
import { FusionCatalogReader, FusionCatalogSnapshotStore, reconcileCatalog } from "./fusion-catalog";

export type CatalogSyncRuntimeConfig={enabled:boolean;intervalMs:number;fullIntervalMs:number;maxBackoffMs:number;watchdogMs?:number};
export function catalogSyncRuntimeConfig(env:NodeJS.ProcessEnv):CatalogSyncRuntimeConfig{const integer=(name:string,fallback:number,min:number)=>{const value=Number(env[name]??fallback);if(!Number.isInteger(value)||value<min)throw new Error(`${name} non valido (minimo ${min}).`);return value;};return{enabled:(env.CATALOG_SYNC_ENABLED??"true").toLowerCase()!=="false",intervalMs:integer("CATALOG_SYNC_INTERVAL_MS",30_000,10_000),fullIntervalMs:integer("CATALOG_SYNC_FULL_INTERVAL_MS",900_000,60_000),maxBackoffMs:integer("CATALOG_SYNC_MAX_BACKOFF_MS",300_000,30_000),watchdogMs:integer("CATALOG_SYNC_WATCHDOG_MS",300_000,10_000)};}

export class FusionCatalogSyncController {
  private running=false;private failures=0;private lastAttempt=0;private lastFull=0;private requestVersion=0;
  constructor(private readonly config:CatalogSyncRuntimeConfig,private readonly reader:FusionCatalogReader,private readonly store:FusionCatalogSnapshotStore,private readonly client:KitchenConnectorClient){}
  request(version:number){if(Number.isInteger(version)&&version>this.requestVersion)this.requestVersion=version;}
  async tick(force=false){if(!this.config.enabled||this.running)return false;const now=Date.now(),backoff=Math.min(this.config.maxBackoffMs,this.config.intervalMs*2**this.failures);if(!force&&now-this.lastAttempt<backoff&&this.failures)return false;if(!force&&now-this.lastAttempt<this.config.intervalMs&&now-this.lastFull<this.config.fullIntervalMs)return false;
    this.running=true;this.lastAttempt=now;const runId=randomUUID(),watchdogMs=this.config.watchdogMs??300_000,watchdog=new AbortController(),timer=setTimeout(()=>watchdog.abort(new Error("CATALOG_SYNC_WATCHDOG_TIMEOUT")),watchdogMs);let runAccepted=false,completed=false,failure:unknown;
    try{await this.client.syncCatalog({status:"SYNCING",runId,watchdogMs},watchdog.signal);runAccepted=true;const previous=await this.store.load(),current=await this.reader.read(watchdog.signal),diff=reconcileCatalog(previous,current.items,new Date().toISOString(),current.emptySlots),signature=createHash("sha256").update(JSON.stringify([this.requestVersion,current.items.map(item=>item.rawFingerprint),current.emptySlots.map(slot=>slot.rawFingerprint),diff.missing])).digest("hex");await this.client.syncCatalog({runId,idempotencyKey:`catalog:${runId}`,catalogFingerprint:signature,requestVersion:this.requestVersion,totalCount:current.items.length+current.emptySlots.length,unchangedCount:diff.unchanged,placeholdersSkipped:diff.placeholdersSkipped,emptySlotsSkipped:diff.emptySlotsSkipped,items:diff.changed.map(item=>({plu:item.plu,name:item.name,priceCents:item.priceCents,fingerprint:item.rawFingerprint})),missingPlus:diff.missing},watchdog.signal);for(const item of Object.values(diff.snapshot.items))if(item.syncState==="PENDING")item.syncState="SYNCED";await this.store.save(diff.snapshot);this.failures=0;this.lastFull=Date.now();completed=true;return true;}catch(error){failure=error;this.failures=Math.min(this.failures+1,8);throw error;}finally{clearTimeout(timer);if(runAccepted&&!completed)await this.client.syncCatalog({status:"ERROR",runId,error:String(failure??"Catalog sync interrotto")}).catch(error=>console.error("[catalog-sync] Impossibile persistere ERROR",error));this.running=false;}}
}

type FusionRuntimeClient={pollOnce():Promise<unknown>;heartbeat(lastError?:string):Promise<unknown>};
type FusionRuntimeCatalog={request(version:number):void;tick(force?:boolean):Promise<boolean>};
/**
 * Quanti rifiuti per credenziale servono, senza un heartbeat riuscito in mezzo,
 * prima di considerare il connector escluso.
 *
 * Col battito ogni 30 secondi sono circa 90 secondi di rifiuto ostinato. Tre
 * bastano perche' il 401 nasce da una ricerca per hash della credenziale, che
 * o corrisponde o no; uno solo sarebbe gia' prova forte, ma uccidere il
 * connector in piena serata per un intoppo isolato sarebbe peggio del male.
 * Il conteggio si azzera solo su un heartbeat riuscito: un errore passeggero
 * fra due rifiuti non incrementa e non azzera, altrimenti un timeout ben
 * piazzato terrebbe il contatore a zero per sempre.
 */
export const FATAL_HEARTBEAT_LIMIT=3;

export function startFusionRuntime(client:FusionRuntimeClient,catalog:FusionRuntimeCatalog,options:{pollMs?:number;heartbeatMs?:number;catalogMs:number;onError?:(error:unknown)=>void;onFatal?:(error:unknown)=>void;fatalLimit?:number}){
  const onError=options.onError??(error=>console.error("[kitchen-connector]",error));let polling=false,heartbeating=false,fatalCount=0;
  const fatalLimit=options.fatalLimit??FATAL_HEARTBEAT_LIMIT;
  const poll=async()=>{if(polling)return;polling=true;try{await client.pollOnce();}catch(error){onError(error);}finally{polling=false;}};
  const heartbeat=async()=>{if(heartbeating)return;heartbeating=true;try{const command=await client.heartbeat() as {catalogSyncRequested?:boolean;requestVersion?:number};fatalCount=0;if(command.catalogSyncRequested){catalog.request(command.requestVersion??0);void catalog.tick(true).catch(onError);}}catch(error){onError(error);if(isFatalConnectorError(error)){fatalCount+=1;if(fatalCount>=fatalLimit)options.onFatal?.(error);}}finally{heartbeating=false;}};
  const sync=()=>void catalog.tick().catch(onError);
  const timers=[setInterval(()=>void poll(),options.pollMs??2_000),setInterval(()=>void heartbeat(),options.heartbeatMs??30_000),setInterval(sync,options.catalogMs)];
  void poll();void catalog.tick(true).catch(onError);
  return()=>{for(const timer of timers)clearInterval(timer);};
}
