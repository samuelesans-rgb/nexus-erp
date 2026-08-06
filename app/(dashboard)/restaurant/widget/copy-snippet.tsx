"use client";

import { useState } from "react";

export function CopySnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="rounded-lg border px-4 py-2 text-sm font-medium" onClick={async () => { await navigator.clipboard.writeText(snippet); setCopied(true); }}>{copied ? "Copiato" : "Copia snippet"}</button>;
}
