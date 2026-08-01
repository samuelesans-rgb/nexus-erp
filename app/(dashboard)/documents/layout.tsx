import { requireDocumentContext } from "@/lib/document-access";
export default async function DocumentsLayout({ children }: { children: React.ReactNode }) { await requireDocumentContext(); return children; }
