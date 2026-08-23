import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { confirmDocument, createDraft, postDocument } from "../../lib/documents";
import { allocateMovementToSchedule, createFinancialAccount, createFinancialMovementTx, createManualSchedule, getFinancialMovement, getFinancialMovements, getOpenReceivables, registerCustomerReceipt, registerSupplierPayment, TreasuryDomainError } from "../../lib/treasury";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Treasury richiedono un DATABASE_URL dedicato contenente _test.");
let companyId="",otherCompanyId="",userId="",locationA="",locationB="",partnerId="",supplierId="",itemId="",unitId="",vatId="",seriesId="",termId="",accountA="",accountB="",documentId="",documentScheduleId="";
const scheduleIds:string[]=[],movementIds:string[]=[],accountIds:string[]=[],locationIds:string[]=[];

before(async()=>{
  companyId=(await prisma.company.findUniqueOrThrow({where:{vatNumber:"IT00000000000"}})).id;
  userId=(await prisma.user.findFirstOrThrow({where:{memberships:{some:{companyId}}},select:{id:true}})).id;
  const s=randomUUID().slice(0,8);
  const [a,b,partner,supplier,unit,vat]=await Promise.all([
    prisma.location.create({data:{companyId,code:`TR-A-${s}`,name:"Treasury A"}}), prisma.location.create({data:{companyId,code:`TR-B-${s}`,name:"Treasury B"}}),
    prisma.partner.create({data:{companyId,code:`TR-C-${s}`,name:"Treasury Customer",isCustomer:true}}), prisma.partner.create({data:{companyId,code:`TR-S-${s}`,name:"Treasury Supplier",isSupplier:true}}),
    prisma.unitOfMeasure.create({data:{companyId,code:`TU-${s}`,name:"Unità Treasury",symbol:"pz"}}), prisma.vatRate.create({data:{companyId,code:`TV-${s}`,name:"IVA Treasury",percentage:22}}),
  ]);
  locationA=a.id; locationB=b.id; partnerId=partner.id; supplierId=supplier.id; unitId=unit.id; vatId=vat.id; locationIds.push(a.id,b.id);
  itemId=(await prisma.item.create({data:{companyId,code:`TI-${s}`,name:"Item Treasury",type:"SERVICE",unitOfMeasureId:unit.id,vatRateId:vat.id,salePrice:100}})).id;
  const [series,term]=await Promise.all([prisma.documentSeries.create({data:{companyId,locationId:a.id,code:`TS-${s}`,name:"Serie Treasury",documentType:"SALES_INVOICE"}}),prisma.paymentTerm.create({data:{companyId,code:`TT-${s}`,name:"Pagamento Treasury",dueDays:30}})]); seriesId=series.id; termId=term.id;
  accountA=(await createFinancialAccount(companyId,locationA,userId,{code:`TA-${s}`,name:"Cassa A",type:"CASH",allowOverdraft:true})).id;
  accountB=(await createFinancialAccount(companyId,locationB,userId,{code:`TB-${s}`,name:"Cassa B",type:"CASH",allowOverdraft:true})).id; accountIds.push(accountA,accountB);
  const draft=await createDraft(companyId,userId,{seriesId,partnerId,paymentTermId:termId,documentDate:new Date(),currency:"EUR",locationId:locationA,lines:[{itemId,quantity:1,unitOfMeasureId:unitId,unitPrice:100,vatRateId:vatId}]}); documentId=draft.id;
  await confirmDocument(companyId,userId,locationA,draft.id); await postDocument(companyId,userId,locationA,draft.id);
  documentScheduleId=(await prisma.paymentSchedule.findFirstOrThrow({where:{companyId,locationId:locationA,documentId:draft.id}})).id; scheduleIds.push(documentScheduleId);
  otherCompanyId=(await prisma.company.create({data:{name:`Treasury tenant ${randomUUID()}`}})).id;
});

after(async()=>{
  if(movementIds.length)await prisma.financialAllocation.deleteMany({where:{movementId:{in:movementIds}}});
  if(movementIds.length)await prisma.financialMovement.deleteMany({where:{id:{in:movementIds}}});
  if(scheduleIds.length)await prisma.paymentSchedule.deleteMany({where:{id:{in:scheduleIds}}});
  if(documentId)await prisma.businessDocument.delete({where:{id:documentId}}); if(accountIds.length)await prisma.financialAccount.deleteMany({where:{id:{in:accountIds}}});
  if(seriesId)await prisma.documentSeries.delete({where:{id:seriesId}}); if(termId)await prisma.paymentTerm.delete({where:{id:termId}}); if(itemId)await prisma.item.delete({where:{id:itemId}});
  await prisma.partner.deleteMany({where:{id:{in:[partnerId,supplierId]}}}); if(vatId)await prisma.vatRate.delete({where:{id:vatId}}); if(unitId)await prisma.unitOfMeasure.delete({where:{id:unitId}});
  if(locationIds.length)await prisma.location.deleteMany({where:{id:{in:locationIds}}}); if(otherCompanyId)await prisma.company.delete({where:{id:otherCompanyId}}); await prisma.$disconnect();
});

test("Treasury: posting Documents crea schedule nella Location A",async()=>{
  const row=await prisma.paymentSchedule.findUniqueOrThrow({where:{id:documentScheduleId}}); assert.equal(row.locationId,locationA); assert.equal(row.documentId,documentId);
});

test("Treasury: movimento, allocazione e lettura sono isolati per Location",async()=>{
  const schedule=await createManualSchedule(companyId,userId,{locationId:locationA,partnerId,direction:"RECEIVABLE",dueDate:new Date(),amount:40}); scheduleIds.push(schedule.id);
  const movement=await prisma.$transaction(tx=>createFinancialMovementTx(tx,companyId,userId,"CUSTOMER_RECEIPT","IN",{locationId:locationA,financialAccountId:accountA,partnerId,amount:40})); movementIds.push(movement.id);
  await allocateMovementToSchedule(companyId,locationA,userId,movement.id,schedule.id,40);
  assert.equal((await prisma.financialAllocation.findFirstOrThrow({where:{movementId:movement.id,scheduleId:schedule.id}})).locationId,locationA);
  assert.equal(await getFinancialMovement(companyId,locationB,movement.id),null); assert.equal((await getFinancialMovements(companyId,locationB)).some(r=>r.id===movement.id),false);
});

test("Treasury: incasso e pagamento cross-location sono rifiutati",async()=>{
  await assert.rejects(registerCustomerReceipt(companyId,userId,{locationId:locationB,financialAccountId:accountA,scheduleId:documentScheduleId,amount:10}),TreasuryDomainError);
  const payable=await createManualSchedule(companyId,userId,{locationId:locationA,partnerId:supplierId,direction:"PAYABLE",dueDate:new Date(),amount:10}); scheduleIds.push(payable.id);
  await assert.rejects(registerSupplierPayment(companyId,userId,{locationId:locationB,financialAccountId:accountB,scheduleId:payable.id,amount:10}),TreasuryDomainError);
});

test("Treasury: schedule/document cross-location e isolamento tenant sono rifiutati",async()=>{
  await assert.rejects(createManualSchedule(companyId,userId,{locationId:locationB,partnerId,documentId,documentType:"SALES_INVOICE",direction:"RECEIVABLE",dueDate:new Date(),amount:10}),TreasuryDomainError);
  await assert.rejects(registerCustomerReceipt(companyId,userId,{locationId:locationB,financialAccountId:accountB,documentId,amount:10}),TreasuryDomainError);
  assert.deepEqual(await getOpenReceivables(otherCompanyId,locationA),[]); assert.equal(await getFinancialMovement(otherCompanyId,locationA,documentScheduleId),null);
});

test("Treasury: account globali legacy assenti",async()=>{
  const rows=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT count(*)::bigint AS count FROM "FinancialAccount" WHERE "companyId"=${companyId} AND "locationId" IS NULL`;
  assert.equal(Number(rows[0].count),0);
});
