import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname } from "node:path";

export const FUSION_CATALOG_ACK = "<CE><ACK></ACK></CE>";
const FRAME_END = "</CE>";

export type FusionCatalogItem = { plu:number;name:string;priceCents:number|null;rawFingerprint:string };
export type CatalogSnapshotItem = FusionCatalogItem & { lastSeenAt:string;lastChangedAt:string;syncState:"SYNCED"|"PENDING"|"MISSING_FROM_FUSION"|"PLACEHOLDER_SKIPPED" };
export type CatalogSnapshot = { version:1;completedAt:string;items:Record<string,CatalogSnapshotItem> };
export type FusionCatalogReaderConfig = { host:string;port:number;upperBoundPlu:number;connectTimeoutMs:number;readTimeoutMs:number;writeTimeoutMs:number;maxFrameBytes:number;maxItems:number };

export class FusionCatalogError extends Error {
  constructor(readonly code:"INVALID_CONFIG"|"CONNECTION"|"TIMEOUT"|"PROTOCOL"|"LIMIT",message:string){super(`${code}: ${message}`);this.name="FusionCatalogError";}
}

export function normalizeFusionName(value:string){return value.replace(/\s+/g," ").trim();}
export function isFusionCatalogPlaceholder(value:{plu:number;name:string}){return value.name===`PLU${value.plu}`;}
export function catalogFingerprint(value:{plu:number;name:string;priceCents:number|null}){
  return createHash("sha256").update(JSON.stringify([value.plu,normalizeFusionName(value.name),value.priceCents])).digest("hex");
}
export function buildFusionDataRequest(upperBoundPlu:number){
  if(!Number.isInteger(upperBoundPlu)||upperBoundPlu<1||upperBoundPlu>2_147_483_647)throw new FusionCatalogError("INVALID_CONFIG","Upper bound PLU non valido.");
  return `<CE><DATA_REQ><PLU>${upperBoundPlu}</PLU></DATA_REQ></CE>`;
}
function textTag(frame:string,tag:string){const match=frame.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));return match?.[1];}
export function parseFusionCatalogFrame(frame:string):{kind:"ITEM";item:FusionCatalogItem}|{kind:"END"}{
  if(frame==="<CE><DB_END/></CE>"||frame==="<CE><DB_END></DB_END></CE>")return{kind:"END"};
  if(!frame.startsWith("<CE><DATA_SEND>")||!frame.endsWith("</DATA_SEND></CE>"))throw new FusionCatalogError("PROTOCOL","Frame DATA_SEND/DB_END non riconosciuto.");
  const rawPlu=frame.match(/<PLU>(\d+)(?:<|$)/)?.[1],rawName=textTag(frame,"DESC"),rawPrice=textTag(frame,"PRICE");
  const plu=Number(rawPlu),priceCents=rawPrice===undefined?null:Number(rawPrice);
  if(!Number.isSafeInteger(plu)||plu<=0||rawName===undefined||!normalizeFusionName(rawName)||rawPrice!==undefined&&(priceCents===null||!Number.isSafeInteger(priceCents)||priceCents<0))throw new FusionCatalogError("PROTOCOL","DATA_SEND contiene campi non validi.");
  const item={plu,name:normalizeFusionName(rawName),priceCents};
  return{kind:"ITEM",item:{...item,rawFingerprint:catalogFingerprint(item)}};
}

export class FusionCatalogReader {
  constructor(private readonly config:FusionCatalogReaderConfig){}
  read(signal?:AbortSignal):Promise<FusionCatalogItem[]>{return new Promise((resolve,reject)=>{
    const c=this.config;if(!c.host||c.port<1||c.port>65535||c.maxFrameBytes<64||c.maxItems<1)return reject(new FusionCatalogError("INVALID_CONFIG","Configurazione reader non valida."));
    const socket=createConnection({host:c.host,port:c.port});let buffer="",bytes=0,settled=false,connected=false,timer:NodeJS.Timeout;
    const onAbort=()=>finish(signal?.reason instanceof Error?signal.reason:new FusionCatalogError("TIMEOUT","Catalog sync watchdog scaduto."));
    const finish=(error?:Error,items?:FusionCatalogItem[])=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener("abort",onAbort);socket.destroy();if(error)reject(error);else resolve(items??[]);};
    const arm=(ms:number)=>{clearTimeout(timer);timer=setTimeout(()=>finish(new FusionCatalogError("TIMEOUT","Timeout durante DATA_REQ.")),ms);};
    const items=new Map<number,FusionCatalogItem>();
    if(signal?.aborted)return onAbort();signal?.addEventListener("abort",onAbort,{once:true});
    socket.once("error",()=>finish(new FusionCatalogError("CONNECTION",connected?"Connessione interrotta.":"Connessione non riuscita.")));
    socket.once("connect",()=>{connected=true;arm(c.writeTimeoutMs);socket.write(buildFusionDataRequest(c.upperBoundPlu),error=>{if(error)finish(new FusionCatalogError("CONNECTION","Invio DATA_REQ fallito."));else arm(c.readTimeoutMs);});});
    socket.on("data",chunk=>{bytes+=chunk.length;if(bytes>c.maxFrameBytes*c.maxItems)return finish(new FusionCatalogError("LIMIT","Risposta catalogo troppo grande."));buffer+=chunk.toString("utf8");
      for(let end;(end=buffer.indexOf(FRAME_END))>=0;){const frame=buffer.slice(0,end+FRAME_END.length);buffer=buffer.slice(end+FRAME_END.length);let parsed;try{parsed=parseFusionCatalogFrame(frame);}catch(error){return finish(error as Error);}arm(c.readTimeoutMs);if(parsed.kind==="END"){socket.write(FUSION_CATALOG_ACK,error=>error?finish(new FusionCatalogError("CONNECTION","ACK DB_END fallito.")):finish(undefined,[...items.values()].sort((a,b)=>a.plu-b.plu)));return;}socket.write(FUSION_CATALOG_ACK);if(parsed.item.plu>c.upperBoundPlu)return finish(new FusionCatalogError("PROTOCOL","PLU oltre upper bound."));const old=items.get(parsed.item.plu);if(old&&old.rawFingerprint!==parsed.item.rawFingerprint)return finish(new FusionCatalogError("PROTOCOL","DATA_SEND duplicato conflittuale."));items.set(parsed.item.plu,parsed.item);if(items.size>c.maxItems)return finish(new FusionCatalogError("LIMIT","Troppi PLU."));}
    });
    arm(c.connectTimeoutMs);
  });}
}

export class FusionCatalogSnapshotStore {
  constructor(readonly path:string){}
  async load():Promise<CatalogSnapshot>{try{const value=JSON.parse(await readFile(this.path,"utf8")) as CatalogSnapshot;if(value.version!==1||!value.items)throw new Error();return value;}catch{return{version:1,completedAt:new Date(0).toISOString(),items:{}};}}
  async save(snapshot:CatalogSnapshot){await mkdir(dirname(this.path),{recursive:true,mode:0o700});const temporary=`${this.path}.${process.pid}.${Date.now()}.tmp`,handle=await open(temporary,"wx",0o600);try{await handle.writeFile(JSON.stringify(snapshot,null,2));await handle.sync();}finally{await handle.close();}await rename(temporary,this.path);const directory=await open(dirname(this.path),"r");try{await directory.sync();}finally{await directory.close();}}
}

export function reconcileCatalog(previous:CatalogSnapshot,current:FusionCatalogItem[],at=new Date().toISOString()){
  const items={...previous.items},changed:FusionCatalogItem[]=[];let unchanged=0,placeholdersSkipped=0;
  const seen=new Set<string>();for(const item of current){const key=String(item.plu),old=items[key];seen.add(key);if(isFusionCatalogPlaceholder(item)){placeholdersSkipped++;items[key]={...item,lastSeenAt:at,lastChangedAt:old?.rawFingerprint===item.rawFingerprint?old.lastChangedAt:at,syncState:"PLACEHOLDER_SKIPPED"};continue;}if(!old||old.rawFingerprint!==item.rawFingerprint||old.syncState==="PLACEHOLDER_SKIPPED"){changed.push(item);items[key]={...item,lastSeenAt:at,lastChangedAt:at,syncState:"PENDING"};}else{unchanged++;items[key]={...old,lastSeenAt:at,syncState:"SYNCED"};}}
  const missing:number[]=[];for(const [key,item] of Object.entries(items)){if(!seen.has(key)&&item.syncState!=="MISSING_FROM_FUSION"){missing.push(item.plu);items[key]={...item,syncState:"MISSING_FROM_FUSION"};}}
  return{snapshot:{version:1 as const,completedAt:at,items},changed,missing,unchanged,placeholdersSkipped};
}
