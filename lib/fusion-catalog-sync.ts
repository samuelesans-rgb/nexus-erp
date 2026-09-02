import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { ConnectorError } from "@/lib/kitchen-connector";
import { prisma } from "@/lib/prisma";

export type CatalogSyncItemInput={plu:number;name:string;priceCents:number|null;fingerprint:string};
export type CatalogSyncInput={runId?:string;idempotencyKey:string;requestVersion:number;totalCount:number;unchangedCount:number;placeholdersSkipped?:number;items:CatalogSyncItemInput[];missingPlus:number[]};
const isPlaceholder=(item:{plu:number;name:string})=>item.name===`PLU${item.plu}`;
const validItem=(item:CatalogSyncItemInput)=>Number.isInteger(item.plu)&&item.plu>0&&item.plu<=2_147_483_647&&item.name.length>0&&item.name.length<=200&&(item.priceCents===null||Number.isSafeInteger(item.priceCents)&&item.priceCents>=0)&&/^[a-f0-9]{64}$/.test(item.fingerprint);
const validRunId=(value:string)=>/^[A-Za-z0-9._:-]{8,120}$/.test(value);
const runCommand="FUSION_CATALOG_RUN";
type Device={id:string;companyId:string;locationId:string};
type SyncResult={created:number;updated:number;unchanged:number;missing:number;placeholdersSkipped:number};

async function activeRun(tx:Prisma.TransactionClient,device:Device,runId?:string){
  if(runId){const run=await tx.idempotencyRecord.findUnique({where:{companyId_commandType_idempotencyKey:{companyId:device.companyId,commandType:runCommand,idempotencyKey:runId}}});return run?.aggregateType==="KitchenConnectorDevice"&&run.aggregateId===device.id?run:null;}
  return tx.idempotencyRecord.findFirst({where:{companyId:device.companyId,commandType:runCommand,aggregateType:"KitchenConnectorDevice",aggregateId:device.id,status:"PROCESSING"},orderBy:{startedAt:"desc"}});
}

export async function startFusionCatalogSync(device:Device,requestedRunId?:string,requestedWatchdogMs=300_000){
  const runId=requestedRunId??`legacy:${randomUUID()}`,watchdogMs=Number.isInteger(requestedWatchdogMs)&&requestedWatchdogMs>=10_000&&requestedWatchdogMs<=900_000?requestedWatchdogMs:300_000;
  if(!validRunId(runId))throw new ConnectorError("Run Catalog Sync non valido.",400);
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${device.companyId}:${device.locationId}:fusion-catalog-run`}))`;
    const existing=await activeRun(tx,device,runId);if(existing?.status==="PROCESSING")return{runId};if(existing)throw new ConnectorError("Run Catalog Sync già concluso.",409);
    const concurrent=await activeRun(tx,device),state=await tx.fusionCatalogSyncState.findUnique({where:{connectorId:device.id}}),now=new Date();
    if(concurrent){const metadata=(concurrent.result??{}) as {watchdogMs?:number},staleAt=concurrent.startedAt.getTime()+(metadata.watchdogMs??300_000)+15_000;if(now.getTime()<staleAt)throw new ConnectorError("Catalog Sync già in esecuzione.",409);await tx.idempotencyRecord.update({where:{id:concurrent.id},data:{status:"FAILED",error:{message:"STALE_CATALOG_SYNC_REPLACED"},completedAt:now}});await writeAuditLogTx(tx,{companyId:device.companyId,locationId:device.locationId,action:"FUSION_CATALOG_SYNC_FAILED",entityType:"KitchenConnectorDevice",entityId:device.id,metadata:{runId:concurrent.id,error:"STALE_CATALOG_SYNC_REPLACED"}});}
    else if(state?.status==="SYNCING"&&state.syncStartedAt){const staleAt=state.syncStartedAt.getTime()+watchdogMs+15_000;if(now.getTime()<staleAt)throw new ConnectorError("Catalog Sync precedente ancora in esecuzione.",409);await writeAuditLogTx(tx,{companyId:device.companyId,locationId:device.locationId,action:"FUSION_CATALOG_SYNC_FAILED",entityType:"KitchenConnectorDevice",entityId:device.id,metadata:{error:"LEGACY_STALE_CATALOG_SYNC_REPLACED"}});}
    await tx.idempotencyRecord.create({data:{companyId:device.companyId,commandType:runCommand,idempotencyKey:runId,aggregateType:"KitchenConnectorDevice",aggregateId:device.id,result:{watchdogMs}}});
    await tx.fusionCatalogSyncState.upsert({where:{connectorId:device.id},create:{companyId:device.companyId,locationId:device.locationId,connectorId:device.id,status:"SYNCING",syncStartedAt:now},update:{status:"SYNCING",syncStartedAt:now,lastError:null}});
    return{runId};
  },{isolationLevel:"Serializable"});
}

export async function failFusionCatalogSync(device:Device,runId:string|undefined,error:string){
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${device.companyId}:${device.locationId}:fusion-catalog-run`}))`;
    const run=await activeRun(tx,device,runId);if(!run)throw new ConnectorError("Run Catalog Sync non trovato.",409);if(run.status==="FAILED")return;if(run.status==="SUCCEEDED")throw new ConnectorError("Run Catalog Sync già completato.",409);
    const safeError=error.slice(0,500),now=new Date();await tx.idempotencyRecord.update({where:{id:run.id},data:{status:"FAILED",error:{message:safeError},completedAt:now}});await tx.fusionCatalogSyncState.update({where:{connectorId:device.id},data:{status:"ERROR",syncStartedAt:null,lastError:safeError,errorCount:{increment:1}}});await writeAuditLogTx(tx,{companyId:device.companyId,locationId:device.locationId,action:"FUSION_CATALOG_SYNC_FAILED",entityType:"KitchenConnectorDevice",entityId:device.id,metadata:{runId:run.id,error:safeError}});
  },{isolationLevel:"Serializable"});
}

export async function syncFusionCatalog(device:Device,input:CatalogSyncInput){
  const itemPlus=input.items.map(item=>item.plu),uniquePlus=new Set(itemPlus);
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(input.idempotencyKey)||!Number.isInteger(input.requestVersion)||input.requestVersion<0||!Number.isInteger(input.totalCount)||input.totalCount<0||!Number.isInteger(input.unchangedCount)||input.unchangedCount<0||!Number.isInteger(input.placeholdersSkipped??0)||(input.placeholdersSkipped??0)<0||input.items.length>500||input.missingPlus.length>10_000||input.items.some(item=>!validItem(item))||input.missingPlus.some(plu=>!Number.isInteger(plu)||plu<=0)||uniquePlus.size!==itemPlus.length)throw new ConnectorError("Payload catalogo non valido.",400);
  const importableItems=input.items.filter(item=>!isPlaceholder(item)),placeholdersSkipped=(input.placeholdersSkipped??0)+(input.items.length-importableItems.length);
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${device.companyId}:${device.locationId}:fusion-catalog-run`}))`;
    const run=await activeRun(tx,device,input.runId);if(!run)throw new ConnectorError("Run Catalog Sync non trovato.",409);if(run.status==="SUCCEEDED")return run.result as SyncResult;if(run.status!=="PROCESSING")throw new ConnectorError("Run Catalog Sync già fallito.",409);
    const previous=await tx.idempotencyRecord.findUnique({where:{companyId_commandType_idempotencyKey:{companyId:device.companyId,commandType:"FUSION_CATALOG_SYNC",idempotencyKey:input.idempotencyKey}}});
    if(previous&&previous.status!=="SUCCEEDED")throw new ConnectorError("Sync già in elaborazione o fallita.",409);
    const replayed=previous?.status==="SUCCEEDED",idempotency=replayed?null:await tx.idempotencyRecord.create({data:{companyId:device.companyId,commandType:"FUSION_CATALOG_SYNC",idempotencyKey:input.idempotencyKey}});
    const uom=await tx.unitOfMeasure.findFirst({where:{companyId:device.companyId,code:"PZ",active:true,deletedAt:null},select:{id:true}});
    if(!replayed&&!uom&&importableItems.length)throw new ConnectorError("Unità di misura PZ non configurata.",422);
    let created=0,updated=0;
    for(const incoming of replayed?[]:importableItems){
      const mapping=await tx.fusionCatalogMapping.findUnique({where:{companyId_locationId_plu:{companyId:device.companyId,locationId:device.locationId,plu:incoming.plu}}});
      const salePrice=incoming.priceCents===null?null:(incoming.priceCents/100).toFixed(2);
      if(mapping){
        const item=await tx.item.findFirst({where:{id:mapping.itemId,companyId:device.companyId,deletedAt:null},select:{id:true}});if(!item)throw new ConnectorError(`Mapping PLU ${incoming.plu} non valido.`,409);
        await tx.item.update({where:{id:item.id},data:{name:incoming.name,salePrice}});
        await tx.fusionCatalogMapping.update({where:{id:mapping.id},data:{synchronizedName:incoming.name,priceCents:incoming.priceCents,fingerprint:incoming.fingerprint,missingFromFusion:false,lastSeenAt:new Date(),lastChangedAt:new Date()}});updated++;
      }else{
        const code=`FUSION_${incoming.plu}`;if(await tx.item.findFirst({where:{companyId:device.companyId,code}}))throw new ConnectorError(`Codice ${code} già esistente senza mapping.`,409);
        const item=await tx.item.create({data:{companyId:device.companyId,code,type:"PRODUCT",status:"ACTIVE",name:incoming.name,unitOfMeasureId:uom!.id,salePrice,currency:"EUR",sellable:true,purchasable:false,stockManaged:false}});
        await tx.fusionCatalogMapping.create({data:{companyId:device.companyId,locationId:device.locationId,itemId:item.id,plu:incoming.plu,synchronizedName:incoming.name,priceCents:incoming.priceCents,fingerprint:incoming.fingerprint,needsReview:true}});created++;
      }
    }
    if(!replayed&&input.missingPlus.length)await tx.fusionCatalogMapping.updateMany({where:{companyId:device.companyId,locationId:device.locationId,plu:{in:input.missingPlus}},data:{missingFromFusion:true}});
    const result={created,updated,unchanged:input.unchangedCount,missing:input.missingPlus.length,placeholdersSkipped};
    const completedAt=new Date();await tx.fusionCatalogSyncState.upsert({where:{connectorId:device.id},create:{companyId:device.companyId,locationId:device.locationId,connectorId:device.id,status:"READY",consumedRequestVersion:input.requestVersion,lastSyncAt:completedAt,totalCount:input.totalCount,createdCount:created,updatedCount:updated,unchangedCount:input.unchangedCount,missingCount:input.missingPlus.length},update:{status:"READY",syncStartedAt:null,consumedRequestVersion:input.requestVersion,lastSyncAt:completedAt,lastError:null,totalCount:input.totalCount,createdCount:created,updatedCount:updated,unchangedCount:input.unchangedCount,missingCount:input.missingPlus.length}});
    if(idempotency)await tx.idempotencyRecord.update({where:{id:idempotency.id},data:{status:"SUCCEEDED",result,completedAt:new Date()}});
    await tx.idempotencyRecord.update({where:{id:run.id},data:{status:"SUCCEEDED",result,completedAt}});await writeAuditLogTx(tx,{companyId:device.companyId,locationId:device.locationId,action:"FUSION_CATALOG_SYNCED",entityType:"KitchenConnectorDevice",entityId:device.id,metadata:{...result,totalCount:input.totalCount,runId:run.id}});
    return result;
  },{isolationLevel:"Serializable"});
}

export async function requestFusionCatalogSync(companyId:string,locationId:string,userId:string){
  const device=await prisma.kitchenConnectorDevice.findFirst({where:{companyId,locationId,active:true,revokedAt:null,printer:{type:"FUSION_XML_1745"}},orderBy:{lastHeartbeatAt:"desc"}});if(!device)throw new ConnectorError("Nessun connector FUSION attivo per la sede.",404);
  return prisma.$transaction(async tx=>{const state=await tx.fusionCatalogSyncState.upsert({where:{connectorId:device.id},create:{companyId,locationId,connectorId:device.id,manualRequestVersion:1,requestedAt:new Date(),requestedById:userId,status:"STALE"},update:{manualRequestVersion:{increment:1},requestedAt:new Date(),requestedById:userId,status:"STALE"}});await writeAuditLogTx(tx,{companyId,locationId,userId,action:"FUSION_CATALOG_SYNC_REQUESTED",entityType:"KitchenConnectorDevice",entityId:device.id,metadata:{requestVersion:state.manualRequestVersion}});return state;});
}

export async function getFusionCatalogCommand(device:{id:string;companyId:string;locationId:string}){const state=await prisma.fusionCatalogSyncState.findFirst({where:{connectorId:device.id,companyId:device.companyId,locationId:device.locationId}});return{catalogSyncRequested:Boolean(state&&state.manualRequestVersion>state.consumedRequestVersion),requestVersion:state?.manualRequestVersion??0};}

export async function getFusionCatalogDashboard(companyId:string,locationId:string){return prisma.fusionCatalogSyncState.findMany({where:{companyId,locationId},orderBy:{updatedAt:"desc"}});}
