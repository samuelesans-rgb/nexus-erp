import "server-only";
export interface RestaurantFiscalAdapter { transmit(input:{orderId:string;documentId:string;total:number}):Promise<{externalId:string|null;fiscal:boolean}> }
export class NoopRestaurantFiscalAdapter implements RestaurantFiscalAdapter { async transmit(){ return {externalId:null,fiscal:false}; } }
export const restaurantFiscalAdapter:RestaurantFiscalAdapter=new NoopRestaurantFiscalAdapter();
