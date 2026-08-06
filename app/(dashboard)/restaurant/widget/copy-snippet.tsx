"use client";

import { useState } from "react";

export function CopySnippet({ snippet }: { snippet: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  return <div className="flex items-center gap-3"><button type="button" className="rounded-lg border px-4 py-2 text-sm font-medium" onClick={async () => { try { await navigator.clipboard.writeText(snippet); setStatus("copied"); } catch { setStatus("error"); } }}>Copia snippet</button><span aria-live="polite" className="text-sm text-slate-600">{status === "copied" ? "Snippet copiato" : status === "error" ? "Copia non riuscita" : ""}</span></div>;
}
