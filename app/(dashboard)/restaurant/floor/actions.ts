"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { saveTableCombination, saveTableLayout, dissolveTableCombination } from "@/lib/restaurant-floor";
import { assignTables } from "@/lib/restaurant-booking";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim(),num=(f:FormData,k:string)=>Number(text(f,k));
async function context(permission:"manage"|"operate"="manage"){return requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR,permission)}
export async function saveTableLayoutAction(f:FormData){const c=await context();try{await saveTableLayout(c.companyId,c.locationId,{tableId:text(f,"tableId"),positionX:num(f,"positionX"),positionY:num(f,"positionY"),width:num(f,"width"),height:num(f,"height"),rotation:num(f,"rotation"),shape:text(f,"shape") as "RECTANGLE"|"SQUARE"|"ROUND"})}catch(e){redirect("/restaurant/floor?error="+encodeURIComponent(e instanceof Error?e.message:"Layout non salvato."))}revalidatePath("/restaurant/floor");redirect("/restaurant/floor?success=Layout salvato")}
export async function saveCombinationAction(f:FormData){const c=await context();try{await saveTableCombination(c.companyId,c.locationId,{id:text(f,"id")||undefined,name:text(f,"name"),tableIds:f.getAll("tableIds").map(String),active:f.get("active")==="on"})}catch(e){redirect("/restaurant/floor?error="+encodeURIComponent(e instanceof Error?e.message:"Combinazione non salvata."))}revalidatePath("/restaurant/floor");redirect("/restaurant/floor?success=Combinazione salvata")}
export async function dissolveCombinationAction(f:FormData){const c=await context();await dissolveTableCombination(c.companyId,c.locationId,text(f,"id"));revalidatePath("/restaurant/floor")}
export async function assignCombinedTablesAction(f:FormData){const c=await context("operate");const reservationId=text(f,"reservationId");try{await assignTables(c.companyId,c.locationId,reservationId,f.getAll("tableIds").map(String),c.userId)}catch(e){redirect("/restaurant/reservations/"+reservationId+"?error="+encodeURIComponent(e instanceof Error?e.message:"Assegnazione non riuscita."))}revalidatePath("/restaurant/floor");redirect("/restaurant/reservations/"+reservationId+"?success=Tavoli assegnati")}
