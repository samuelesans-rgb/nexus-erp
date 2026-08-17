"use server";
import { createCategory, createUnit, createVatRate, MasterDataError, updateCategory, updateUnit, updateVatRate } from "@/lib/master-data";
import { requireMasterDataContext } from "@/lib/master-data-access";
import { redirect } from "next/navigation";
const text=(d:FormData,k:string)=>String(d.get(k)??""); const active=(d:FormData)=>d.get("active")==="on";
const common=(d:FormData)=>({code:text(d,"code"),name:text(d,"name"),description:text(d,"description"),active:active(d)});
async function run(data:FormData, operation:(companyId:string,userId:string)=>Promise<unknown>) { const {companyId,userId}=await requireMasterDataContext("write"); try { await operation(companyId,userId); } catch(error) { const message=error instanceof MasterDataError?error.message:"Salvataggio non riuscito."; redirect(`/settings/master-data?error=${encodeURIComponent(message)}`); } redirect("/settings/master-data?success=Configurazione%20salvata"); }
export async function saveVat(data:FormData){return run(data,(companyId,userId)=>{const input={...common(data),percentage:Number(text(data,"percentage")),natureCode:text(data,"natureCode")};const id=text(data,"id");return id?updateVatRate(companyId,userId,id,input):createVatRate(companyId,userId,input);});}
export async function saveUnit(data:FormData){return run(data,(companyId,userId)=>{const input={...common(data),symbol:text(data,"symbol"),precision:Number(text(data,"precision"))};const id=text(data,"id");return id?updateUnit(companyId,userId,id,input):createUnit(companyId,userId,input);});}
export async function saveCategory(data:FormData){return run(data,(companyId,userId)=>{const input=common(data);const id=text(data,"id");return id?updateCategory(companyId,userId,id,input):createCategory(companyId,userId,input);});}
