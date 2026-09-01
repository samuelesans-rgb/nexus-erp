import { createHash } from "node:crypto";
import type { KitchenConnectorClient } from "./runtime";
import { FusionCatalogReader, FusionCatalogSnapshotStore, reconcileCatalog } from "./fusion-catalog";

export type CatalogSyncRuntimeConfig={enabled:boolean;intervalMs:number;fullIntervalMs:number;maxBackoffMs:number};
export function catalogSyncRuntimeConfig(env:NodeJS.ProcessEnv):CatalogSyncRuntimeConfig{const integer=(name:string,fallback:number,min:number)=>{const value=Number(env[name]??fallback);if(!Number.isInteger(value)||value<min)throw new Error(`${name} non valido (minimo ${min}).`);return value;};return{enabled:(env.CATALOG_SYNC_ENABLED??"true").toLowerCase()!=="false",intervalMs:integer("CATALOG_SYNC_INTERVAL_MS",30_000,10_000),fullIntervalMs:integer("CATALOG_SYNC_FULL_INTERVAL_MS",900_000,60_000),maxBackoffMs:integer("CATALOG_SYNC_MAX_BACKOFF_MS",300_000,30_000)};}

export class FusionCatalogSyncController {
  private running=false;private failures=0;private lastAttempt=0;private lastFull=0;private requestVersion=0;
  constructor(private readonly config:CatalogSyncRuntimeConfig,private readonly reader:FusionCatalogReader,private readonly store:FusionCatalogSnapshotStore,private readonly client:KitchenConnectorClient){}
  request(version:number){if(Number.isInteger(version)&&version>this.requestVersion)this.requestVersion=version;}
  async tick(force=false){if(!this.config.enabled||this.running)return false;const now=Date.now(),backoff=Math.min(this.config.maxBackoffMs,this.config.intervalMs*2**this.failures);if(!force&&now-this.lastAttempt<backoff&&this.failures)return false;if(!force&&now-this.lastAttempt<this.config.intervalMs&&now-this.lastFull<this.config.fullIntervalMs)return false;
    this.running=true;this.lastAttempt=now;try{await this.client.syncCatalog({status:"SYNCING"});const previous=await this.store.load(),current=await this.reader.read(),diff=reconcileCatalog(previous,current),signature=createHash("sha256").update(JSON.stringify([this.requestVersion,current.map(item=>item.rawFingerprint),diff.missing])).digest("hex");await this.client.syncCatalog({idempotencyKey:`catalog:${signature}`,requestVersion:this.requestVersion,totalCount:current.length,unchangedCount:diff.unchanged,items:diff.changed.map(item=>({plu:item.plu,name:item.name,priceCents:item.priceCents,fingerprint:item.rawFingerprint})),missingPlus:diff.missing});for(const item of Object.values(diff.snapshot.items))if(item.syncState==="PENDING")item.syncState="SYNCED";await this.store.save(diff.snapshot);this.failures=0;this.lastFull=now;return true;}catch(error){this.failures=Math.min(this.failures+1,8);await this.client.syncCatalog({status:"ERROR",error:String(error)}).catch(()=>undefined);throw error;}finally{this.running=false;}}
}
