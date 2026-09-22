import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { checkAvailability } from "../../lib/restaurant-availability";
import { assignTable, createReservation, newCancellationToken, createStaffReservation, getAssignableTables, RestaurantBookingError, transitionReservation } from "../../lib/restaurant-booking";
import { openOrder, reassignOrderTables } from "../../lib/restaurant-orders";
import { saveCalendarException, saveRestaurantBookingSettings, saveServiceWindow } from "../../lib/restaurant-booking-settings";
import { RestaurantFloorError, saveTableCombination } from "../../lib/restaurant-floor";
import { FloorConfigError, saveFloorLayout, saveFloorTable } from "../../lib/restaurant-floor-config";
import { prisma } from "../../lib/prisma";
if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Floor V2 richiedono DATABASE_URL _test.");
const suffix=randomUUID().slice(0,8).toUpperCase();let companyId="",locationA="",userId="",areaA="",areaB="",table1="",table2="",tableB="";const reservationIds:string[]=[],orderIds:string[]=[];
function future(days:number,hour:number){const d=new Date();d.setDate(d.getDate()+days);d.setHours(hour,0,0,0);return d}
before(async()=>{const company=await prisma.company.create({data:{name:"Floor V2 "+suffix}});companyId=company.id;const[a,b]=await Promise.all([prisma.location.create({data:{companyId,code:"FA-"+suffix,name:"Floor A"}}),prisma.location.create({data:{companyId,code:"FB-"+suffix,name:"Floor B"}})]);locationA=a.id;userId=(await prisma.user.create({data:{email:`floorv2-${suffix.toLowerCase()}@test.invalid`,firstName:"Floor",lastName:"V2",password:"unused"}})).id;await prisma.membership.create({data:{companyId,userId,active:true,isDefault:true}});const[aa,ab]=await Promise.all([prisma.restaurantArea.create({data:{companyId,locationId:a.id,code:"AA-"+suffix,name:"Sala A"}}),prisma.restaurantArea.create({data:{companyId,locationId:b.id,code:"AB-"+suffix,name:"Sala B"}})]);areaA=aa.id;areaB=ab.id;const[t1,t2,tb]=await Promise.all([prisma.restaurantTable.create({data:{companyId,locationId:a.id,areaId:aa.id,code:"T1-"+suffix,name:"T1",seats:2}}),prisma.restaurantTable.create({data:{companyId,locationId:a.id,areaId:aa.id,code:"T2-"+suffix,name:"T2",seats:2}}),prisma.restaurantTable.create({data:{companyId,locationId:b.id,areaId:ab.id,code:"TB-"+suffix,name:"TB",seats:4}})]);table1=t1.id;table2=t2.id;tableB=tb.id;await saveRestaurantBookingSettings(companyId,locationA,{enabled:true,openingHours:{},slotIntervalMinutes:30,defaultDurationMinutes:60,minAdvanceMinutes:0,maxAdvanceDays:90,maxCoversPerSlot:20,bufferBeforeMinutes:15,bufferAfterMinutes:15,confirmationPolicy:"MANUAL",cancellationEnabled:true,cancellationDeadlineMinutes:60,customerCancellationMessage:null,noShowThresholdMinutes:30,internalNotificationEmail:null,confirmationMessage:null,cancellationMessage:null})});
after(async()=>{await prisma.restaurantOrderTable.deleteMany({where:{orderId:{in:orderIds}}});await prisma.restaurantOrder.deleteMany({where:{id:{in:orderIds}}});await prisma.restaurantReservationTable.deleteMany({where:{reservationId:{in:reservationIds}}});await prisma.restaurantReservation.deleteMany({where:{id:{in:reservationIds}}});await prisma.restaurantTableCombinationTable.deleteMany({where:{companyId}});await prisma.restaurantTableCombination.deleteMany({where:{companyId}});await prisma.restaurantCalendarException.deleteMany({where:{companyId}});await prisma.restaurantServiceWindow.deleteMany({where:{companyId}});await prisma.restaurantBookingSettings.deleteMany({where:{companyId}});await prisma.auditLog.deleteMany({where:{companyId}});await prisma.restaurantTable.deleteMany({where:{companyId}});await prisma.restaurantArea.deleteMany({where:{companyId}});await prisma.membership.deleteMany({where:{companyId}});await prisma.location.deleteMany({where:{companyId}});await prisma.company.delete({where:{id:companyId}});await prisma.$disconnect()});
test("Floor V2: salva coordinate, dimensioni, forma e rotazione",async()=>{
  const actor={companyId,locationId:locationA,userId};
  const base={areaId:areaA,name:"T1",seats:2,sortOrder:0,active:true,visibleInFloor:true,fusionTableNumber:null};
  await saveFloorTable(actor,{...base,id:table1,code:"T1-"+suffix,shape:"RECTANGLE",positionX:120,positionY:80,width:100,height:70,rotation:90});
  const row=await prisma.restaurantTable.findUniqueOrThrow({where:{id:table1}});
  assert.equal(Number(row.positionX),120);assert.equal(Number(row.positionY),80);assert.equal(Number(row.rotation),90);assert.equal(row.shape,"RECTANGLE");
  // Rotazione libera rifiutata dal dominio prima del CHECK di database.
  await assert.rejects(saveFloorTable(actor,{...base,id:table1,code:"T1-"+suffix,shape:"RECTANGLE",positionX:120,positionY:80,width:100,height:70,rotation:15}),FloorConfigError);
  // Tondi e quadrati devono avere lati uguali, anche via salvataggio pianta.
  await assert.rejects(saveFloorTable(actor,{...base,id:table1,code:"T1-"+suffix,shape:"ROUND",positionX:120,positionY:80,width:100,height:70,rotation:0}),FloorConfigError);
  await saveFloorTable(actor,{...base,id:table1,code:"T1-"+suffix,shape:"RECTANGLE",positionX:40,positionY:40,width:120,height:80,rotation:0});
});
test("Floor V2: layout cross-location negato",async()=>{
  const actor={companyId,locationId:locationA,userId};
  // Tavolo di un'altra sede: la sala non appartiene alla Location corrente.
  await assert.rejects(saveFloorTable(actor,{areaId:areaB,id:tableB,code:"TB-"+suffix,name:"TB",seats:2,shape:"SQUARE",positionX:1,positionY:1,width:80,height:80,rotation:0,sortOrder:0,active:true,visibleInFloor:true,fusionTableNumber:null}),FloorConfigError);
  const area=await prisma.restaurantArea.findUniqueOrThrow({where:{id:areaA},select:{updatedAt:true}});
  await assert.rejects(saveFloorLayout(actor,areaA,area.updatedAt,[{id:tableB,positionX:10,positionY:10,width:80,height:80,rotation:0}]),FloorConfigError);
});
test("Floor V2: combinazione valida e cross-location negata",async()=>{const row=await saveTableCombination(companyId,locationA,{name:"Combo "+suffix,tableIds:[table1,table2],active:true});assert.ok(row.id);await assert.rejects(saveTableCombination(companyId,locationA,{name:"Bad "+suffix,tableIds:[table1,tableB],active:true}),RestaurantFloorError)});
test("Floor V2: servizio pranzo e servizio inattivo",async()=>{const start=future(20,12),day=start.getDay();const lunch=await saveServiceWindow(companyId,locationA,{name:"Pranzo",daysOfWeek:[day],startTime:"12:00",endTime:"15:00",slotIntervalMinutes:30,defaultDurationMinutes:60,maxCovers:10,bufferBeforeMinutes:15,bufferAfterMinutes:15,active:true});assert.equal((await checkAvailability(companyId,locationA,{startTime:start,partySize:4,serviceWindowId:lunch.id})).available,true);const inactive=await prisma.restaurantServiceWindow.create({data:{companyId,locationId:locationA,name:"Inactive",daysOfWeek:[day],startTime:"18:00",endTime:"19:00",slotIntervalMinutes:30,defaultDurationMinutes:60,active:false}});await assert.rejects(checkAvailability(companyId,locationA,{startTime:future(20,18),partySize:2,serviceWindowId:inactive.id}),/non attivo/)});
test("Floor V2: chiusura ed eccezioni sovrapposte negate",async()=>{const start=future(21,12);await saveCalendarException(companyId,locationA,{date:start,type:"CLOSED",intervals:[],maxCovers:null,reason:"Chiusura",active:true});await assert.rejects(checkAvailability(companyId,locationA,{startTime:start,partySize:2}),/chiusa/);await assert.rejects(saveCalendarException(companyId,locationA,{date:future(22,12),type:"OVERRIDE_HOURS",intervals:[["12:00","15:00"],["14:00","16:00"]],maxCovers:null,reason:null,active:true}),/sovrapposti/)});
test("Floor V2: ordine multi-table propaga prenotazione e riassegna",async()=>{const start=future(40,12);const reservation=await prisma.restaurantReservation.create({data:{companyId,locationId:locationA,code:"PROP-"+suffix,guestName:"Propagazione",partySize:4,reservationDate:start,startTime:start,endTime:new Date(start.getTime()+3600000),status:"CONFIRMED",tables:{create:[{tableId:table1},{tableId:table2}]}},select:{id:true}});reservationIds.push(reservation.id);const order=await openOrder(companyId,locationA,userId,{reservationId:reservation.id,guestCount:4,serviceType:"DINE_IN"});orderIds.push(order.id);assert.equal(await prisma.restaurantOrderTable.count({where:{orderId:order.id}}),2);await reassignOrderTables(companyId,locationA,order.id,[table1]);assert.deepEqual((await prisma.restaurantOrderTable.findMany({where:{orderId:order.id},select:{tableId:true}})).map(x=>x.tableId),[table1]);await prisma.restaurantOrder.update({where:{id:order.id},data:{status:"CLOSED"}});await prisma.restaurantTable.updateMany({where:{id:{in:[table1,table2]}},data:{physicalStatus:"READY"}})});
test("Floor V2: due ordini concorrenti stesso tavolo hanno un solo vincitore",async()=>{const results=await Promise.allSettled([openOrder(companyId,locationA,userId,{tableId:table1,guestCount:2,serviceType:"DINE_IN"}),openOrder(companyId,locationA,userId,{tableId:table1,guestCount:2,serviceType:"DINE_IN"})]);const won=results.filter(x=>x.status==="fulfilled");assert.equal(won.length,1);if(won[0].status==="fulfilled")orderIds.push(won[0].value.id);for(const x of won)if(x.status==="fulfilled")await prisma.restaurantOrder.update({where:{id:x.value.id},data:{status:"CLOSED"}});await prisma.restaurantTable.update({where:{id:table1},data:{physicalStatus:"READY"}})});
test("Floor V2: prenotazione singola contro combinazione ha un solo vincitore",async()=>{const start=future(50,12),results=await Promise.allSettled([createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(),locationId:locationA,guestName:"Single race",partySize:2,startTime:start,tableId:table1}),createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(),locationId:locationA,guestName:"Combo race",partySize:4,startTime:start,tableIds:[table1,table2]})]);const won=results.filter(x=>x.status==="fulfilled");assert.equal(won.length,1);for(const x of won)if(x.status==="fulfilled")reservationIds.push(x.value.reservationId)});
test("Floor V2: promozione waitlist concorrente ha un solo vincitore",async()=>{const start=future(60,12);await prisma.restaurantTable.update({where:{id:table2},data:{physicalStatus:"OUT_OF_SERVICE"}});const rows=await Promise.all(["A","B"].map(code=>prisma.restaurantReservation.create({data:{companyId,locationId:locationA,code:"WAIT-"+code+suffix,guestName:"Wait "+code,partySize:2,reservationDate:start,startTime:start,endTime:new Date(start.getTime()+3600000),status:"WAITLIST"},select:{id:true}})));reservationIds.push(...rows.map(x=>x.id));const results=await Promise.allSettled(rows.map(x=>transitionReservation(companyId,locationA,x.id,"CONFIRMED")));assert.equal(results.filter(x=>x.status==="fulfilled").length,1);await prisma.restaurantTable.update({where:{id:table2},data:{physicalStatus:"READY"}})});
test("Floor V2: buffer impedisce doppia occupazione",async()=>{const start=future(30,12);const first=await createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(),locationId:locationA,guestName:"Buffer One",partySize:4,startTime:start,tableIds:[table1,table2]});reservationIds.push(first.reservationId);await assert.rejects(createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(),locationId:locationA,guestName:"Buffer Two",partySize:2,startTime:new Date(start.getTime()+70*60000),tableId:table1}),/disponibile/)});
test("Floor V2: prenotazione multi-table prevale sui tavoli parziali inviati dal client",async()=>{const start=future(41,12);const reservation=await prisma.restaurantReservation.create({data:{companyId,locationId:locationA,code:"KEEP-"+suffix,guestName:"Conserva tavoli",partySize:4,reservationDate:start,startTime:start,endTime:new Date(start.getTime()+3600000),status:"CONFIRMED",tables:{create:[{tableId:table1},{tableId:table2}]}},select:{id:true}});reservationIds.push(reservation.id);const order=await openOrder(companyId,locationA,userId,{reservationId:reservation.id,tableIds:[table1],guestCount:4,serviceType:"DINE_IN"});orderIds.push(order.id);assert.deepEqual(new Set((await prisma.restaurantOrderTable.findMany({where:{orderId:order.id},select:{tableId:true}})).map(x=>x.tableId)),new Set([table1,table2]));await prisma.restaurantOrder.update({where:{id:order.id},data:{status:"CLOSED"}});await prisma.restaurantTable.updateMany({where:{id:{in:[table1,table2]}},data:{physicalStatus:"READY"}})});
test("Floor V2: prenotazione senza tavoli non apre una comanda",async()=>{const start=future(42,12);const reservation=await prisma.restaurantReservation.create({data:{companyId,locationId:locationA,code:"EMPTY-"+suffix,guestName:"Senza tavolo",partySize:2,reservationDate:start,startTime:start,endTime:new Date(start.getTime()+3600000),status:"CONFIRMED"},select:{id:true}});reservationIds.push(reservation.id);await assert.rejects(openOrder(companyId,locationA,userId,{reservationId:reservation.id,tableIds:[table1],guestCount:2,serviceType:"DINE_IN"}),/non ha tavoli assegnati/)});
test("Floor V2: comanda libera rispetta lo stato fisico",async()=>{
  // Lo stato fisico decide: DA RIASSETTARE e FUORI SERVIZIO bloccano.
  for(const physicalStatus of ["DIRTY","OUT_OF_SERVICE"] as const){
    await prisma.restaurantTable.update({where:{id:table1},data:{physicalStatus}});
    await assert.rejects(openOrder(companyId,locationA,userId,{tableId:table1,guestCount:2,serviceType:"DINE_IN"}),/non disponibile|non appartengono/);
  }
  // Ripristino: i test successivi si aspettano un tavolo utilizzabile.
  await prisma.restaurantTable.update({where:{id:table1},data:{physicalStatus:"READY"}});
});
test("Floor V2: ordine singolo contro combinazione concorrente ha un solo vincitore",async()=>{const results=await Promise.allSettled([openOrder(companyId,locationA,userId,{tableId:table1,guestCount:2,serviceType:"DINE_IN"}),openOrder(companyId,locationA,userId,{tableIds:[table1,table2],guestCount:4,serviceType:"DINE_IN"})]);const won=results.filter(x=>x.status==="fulfilled");assert.equal(won.length,1);for(const x of won)if(x.status==="fulfilled"){orderIds.push(x.value.id);await prisma.restaurantOrder.update({where:{id:x.value.id},data:{status:"CLOSED"}});}await prisma.restaurantTable.updateMany({where:{id:{in:[table1,table2]}},data:{physicalStatus:"READY"}})});
test("Floor V2: due prenotazioni concorrenti sullo stesso tavolo hanno un solo vincitore",async()=>{const start=future(49,12),results=await Promise.allSettled(["A","B"].map(name=>createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(),locationId:locationA,guestName:"Same "+name,partySize:2,startTime:start,tableId:table1})));const won=results.filter(x=>x.status==="fulfilled");assert.equal(won.length,1);for(const x of won)if(x.status==="fulfilled")reservationIds.push(x.value.reservationId)});

test("Floor V2: prenotazione staff su tavoli espliciti, con override e senza duplicazione di servizio",async()=>{
  const start=future(70,19),end=new Date(start.getTime()+3600000);
  const base={guestName:"Staff Diretta",partySize:2,startTime:start,endTime:end,source:"PHONE" as const,tableIds:[table1]};
  // Tavolo di un'altra sede rifiutato.
  await assert.rejects(createStaffReservation(companyId,locationA,userId,{...base,tableIds:[tableB]}),RestaurantBookingError);
  // Capienza insufficiente rifiutata.
  await assert.rejects(createStaffReservation(companyId,locationA,userId,{...base,partySize:99}),RestaurantBookingError);
  // Creazione diretta con stato forzato, senza passare dal motore di disponibilità.
  const created=await createStaffReservation(companyId,locationA,userId,{...base,status:"CONFIRMED"});
  reservationIds.push(created.id);
  const row=await prisma.restaurantReservation.findUniqueOrThrow({where:{id:created.id},include:{tables:true}});
  assert.equal(row.status,"CONFIRMED");
  assert.equal(row.source,"PHONE");
  assert.deepEqual(row.tables.map(t=>t.tableId),[table1]);
  assert.equal(row.durationMinutes,60);
  assert.match(row.code,/^RES-[0-9A-F]{12}$/,"il codice usa entropia, non il timestamp");
  // Sovrapposizione sullo stesso tavolo rifiutata...
  await assert.rejects(createStaffReservation(companyId,locationA,userId,base),RestaurantBookingError);
  // ...ma l'override amministrativo la consente.
  const forced=await createStaffReservation(companyId,locationA,userId,{...base,adminOverride:true});
  reservationIds.push(forced.id);
  assert.notEqual(forced.code,created.code);
  // L'evento di dominio è emesso nella stessa transazione.
  assert.equal(await prisma.domainEvent.count({where:{companyId,aggregateId:created.id,eventType:"RestaurantReservationCreated"}}),1);
  for(const id of [created.id,forced.id]) await prisma.restaurantReservationTable.deleteMany({where:{reservationId:id}});
});

test("Floor V2: assegnazione tavolo usa lo stato fisico e deriva quello esposto",async()=>{
  const start=future(80,20),end=new Date(start.getTime()+3600000);
  const resv=await createStaffReservation(companyId,locationA,userId,{guestName:"Assegnazione",partySize:2,startTime:start,endTime:end,source:"PHONE"});
  reservationIds.push(resv.id);
  await assignTable(companyId,locationA,resv.id,table1,userId);
  assert.deepEqual((await prisma.restaurantReservationTable.findMany({where:{reservationId:resv.id},select:{tableId:true}})).map(r=>r.tableId),[table1]);
  // Fuori servizio letto dalla colonna fisica: rifiutato anche se la colonna
  // legacy dice AVAILABLE (prima era quest'ultima a decidere).
  await prisma.restaurantTable.update({where:{id:table2},data:{physicalStatus:"OUT_OF_SERVICE"}});
  await assert.rejects(assignTable(companyId,locationA,resv.id,table2,userId),RestaurantBookingError);
  const assignable=await getAssignableTables(companyId,locationA);
  assert.equal(assignable.some(t=>t.id===table2),false,"un tavolo fuori servizio non è assegnabile");
  // Lo stato esposto è derivato: tavolo fisicamente pronto e nessuna comanda
  // aperta, quindi disponibile. Non è più possibile contraddirlo scrivendo una
  // colonna, perché quella colonna non esiste.
  assert.equal((await getAssignableTables(companyId,locationA)).find(t=>t.id===table1)?.status,"AVAILABLE");
  await prisma.restaurantTable.update({where:{id:table2},data:{physicalStatus:"READY"}});
  await prisma.restaurantReservationTable.deleteMany({where:{reservationId:resv.id}});
});

test("Floor V2: un tavolo occupato adesso non blocca una prenotazione futura",async()=>{
  // Tavolo fisicamente pronto ma con una comanda aperta adesso.
  await prisma.restaurantTable.update({where:{id:table1},data:{physicalStatus:"READY"}});
  const order=await openOrder(companyId,locationA,userId,{tableId:table1,guestCount:2,serviceType:"DINE_IN"});
  orderIds.push(order.id);
  // Finestra futura: il tavolo deve restare disponibile.
  const tomorrow=future(1,20);
  const futureCheck=await checkAvailability(companyId,locationA,{startTime:tomorrow,partySize:2,tableId:table1,ignoreAdvance:true});
  assert.equal(futureCheck.available,true,"una comanda aperta adesso non deve bloccare domani");
  // Finestra che contiene l'adesso: il tavolo non è disponibile.
  const nowCheck=await checkAvailability(companyId,locationA,{startTime:new Date(),partySize:2,tableId:table1,ignoreAdvance:true});
  assert.equal(nowCheck.available,false,"per l'adesso una comanda aperta rende il tavolo indisponibile");
  // Chiusa la comanda, torna disponibile anche adesso.
  await prisma.restaurantOrder.update({where:{id:order.id},data:{status:"CANCELLED"}});
  assert.equal((await checkAvailability(companyId,locationA,{startTime:new Date(),partySize:2,tableId:table1,ignoreAdvance:true})).available,true);
});
