import "server-only";

import { prisma } from "@/lib/prisma";
import { tableHasOpenOrderWhere } from "@/lib/restaurant-table-status";
import { canSeatAll, MAX_UNION_TABLES } from "@/lib/restaurant-seating";
import { addZonedDays, atZonedTime, startOfZonedDay, zonedCalendarDate, zonedWeekday } from "@/lib/timezone";

export class RestaurantAvailabilityError extends Error { constructor(message:string){super(message);this.name="RestaurantAvailabilityError";} }
type Interval=[string,string];
export type BookingSettings={enabled:boolean;slotIntervalMinutes:number;defaultDurationMinutes:number;minAdvanceMinutes:number;maxAdvanceDays:number;maxCoversPerSlot:number;bufferBeforeMinutes:number;bufferAfterMinutes:number;confirmationPolicy:"MANUAL"|"AUTO_CONFIRM";cancellationEnabled:boolean;cancellationDeadlineMinutes:number;customerCancellationMessage:string|null;noShowThresholdMinutes:number;timeZone:string;openingHours:Record<string,Interval[]>};
const defaults:BookingSettings={enabled:true,slotIntervalMinutes:30,defaultDurationMinutes:120,minAdvanceMinutes:60,maxAdvanceDays:90,maxCoversPerSlot:0,bufferBeforeMinutes:0,bufferAfterMinutes:0,confirmationPolicy:"MANUAL",cancellationEnabled:true,cancellationDeadlineMinutes:1440,customerCancellationMessage:null,noShowThresholdMinutes:30,timeZone:"Europe/Rome",openingHours:{}};
function intervals(value:unknown):Interval[]{return Array.isArray(value)?value.filter((row):row is Interval=>Array.isArray(row)&&row.length===2&&row.every(entry=>typeof entry==="string")):[]}
function weekly(value:unknown){return !value||typeof value!=="object"||Array.isArray(value)?{}:Object.fromEntries(Object.entries(value).map(([day,rows])=>[day,intervals(rows)]))}
// L'ora di parete si interpreta nel fuso della sede, non in quello del server:
// "12:00" e' mezzogiorno a Roma, che in UTC sono le 10 d'estate e le 11 d'inverno.
function atTime(day:Date,time:string,timeZone:string){return atZonedTime(day,time,timeZone)}
function overlaps(a:Date,b:Date,c:Date,d:Date){return c<b&&d>a}
function occupiedWindow(start:Date,end:Date,before:number,after:number){return{start:new Date(start.getTime()-before*60000),end:new Date(end.getTime()+after*60000)}}
export async function getBookingSettings(companyId:string,locationId:string):Promise<BookingSettings>{const location=await prisma.location.findFirst({where:{id:locationId,companyId,active:true,deletedAt:null},select:{id:true,timezone:true}});if(!location)throw new RestaurantAvailabilityError("Sede non disponibile.");const settings=await prisma.restaurantBookingSettings.findFirst({where:{companyId,locationId}});const timeZone=location.timezone;return settings?{...settings,customerCancellationMessage:settings.customerCancellationMessage??null,timeZone,openingHours:weekly(settings.openingHours)}:{...defaults,timeZone}}
async function rulesFor(companyId:string,locationId:string,startTime:Date,settings:BookingSettings,requestedServiceId?:string|null){const day=zonedWeekday(startTime,settings.timeZone),dayStart=startOfZonedDay(startTime,settings.timeZone),dayEnd=addZonedDays(dayStart,1,settings.timeZone);const[services,exceptions]=await Promise.all([prisma.restaurantServiceWindow.findMany({where:{companyId,locationId,active:true,daysOfWeek:{has:day}},orderBy:{startTime:"asc"}}),prisma.restaurantCalendarException.findMany({where:{companyId,locationId,active:true,date:zonedCalendarDate(startTime,settings.timeZone)},orderBy:{createdAt:"asc"}})]);if(exceptions.some(x=>x.type==="CLOSED"))throw new RestaurantAvailabilityError("La sede è chiusa nella data selezionata.");const openingOverride=exceptions.find(x=>x.type==="SPECIAL_OPENING"||x.type==="OVERRIDE_HOURS"),allowed=openingOverride?intervals(openingOverride.intervals):null,eligible=services.filter(s=>requestedServiceId?s.id===requestedServiceId:startTime>=atTime(startTime,s.startTime,settings.timeZone)&&startTime<atTime(startTime,s.endTime,settings.timeZone));if(requestedServiceId&&!eligible.length)throw new RestaurantAvailabilityError("Servizio non attivo o non valido per l’orario selezionato.");const service=eligible[0]??null,windows=allowed??(requestedServiceId&&service?[[service.startTime,service.endTime] as Interval]:services.length?services.map(s=>[s.startTime,s.endTime] as Interval):(settings.openingHours[String(day)]??[["00:00","23:59"]]));if(!windows.length)throw new RestaurantAvailabilityError("La sede è chiusa nell’orario selezionato.");const maxCovers=exceptions.filter(x=>x.type==="CAPACITY_OVERRIDE").at(-1)?.maxCovers??service?.maxCovers??(settings.maxCoversPerSlot||null);return{service,windows,maxCovers,slotIntervalMinutes:service?.slotIntervalMinutes??settings.slotIntervalMinutes,durationMinutes:service?.defaultDurationMinutes??settings.defaultDurationMinutes,bufferBefore:service?.bufferBeforeMinutes??settings.bufferBeforeMinutes,bufferAfter:service?.bufferAfterMinutes??settings.bufferAfterMinutes}}
// A table busy right now must not block a booking for a future window. Time
// conflicts between reservations are already handled by `busy`, computed from
// the reservations overlapping the requested window; the open-order check is
// only meaningful when the requested window actually contains the present
// moment. Out of service is indefinite, so it still excludes a table outright.
export async function checkAvailability(companyId:string,locationId:string,input:{startTime:Date;partySize:number;durationMinutes?:number;tableId?:string|null;tableIds?:string[];serviceWindowId?:string|null;excludeReservationId?:string;ignoreAdvance?:boolean}){if(!Number.isInteger(input.partySize)||input.partySize<1)throw new RestaurantAvailabilityError("Numero coperti non valido.");const settings=await getBookingSettings(companyId,locationId);if(!settings.enabled)throw new RestaurantAvailabilityError("Le prenotazioni non sono disponibili per questa sede.");const startTime=new Date(input.startTime);if(Number.isNaN(startTime.getTime()))throw new RestaurantAvailabilityError("Data prenotazione non valida.");const rules=await rulesFor(companyId,locationId,startTime,settings,input.serviceWindowId),durationMinutes=input.durationMinutes??rules.durationMinutes;if(!Number.isInteger(durationMinutes)||durationMinutes<15)throw new RestaurantAvailabilityError("Durata prenotazione non valida.");const endTime=new Date(startTime.getTime()+durationMinutes*60000);// LIMITE NOTO, non un difetto: una prenotazione deve stare per intero dentro
  // una finestra ancorata al giorno locale del suo inizio, quindi **non puo'
  // attraversare la mezzanotte**. Con una finestra 00:00-23:59 e durata 60
  // minuti l'ultimo orario prenotabile e' le 22:59.
  //
  // Oggi non si manifesta: il locale chiude entro mezzanotte e l'ultimo tavolo
  // entra prima delle 23:00. Si manifesterebbe allungando il servizio oltre la
  // mezzanotte o aggiungendo una sede con orari diversi — e allora il sintomo
  // sarebbe "prenotazioni serali rifiutate come fuori servizio" senza che
  // nulla lo colleghi a questa riga. Per superarlo servirebbe una finestra che
  // possa terminare nel giorno successivo, cioe' orari di apertura espressi
  // come intervallo e non come coppia di ore dello stesso giorno.
  if(!rules.windows.some(([from,to])=>startTime>=atTime(startTime,from,settings.timeZone)&&endTime<=atTime(startTime,to,settings.timeZone)))throw new RestaurantAvailabilityError("L’orario selezionato è fuori servizio.");if(!input.ignoreAdvance){const now=Date.now();if(startTime.getTime()<now+settings.minAdvanceMinutes*60000)throw new RestaurantAvailabilityError("L’anticipo minimo non è rispettato.");if(startTime.getTime()>now+settings.maxAdvanceDays*86400000)throw new RestaurantAvailabilityError("La data è oltre l’anticipo massimo consentito.");}const target=occupiedWindow(startTime,endTime,rules.bufferBefore,rules.bufferAfter);const reservations=await prisma.restaurantReservation.findMany({where:{companyId,locationId,deletedAt:null,id:input.excludeReservationId?{not:input.excludeReservationId}:undefined,status:{in:["PENDING","CONFIRMED","SEATED"]},startTime:{lt:new Date(target.end.getTime()+86400000)},endTime:{gt:new Date(target.start.getTime()-86400000)}},include:{tables:{select:{tableId:true}},serviceWindow:true}});const overlapping=reservations.filter(r=>{const occupied=occupiedWindow(r.startTime,r.endTime??new Date(r.startTime.getTime()+r.durationMinutes*60000),r.serviceWindow?.bufferBeforeMinutes??settings.bufferBeforeMinutes,r.serviceWindow?.bufferAfterMinutes??settings.bufferAfterMinutes);return overlaps(target.start,target.end,occupied.start,occupied.end)});if(rules.maxCovers&&overlapping.reduce((n,r)=>n+r.partySize,0)+input.partySize>rules.maxCovers)throw new RestaurantAvailabilityError("Capienza massima della fascia raggiunta.");const nowInstant=new Date(),windowIncludesNow=target.start<=nowInstant&&target.end>nowInstant
const busy=new Set(overlapping.flatMap(r=>r.tables.map(t=>t.tableId))),requested=[...(input.tableIds??[]),...(input.tableId?[input.tableId]:[])],unique=[...new Set(requested)];
  const tables=await prisma.restaurantTable.findMany({where:{companyId,locationId,active:true,deletedAt:null,physicalStatus:{not:"OUT_OF_SERVICE"},...(windowIncludesNow?{NOT:tableHasOpenOrderWhere()}:{})},select:{id:true,areaId:true,seats:true,maxSeats:true,combinable:true}});
  const seating=tables.map(t=>({id:t.id,areaId:t.areaId,capacity:t.maxSeats??t.seats,combinable:t.combinable}));
  const combinations=await prisma.restaurantTableCombination.findMany({where:{companyId,locationId,active:true},include:{tables:{select:{tableId:true}}}});
  const configured=combinations.map(c=>c.tables.map(row=>row.tableId));
  const none={available:false,tableId:null,tableIds:[] as string[],startTime,endTime,durationMinutes,serviceWindowId:rules.service?.id??null};
  if(unique.length){
    // Tavoli chiesti esplicitamente: e' il percorso dello staff, che sceglie.
    const chosen=seating.filter(t=>unique.includes(t.id));
    if(chosen.length!==unique.length||unique.some(id=>busy.has(id)))return none;
    if(new Set(chosen.map(t=>t.areaId)).size!==1)throw new RestaurantAvailabilityError("I tavoli combinati devono appartenere alla stessa area.");
    if(chosen.reduce((n,t)=>n+t.capacity,0)<input.partySize)return none;
    if(unique.length>1){
      // Un'unione al volo e' ammessa fra tavoli dichiarati combinabili nella
      // stessa area, fino al tetto: la preconfigurazione non e' piu' l'unica
      // strada. Le combinazioni configurate restano valide anche fra tavoli
      // non combinabili, perche' qualcuno le ha dichiarate apposta.
      const isConfigured=configured.some(combo=>combo.length===unique.length&&unique.every(id=>combo.includes(id)));
      const adHoc=unique.length<=MAX_UNION_TABLES&&chosen.every(t=>t.combinable);
      if(!isConfigured&&!adHoc)throw new RestaurantAvailabilityError("Combinazione tavoli non consentita.");
    }
    return{available:true,tableId:unique[0]!,tableIds:unique,startTime,endTime,durationMinutes,serviceWindowId:rules.service?.id??null};
  }
  // Nessun tavolo chiesto: e' il canale pubblico, che non rivendica tavoli. Si
  // verifica che l'insieme delle prenotazioni della fascia sia sistemabile —
  // chi va dove lo decide il cameriere all'arrivo.
  const groups=[...overlapping.map(r=>({id:r.id,size:r.partySize,fixedTableIds:r.tables.map(t=>t.tableId)})),{id:"nuova",size:input.partySize,fixedTableIds:[] as string[]}];
  const outcome=canSeatAll(groups,seating,configured);
  return{available:outcome.seatable,tableId:null,tableIds:[],startTime,endTime,durationMinutes,serviceWindowId:rules.service?.id??null};
}
/**
 * Gli slot prenotabili di un giorno.
 *
 * Il ciclo assorbe solo RestaurantAvailabilityError, che e' una risposta: la
 * sede e' chiusa, l'orario e' fuori servizio, l'anticipo non basta. Qualunque
 * altro errore viene propagato, perche' prima finivano tutti in un `catch {}`
 * vuoto e un guasto del database diventava indistinguibile da "nessun orario
 * disponibile": il cliente vedeva il locale pieno e se ne andava, senza che
 * niente lo registrasse.
 */

/**
 * La sala e' sistemabile nella finestra indicata, contando anche un gruppo
 * nuovo di `partySize`?
 *
 * Accetta un client qualsiasi perche' serve due volte: una fuori transazione,
 * per rispondere al cliente, e una dentro, sotto lock, prima di scrivere —
 * altrimenti due prenotazioni simultanee superano entrambe il controllo e
 * insieme sforano.
 */
export async function isSeatable(
  client: { restaurantReservation: { findMany: (args: unknown) => Promise<Array<{ id: string; partySize: number; tables: Array<{ tableId: string }> }>> }; restaurantTable: { findMany: (args: unknown) => Promise<Array<{ id: string; areaId: string; seats: number; maxSeats: number | null; combinable: boolean }>> }; restaurantTableCombination: { findMany: (args: unknown) => Promise<Array<{ tables: Array<{ tableId: string }> }>> } },
  companyId: string,
  locationId: string,
  window: { start: Date; end: Date; partySize: number; excludeReservationId?: string },
) {
  const [reservations, tables, combinations] = await Promise.all([
    client.restaurantReservation.findMany({ where: { companyId, locationId, deletedAt: null, id: window.excludeReservationId ? { not: window.excludeReservationId } : undefined, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startTime: { lt: window.end }, endTime: { gt: window.start } }, select: { id: true, partySize: true, tables: { select: { tableId: true } } } }),
    client.restaurantTable.findMany({ where: { companyId, locationId, active: true, deletedAt: null, physicalStatus: { not: "OUT_OF_SERVICE" } }, select: { id: true, areaId: true, seats: true, maxSeats: true, combinable: true } }),
    client.restaurantTableCombination.findMany({ where: { companyId, locationId, active: true }, include: { tables: { select: { tableId: true } } } }),
  ]);
  const groups = [
    ...reservations.map((row) => ({ id: row.id, size: row.partySize, fixedTableIds: row.tables.map((t) => t.tableId) })),
    { id: "nuova", size: window.partySize, fixedTableIds: [] as string[] },
  ];
  return canSeatAll(
    groups,
    tables.map((t) => ({ id: t.id, areaId: t.areaId, capacity: t.maxSeats ?? t.seats, combinable: t.combinable })),
    combinations.map((c) => c.tables.map((row) => row.tableId)),
  );
}

export async function getAvailableSlots(companyId:string,locationId:string,input:{date:Date;partySize:number;serviceWindowId?:string|null},check?:typeof checkAvailability){
  const settings=await getBookingSettings(companyId,locationId),date=startOfZonedDay(new Date(input.date),settings.timeZone);
  let rules;try{rules=await rulesFor(companyId,locationId,date,settings,input.serviceWindowId)}catch(error){if(error instanceof RestaurantAvailabilityError)return[];throw error}
  // Il percorso iniettabile resta per i test, che devono poter far fallire un
  // singolo slot. Fuori dai test si usa la valutazione in memoria.
  if(check){
    const slots:Date[]=[];
    for(const[from,to]of rules.windows)for(let cursor=atTime(date,from,settings.timeZone),limit=atTime(date,to,settings.timeZone);cursor.getTime()+rules.durationMinutes*60000<=limit.getTime();cursor=new Date(cursor.getTime()+rules.slotIntervalMinutes*60000)){
      try{if((await check(companyId,locationId,{startTime:cursor,partySize:input.partySize,serviceWindowId:input.serviceWindowId})).available)slots.push(cursor)}catch(error){if(!(error instanceof RestaurantAvailabilityError))throw error}
    }
    return slots;
  }
  // Una lettura sola per tutta la giornata, invece di una interrogazione per
  // slot: prima ogni richiesta pubblica ne costava un centinaio, su una rotta
  // senza limitatore.
  const dayStart=date,dayEnd=addZonedDays(date,1,settings.timeZone);
  const margin=(Math.max(rules.bufferBefore,rules.bufferAfter)+rules.durationMinutes)*60000;
  const[reservations,tables,combinations]=await Promise.all([
    prisma.restaurantReservation.findMany({where:{companyId,locationId,deletedAt:null,status:{in:["PENDING","CONFIRMED","SEATED"]},startTime:{lt:new Date(dayEnd.getTime()+margin)},endTime:{gt:new Date(dayStart.getTime()-margin)}},select:{id:true,partySize:true,startTime:true,endTime:true,durationMinutes:true,tables:{select:{tableId:true}}}}),
    prisma.restaurantTable.findMany({where:{companyId,locationId,active:true,deletedAt:null,physicalStatus:{not:"OUT_OF_SERVICE"}},select:{id:true,areaId:true,seats:true,maxSeats:true,combinable:true}}),
    prisma.restaurantTableCombination.findMany({where:{companyId,locationId,active:true},include:{tables:{select:{tableId:true}}}}),
  ]);
  const seating=tables.map(t=>({id:t.id,areaId:t.areaId,capacity:t.maxSeats??t.seats,combinable:t.combinable}));
  const configured=combinations.map(c=>c.tables.map(row=>row.tableId));
  const now=Date.now(),slots:Date[]=[];
  for(const[from,to]of rules.windows)for(let cursor=atTime(date,from,settings.timeZone),limit=atTime(date,to,settings.timeZone);cursor.getTime()+rules.durationMinutes*60000<=limit.getTime();cursor=new Date(cursor.getTime()+rules.slotIntervalMinutes*60000)){
    const start=cursor,end=new Date(cursor.getTime()+rules.durationMinutes*60000);
    if(start.getTime()<now+settings.minAdvanceMinutes*60000)continue;
    if(start.getTime()>now+settings.maxAdvanceDays*86400000)continue;
    const target=occupiedWindow(start,end,rules.bufferBefore,rules.bufferAfter);
    const overlapping=reservations.filter(r=>{const occupied=occupiedWindow(r.startTime,r.endTime??new Date(r.startTime.getTime()+r.durationMinutes*60000),rules.bufferBefore,rules.bufferAfter);return overlaps(target.start,target.end,occupied.start,occupied.end)});
    if(rules.maxCovers&&overlapping.reduce((n,r)=>n+r.partySize,0)+input.partySize>rules.maxCovers)continue;
    const groups=[...overlapping.map(r=>({id:r.id,size:r.partySize,fixedTableIds:r.tables.map(t=>t.tableId)})),{id:"nuova",size:input.partySize,fixedTableIds:[] as string[]}];
    if(canSeatAll(groups,seating,configured).seatable)slots.push(start);
  }
  return slots;
}
