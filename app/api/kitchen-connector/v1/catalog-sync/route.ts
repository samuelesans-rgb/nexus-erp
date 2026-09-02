import { failFusionCatalogSync, startFusionCatalogSync, syncFusionCatalog, type CatalogSyncItemInput } from "@/lib/fusion-catalog-sync";
import { connectorBody, connectorFromRequest, connectorResponse } from "@/lib/kitchen-connector-http";

export async function POST(request:Request){try{
  const[device,body]=await Promise.all([connectorFromRequest(request),connectorBody(request,262_144)]);
  const runId=typeof body.runId==="string"?body.runId:undefined;
  if(body.status==="SYNCING")return Response.json({ok:true,...await startFusionCatalogSync(device,runId,Number(body.watchdogMs??300_000))});
  if(body.status==="ERROR"){await failFusionCatalogSync(device,runId,typeof body.error==="string"?body.error:"Catalog sync error");return Response.json({ok:true});}
  const rawItems=Array.isArray(body.items)?body.items:[],rawMissing=Array.isArray(body.missingPlus)?body.missingPlus:[];
  const items:CatalogSyncItemInput[]=rawItems.map(value=>{const item=value as Record<string,unknown>;return{plu:Number(item.plu),name:typeof item.name==="string"?item.name.trim():"",priceCents:item.priceCents===null?null:Number(item.priceCents),fingerprint:typeof item.fingerprint==="string"?item.fingerprint:""};});
  const result=await syncFusionCatalog(device,{runId,idempotencyKey:typeof body.idempotencyKey==="string"?body.idempotencyKey:"",requestVersion:Number(body.requestVersion??0),totalCount:Number(body.totalCount),unchangedCount:Number(body.unchangedCount),placeholdersSkipped:Number(body.placeholdersSkipped??0),emptySlotsSkipped:Number(body.emptySlotsSkipped??0),items,missingPlus:rawMissing.map(Number)});
  return Response.json({ok:true,...result});
}catch(error){return connectorResponse(error);}}
