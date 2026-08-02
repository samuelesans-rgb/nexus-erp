import{redirect}from"next/navigation";export default async function Page({params}:{params:Promise<{stationId:string}>}){redirect(`/restaurant/kitchen?station=${(await params).stationId}`)}
