import "server-only";
import {type DocumentLinkType,type DocumentStatus,type DocumentType,Prisma} from "@/generated/prisma/client";import{confirmDocument,createDraft,createDraftTx,duplicateDraft,getDocuments,postDocument,postDocumentTx,type DraftInput}from"@/lib/documents";import{postInventoryMovementTx,validateInventoryMovementTx,type MovementInput}from"@/lib/inventory";import{MODULE_CODES}from"@/lib/module-catalog";import{requireModule}from"@/lib/modules";import{prisma}from"@/lib/prisma";
export class PurchasingDomainError extends Error{constructor(message:string){super(message);this.name="PurchasingDomainError";}}
const TYPES=["PURCHASE_ORDER","GOODS_RECEIPT","PURCHASE_INVOICE","RETURN","CREDIT_NOTE"] satisfies DocumentType[];
const links:Partial<Record<DocumentType,Partial<Record<DocumentType,DocumentLinkType>>>>={PURCHASE_ORDER:{GOODS_RECEIPT:"PURCHASE_ORDER_TO_RECEIPT",PURCHASE_INVOICE:"PURCHASE_ORDER_TO_PURCHASE_INVOICE"},GOODS_RECEIPT:{PURCHASE_INVOICE:"RECEIPT_TO_PURCHASE_INVOICE",RETURN:"RECEIPT_TO_PURCHASE_RETURN"},RETURN:{CREDIT_NOTE:"PURCHASE_RETURN_TO_CREDIT_NOTE"}};
const events:Partial<Record<DocumentType,string>>={PURCHASE_ORDER:"PurchaseOrderCreated",GOODS_RECEIPT:"GoodsReceiptCreated",PURCHASE_INVOICE:"PurchaseInvoiceCreated",RETURN:"PurchaseReturnCreated",CREDIT_NOTE:"PurchaseCreditNoteCreated"};
async function emit(companyId:string,eventType:string,id:string,payload:Prisma.InputJsonValue={}){await prisma.domainEvent.create({data:{companyId,eventType,aggregateType:"BusinessDocument",aggregateId:id,payload:{documentId:id,...payload as object},occurredAt:new Date()}});}
async function seriesFor(companyId:string,locationId:string,type:DocumentType){const row=await prisma.documentSeries.findFirst({where:{companyId,documentType:type,active:true,locationId},select:{id:true},orderBy:{code:"asc"}});if(!row)throw new PurchasingDomainError(`Nessuna serie attiva per ${type}.`);return row.id;}
export function activePurchasingSupplierWhere(companyId:string):Prisma.PartnerWhereInput {
  return {companyId,isSupplier:true,status:"ACTIVE",active:true,deletedAt:null};
}
async function validatePurchaseInput(tx:Prisma.TransactionClient,companyId:string,input:Omit<DraftInput,"seriesId">){const partner=await tx.partner.findFirst({where:{id:input.partnerId,...activePurchasingSupplierWhere(companyId)},select:{id:true}});if(!partner)throw new PurchasingDomainError("Il Partner deve essere un fornitore attivo.");if(!input.lines.length)throw new PurchasingDomainError("È richiesta almeno una riga.");const ids=[...new Set(input.lines.map((line)=>line.itemId))];const items=await tx.item.findMany({where:{companyId,id:{in:ids},purchasable:true,active:true,deletedAt:null},select:{id:true,stockManaged:true,unitOfMeasureId:true,vatRateId:true,suppliers:{where:{companyId,locationId:input.locationId,supplierPartnerId:input.partnerId,active:true},select:{purchaseUomId:true}}}});if(items.length!==ids.length)throw new PurchasingDomainError("Tutti gli Item devono essere acquistabili e appartenere alla Company.");const map=new Map(items.map((item)=>[item.id,item]));for(const line of input.lines){const item=map.get(line.itemId)!;if((item.unitOfMeasureId!==line.unitOfMeasureId&&!item.suppliers.some(x=>x.purchaseUomId===line.unitOfMeasureId))||item.vatRateId!==line.vatRateId)throw new PurchasingDomainError("UOM acquisto o IVA non coerente con Item e supplier.");if(item.stockManaged&&!line.warehouseId&&!input.warehouseId)throw new PurchasingDomainError("Il magazzino è obbligatorio per Item stock-managed.");}return input;}
async function snapshotPurchaseInput(tx:Prisma.TransactionClient,companyId:string,input:Omit<DraftInput,"seriesId">){
  const items=await tx.item.findMany({where:{companyId,id:{in:input.lines.map(x=>x.itemId)}},select:{id:true,unitOfMeasureId:true,suppliers:{where:{locationId:input.locationId,supplierPartnerId:input.partnerId,active:true},select:{purchaseUomId:true,packSize:true}}}});
  const map=new Map(items.map(x=>[x.id,x]));
  return{...input,lines:input.lines.map(line=>{const item=map.get(line.itemId);if(!item?.unitOfMeasureId)throw new PurchasingDomainError("UOM stock mancante.");const link=item.suppliers.find(x=>x.purchaseUomId===line.unitOfMeasureId),factor=line.unitOfMeasureId===item.unitOfMeasureId?1:Number(link?.packSize??0);if(!Number.isFinite(factor)||factor<=0)throw new PurchasingDomainError("Conversione UOM supplier non disponibile.");return{...line,stockUnitOfMeasureId:item.unitOfMeasureId,purchaseConversionFactor:factor};})};
}
export async function preparePurchaseInputTx(tx:Prisma.TransactionClient,companyId:string,input:Omit<DraftInput,"seriesId">){
  await validatePurchaseInput(tx,companyId,input);
  return snapshotPurchaseInput(tx,companyId,input);
}
export async function createPurchaseOrder(companyId:string,userId:string,input:Omit<DraftInput,"seriesId">&{seriesId?:string}){
  const result=await prisma.$transaction(async tx=>{
    const prepared=await preparePurchaseInputTx(tx,companyId,input);
    const series=input.seriesId??(await tx.documentSeries.findFirst({where:{companyId,locationId:input.locationId,documentType:"PURCHASE_ORDER",active:true},orderBy:{code:"asc"},select:{id:true}}))?.id;
    if(!series)throw new PurchasingDomainError("Nessuna serie attiva per PURCHASE_ORDER.");
    return createDraftTx(tx,companyId,userId,{...prepared,seriesId:series});
  },{timeout:15000});
  await emit(companyId,"PurchaseOrderCreated",result.id);return result;
}
export async function confirmPurchaseOrder(companyId:string,userId:string,locationId:string,id:string){const row=await prisma.businessDocument.findFirst({where:{id,companyId,locationId,documentType:"PURCHASE_ORDER",status:"DRAFT",deletedAt:null},select:{id:true}});if(!row)throw new PurchasingDomainError("Ordine fornitore Draft non disponibile.");await confirmDocument(companyId,userId,locationId,id);await emit(companyId,"PurchaseOrderConfirmed",id);return{id};}
export async function convertPurchaseDocument(companyId:string,userId:string,locationId:string,sourceId:string,targetType:DocumentType,quantities?:Record<string,number>){const source=await prisma.businessDocument.findFirst({where:{id:sourceId,companyId,locationId,deletedAt:null},include:{lines:{orderBy:{lineNumber:"asc"}},sourceLinks:{where:{targetDocument:{locationId}},include:{targetDocument:{include:{lines:true}}}}}});if(!source)throw new PurchasingDomainError("Documento sorgente non trovato.");const linkType=links[source.documentType]?.[targetType];if(!linkType)throw new PurchasingDomainError(`Conversione ${source.documentType} → ${targetType} non consentita.`);if(!["CONFIRMED","POSTED"].includes(source.status))throw new PurchasingDomainError("Il documento sorgente deve essere confermato o posted.");const previous=source.sourceLinks.filter((link)=>link.linkType===linkType).flatMap((link)=>link.targetDocument.lines);const converted=new Map<string,number>();for(const line of previous)converted.set(line.itemId,(converted.get(line.itemId)??0)+Number(line.quantity));const selected=source.lines.map((line)=>{const remaining=Number(line.quantity)-(converted.get(line.itemId)??0);const quantity=quantities?.[line.id]??remaining;if(quantity<0||quantity>remaining)throw new PurchasingDomainError("Quantità superiore al residuo ordinato/ricevuto.");return{line,quantity};}).filter((row)=>row.quantity>0);if(!selected.length)throw new PurchasingDomainError("Nessuna quantità residua da convertire.");if(targetType==="GOODS_RECEIPT"&&selected.some(({line})=>!line.warehouseId&&!source.warehouseId))throw new PurchasingDomainError("Magazzino richiesto per il ricevimento.");const target=await createDraft(companyId,userId,{seriesId:await seriesFor(companyId,locationId,targetType),partnerId:source.partnerId,documentDate:new Date(),currency:source.currency,exchangeRate:Number(source.exchangeRate),warehouseId:source.warehouseId,locationId,paymentMethodId:source.paymentMethodId,paymentTermId:source.paymentTermId,priceListId:source.priceListId,notes:source.notes,internalNotes:source.internalNotes,lines:selected.map(({line,quantity})=>({itemId:line.itemId,description:line.description,quantity,unitOfMeasureId:line.unitOfMeasureId,stockUnitOfMeasureId:line.stockUnitOfMeasureId,purchaseConversionFactor:line.purchaseConversionFactor?Number(line.purchaseConversionFactor):null,warehouseBinId:line.warehouseBinId,unitPrice:Number(line.unitPrice),discount:Number(line.discount),vatRateId:line.vatRateId,vatNameSnapshot:line.vatName,vatPercentageSnapshot:Number(line.vatPercentage),warehouseId:line.warehouseId,lotId:line.lotId,serialId:line.serialId,notes:line.notes}))});await prisma.$transaction([prisma.documentLink.create({data:{companyId,sourceDocumentId:sourceId,targetDocumentId:target.id,linkType,createdById:userId}}),prisma.domainEvent.create({data:{companyId,eventType:events[targetType]??"PurchaseDocumentCreated",aggregateType:"BusinessDocument",aggregateId:target.id,payload:{documentId:target.id,sourceDocumentId:sourceId,linkType},occurredAt:new Date()}})]);return target;}
export async function createReceiptFromPurchaseOrder(c:string,u:string,l:string,id:string,q?:Record<string,number>){const invalid=await prisma.businessDocumentLine.count({where:{companyId:c,documentId:id,item:{stockManaged:false}}});if(invalid)throw new PurchasingDomainError("Il ricevimento fisico accetta soltanto Item stock-managed.");return convertPurchaseDocument(c,u,l,id,"GOODS_RECEIPT",q);}export const createPurchaseInvoiceFromReceipt=(c:string,u:string,l:string,id:string)=>convertPurchaseDocument(c,u,l,id,"PURCHASE_INVOICE");export const createPurchaseInvoiceFromOrder=(c:string,u:string,l:string,id:string)=>convertPurchaseDocument(c,u,l,id,"PURCHASE_INVOICE");export const createCreditNoteFromReturn=(c:string,u:string,l:string,id:string)=>convertPurchaseDocument(c,u,l,id,"CREDIT_NOTE");
export async function postGoodsReceipt(companyId: string, userId: string, locationId: string, id: string) {
  await requireModule(companyId, MODULE_CODES.CORE_INVENTORY);
  return prisma.$transaction(async (tx) => {
    // Lock only the document belonging to this tenant/location; concurrent posting
    // either observes the completed state or fails serialization without writes.
    await tx.$queryRaw`SELECT "id" FROM "BusinessDocument"
      WHERE "id" = ${id} AND "companyId" = ${companyId} AND "locationId" = ${locationId}
      FOR UPDATE`;
    const doc = await tx.businessDocument.findFirst({
      where: { id, companyId, locationId, documentType: "GOODS_RECEIPT", status: "CONFIRMED", deletedAt: null },
      include: { lines: { orderBy: { lineNumber: "asc" }, include: { item: { select: { stockManaged: true, purchasable: true, unitOfMeasureId: true } } } } },
    });
    if (!doc) throw new PurchasingDomainError("Solo un ricevimento confermato può essere posted.");

    const movements: MovementInput[] = [];
    for (const line of doc.lines) {
      if (!line.item.stockManaged) continue;
      const exists = await tx.inventoryMovement.count({
        where: { companyId, locationId, referenceType: "BusinessDocumentLine", referenceId: line.id, movementType: "RECEIPT" },
      });
      if (exists) continue;
      const factor = Number(line.purchaseConversionFactor ?? 0), stockUom = line.stockUnitOfMeasureId;
      if (!stockUom || !Number.isFinite(factor) || factor <= 0) throw new PurchasingDomainError("Snapshot conversione UOM mancante o non valido.");
      const input: MovementInput = {
        locationId, warehouseId: line.warehouseId ?? doc.warehouseId ?? "", binId: line.warehouseBinId,
        itemId: line.itemId, movementType: "RECEIPT", quantity: Number(line.quantity) * factor,
        unitOfMeasureId: stockUom, lotId: line.lotId, serialId: line.serialId,
        unitCost: Number(line.unitPrice) / factor, referenceType: "BusinessDocumentLine", referenceId: line.id,
        reason: `Ricevimento ${doc.documentNumber}`,
      };
      // Read-only preflight of every row; database failures during posting still
      // roll back the whole receipt, including stock, tracking and events.
      await validateInventoryMovementTx(tx, companyId, input);
      movements.push(input);
    }
    for (const input of movements) await postInventoryMovementTx(tx, companyId, userId, input);
    await postDocumentTx(tx, companyId, userId, locationId, id);
    await tx.domainEvent.create({ data: {
      companyId, eventType: "GoodsReceiptPosted", aggregateType: "BusinessDocument", aggregateId: id,
      payload: { documentId: id }, occurredAt: new Date(),
    } });
    return { id };
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
export async function postPurchaseInvoice(companyId:string,userId:string,locationId:string,id:string){const row=await prisma.businessDocument.findFirst({where:{id,companyId,locationId,documentType:"PURCHASE_INVOICE",status:"CONFIRMED",deletedAt:null},select:{id:true}});if(!row)throw new PurchasingDomainError("Solo una fattura passiva confermata può essere posted.");await postDocument(companyId,userId,locationId,id);await emit(companyId,"PurchaseInvoicePosted",id);await emit(companyId,"PurchaseCycleClosed",id);return{id};}
export async function createPurchaseReturn(companyId:string,userId:string,locationId:string,sourceId:string,quantities?:Record<string,number>){const result=await convertPurchaseDocument(companyId,userId,locationId,sourceId,"RETURN",quantities);return result;}
export async function postPurchaseReturn(companyId: string, userId: string, locationId: string, id: string) {
  await requireModule(companyId, MODULE_CODES.CORE_INVENTORY);
  return prisma.$transaction(async (tx) => {
    // Lock only the document belonging to this tenant/location; concurrent posting
    // either observes the completed state or fails serialization without writes.
    await tx.$queryRaw`SELECT "id" FROM "BusinessDocument"
      WHERE "id" = ${id} AND "companyId" = ${companyId} AND "locationId" = ${locationId}
      FOR UPDATE`;
    const doc = await tx.businessDocument.findFirst({
      where: { id, companyId, locationId, documentType: "RETURN", status: "CONFIRMED", deletedAt: null },
      include: { lines: { orderBy: { lineNumber: "asc" }, include: { item: { select: { stockManaged: true, purchasable: true, unitOfMeasureId: true } } } } },
    });
    if (!doc) throw new PurchasingDomainError("Solo un reso confermato può essere posted.");

    const movements: MovementInput[] = [];
    for (const line of doc.lines) {
      if (!line.item.stockManaged) continue;
      const exists = await tx.inventoryMovement.count({
        where: { companyId, locationId, referenceType: "BusinessDocumentLine", referenceId: line.id, movementType: "RETURN_OUT" },
      });
      if (exists) continue;
      const factor = Number(line.purchaseConversionFactor ?? 0), stockUom = line.stockUnitOfMeasureId;
      if (!stockUom || !Number.isFinite(factor) || factor <= 0) throw new PurchasingDomainError("Snapshot conversione UOM mancante o non valido.");
      const input: MovementInput = {
        locationId, warehouseId: line.warehouseId ?? doc.warehouseId ?? "", binId: line.warehouseBinId,
        itemId: line.itemId, movementType: "RETURN_OUT", quantity: Number(line.quantity) * factor,
        unitOfMeasureId: stockUom, lotId: line.lotId, serialId: line.serialId,
        referenceType: "BusinessDocumentLine", referenceId: line.id,
        reason: `Reso ${doc.documentNumber}`,
      };
      // Read-only preflight of every row; database failures during posting still
      // roll back the whole return, including stock, tracking and events.
      await validateInventoryMovementTx(tx, companyId, input);
      movements.push(input);
    }
    for (const input of movements) await postInventoryMovementTx(tx, companyId, userId, input);
    await postDocumentTx(tx, companyId, userId, locationId, id);
    await tx.domainEvent.create({ data: {
      companyId, eventType: "PurchaseReturnPosted", aggregateType: "BusinessDocument", aggregateId: id,
      payload: { documentId: id }, occurredAt: new Date(),
    } });
    return { id };
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
export async function duplicatePurchaseOrder(companyId:string,userId:string,locationId:string,id:string){const source=await prisma.businessDocument.count({where:{id,companyId,locationId,documentType:"PURCHASE_ORDER",deletedAt:null}});if(!source)throw new PurchasingDomainError("Ordine da duplicare non trovato.");const copy=await duplicateDraft(companyId,userId,locationId,id);await emit(companyId,"PurchaseOrderCreated",copy.id,{duplicatedFromId:id});return copy;}
export async function getPurchaseDocuments(companyId:string,locationId:string,filters:{query?:string;documentType?:DocumentType;status?:DocumentStatus;partnerId?:string;seriesId?:string;from?:Date;to?:Date;page?:number}={}){if(filters.documentType&&(TYPES as readonly DocumentType[]).includes(filters.documentType))return getDocuments(companyId,locationId,filters);return getDocuments(companyId,locationId,{...filters,documentType:"PURCHASE_ORDER"});}
export async function getOpenPurchaseOrders(companyId:string,locationId:string){return prisma.businessDocument.findMany({where:{companyId,locationId,documentType:"PURCHASE_ORDER",status:{in:["DRAFT","CONFIRMED"]},deletedAt:null},select:{id:true,documentNumber:true,total:true,documentDate:true,partner:{select:{name:true,displayName:true}}},orderBy:{documentDate:"desc"}});}
export async function getReceiptsToInvoice(companyId:string,locationId:string){return prisma.businessDocument.findMany({where:{companyId,locationId,documentType:"GOODS_RECEIPT",status:"POSTED",sourceLinks:{none:{linkType:"RECEIPT_TO_PURCHASE_INVOICE",targetDocument:{locationId}}},deletedAt:null},select:{id:true,documentNumber:true,total:true,partner:{select:{name:true,displayName:true}}},orderBy:{documentDate:"desc"}});}
export async function getPurchaseDocument(companyId:string,locationId:string,id:string){return prisma.businessDocument.findFirst({where:{id,companyId,locationId,documentType:{in:TYPES},deletedAt:null},include:{series:true,partner:{select:{name:true,displayName:true,isSupplier:true}},lines:{include:{item:{select:{code:true,name:true,stockManaged:true}},unitOfMeasure:{select:{symbol:true}}},orderBy:{lineNumber:"asc"}},sourceLinks:{where:{targetDocument:{locationId}},include:{targetDocument:{select:{id:true,documentNumber:true,documentType:true}}}},targetLinks:{where:{sourceDocument:{locationId}},include:{sourceDocument:{select:{id:true,documentNumber:true,documentType:true}}}}}});}
export async function getPurchasingDashboard(companyId:string,locationId:string){const start=new Date();start.setDate(1);start.setHours(0,0,0,0);const[open,receipts,invoices,recent,suppliers]=await Promise.all([getOpenPurchaseOrders(companyId,locationId),getReceiptsToInvoice(companyId,locationId),prisma.businessDocument.aggregate({where:{companyId,locationId,documentType:"PURCHASE_INVOICE",documentDate:{gte:start},deletedAt:null},_sum:{total:true},_count:true}),prisma.businessDocument.findMany({where:{companyId,locationId,documentType:{in:TYPES},deletedAt:null},select:{id:true,documentType:true,documentNumber:true,total:true},orderBy:{createdAt:"desc"},take:6}),prisma.businessDocument.groupBy({by:["partnerId"],where:{companyId,locationId,documentType:"PURCHASE_INVOICE",deletedAt:null},_sum:{total:true},orderBy:{_sum:{total:"desc"}},take:5})]);return{openOrders:open.length,overdueOrders:0,receiptsToComplete:await prisma.businessDocument.count({where:{companyId,locationId,documentType:"GOODS_RECEIPT",status:{in:["DRAFT","CONFIRMED"]},deletedAt:null}}),receiptsToInvoice:receipts.length,invoicesMonth:Number(invoices._sum.total??0),invoiceCount:invoices._count,purchaseValue:open.reduce((sum,row)=>sum+Number(row.total),0),recent,topSupplierCount:suppliers.length};}
