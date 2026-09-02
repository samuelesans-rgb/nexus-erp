import "server-only";
import { prisma } from "@/lib/prisma";
import { createDraftTx, confirmDocumentTx, postDocumentTx } from "@/lib/documents";
import { allocateMovementToScheduleTx, registerCustomerReceiptTx } from "@/lib/treasury";
import { executeIdempotent } from "@/lib/idempotency";
import { emitRestaurantEvent, emitRestaurantEventTx, RestaurantDomainError } from "@/lib/restaurant";
import { restaurantFiscalAdapter } from "@/lib/restaurant-fiscal-adapter";
import { lockRestaurantResources } from "@/lib/restaurant-locking";
import { restaurantMenuEligibleItemWhere, restaurantMenuPrice } from "@/lib/restaurant-menu-eligibility";

export async function openOrder(companyId:string,locationId:string,userId:string,input:{tableId?:string|null;tableIds?:string[];reservationId?:string|null;partnerId?:string|null;guestCount:number;serviceType:"DINE_IN"|"TAKEAWAY"|"DELIVERY"|"EVENT";notes?:string}){
  if(input.guestCount<1)throw new RestaurantDomainError("Numero coperti non valido.");
  const row=await prisma.$transaction(async tx=>{
    const reservation=input.reservationId?await tx.restaurantReservation.findFirst({where:{id:input.reservationId,companyId,locationId,deletedAt:null,status:{in:["CONFIRMED","SEATED"]}},include:{tables:true}}):null;
    if(input.reservationId&&!reservation)throw new RestaurantDomainError("Prenotazione non valida per la sede corrente.");
    const requested=[...new Set(reservation
      ? reservation.tables.map(row=>row.tableId)
      : input.tableIds?.length
        ? input.tableIds
        : input.tableId
          ? [input.tableId]
          : [])];
    if(reservation&&!requested.length)throw new RestaurantDomainError("La prenotazione non ha tavoli assegnati.");
    await lockRestaurantResources(tx,companyId,requested.map(id=>"table:"+id));
    const tables=requested.length?await tx.restaurantTable.findMany({where:{companyId,locationId,id:{in:requested},active:true,deletedAt:null,status:{not:"OUT_OF_SERVICE"}},select:{id:true,status:true}}):[];
    if(tables.length!==requested.length)throw new RestaurantDomainError("Uno o più tavoli non appartengono alla sede corrente.");
    if(requested.length>1&&!reservation){const combinations=await tx.restaurantTableCombination.findMany({where:{companyId,locationId,active:true},include:{tables:true}});if(!combinations.some(combo=>combo.tables.length===requested.length&&requested.every(id=>combo.tables.some(row=>row.tableId===id))))throw new RestaurantDomainError("Combinazione tavoli non consentita.");}
    const conflict=requested.length?await tx.restaurantOrderTable.findFirst({where:{companyId,locationId,tableId:{in:requested},order:{status:{notIn:["CLOSED","CANCELLED"]}}},select:{tableId:true}}):null;
    if(conflict)throw new RestaurantDomainError("Uno o più tavoli sono già occupati da una comanda.");
    if(!reservation&&tables.some(table=>table.status!=="AVAILABLE"))throw new RestaurantDomainError("Tavolo non disponibile.");
    const created=await tx.restaurantOrder.create({data:{companyId,locationId,code:`ORD-${Date.now().toString(36).toUpperCase()}`,tableId:requested[0]??null,reservationId:reservation?.id??null,partnerId:input.partnerId??reservation?.partnerId??null,guestCount:input.guestCount,serviceType:input.serviceType,notes:input.notes,createdById:userId,updatedById:userId},select:{id:true}});
    if(requested.length)await tx.restaurantOrderTable.createMany({data:requested.map(tableId=>({companyId,locationId,orderId:created.id,tableId}))});
    if(requested.length)await tx.restaurantTable.updateMany({where:{companyId,locationId,id:{in:requested}},data:{status:"OCCUPIED"}});
    return created;
  });
  await emitRestaurantEvent(companyId,"RestaurantOrderOpened","RestaurantOrder",row.id,{reservationId:input.reservationId??null});return row;
}
export async function addOrderLine(companyId:string,locationId:string,orderId:string,input:{itemId:string;variantId?:string|null;modifierIds?:string[];quantity:number;courseNumber?:number;notes?:string;kitchenNotes?:string}){
  const modifierIds=[...new Set(input.modifierIds??[])];
  if(modifierIds.length!==(input.modifierIds??[]).length)throw new RestaurantDomainError("Lo stesso modifier non può essere selezionato più volte.");
  const line=await prisma.$transaction(async tx=>{
    const [order,item]=await Promise.all([
      tx.restaurantOrder.findFirst({where:{id:orderId,companyId,locationId,status:{notIn:["CLOSED","CANCELLED"]}}}),
      tx.item.findFirst({where:{id:input.itemId,companyId,...restaurantMenuEligibleItemWhere,category:{active:true,deletedAt:null}},include:{vatRate:true,restaurantMenuItems:{where:{available:true,section:{active:true,menu:{locationId,active:true,deletedAt:null}}},orderBy:{createdAt:"desc"},take:1},restaurantVariants:{where:{id:input.variantId??undefined,active:true,available:true,deletedAt:null}},restaurantModifierGroups:{where:{active:true,deletedAt:null},include:{modifiers:{where:{id:{in:modifierIds},active:true,deletedAt:null}}}}}})
    ]);
    if(!order||!item||!item.vatRate||!item.vatRate.active||!item.restaurantMenuItems.length||input.quantity<=0)throw new RestaurantDomainError("Ordine o Item non valido.");
    const variant=input.variantId?item.restaurantVariants.find(row=>row.id===input.variantId):null;
    if(input.variantId&&!variant)throw new RestaurantDomainError("Variante non disponibile.");
    const selected=item.restaurantModifierGroups.flatMap(group=>group.modifiers.map(modifier=>({group,modifier})));
    if(selected.length!==modifierIds.length)throw new RestaurantDomainError("Modifier inattivo o non associato al prodotto.");
    for(const group of item.restaurantModifierGroups){const count=selected.filter(row=>row.group.id===group.id).length;if(count<group.minSelections||count>group.maxSelections||(group.required&&count===0))throw new RestaurantDomainError("Selezioni non valide per " + group.name + ".");}
    const fusionManaged=Boolean(await tx.fusionCatalogMapping.findFirst({where:{companyId,locationId,itemId:item.id,missingFromFusion:false},select:{id:true}}));
    const catalogBase=restaurantMenuPrice({salePrice:item.salePrice,priceOverride:item.restaurantMenuItems[0]?.priceOverride,fusionManaged});
    const baseUnitPrice=variant?.priceOverride!=null?Number(variant.priceOverride):catalogBase+Number(variant?.priceDelta??0);
    const modifierTotal=selected.reduce((sum,row)=>sum+Number(row.modifier.priceDelta),0);const unitPrice=baseUnitPrice+modifierTotal;
    if(unitPrice<0)throw new RestaurantDomainError("Il prezzo finale non può essere negativo.");
    const lineTotal=Math.round((input.quantity*unitPrice+Number.EPSILON)*100)/100;
    return tx.restaurantOrderLine.create({data:{companyId,locationId,orderId,itemId:item.id,variantId:variant?.id??null,productName:item.name,variantName:variant?.name??null,baseUnitPrice,modifierTotal,quantity:input.quantity,unitPrice,vatRateId:item.vatRate.id,vatName:item.vatRate.name,vatPercentage:item.vatRate.percentage,lineTotal,courseNumber:input.courseNumber,notes:input.notes,kitchenNotes:input.kitchenNotes,modifiers:{create:selected.map(({group,modifier})=>({modifierId:modifier.id,itemId:modifier.itemId,groupName:group.name,name:modifier.name,priceDelta:modifier.priceDelta}))}},select:{id:true}});
  });
  await emitRestaurantEvent(companyId,"RestaurantOrderLineAdded","RestaurantOrder",orderId,{lineId:line.id});return line;
}
export async function cancelNewLine(companyId:string,locationId:string,lineId:string){const result=await prisma.restaurantOrderLine.updateMany({where:{id:lineId,companyId,locationId,status:"NEW"},data:{status:"CANCELLED",cancelledAt:new Date()}});if(!result.count)throw new RestaurantDomainError("Solo una riga NEW può essere annullata.");return{id:lineId};}
export async function reassignOrderTables(companyId:string,locationId:string,orderId:string,tableIds:string[]){const requested=[...new Set(tableIds)];if(!requested.length)throw new RestaurantDomainError("Selezionare almeno un tavolo.");return prisma.$transaction(async tx=>{const order=await tx.restaurantOrder.findFirst({where:{id:orderId,companyId,locationId,status:{notIn:["CLOSED","CANCELLED"]}},include:{tables:true}});if(!order)throw new RestaurantDomainError("Comanda non valida.");const oldIds=order.tables.map(row=>row.tableId);await lockRestaurantResources(tx,companyId,[...oldIds,...requested].map(id=>"table:"+id));const tables=await tx.restaurantTable.findMany({where:{companyId,locationId,id:{in:requested},active:true,deletedAt:null,status:{not:"OUT_OF_SERVICE"}},select:{id:true}});if(tables.length!==requested.length)throw new RestaurantDomainError("Tavoli non validi per la sede corrente.");if(requested.length>1){const combinations=await tx.restaurantTableCombination.findMany({where:{companyId,locationId,active:true},include:{tables:true}});if(!combinations.some(combo=>combo.tables.length===requested.length&&requested.every(id=>combo.tables.some(row=>row.tableId===id))))throw new RestaurantDomainError("Combinazione tavoli non consentita.");}const conflict=await tx.restaurantOrderTable.findFirst({where:{companyId,locationId,tableId:{in:requested},orderId:{not:orderId},order:{status:{notIn:["CLOSED","CANCELLED"]}}}});if(conflict)throw new RestaurantDomainError("Uno o più tavoli sono già occupati.");await tx.restaurantOrderTable.deleteMany({where:{companyId,orderId}});await tx.restaurantOrderTable.createMany({data:requested.map(tableId=>({companyId,locationId,orderId,tableId}))});await tx.restaurantOrder.update({where:{id:orderId},data:{tableId:requested[0]}});const released=oldIds.filter(id=>!requested.includes(id));if(released.length)await tx.restaurantTable.updateMany({where:{companyId,locationId,id:{in:released}},data:{status:"AVAILABLE"}});await tx.restaurantTable.updateMany({where:{companyId,locationId,id:{in:requested}},data:{status:"OCCUPIED"}});return{id:orderId,tableIds:requested};});}
export async function transferOrderTable(companyId:string,locationId:string,orderId:string,tableId:string){return reassignOrderTables(companyId,locationId,orderId,[tableId]);}
export type RestaurantPaymentInput={financialAccountId:string;paymentMethod:"CASH"|"CARD"|"BANK"|"OTHER";amount:number};
export async function closeRestaurantOrderAtomic(companyId:string,locationId:string,userId:string,orderId:string,idempotencyKey:string,input:{seriesId:string;invoice:boolean;payments:RestaurantPaymentInput[]}) {
  const result=await executeIdempotent(companyId,"RestaurantOrderClose",locationId + ":" + idempotencyKey,async tx=>{
    const order=await tx.restaurantOrder.findFirst({where:{id:orderId,companyId,locationId,status:{not:"CANCELLED"}},include:{lines:{where:{status:{not:"CANCELLED"}},include:{item:true,modifiers:true}},document:true,tables:true}});
    if(!order||!order.partnerId||!order.lines.length)throw new RestaurantDomainError("Cliente e righe sono necessari per chiudere il conto.");
    if(order.status==="CLOSED")return{aggregateId:order.id,orderId:order.id,documentId:order.documentId!,movementIds:[],paymentStatus:"PAID",total:Number(order.document?.total??0)};
    if(order.lines.some(line=>line.status!=="SERVED"))throw new RestaurantDomainError("Tutte le righe devono essere servite.");
    let documentId=order.documentId;let total=Number(order.document?.total??0);
    if(!documentId){const series=await tx.documentSeries.findFirst({where:{id:input.seriesId,companyId,locationId,active:true,documentType:input.invoice?"SALES_INVOICE":"SALES_RECEIPT"}});if(!series)throw new RestaurantDomainError(input.invoice?"Selezionare una serie fattura.":"Selezionare la serie conto Restaurant.");const doc=await createDraftTx(tx,companyId,userId,{seriesId:series.id,partnerId:order.partnerId,documentDate:new Date(),currency:"EUR",locationId:order.locationId,lines:order.lines.map(line=>({itemId:line.itemId,description:[line.productName,line.variantName].filter(Boolean).join(" · "),quantity:Number(line.quantity),unitOfMeasureId:line.item.unitOfMeasureId!,unitPrice:Number(line.unitPrice),vatRateId:line.vatRateId,vatNameSnapshot:line.vatName,vatPercentageSnapshot:Number(line.vatPercentage),notes:line.modifiers.length?line.modifiers.map(modifier=>modifier.groupName+": "+modifier.name).join("; "):line.notes}))});await confirmDocumentTx(tx,companyId,userId,order.locationId,doc.id);await postDocumentTx(tx,companyId,userId,order.locationId,doc.id);const posted=await tx.businessDocument.findUniqueOrThrow({where:{id:doc.id},select:{total:true}});documentId=doc.id;total=Number(posted.total);await emitRestaurantEventTx(tx,companyId,"RestaurantBillCreated","RestaurantOrder",order.id,{documentId,total,fiscal:false});}
    const alreadyPaid=Number((await tx.financialMovement.aggregate({where:{companyId,locationId:order.locationId,documentId,movementType:"CUSTOMER_RECEIPT",reversalOfId:null,reversals:{none:{}}},_sum:{amount:true}}))._sum.amount??0);if(input.payments.some(payment=>!Number.isFinite(Number(payment.amount))||Number(payment.amount)<=0))throw new RestaurantDomainError("Gli importi di pagamento devono essere positivi.");const requested=input.payments.reduce((sum,payment)=>sum+Number(payment.amount),0);const residual=Math.max(0,total-alreadyPaid);if(!Number.isFinite(requested)||requested>residual+0.001)throw new RestaurantDomainError("Il pagamento supera il residuo del conto.");
    const schedules=await tx.paymentSchedule.findMany({where:{companyId,locationId:order.locationId,documentId,status:{in:["OPEN","PARTIALLY_PAID","OVERDUE"]},deletedAt:null},orderBy:[{dueDate:"asc"},{installmentNumber:"asc"}]});const scheduleResiduals=new Map(schedules.map(schedule=>[schedule.id,Number(schedule.residualAmount)]));
    const movementIds:string[]=[];for(const payment of input.payments){if(payment.amount<=0)continue;const movement=await registerCustomerReceiptTx(tx,companyId,userId,{locationId:order.locationId,financialAccountId:payment.financialAccountId,partnerId:order.partnerId,documentId,amount:payment.amount,occurredAt:new Date(),reference:`RestaurantOrder:${order.id}`,notes:payment.paymentMethod});movementIds.push(movement.id);let allocatable=Number(payment.amount);for(const schedule of schedules){if(allocatable<=0)break;const residualAmount=scheduleResiduals.get(schedule.id)??0;const allocation=Math.min(allocatable,residualAmount);if(allocation>0){await allocateMovementToScheduleTx(tx,companyId,order.locationId,userId,movement.id,schedule.id,allocation);scheduleResiduals.set(schedule.id,residualAmount-allocation);allocatable-=allocation;}}await emitRestaurantEventTx(tx,companyId,"RestaurantPaymentRegistered","RestaurantOrder",order.id,{movementId:movement.id,amount:payment.amount,method:payment.paymentMethod});}
    const nextPaid=alreadyPaid+requested;const paid=Math.abs(total-nextPaid)<0.001;await tx.restaurantOrder.update({where:{id:order.id},data:{documentId,paymentStatus:paid?"PAID":nextPaid>0?"PARTIALLY_PAID":"UNPAID",status:paid?"CLOSED":order.status,closedAt:paid?new Date():null}});if(paid&&order.tables.length)await tx.restaurantTable.updateMany({where:{companyId,locationId,id:{in:order.tables.map(row=>row.tableId)}},data:{status:"DIRTY"}});if(paid)await emitRestaurantEventTx(tx,companyId,"RestaurantOrderClosed","RestaurantOrder",order.id,{documentId,total});return{aggregateId:order.id,orderId:order.id,documentId,movementIds,paymentStatus:paid?"PAID":"PARTIALLY_PAID",total};
  },{aggregateType:"RestaurantOrder",aggregateId:orderId,timeout:30000});
  if(result.documentId)await restaurantFiscalAdapter.transmit({orderId,documentId:result.documentId,total:result.total});return result;
}
export async function closeOrder(companyId:string,locationId:string,userId:string,orderId:string,idempotencyKey:string,input:{seriesId:string;financialAccountId:string;paymentMethod:"CASH"|"CARD"|"BANK"|"OTHER";amount:number;invoice:boolean}){return closeRestaurantOrderAtomic(companyId,locationId,userId,orderId,idempotencyKey,{seriesId:input.seriesId,invoice:input.invoice,payments:input.amount>0?[{financialAccountId:input.financialAccountId,paymentMethod:input.paymentMethod,amount:input.amount}]:[]})}
export const getOrders=(companyId:string,locationId:string)=>prisma.restaurantOrder.findMany({where:{companyId,locationId},include:{table:true,tables:{include:{table:true}},partner:true,_count:{select:{lines:true}}},orderBy:{openedAt:"desc"}});
export const getOrder=(companyId:string,locationId:string,id:string)=>prisma.restaurantOrder.findFirst({where:{id,companyId,locationId},include:{table:true,tables:{include:{table:true}},partner:true,document:true,lines:{include:{item:true,modifiers:true},orderBy:{createdAt:"asc"}}}});
