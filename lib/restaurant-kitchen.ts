import "server-only";
import { prisma } from "@/lib/prisma";
import { postInventoryMovementsBatchTx, type MovementInput } from "@/lib/inventory";
import { executeIdempotent } from "@/lib/idempotency";
import { emitRestaurantEvent, emitRestaurantEventTx, RestaurantDomainError } from "@/lib/restaurant";

export async function sendOrderToKitchen(companyId:string, orderId:string) {
  const order=await prisma.restaurantOrder.findFirst({where:{id:orderId,companyId,status:{in:["OPEN","SENT","IN_PROGRESS"]}},include:{lines:{where:{status:"NEW"},include:{item:true}}}});
  if(!order||!order.lines.length) throw new RestaurantDomainError("Nessuna nuova riga da inviare.");
  for(const line of order.lines){
    const assignment=await prisma.kitchenStationAssignment.findFirst({where:{companyId,active:true,station:{locationId:order.locationId,active:true},OR:[{itemId:line.itemId},{itemCategoryId:line.item.categoryId}]},orderBy:[{itemId:"desc"},{priority:"desc"}]});
    if(!assignment) throw new RestaurantDomainError(`Nessuna stazione configurata per ${line.item.name}.`);
    let ticket=await prisma.kitchenTicket.findFirst({where:{companyId,orderId:order.id,kitchenStationId:assignment.kitchenStationId,status:"NEW",lines:{none:{}}}});
    ticket??=await prisma.kitchenTicket.create({data:{companyId,locationId:order.locationId,orderId:order.id,kitchenStationId:assignment.kitchenStationId}});
    await prisma.kitchenTicketLine.create({data:{companyId,ticketId:ticket.id,orderLineId:line.id}});
    await prisma.restaurantOrderLine.update({where:{id:line.id},data:{status:"SENT",sentAt:new Date()}});
    await emitRestaurantEvent(companyId,"KitchenTicketCreated","KitchenTicket",ticket.id,{orderLineId:line.id});
  }
  await prisma.restaurantOrder.update({where:{id:order.id},data:{status:"SENT"}}); await emitRestaurantEvent(companyId,"RestaurantOrderSentToKitchen","RestaurantOrder",order.id,{}); return {id:order.id};
}
export async function advanceKitchenLine(companyId:string,userId:string,lineId:string,status:"IN_PREPARATION"|"READY"|"SERVED"){
  if(status==="SERVED") return serveRestaurantOrderLine(companyId,userId,lineId,`${companyId}:${lineId}:serve`);
  const line=await prisma.restaurantOrderLine.findFirst({where:{id:lineId,companyId},include:{order:true,item:{include:{recipeComponents:{where:{deletedAt:null},include:{componentItem:true}}}}}});if(!line)throw new RestaurantDomainError("Riga non trovata.");
  const data=status==="IN_PREPARATION"?{status,startedAt:new Date()}:{status,readyAt:new Date()};await prisma.restaurantOrderLine.update({where:{id:line.id},data});await prisma.kitchenTicketLine.updateMany({where:{companyId,orderLineId:line.id},data:{status}});
  await emitRestaurantEvent(companyId,status==="READY"?"KitchenItemReady":"KitchenPreparationStarted","RestaurantOrderLine",line.id,{status});return{id:line.id};
}
export async function serveRestaurantOrderLine(companyId:string,userId:string,lineId:string,idempotencyKey:string,lotSelections:Record<string,string>={}){
  return executeIdempotent(companyId,"RestaurantOrderLineServe",idempotencyKey,async tx=>{
    const line=await tx.restaurantOrderLine.findFirst({where:{id:lineId,companyId,status:{in:["READY","SERVED"]}},include:{order:true,item:{include:{recipeComponents:{where:{deletedAt:null},include:{componentItem:true,unitOfMeasure:{select:{precision:true}}}}}}}});if(!line)throw new RestaurantDomainError("Solo una riga pronta può essere servita.");
    if(line.status==="SERVED")return{aggregateId:line.id,orderLineId:line.id,movementIds:[]};
    const warehouse=await tx.warehouse.findFirst({where:{companyId,locationId:line.order.locationId,active:true,deletedAt:null},include:{bins:{where:{active:true,deletedAt:null},take:1}}});if(line.item.type==="RECIPE"&&!warehouse)throw new RestaurantDomainError("Magazzino Restaurant non configurato.");
    const inputs:MovementInput[]=line.item.type==="RECIPE"?line.item.recipeComponents.map(c=>{const lotId=lotSelections[c.componentItemId];if((c.componentItem.trackLots||c.componentItem.trackSerials)&&!lotId)throw new RestaurantDomainError(`Lotto o seriale obbligatorio per ${c.componentItem.name}.`);const precision=Math.min(3,c.unitOfMeasure.precision),factor=10**precision,quantity=Math.round((Number(line.quantity)*Number(c.quantity)*(1+Number(c.wastePercentage||0)/100)+Number.EPSILON)*factor)/factor;return{warehouseId:warehouse!.id,binId:warehouse!.bins[0]?.id,itemId:c.componentItemId,movementType:"CONSUMPTION",quantity,unitOfMeasureId:c.unitOfMeasureId,lotId:c.componentItem.trackLots?lotId:null,serialId:c.componentItem.trackSerials?lotId:null,referenceType:"RestaurantOrderLine",referenceId:line.id,reason:"Consumo ricetta servita"}}):[];
    const movements=inputs.length?await postInventoryMovementsBatchTx(tx,companyId,userId,inputs):[];
    for(let index=0;index<inputs.length;index++){const input=inputs[index];await tx.recipeConsumption.create({data:{companyId,locationId:line.order.locationId,orderId:line.order.id,orderLineId:line.id,recipeItemId:line.item.id,componentItemId:input.itemId,inventoryMovementId:movements[index].id,quantity:Number(input.quantity)}})}
    await tx.restaurantOrderLine.update({where:{id:line.id},data:{status:"SERVED",servedAt:new Date()}});await tx.kitchenTicketLine.updateMany({where:{companyId,orderLineId:line.id},data:{status:"COMPLETED"}});await emitRestaurantEventTx(tx,companyId,"RestaurantOrderLineServed","RestaurantOrderLine",line.id,{movementIds:movements.map(m=>m.id)});if(movements.length)await emitRestaurantEventTx(tx,companyId,"RecipeInventoryConsumed","RestaurantOrderLine",line.id,{movementIds:movements.map(m=>m.id)});return{aggregateId:line.id,orderLineId:line.id,movementIds:movements.map(m=>m.id)};
  },{aggregateType:"RestaurantOrderLine",aggregateId:lineId});
}
export async function reverseRecipeConsumption(companyId:string,userId:string,lineId:string,idempotencyKey=`${companyId}:${lineId}:reverse-consumption`){return executeIdempotent(companyId,"RestaurantRecipeConsumptionReverse",idempotencyKey,async tx=>{const rows=await tx.recipeConsumption.findMany({where:{companyId,orderLineId:lineId},include:{inventoryMovement:true}});const inputs:MovementInput[]=rows.map(row=>({warehouseId:row.inventoryMovement.warehouseId,binId:row.inventoryMovement.binId,itemId:row.componentItemId,movementType:"ADJUSTMENT_IN",quantity:Number(row.quantity),unitOfMeasureId:row.inventoryMovement.unitOfMeasureId,lotId:row.inventoryMovement.lotId,serialId:row.inventoryMovement.serialId,unitCost:Number(row.inventoryMovement.unitCost??0),referenceType:"RestaurantOrderLineReversal",referenceId:lineId,reason:"Storno compensativo completo consumo Restaurant"}));const movements=await postInventoryMovementsBatchTx(tx,companyId,userId,inputs);await emitRestaurantEventTx(tx,companyId,"RecipeInventoryConsumptionReversed","RestaurantOrderLine",lineId,{movementIds:movements.map(m=>m.id)});return{aggregateId:lineId,count:movements.length,movementIds:movements.map(m=>m.id)}})}
export const getKitchen= (companyId:string,stationId?:string)=>prisma.kitchenTicket.findMany({where:{companyId,kitchenStationId:stationId,status:{notIn:["COMPLETED","CANCELLED"]}},include:{station:true,order:true,lines:{include:{orderLine:{include:{item:true}}}}},orderBy:{createdAt:"asc"}});
