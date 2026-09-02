import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

export const HARDWARE_PROTOCOL_REQUIRED = "HARDWARE_PROTOCOL_REQUIRED";
export const UNCERTAIN_PRINT_OUTCOME = "UNCERTAIN_PRINT_OUTCOME";
export type ClaimedJob = { jobId:string;leaseToken:string;leaseExpiresAt:string;payload:string;printType:string;copies:number;paperWidth:number;printerType:string;connectionType:string;attempts?:number;fusionOrder?:{tableIds:string[];lines:Array<{lineId:string;itemId:string;plu?:number;quantity:number;hasModifiers:boolean;hasNotes:boolean}>} };
export type SpoolState = "RECEIVED"|"PRINTING"|"PRINTED"|"FAILED";
export type SpoolRecord = ClaimedJob & { state:SpoolState;updatedAt:string;error?:string;printStartedAt?:string;printedAt?:string };
export type SerialConfiguration = { devicePath:string;baudRate:number;dataBits:5|6|7|8;parity:"none"|"even"|"odd"|"mark"|"space";stopBits:1|1.5|2;flowControl:"none"|"hardware"|"software";readTimeoutMs:number;writeTimeoutMs:number };

export interface SerialTransport { open():Promise<void>;write(data:Uint8Array,timeoutMs?:number):Promise<void>;read(timeoutMs?:number):Promise<Uint8Array>;close():Promise<void>;reconnect():Promise<void>;diagnostics():Promise<Record<string,unknown>> }
export interface PrinterAdapter { print(job:ClaimedJob):Promise<void>;diagnostics():Promise<Record<string,unknown>> }

export class CustomKubePrinterAdapter implements PrinterAdapter {
  constructor(private readonly transport?:SerialTransport){}
  async print(job:ClaimedJob){void job;throw new Error(HARDWARE_PROTOCOL_REQUIRED);}
  async diagnostics(){return{status:HARDWARE_PROTOCOL_REQUIRED,adapter:"CUSTOM_KUBE",transportConfigured:Boolean(this.transport)};}
}

export type SimulatorScenario="success"|"delayed_ack"|"timeout"|"disconnect"|"paper_out"|"busy"|"malformed_response"|"duplicate_ack"|"failed_print";
export class SimulatorPrinterAdapter implements PrinterAdapter {
  readonly printed:ClaimedJob[]=[];private connected=true;
  constructor(private readonly output?:(text:string)=>void,private scenario:SimulatorScenario="success",private readonly delayMs=25){}
  setScenario(scenario:SimulatorScenario){this.scenario=scenario;} reconnect(){this.connected=true;this.scenario="success";} disconnect(){this.connected=false;}
  async print(job:ClaimedJob){
    if(job.printType==="FISCAL_RECEIPT")throw new Error("FISCAL_PROTOCOL_REQUIRED");
    if(!this.connected||this.scenario==="disconnect"){this.connected=false;throw new Error("PRINTER_DISCONNECTED");}
    if(this.scenario==="delayed_ack")await new Promise(resolve=>setTimeout(resolve,this.delayMs));
    const failures:Partial<Record<SimulatorScenario,string>>={timeout:"PRINTER_TIMEOUT",paper_out:"PAPER_OUT",busy:"PRINTER_BUSY",malformed_response:"MALFORMED_PRINTER_RESPONSE",failed_print:"PRINT_FAILED"};
    const failure=failures[this.scenario];if(failure)throw new Error(failure);
    this.printed.push(job);this.output?.(`[SIMULATOR] ${job.jobId}\n${job.payload}`);
  }
  async diagnostics(){return{status:this.connected?"READY":"DISCONNECTED",adapter:"SIMULATOR",scenario:this.scenario,printedJobs:this.printed.length};}
}

export class JsonSpool {
  constructor(readonly directory:string){} private path(jobId:string){return join(this.directory,`${jobId}.json`);}
  private async syncDirectory(){const handle=await open(this.directory,"r");try{await handle.sync();}finally{await handle.close();}}
  async save(record:SpoolRecord){
    await mkdir(this.directory,{recursive:true,mode:0o700});const target=this.path(record.jobId),temporary=`${target}.${process.pid}.${Date.now()}.tmp`;const handle=await open(temporary,"wx",0o600);
    try{await handle.writeFile(JSON.stringify(record,null,2));await handle.sync();}finally{await handle.close();}await rename(temporary,target);await this.syncDirectory();
  }
  async complete(jobId:string,suffix:"done"|"failed"){await rename(this.path(jobId),join(this.directory,`${jobId}.${suffix}.json`));await this.syncDirectory();}
  async load():Promise<SpoolRecord[]>{
    await mkdir(this.directory,{recursive:true,mode:0o700});const names=(await readdir(this.directory)).filter(name=>/^[^.]+\.json$/.test(name));const records:SpoolRecord[]=[];
    for(const name of names){const path=join(this.directory,name);try{const parsed=JSON.parse(await readFile(path,"utf8")) as SpoolRecord;if(!parsed.jobId||!["RECEIVED","PRINTING","PRINTED","FAILED"].includes(parsed.state))throw new Error();records.push(parsed);}catch{await rename(path,`${path}.corrupt-${Date.now()}`).catch(()=>undefined);}}
    return records;
  }
  async diagnostics(){const names=await readdir(this.directory).catch(()=>[]);return{directory:this.directory,activeFiles:names.filter(name=>/^[^.]+\.json$/.test(name)).length,completedFiles:names.filter(name=>name.endsWith(".done.json")).length,failedFiles:names.filter(name=>name.endsWith(".failed.json")).length,corruptFiles:names.filter(name=>name.includes(".corrupt-")).length,temporaryFiles:names.filter(name=>name.endsWith(".tmp")).length};}
}

export class KitchenConnectorClient {
  constructor(private readonly baseUrl:string,private readonly credential:string,readonly spool:JsonSpool,readonly printer:PrinterAdapter){}
  private async request(path:string,init:RequestInit={}){const response=await fetch(`${this.baseUrl.replace(/\/$/,"")}/api/kitchen-connector/v1${path}`,{...init,signal:init.signal??AbortSignal.timeout(15_000),headers:{authorization:`Bearer ${this.credential}`,"content-type":"application/json",...init.headers}});const body=await response.json() as Record<string,unknown>;if(!response.ok)throw new Error(`${response.status}:${String(body.error??"Connector request failed")}`);return body;}
  private post(path:string,body:unknown){return this.request(path,{method:"POST",body:JSON.stringify(body)});}
  async heartbeat(lastError?:string){const[spool,printer]=await Promise.all([this.spool.diagnostics(),this.printer.diagnostics()]);return this.post("/heartbeat",{printerOnline:printer.status==="READY",queueDepth:spool.activeFiles,failedJobs:spool.failedFiles,lastError,connectorVersion:"1.1.0",diagnostics:{spool,printer,runtime:process.version,platform:process.platform}});}
  async syncCatalog(body:unknown,signal?:AbortSignal){return this.request("/catalog-sync",{method:"POST",body:JSON.stringify(body),signal});}
  async recover(){for(const record of await this.spool.load()){if(record.state==="PRINTED")await this.ack(record).catch(()=>undefined);else if(record.state==="PRINTING"){const uncertain={...record,state:"FAILED" as const,error:UNCERTAIN_PRINT_OUTCOME,updatedAt:new Date().toISOString()};await this.spool.save(uncertain);await this.fail(uncertain).catch(()=>undefined);}else if(record.state==="RECEIVED")await this.execute(record);else await this.fail(record).catch(()=>undefined);}}
  async pollOnce(){const response=await this.request("/jobs?take=20") as {jobs?:Array<{id:string}>};for(const candidate of response.jobs??[]){try{const job=await this.post(`/jobs/${candidate.id}/claim`,{}) as unknown as ClaimedJob;const received={...job,state:"RECEIVED" as const,updatedAt:new Date().toISOString()};await this.spool.save(received);await this.execute(received);}catch(error){if(!String(error).includes("409:"))await this.heartbeat(String(error)).catch(()=>undefined);}}}
  private async execute(job:SpoolRecord){const printing={...job,state:"PRINTING" as const,printStartedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await this.spool.save(printing);try{await this.printer.print(job);const printed={...printing,state:"PRINTED" as const,printedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await this.spool.save(printed);await this.ack(printed).catch(()=>undefined);}catch(error){const failed={...printing,state:"FAILED" as const,error:String(error),updatedAt:new Date().toISOString()};await this.spool.save(failed);await this.fail(failed).catch(()=>undefined);}}
  private async fail(job:SpoolRecord){await this.post(`/jobs/${job.jobId}/fail`,{leaseToken:job.leaseToken,error:job.error??"PRINT_FAILED"});await this.spool.complete(job.jobId,"failed");}
  private async ack(job:SpoolRecord){await this.post(`/jobs/${job.jobId}/ack`,{leaseToken:job.leaseToken});await this.spool.complete(job.jobId,"done");}
}

export async function pair(baseUrl:string,pairingToken:string,name:string,serialConfig?:unknown){const response=await fetch(`${baseUrl.replace(/\/$/,"")}/api/kitchen-connector/v1/pair`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pairingToken,name,serialConfig})});const body=await response.json();if(!response.ok)throw new Error(String(body.error??`HTTP ${response.status}`));return body as {deviceId:string;credential:string};}
