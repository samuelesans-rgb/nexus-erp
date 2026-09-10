import "server-only";
// Permanent Noop by design, not a placeholder. Fiscal emission belongs entirely
// to the POS, cabled to the registratore telematico; Nexus never forms a fiscal
// document and direct KUBE access is forbidden. `fiscal: false` is the honest
// answer, not a temporary one. See the note at the transmit() call site in
// lib/restaurant-orders.ts for why this is not idempotent.
export interface RestaurantFiscalAdapter { transmit(input:{orderId:string;documentId:string;total:number}):Promise<{externalId:string|null;fiscal:boolean}> }
export class NoopRestaurantFiscalAdapter implements RestaurantFiscalAdapter { async transmit(){ return {externalId:null,fiscal:false}; } }
export const restaurantFiscalAdapter:RestaurantFiscalAdapter=new NoopRestaurantFiscalAdapter();
