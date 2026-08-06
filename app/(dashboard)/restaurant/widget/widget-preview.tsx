"use client";

import { useState } from "react";

export function WidgetPreview({ src, mode }: { src: string; mode: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return <section className="space-y-4" aria-labelledby="widget-preview-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="widget-preview-title" className="text-xl font-semibold">Preview live</h2><p className="text-sm text-slate-500">Modalità anteprima · {mode}</p></div><div className="flex gap-2" role="group" aria-label="Dimensione anteprima"><button type="button" aria-pressed={device === "desktop"} className="rounded-lg border px-4 py-2 text-sm aria-pressed:bg-slate-900 aria-pressed:text-white" onClick={() => setDevice("desktop")}>Desktop</button><button type="button" aria-pressed={device === "mobile"} className="rounded-lg border px-4 py-2 text-sm aria-pressed:bg-slate-900 aria-pressed:text-white" onClick={() => setDevice("mobile")}>Mobile</button></div></div>
    <div className="overflow-auto rounded-xl border bg-slate-100 p-3 sm:p-6"><div data-preview-device={device} className={`mx-auto overflow-hidden rounded-xl bg-white shadow-sm transition-[width] ${device === "mobile" ? "w-[390px] max-w-full" : "w-full max-w-5xl"}`}>{state === "loading" && <p role="status" className="p-4 text-sm">Caricamento anteprima…</p>}{state === "error" && <p role="alert" className="p-4 text-sm text-red-700">Anteprima non disponibile.</p>}<iframe className="h-[720px] w-full border-0" title={`Preview widget ${device}`} src={src} onLoad={() => setState("ready")} onError={() => setState("error")} /></div></div>
  </section>;
}
