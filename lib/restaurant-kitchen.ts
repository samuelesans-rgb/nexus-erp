import "server-only";
import { prisma } from "@/lib/prisma";
import { postInventoryMovement, reverseInventoryMovement } from "@/lib/inventory";
import { emitRestaurantEvent, RestaurantDomainError } from "@/lib/restaurant";

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
  const line=await prisma.restaurantOrderLine.findFirst({where:{id:lineId,companyId},include:{order:true,item:{include:{recipeComponents:{where:{deletedAt:null},include:{componentItem:true}}}}}});if(!line)throw new RestaurantDomainError("Riga non trovata.");
  const data=status==="IN_PREPARATION"?{status,startedAt:new Date()}:status==="READY"?{status,readyAt:new Date()}:{status,servedAt:new Date()};await prisma.restaurantOrderLine.update({where:{id:line.id},data});await prisma.kitchenTicketLine.updateMany({where:{companyId,orderLineId:line.id},data:{status:status==="SERVED"?"COMPLETED":status}});
  if(status==="SERVED"&&line.item.type==="RECIPE")await consumeRecipe(companyId,userId,line);
  await emitRestaurantEvent(companyId,status==="READY"?"KitchenItemReady":status==="SERVED"?"RestaurantOrderLineServed":"KitchenPreparationStarted","RestaurantOrderLine",line.id,{status});return{id:line.id};
}
async function consumeRecipe(companyId:string,userId:string,line:Awaited<ReturnType<typeof prisma.restaurantOrderLine.findFirst>> & {order:{locationId:string;id:string};item:{id:string;recipeComponents:Array<{componentItemId:string;unitOfMeasureId:string;quantity:unknown;wastePercentage:unknown;componentItem:{trackLots:boolean;trackSerials:boolean}}>}}){
  const warehouse=await prisma.warehouse.findFirst({where:{companyId,locationId:line.order.locationId,active:true,deletedAt:null},include:{bins:{where:{active:true,deletedAt:null},take:1}}});if(!warehouse)throw new RestaurantDomainError("Magazzino Restaurant non configurato.");
  for(const c of line.item.recipeComponents){if(await prisma.recipeConsumption.count({where:{companyId,orderLineId:line.id,componentItemId:c.componentItemId}}))continue;if(c.componentItem.trackLots||c.componentItem.trackSerials)throw new RestaurantDomainError("Il consumo richiede la selezione esplicita di lotto o seriale.");const quantity=Number(line.quantity)*Number(c.quantity)*(1+Number(c.wastePercentage||0)/100);const movement=await postInventoryMovement(companyId,userId,{warehouseId:warehouse.id,binId:warehouse.bins[0]?.id,itemId:c.componentItemId,movementType:"CONSUMPTION",quantity,unitOfMeasureId:c.unitOfMeasureId,referenceType:"RestaurantOrderLine",referenceId:line.id,reason:"Consumo ricetta servita"});await prisma.recipeConsumption.create({data:{companyId,locationId:line.order.locationId,orderId:line.order.id,orderLineId:line.id,recipeItemId:line.item.id,componentItemId:c.componentItemId,inventoryMovementId:movement.id,quantity}});await emitRestaurantEvent(companyId,"RecipeInventoryConsumed","RestaurantOrderLine",line.id,{movementId:movement.id,componentItemId:c.componentItemId});}
}
export async function reverseRecipeConsumption(companyId:string,userId:string,lineId:string){const rows=await prisma.recipeConsumption.findMany({where:{companyId,orderLineId:lineId}});for(const row of rows)await reverseInventoryMovement(companyId,userId,row.inventoryMovementId,"Storno consumo Restaurant");return{count:rows.length};}
export const getKitchen= (companyId:string,stationId?:string)=>prisma.kitchenTicket.findMany({where:{companyId,kitchenStationId:stationId,status:{notIn:["COMPLETED","CANCELLED"]}},include:{station:true,order:true,lines:{include:{orderLine:{include:{item:true}}}}},orderBy:{createdAt:"asc"}});
