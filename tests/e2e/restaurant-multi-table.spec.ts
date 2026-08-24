import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("L’E2E multi-table richiede DATABASE_URL _test.");
const email="admin@nexuserp.local",password="Admin123!";
test.afterAll(async()=>prisma.$disconnect());
test("multi-table reservation -> order, conflict and release",async({page})=>{
 const suffix=randomUUID().replaceAll("-","").slice(0,10).toUpperCase();
 const company=await prisma.company.findUniqueOrThrow({where:{vatNumber:"IT00000000000"}});
 const membership=await prisma.membership.findFirstOrThrow({where:{companyId:company.id,active:true,user:{email}},include:{defaultLocation:true,authorizedLocations:{include:{location:true}}}});
 const location=membership.defaultLocation??membership.authorizedLocations.map(x=>x.location).find(x=>x.active&&!x.deletedAt);
 if(!location)throw new Error("Location E2E autorizzata mancante.");
 const userId=membership.userId,tableIds:string[]=[];let areaId="",comboId="",serviceId="",reservationId="",orderId="",documentId="",partnerId="",categoryId="",unitId="",vatId="",itemId="",seriesId="",accountId="";
 try{
  areaId=(await prisma.restaurantArea.create({data:{companyId:company.id,locationId:location.id,code:"MTA-"+suffix,name:"Multi table "+suffix}})).id;
  const tables=await Promise.all(["1","2"].map(n=>prisma.restaurantTable.create({data:{companyId:company.id,locationId:location.id,areaId,code:"MT"+n+"-"+suffix,name:"MT "+n+" "+suffix,seats:2,combinable:true}})));tableIds.push(...tables.map(x=>x.id));
  comboId=(await prisma.restaurantTableCombination.create({data:{companyId:company.id,locationId:location.id,areaId,name:"Combo "+suffix,tables:{create:tableIds.map(tableId=>({tableId}))}}})).id;
  const start=new Date();start.setDate(start.getDate()+30);start.setHours(12,0,0,0);
  serviceId=(await prisma.restaurantServiceWindow.create({data:{companyId:company.id,locationId:location.id,name:"Lunch "+suffix,daysOfWeek:[start.getDay()],startTime:"12:00",endTime:"15:00",slotIntervalMinutes:30,defaultDurationMinutes:60}})).id;
  partnerId=(await prisma.partner.create({data:{companyId:company.id,code:"MTC-"+suffix,name:"Customer "+suffix,isCustomer:true,createdById:userId,updatedById:userId}})).id;
  reservationId=(await prisma.restaurantReservation.create({data:{companyId:company.id,locationId:location.id,code:"MTR-"+suffix,partnerId,guestName:"Multi table",partySize:4,reservationDate:start,startTime:start,endTime:new Date(start.getTime()+3600000),durationMinutes:60,status:"CONFIRMED",serviceWindowId:serviceId,tables:{create:tableIds.map(tableId=>({tableId}))}}})).id;
  categoryId=(await prisma.itemCategory.create({data:{companyId:company.id,code:"MTCAT-"+suffix,name:"MT category",purpose:"SELLABLE",createdById:userId,updatedById:userId}})).id;
  unitId=(await prisma.unitOfMeasure.create({data:{companyId:company.id,code:"MTU-"+suffix,name:"MT unit",symbol:"u",createdById:userId,updatedById:userId}})).id;
  vatId=(await prisma.vatRate.create({data:{companyId:company.id,code:"MTV-"+suffix,name:"MT VAT",percentage:0,createdById:userId,updatedById:userId}})).id;
  const item=await prisma.item.create({data:{companyId:company.id,code:"MTI-"+suffix,name:"MT close",type:"SERVICE",categoryId,unitOfMeasureId:unitId,vatRateId:vatId,salePrice:0,sellable:true,createdById:userId,updatedById:userId}});itemId=item.id;
  seriesId=(await prisma.documentSeries.create({data:{companyId:company.id,locationId:location.id,code:"MTS-"+suffix,name:"MT series",documentType:"SALES_RECEIPT"}})).id;
  accountId=(await prisma.financialAccount.create({data:{companyId:company.id,locationId:location.id,code:"MTF-"+suffix,name:"MT cash",type:"CASH",allowOverdraft:true,createdById:userId,updatedById:userId}})).id;
  expect(await prisma.restaurantReservationTable.count({where:{companyId:company.id,reservationId,tableId:{in:tableIds}}})).toBe(2);
  await page.goto("/login");await page.getByLabel("Email").fill(email);await page.getByLabel("Password").fill(password);await page.getByRole("button",{name:"Accedi"}).click();await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/restaurant/orders/new?reservationId="+reservationId);await page.locator('select[name="reservationId"]').selectOption(reservationId);await page.locator('input[name="guestCount"]').fill("4");await page.getByRole("button",{name:"Apri comanda"}).click();await expect(page).toHaveURL(/\/restaurant\/orders\/(?!new)[^/?]+/);
  orderId=new URL(page.url()).pathname.split("/").filter(Boolean).at(-1)??"";const links=await prisma.restaurantOrderTable.findMany({where:{companyId:company.id,locationId:location.id,orderId},select:{tableId:true}});expect(links).toHaveLength(2);expect(new Set(links.map(x=>x.tableId))).toEqual(new Set(tableIds));
  await page.goto("/restaurant/floor");for(const table of tables)await expect(page.getByText(new RegExp(table.code+".*OCCUPIED"))).toBeVisible();
  await page.goto("/restaurant/orders/new");await page.locator('select[name="tableIds"]').selectOption(tableIds[0]);await page.locator('select[name="partnerId"]').selectOption(partnerId);await page.getByRole("button",{name:"Apri comanda"}).click();await expect(page).toHaveURL(/\/restaurant\/orders\/new\?error=/);expect(await prisma.restaurantOrder.count({where:{companyId:company.id,locationId:location.id,tables:{some:{tableId:tableIds[0]}},status:{notIn:["CLOSED","CANCELLED"]}}})).toBe(1);
  await prisma.restaurantOrderLine.create({data:{companyId:company.id,locationId:location.id,orderId,itemId,productName:item.name,baseUnitPrice:0,quantity:1,unitPrice:0,vatRateId:vatId,vatName:"MT VAT",vatPercentage:0,lineTotal:0,status:"SERVED",servedAt:new Date()}});
  await page.goto("/restaurant/orders/"+orderId);await page.locator('select[name="seriesId"]').selectOption(seriesId);await page.locator('select[name="financialAccountId"]').selectOption(accountId);await page.locator('input[name="amount"]').fill("0");await page.getByRole("button",{name:"Registra conto"}).click();await expect.poll(async()=>(await prisma.restaurantOrder.findUniqueOrThrow({where:{id:orderId}})).status).toBe("CLOSED");
  documentId=(await prisma.restaurantOrder.findUniqueOrThrow({where:{id:orderId},select:{documentId:true}})).documentId??"";expect((await prisma.restaurantTable.findMany({where:{id:{in:tableIds}},select:{status:true}})).map(x=>x.status)).toEqual(["DIRTY","DIRTY"]);
 }finally{
  if(orderId){await prisma.idempotencyRecord.deleteMany({where:{companyId:company.id,aggregateId:orderId}});await prisma.domainEvent.deleteMany({where:{companyId:company.id,aggregateId:orderId}});await prisma.restaurantOrderLine.deleteMany({where:{companyId:company.id,orderId}});await prisma.restaurantOrder.updateMany({where:{id:orderId},data:{documentId:null}});}
  if(documentId){await prisma.paymentSchedule.deleteMany({where:{companyId:company.id,documentId}});await prisma.documentEvent.deleteMany({where:{companyId:company.id,documentId}});await prisma.businessDocumentLine.deleteMany({where:{companyId:company.id,documentId}});await prisma.businessDocument.deleteMany({where:{id:documentId}});}
  if(orderId)await prisma.restaurantOrder.deleteMany({where:{id:orderId}});if(reservationId)await prisma.restaurantReservation.deleteMany({where:{id:reservationId}});if(comboId)await prisma.restaurantTableCombination.deleteMany({where:{id:comboId}});if(serviceId)await prisma.restaurantServiceWindow.deleteMany({where:{id:serviceId}});if(tableIds.length)await prisma.restaurantTable.deleteMany({where:{id:{in:tableIds}}});if(areaId)await prisma.restaurantArea.deleteMany({where:{id:areaId}});
  if(accountId)await prisma.financialAccount.deleteMany({where:{id:accountId}});if(seriesId)await prisma.documentSeries.deleteMany({where:{id:seriesId}});if(itemId)await prisma.item.deleteMany({where:{id:itemId}});if(vatId)await prisma.vatRate.deleteMany({where:{id:vatId}});if(unitId)await prisma.unitOfMeasure.deleteMany({where:{id:unitId}});if(categoryId)await prisma.itemCategory.deleteMany({where:{id:categoryId}});if(partnerId)await prisma.partner.deleteMany({where:{id:partnerId}});
 }
});
