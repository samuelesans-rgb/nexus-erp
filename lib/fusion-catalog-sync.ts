import "server-only";

import { writeAuditLogTx } from "@/lib/audit";
import { ConnectorError } from "@/lib/kitchen-connector";
import { prisma } from "@/lib/prisma";

export type CatalogSyncItemInput={plu:number;name:string;priceCents:number|null;fingerprint:string};
export type CatalogSyncInput={idempotencyKey:string;requestVersion:number;totalCount:number;unchangedCount:number;items:CatalogSyncItemInput[];missingPlus:number[]};
const validItem=(item:CatalogSyncItemInput)=>Number.isInteger(item.plu)&&item.plu>0&&item.plu<=2_147_483_647&&item.name.length>0&&item.name.length<=200&&(item.priceCents===null||Number.isSafeInteger(item.priceCents)&&item.priceCents>=0)&&/^[a-f0-9]{64}$/.test(item.fingerprint);

export async function syncFusionCatalog(device:{id:string;companyId:string;locationId:string},input:CatalogSyncInput){
  const itemPlus=input.items.map(item=>item.plu),uniquePlus=new Set(itemPlus);
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(input.idempotencyKey)||!Number.isInteger(input.requestVersion)||input.requestVersion<0||!Number.isInteger(input.totalCount)||input.totalCount<0||!Number.isInteger(input.unchangedCount)||input.unchangedCount<0||input.items.length>500||input.missingPlus.length>10_000||input.items.some(item=>!validItem(item))||input.missingPlus.some(plu=>!Number.isInteger(plu)||plu<=0)||uniquePlus.size!==itemPlus.length)throw new ConnectorError("Payload catalogo non valido.",400);
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${device.companyId}:${device.locationId}:fusion-catalog`}))`;
    const previous=await tx.idempotencyRecord.findUnique({where:{companyId_commandType_idempotencyKey:{companyId:device.companyId,commandType:"FUSION_CATALOG_SYNC",idempotencyKey:input.idempotencyKey}}});
    if(previous?.status==="SUCCEEDED")return previous.result as {created:number;updated:number;unchanged:number;missing:number};
    if(previous)throw new ConnectorError("Sync già in elaborazione o fallita.",409);
    const idempotency=await tx.idempotencyRecord.create({data:{companyId:device.companyId,commandType:"FUSION_CATALOG_SYNC",idempotencyKey:input.idempotencyKey}});
    const uom=await tx.unitOfMeasure.findFirst({where:{companyId:device.companyId,code:"PZ",active:true,deletedAt:null},select:{id:true}});
    if(!uom&&input.items.length)throw new ConnectorError("Unità di misura PZ non configurata.",422);
    let created=0,updated=0;
    for(const incoming of input.items){
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
    if(input.missingPlus.length)await tx.fusionCatalogMapping.updateMany({where:{companyId:device.companyId,locationId:device.locationId,plu:{in:input.missingPlus}},data:{missingFromFusion:true}});
    const result={created,updated,unchanged:input.unchangedCount,missing:input.missingPlus.length};
    await tx.fusionCatalogSyncState.upsert({where:{connectorId:device.id},create:{companyId:device.companyId,locationId:device.locationId,connectorId:device.id,status:"READY",consumedRequestVersion:input.requestVersion,lastSyncAt:new Date(),totalCount:input.totalCount,createdCount:created,updatedCount:updated,unchangedCount:input.unchangedCount,missingCount:input.missingPlus.length},update:{status:"READY",consumedRequestVersion:input.requestVersion,lastSyncAt:new Date(),lastError:null,totalCount:input.totalCount,createdCount:created,updatedCount:updated,unchangedCount:input.unchangedCount,missingCount:input.missingPlus.length}});
    await tx.idempotencyRecord.update({where:{id:idempotency.id},data:{status:"SUCCEEDED",result,completedAt:new Date()}});
    await writeAuditLogTx(tx,{companyId:device.companyId,locationId:device.locationId,action:"FUSION_CATALOG_SYNCED",entityType:"KitchenConnectorDevice",entityId:device.id,metadata:{...result,totalCount:input.totalCount}});
    return result;
  },{isolationLevel:"Serializable"});
}

export async function requestFusionCatalogSync(companyId:string,locationId:string,userId:string){
  const device=await prisma.kitchenConnectorDevice.findFirst({where:{companyId,locationId,active:true,revokedAt:null,printer:{type:"FUSION_XML_1745"}},orderBy:{lastHeartbeatAt:"desc"}});if(!device)throw new ConnectorError("Nessun connector FUSION attivo per la sede.",404);
  return prisma.$transaction(async tx=>{const state=await tx.fusionCatalogSyncState.upsert({where:{connectorId:device.id},create:{companyId,locationId,connectorId:device.id,manualRequestVersion:1,requestedAt:new Date(),requestedById:userId,status:"STALE"},update:{manualRequestVersion:{increment:1},requestedAt:new Date(),requestedById:userId,status:"STALE"}});await writeAuditLogTx(tx,{companyId,locationId,userId,action:"FUSION_CATALOG_SYNC_REQUESTED",entityType:"KitchenConnectorDevice",entityId:device.id,metadata:{requestVersion:state.manualRequestVersion}});return state;});
}

export async function getFusionCatalogCommand(device:{id:string;companyId:string;locationId:string}){const state=await prisma.fusionCatalogSyncState.findFirst({where:{connectorId:device.id,companyId:device.companyId,locationId:device.locationId}});return{catalogSyncRequested:Boolean(state&&state.manualRequestVersion>state.consumedRequestVersion),requestVersion:state?.manualRequestVersion??0};}

export async function reportFusionCatalogStatus(device:{id:string;companyId:string;locationId:string},status:"SYNCING"|"ERROR",error?:string){await prisma.fusionCatalogSyncState.upsert({where:{connectorId:device.id},create:{companyId:device.companyId,locationId:device.locationId,connectorId:device.id,status,syncStartedAt:status==="SYNCING"?new Date():null,lastError:error?.slice(0,500),errorCount:status==="ERROR"?1:0},update:{status,syncStartedAt:status==="SYNCING"?new Date():undefined,lastError:status==="ERROR"?error?.slice(0,500):null,errorCount:status==="ERROR"?{increment:1}:undefined}});}

export async function getFusionCatalogDashboard(companyId:string,locationId:string){return prisma.fusionCatalogSyncState.findMany({where:{companyId,locationId},orderBy:{updatedAt:"desc"}});}
