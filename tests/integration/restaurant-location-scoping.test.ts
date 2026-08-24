import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { prisma } from "../../lib/prisma";
import { postInventoryMovementsBatch } from "../../lib/inventory";
import { getRestaurantDashboard, getRestaurantOptions, saveArea, saveTable } from "../../lib/restaurant";
import { advanceKitchenLine, getKitchen, sendOrderToKitchen, serveRestaurantOrderLine } from "../../lib/restaurant-kitchen";
import { addOrderLine, closeRestaurantOrderAtomic, getOrder, getOrders, openOrder } from "../../lib/restaurant-orders";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Restaurant richiedono un DATABASE_URL dedicato contenente _test.");

let companyId="",otherCompanyId="",userId="",locationA="",locationB="",partnerId="",itemId="",recipeId="",seriesId="",accountId="",areaA="",areaB="",tableA="",tableB="",orderId="",lineId="";
const orderIds:string[]=[],documentIds:string[]=[],movementIds:string[]=[],locationIds:string[]=[];
const lotSelections:Record<string,string>={};
const balanceSnapshots:Array<{id:string;quantity:number;averageCost:number;stockValue:number}>=[];

before(async()=>{
  const company=await prisma.company.findUniqueOrThrow({where:{vatNumber:"IT00000000000"}}); companyId=company.id;
  userId=(await prisma.user.findFirstOrThrow({where:{memberships:{some:{companyId}}},select:{id:true}})).id;
  partnerId=(await prisma.partner.findFirstOrThrow({where:{companyId,isCustomer:true,active:true}})).id;
  const product=await prisma.item.findFirstOrThrow({where:{companyId,sellable:true,active:true,vatRateId:{not:null}}}); itemId=product.id;
  const recipe=await prisma.item.findFirstOrThrow({where:{companyId,type:"RECIPE",sellable:true,vatRateId:{not:null}},include:{recipeComponents:{include:{componentItem:true}}}}); recipeId=recipe.id;
  const suffix=randomUUID().slice(0,8);
  locationA=(await prisma.location.findFirstOrThrow({where:{companyId,active:true,deletedAt:null,warehouses:{some:{active:true,deletedAt:null}},kitchenStations:{some:{active:true}}},select:{id:true}})).id;
  const testWarehouse=await prisma.warehouse.findFirstOrThrow({where:{companyId,locationId:locationA,active:true,deletedAt:null},include:{bins:{where:{active:true,deletedAt:null},take:1}}});
  const topUps=[];for(const component of recipe.recipeComponents){let lotId:string|undefined,serialId:string|undefined;if(component.componentItem.trackLots){lotId=(await prisma.inventoryLot.findFirstOrThrow({where:{companyId,locationId:locationA,itemId:component.componentItemId,active:true}})).id;lotSelections[component.componentItemId]=lotId;}else if(component.componentItem.trackSerials){serialId=(await prisma.inventorySerial.findFirstOrThrow({where:{companyId,locationId:locationA,itemId:component.componentItemId,status:"AVAILABLE"}})).id;lotSelections[component.componentItemId]=serialId;}const balance=await prisma.stockBalance.findUnique({where:{companyId_warehouseId_itemId:{companyId,warehouseId:testWarehouse.id,itemId:component.componentItemId}}});if(balance){balanceSnapshots.push({id:balance.id,quantity:Number(balance.quantity),averageCost:Number(balance.averageCost),stockValue:Number(balance.stockValue)});const missing=Math.max(0,(component.componentItem.trackSerials?1:100)-Number(balance.quantity));if(missing)topUps.push({warehouseId:testWarehouse.id,binId:testWarehouse.bins[0]?.id,itemId:component.componentItemId,movementType:"ADJUSTMENT_IN" as const,quantity:missing,unitOfMeasureId:component.unitOfMeasureId,lotId,serialId,referenceType:"RestaurantLocationFixture",referenceId:suffix});}}
  if(topUps.length){const topUp=await postInventoryMovementsBatch(companyId,userId,"restaurant-location-topup-"+suffix,topUps);movementIds.push(...topUp.movementIds);}
  for(const component of recipe.recipeComponents){if(component.componentItem.trackLots){const lot=await prisma.inventoryLot.findFirst({where:{companyId,locationId:locationA,itemId:component.componentItemId,active:true}});if(lot)lotSelections[component.componentItemId]=lot.id;}else if(component.componentItem.trackSerials){const serial=await prisma.inventorySerial.findFirst({where:{companyId,locationId:locationA,itemId:component.componentItemId,status:"AVAILABLE"}});if(serial)lotSelections[component.componentItemId]=serial.id;}}
  const b=await prisma.location.create({data:{companyId,code:`RB-`,name:"Restaurant B"}}); locationB=b.id; locationIds.push(b.id);
  seriesId=(await prisma.documentSeries.create({data:{companyId,locationId:locationA,code:`RS-${suffix}`,name:"Restaurant receipt",documentType:"SALES_RECEIPT"}})).id;
  accountId=(await prisma.financialAccount.create({data:{companyId,locationId:locationA,code:`RC-${suffix}`,name:"Restaurant cash",type:"CASH",allowOverdraft:true,createdById:userId,updatedById:userId}})).id;
  areaA=(await saveArea(companyId,locationA,userId,{code:`SAME-`,name:"Area A"})).id;
  areaB=(await saveArea(companyId,locationB,userId,{code:`SAME-`,name:"Area B"})).id;
  tableA=(await saveTable(companyId,locationA,{areaId:areaA,code:`T-`,name:"Table A",seats:2})).id;
  tableB=(await saveTable(companyId,locationB,{areaId:areaB,code:`T-`,name:"Table B",seats:2})).id;
  otherCompanyId=(await prisma.company.create({data:{name:`Restaurant tenant ${randomUUID()}`}})).id;
});

after(async()=>{
  if(documentIds.length){const schedules=await prisma.paymentSchedule.findMany({where:{documentId:{in:documentIds}},select:{id:true}});const scheduleIds=schedules.map(x=>x.id);const financial=await prisma.financialMovement.findMany({where:{documentId:{in:documentIds}},select:{id:true}});const financialIds=financial.map(x=>x.id);if(financialIds.length)await prisma.financialAllocation.deleteMany({where:{movementId:{in:financialIds}}});if(financialIds.length)await prisma.financialMovement.deleteMany({where:{id:{in:financialIds}}});if(scheduleIds.length)await prisma.paymentSchedule.deleteMany({where:{id:{in:scheduleIds}}});}
  if(orderIds.length){await prisma.idempotencyRecord.deleteMany({where:{aggregateId:{in:orderIds}}});const tickets=await prisma.kitchenTicket.findMany({where:{orderId:{in:orderIds}},select:{id:true}});if(tickets.length)await prisma.kitchenTicketLine.deleteMany({where:{ticketId:{in:tickets.map(x=>x.id)}}});if(tickets.length)await prisma.kitchenTicket.deleteMany({where:{id:{in:tickets.map(x=>x.id)}}});await prisma.recipeConsumption.deleteMany({where:{orderId:{in:orderIds}}});await prisma.restaurantOrderLine.deleteMany({where:{orderId:{in:orderIds}}});await prisma.restaurantOrder.updateMany({where:{id:{in:orderIds}},data:{documentId:null}});await prisma.restaurantOrder.deleteMany({where:{id:{in:orderIds}}});}
  if(movementIds.length)await prisma.inventoryMovement.deleteMany({where:{id:{in:movementIds}}});
  for(const balance of balanceSnapshots)await prisma.stockBalance.update({where:{id:balance.id},data:{quantity:balance.quantity,averageCost:balance.averageCost,stockValue:balance.stockValue}});
  if(documentIds.length)await prisma.businessDocument.deleteMany({where:{id:{in:documentIds}}});
  await prisma.restaurantTable.deleteMany({where:{id:{in:[tableA,tableB]}}});await prisma.restaurantArea.deleteMany({where:{id:{in:[areaA,areaB]}}});
  await prisma.financialAccount.deleteMany({where:{id:accountId}});await prisma.documentSeries.deleteMany({where:{id:seriesId}});await prisma.warehouseBin.deleteMany({where:{warehouse:{locationId:{in:locationIds}}}});await prisma.warehouse.deleteMany({where:{locationId:{in:locationIds}}});await prisma.location.deleteMany({where:{id:{in:locationIds}}});if(otherCompanyId)await prisma.company.delete({where:{id:otherCompanyId}});await prisma.$disconnect();
});

test("Restaurant Area e Table sono visibili e utilizzabili solo nella Location corrente",async()=>{
  const a=await getRestaurantOptions(companyId,locationA),b=await getRestaurantOptions(companyId,locationB);
  assert.equal(a.areas.some(x=>x.id===areaA),true);assert.equal(a.areas.some(x=>x.id===areaB),false);assert.equal(b.tables.some(x=>x.id===tableA),false);
  await assert.rejects(saveTable(companyId,locationB,{areaId:areaA,code:"BAD",name:"Bad",seats:2}));
});

test("apertura, lettura e aggiunta righe rifiutano accessi cross-location",async()=>{
  const order=await openOrder(companyId,locationA,userId,{tableId:tableA,partnerId,guestCount:2,serviceType:"DINE_IN"});orderId=order.id;orderIds.push(order.id);
  assert.equal((await getOrder(companyId,locationA,order.id))?.locationId,locationA);assert.equal(await getOrder(companyId,locationB,order.id),null);assert.equal((await getOrders(companyId,locationB)).some(x=>x.id===order.id),false);
  await assert.rejects(addOrderLine(companyId,locationB,order.id,{itemId,quantity:1}));lineId=(await addOrderLine(companyId,locationA,order.id,{itemId:recipeId,quantity:1})).id;
  assert.equal((await prisma.restaurantOrderLine.findUniqueOrThrow({where:{id:lineId}})).locationId,locationA);
});

test("Kitchen espone e avanza soltanto ticket della sede",async()=>{
  await sendOrderToKitchen(companyId,locationA,orderId);const ticket=(await getKitchen(companyId,locationA)).find(x=>x.orderId===orderId);assert.ok(ticket);
  assert.equal((await getKitchen(companyId,locationB)).some(x=>x.id===ticket.id),false);assert.equal(ticket.lines[0].locationId,locationA);
  await assert.rejects(advanceKitchenLine(companyId,locationB,userId,lineId,"IN_PREPARATION"));await advanceKitchenLine(companyId,locationA,userId,lineId,"IN_PREPARATION");await advanceKitchenLine(companyId,locationA,userId,lineId,"READY");
});

test("servizio consuma Inventory nella Location dell'ordine",async()=>{
  const result=await serveRestaurantOrderLine(companyId,locationA,userId,lineId,randomUUID(),lotSelections);movementIds.push(...result.movementIds);
  const rows=await prisma.inventoryMovement.findMany({where:{id:{in:result.movementIds}}});assert.ok(rows.every(x=>x.locationId===locationA));
});

test("chiusura crea Documents e Treasury nella stessa Location e il pagamento cross-location è rifiutato",async()=>{
  await assert.rejects(closeRestaurantOrderAtomic(companyId,locationB,userId,orderId,randomUUID(),{seriesId,invoice:false,payments:[]}));
  const billed=await closeRestaurantOrderAtomic(companyId,locationA,userId,orderId,randomUUID(),{seriesId,invoice:false,payments:[]});documentIds.push(billed.documentId);
  const total=Number((await prisma.businessDocument.findUniqueOrThrow({where:{id:billed.documentId}})).total);
  const closed=await closeRestaurantOrderAtomic(companyId,locationA,userId,orderId,randomUUID(),{seriesId,invoice:false,payments:[{financialAccountId:accountId,paymentMethod:"CASH",amount:total}]});movementIds.push(...closed.movementIds);
  const [document,movement]=await Promise.all([prisma.businessDocument.findUniqueOrThrow({where:{id:closed.documentId}}),prisma.financialMovement.findFirstOrThrow({where:{id:{in:closed.movementIds}}})]);assert.equal(document.locationId,locationA);assert.equal(movement.locationId,locationA);assert.equal(await prisma.restaurantOrderTable.count({where:{orderId}}),1);assert.equal((await prisma.restaurantTable.findUniqueOrThrow({where:{id:tableA}})).status,"DIRTY");
});

test("dashboard e tenant isolation non espongono aggregate di altre sedi",async()=>{
  assert.equal((await getRestaurantDashboard(companyId,locationB)).openOrders,0);assert.equal(await getOrder(otherCompanyId,locationA,orderId),null);await assert.rejects(addOrderLine(otherCompanyId,locationA,orderId,{itemId,quantity:1}));
});

test("Restaurant non espone serie Documents globali",async()=>{
  const rows=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT count(*)::bigint AS count FROM "DocumentSeries" WHERE "companyId"=${companyId} AND "locationId" IS NULL`;
  assert.equal(Number(rows[0].count),0);
});
