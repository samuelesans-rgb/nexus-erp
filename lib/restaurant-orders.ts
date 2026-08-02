import "server-only";
import { prisma } from "@/lib/prisma";
import { createDraft, confirmDocument, postDocument } from "@/lib/documents";
import { registerCustomerReceipt } from "@/lib/treasury";
import { emitRestaurantEvent, RestaurantDomainError } from "@/lib/restaurant";
import { restaurantFiscalAdapter } from "@/lib/restaurant-fiscal-adapter";

export async function openOrder(companyId:string,userId:string,input:{locationId:string;tableId?:string|null;reservationId?:string|null;partnerId?:string|null;guestCount:number;serviceType:"DINE_IN"|"TAKEAWAY"|"DELIVERY"|"EVENT";notes?:string}){
  if(input.guestCount<1)throw new RestaurantDomainError("Numero coperti non valido.");if(input.tableId){const table=await prisma.restaurantTable.findFirst({where:{id:input.tableId,companyId,locationId:input.locationId,active:true,deletedAt:null,status:{notIn:["OUT_OF_SERVICE","OCCUPIED"]}}});if(!table)throw new RestaurantDomainError("Tavolo non disponibile.");}
  const row=await prisma.restaurantOrder.create({data:{companyId,locationId:input.locationId,code:`ORD-${Date.now().toString(36).toUpperCase()}`,tableId:input.tableId||null,reservationId:input.reservationId||null,partnerId:input.partnerId||null,guestCount:input.guestCount,serviceType:input.serviceType,notes:input.notes,createdById:userId,updatedById:userId},select:{id:true}});if(input.tableId)await prisma.restaurantTable.update({where:{id:input.tableId},data:{status:"OCCUPIED"}});await emitRestaurantEvent(companyId,"RestaurantOrderOpened","RestaurantOrder",row.id,{});return row;
}
export async function addOrderLine(companyId:string,orderId:string,input:{itemId:string;quantity:number;courseNumber?:number;notes?:string;kitchenNotes?:string}){const order=await prisma.restaurantOrder.findFirst({where:{id:orderId,companyId,status:{notIn:["CLOSED","CANCELLED"]}}});const item=await prisma.item.findFirst({where:{id:input.itemId,companyId,sellable:true,active:true,deletedAt:null},include:{restaurantMenuItems:{where:{available:true},orderBy:{createdAt:"desc"},take:1}}});if(!order||!item||!item.vatRateId||input.quantity<=0)throw new RestaurantDomainError("Ordine o Item non valido.");const line=await prisma.restaurantOrderLine.create({data:{companyId,orderId,itemId:item.id,quantity:input.quantity,unitPrice:item.restaurantMenuItems[0]?.priceOverride??item.salePrice??0,vatRateId:item.vatRateId,courseNumber:input.courseNumber,notes:input.notes,kitchenNotes:input.kitchenNotes},select:{id:true}});await emitRestaurantEvent(companyId,"RestaurantOrderLineAdded","RestaurantOrder",orderId,{lineId:line.id});return line;}
export async function cancelNewLine(companyId:string,lineId:string){const result=await prisma.restaurantOrderLine.updateMany({where:{id:lineId,companyId,status:"NEW"},data:{status:"CANCELLED",cancelledAt:new Date()}});if(!result.count)throw new RestaurantDomainError("Solo una riga NEW può essere annullata.");return{id:lineId};}
export async function transferOrderTable(companyId:string,orderId:string,tableId:string){return prisma.$transaction(async tx=>{const order=await tx.restaurantOrder.findFirst({where:{id:orderId,companyId,status:{notIn:["CLOSED","CANCELLED"]}}});const table=await tx.restaurantTable.findFirst({where:{id:tableId,companyId,locationId:order?.locationId,status:"AVAILABLE",deletedAt:null}});if(!order||!table)throw new RestaurantDomainError("Trasferimento tavolo non consentito.");if(order.tableId)await tx.restaurantTable.update({where:{id:order.tableId},data:{status:"AVAILABLE"}});await tx.restaurantTable.update({where:{id:table.id},data:{status:"OCCUPIED"}});await tx.restaurantOrder.update({where:{id:order.id},data:{tableId:table.id}});return{id:order.id};});}
export async function closeOrder(companyId:string,userId:string,orderId:string,input:{seriesId:string;financialAccountId:string;paymentMethod:"CASH"|"CARD"|"BANK"|"OTHER";amount:number;invoice:boolean}) {
  const order=await prisma.restaurantOrder.findFirst({where:{id:orderId,companyId,status:{notIn:["CLOSED","CANCELLED"]}},include:{lines:{where:{status:{not:"CANCELLED"}},include:{item:true}}}});
  if(!order||!order.partnerId||!order.lines.length)throw new RestaurantDomainError("Cliente e righe sono necessari per chiudere il conto.");
  if(order.lines.some(l=>l.status!=="SERVED"))throw new RestaurantDomainError("Tutte le righe devono essere servite.");
  let documentId=order.documentId;
  const total=order.lines.reduce((s,l)=>s+Number(l.quantity)*Number(l.unitPrice),0);
  if(!documentId){
    const series=await prisma.documentSeries.findFirst({where:{id:input.seriesId,companyId,active:true,documentType:input.invoice?"SALES_INVOICE":"SALES_RECEIPT"}});
    if(!series)throw new RestaurantDomainError(input.invoice?"Selezionare una serie fattura.":"Selezionare la serie conto Restaurant.");
    const doc=await createDraft(companyId,userId,{seriesId:series.id,partnerId:order.partnerId,documentDate:new Date(),currency:"EUR",locationId:order.locationId,lines:order.lines.map(l=>({itemId:l.itemId,description:l.item.name,quantity:Number(l.quantity),unitOfMeasureId:l.item.unitOfMeasureId!,unitPrice:Number(l.unitPrice),vatRateId:l.vatRateId}))});
    await confirmDocument(companyId,userId,doc.id);await postDocument(companyId,userId,doc.id);documentId=doc.id;
    await emitRestaurantEvent(companyId,"RestaurantBillCreated","RestaurantOrder",order.id,{documentId,total,fiscal:false});
  }
  const reference=`Restaurant ${order.code}`;
  const alreadyPaid=Number((await prisma.financialMovement.aggregate({where:{companyId,partnerId:order.partnerId,reference,movementType:"CUSTOMER_RECEIPT",reversalOfId:null},_sum:{amount:true}}))._sum.amount??0);
  if(input.amount>0)await registerCustomerReceipt(companyId,userId,{financialAccountId:input.financialAccountId,partnerId:order.partnerId,amount:input.amount,occurredAt:new Date(),reference,notes:input.paymentMethod});
  const paid=alreadyPaid+input.amount>=total;
  await prisma.restaurantOrder.update({where:{id:order.id},data:{documentId,paymentStatus:paid?"PAID":"PARTIALLY_PAID",status:paid?"CLOSED":order.status,closedAt:paid?new Date():null}});
  if(paid&&order.tableId)await prisma.restaurantTable.update({where:{id:order.tableId},data:{status:"DIRTY"}});
  await restaurantFiscalAdapter.transmit({orderId:order.id,documentId,total});await emitRestaurantEvent(companyId,"RestaurantPaymentRegistered","RestaurantOrder",order.id,{amount:input.amount,method:input.paymentMethod});if(paid)await emitRestaurantEvent(companyId,"RestaurantOrderClosed","RestaurantOrder",order.id,{});return{id:order.id,documentId};
}
export const getOrders=(companyId:string)=>prisma.restaurantOrder.findMany({where:{companyId},include:{table:true,partner:true,_count:{select:{lines:true}}},orderBy:{openedAt:"desc"}});
export const getOrder=(companyId:string,id:string)=>prisma.restaurantOrder.findFirst({where:{id,companyId},include:{table:true,partner:true,document:true,lines:{include:{item:true,modifiers:true},orderBy:{createdAt:"asc"}}}});
