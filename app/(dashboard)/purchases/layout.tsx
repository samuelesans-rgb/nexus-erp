import{requirePurchasingContext}from"@/lib/purchasing-access";export default async function Layout({children}:{children:React.ReactNode}){await requirePurchasingContext();return children;}
