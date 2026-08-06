import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { BookingWidgetError, getWidgetPublicConfig } from "@/lib/restaurant-booking-widget";

function escapeJson(value: unknown) {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[character] ?? character);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function refererOrigin(request: Request) {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const origin = new URL(referer).origin;
    return origin === new URL(request.url).origin ? null : origin;
  } catch { return "invalid:"; }
}

function frameAncestors(domains: readonly string[]) {
  return ["'self'", ...domains.flatMap((domain) => [`https://${domain}`, `https://*.${domain}`, `http://${domain}`, `http://*.${domain}`])].join(" ");
}

function logoSource(logoUrl: string | null) {
  if (!logoUrl) return "";
  try { return new URL(logoUrl).origin; } catch { return ""; }
}

export async function GET(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const publicKey = (await context.params).publicKey;
  const origin = refererOrigin(request);
  const preview = new URL(request.url).searchParams.get("preview") === "1";
  try {
    const config = await getWidgetPublicConfig(publicKey, origin);
    const nonce = randomBytes(18).toString("base64");
    const widget = await prisma.restaurantBookingWidget.findUniqueOrThrow({ where: { publicKey }, select: { allowedDomains: true } });
    const parentOrigin = origin ?? new URL(request.url).origin;
    const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data: ${logoSource(config.logoUrl)}; form-action 'self'; base-uri 'none'; frame-ancestors ${frameAncestors(widget.allowedDomains)}`;
    const html = `<!doctype html><html lang="${config.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(config.heading)}</title><style nonce="${nonce}">:root{color-scheme:${config.theme === "DARK" ? "dark" : config.theme === "AUTO" ? "light dark" : "light"};--primary:${config.primaryColor};--secondary:${config.secondaryColor};--accent:${config.accentColor};--background:${config.backgroundColor};--text:${config.textColor};--radius:${config.borderRadius}px;font-family:${config.fontFamily},sans-serif;color:var(--text);background:var(--background)}*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--background);color:var(--text)}main{max-width:680px;margin:auto}.preview{margin:0 0 14px;padding:9px 12px;border-radius:var(--radius);background:#fef3c7;color:#92400e;font-weight:700;text-align:center}.logo{display:block;max-width:180px;max-height:72px;margin:0 0 14px;object-fit:contain}h1{margin:.2rem 0;color:var(--primary)}p{line-height:1.5}.grid{display:grid;gap:12px}.two{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}label{display:grid;gap:5px;font-size:.9rem}input,textarea,button{font:inherit;border:1px solid #cbd5e1;border-radius:var(--radius);padding:11px;background:var(--secondary);color:var(--text)}button{background:var(--primary);color:var(--secondary);border:0;font-weight:700;cursor:pointer}.slots{display:flex;flex-wrap:wrap;gap:8px}.slot{width:auto;background:transparent;color:var(--text);border:1px solid #cbd5e1}.slot[aria-pressed=true]{background:var(--primary);color:var(--secondary)}.status{padding:12px;border-radius:var(--radius);background:#ecfdf5;color:#065f46}.error{background:#fef2f2;color:#991b1b}a{color:var(--accent)}</style></head><body><main>${preview ? '<p class="preview" role="status">Modalità anteprima · nessuna prenotazione verrà creata</p>' : ""}<img id="logo" class="logo" alt=""><h1 id="heading"></h1><p id="description"></p><form id="booking" class="grid"><div class="grid two"><label>Data<input id="date" type="date" required></label><label>Persone<input id="party" type="number" min="1" max="50" value="2" required></label></div><button type="button" id="availability">Cerca disponibilità</button><div id="slots" class="slots" role="group" aria-label="Orari disponibili"></div><div id="details" class="grid" hidden><label>Nome e cognome<input name="guestName" minlength="2" maxlength="120" autocomplete="name" required></label><div class="grid two"><label>Telefono<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label><label>Email<input name="email" type="email" maxlength="254" autocomplete="email"></label></div><label id="notes-label">Note<textarea name="notes" maxlength="1000" rows="3"></textarea></label><label><span><input name="privacyConsent" type="checkbox" required> Accetto l’informativa privacy</span><a id="privacy" target="_blank" rel="noopener noreferrer">Leggi l’informativa</a></label><button id="submit" type="submit"></button></div><p id="message" role="status" aria-live="polite"></p></form></main><script nonce="${nonce}">const config=${escapeJson(config)},key=${escapeJson(publicKey)},preview=${escapeJson(preview)},parentOrigin=${escapeJson(parentOrigin)},api="/api/widget/v1/"+encodeURIComponent(key),form=document.querySelector("#booking"),message=document.querySelector("#message"),slots=document.querySelector("#slots"),details=document.querySelector("#details"),logo=document.querySelector("#logo");let selected=null,idempotency=crypto.randomUUID();document.querySelector("#heading").textContent=config.heading;document.querySelector("#description").textContent=config.description||config.location.name;document.querySelector("#submit").textContent=config.buttonLabel;document.querySelector('[name=phone]').required=config.requirePhone;document.querySelector('[name=email]').required=config.requireEmail;document.querySelector("#notes-label").hidden=!config.showNotes;logo.hidden=!config.logoUrl;if(config.logoUrl){logo.src=config.logoUrl;logo.alt="Logo "+config.location.name}const privacy=document.querySelector("#privacy");privacy.href=config.privacyUrl||"#";privacy.hidden=!config.privacyUrl;const date=document.querySelector("#date"),today=new Date(),offset=today.getTimezoneOffset()*60000;date.min=new Date(today.getTime()-offset).toISOString().slice(0,10);date.value=date.min;function resize(){parent.postMessage({type:"nexus-booking:resize",height:document.documentElement.scrollHeight},parentOrigin)}new ResizeObserver(resize).observe(document.body);function error(text){message.className="status error";message.textContent=text}document.querySelector("#availability").onclick=async()=>{message.textContent="";slots.textContent="";details.hidden=true;selected=null;try{const response=await fetch(api+"/availability?date="+encodeURIComponent(date.value)+"&partySize="+encodeURIComponent(document.querySelector("#party").value)),data=await response.json();if(!response.ok)throw new Error(data.error);data.slots.forEach(value=>{const button=document.createElement("button");button.type="button";button.className="slot";button.textContent=new Intl.DateTimeFormat(config.locale,{hour:"2-digit",minute:"2-digit"}).format(new Date(value));button.setAttribute("aria-pressed","false");button.onclick=()=>{slots.querySelectorAll("button").forEach(item=>item.setAttribute("aria-pressed","false"));button.setAttribute("aria-pressed","true");selected=value;details.hidden=false};slots.append(button)});if(!data.slots.length)error("Nessun orario disponibile.")}catch(reason){error(reason instanceof Error?reason.message:"Disponibilità non caricata.")}};form.onsubmit=async event=>{event.preventDefault();if(preview)return error("Modalità anteprima: invio disabilitato.");if(!selected)return error("Scegli un orario.");const values=Object.fromEntries(new FormData(form));values.idempotencyKey=idempotency;values.startTime=selected;values.partySize=Number(document.querySelector("#party").value);values.privacyConsent=values.privacyConsent==="on";try{const response=await fetch(api+"/reservation",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(values)}),data=await response.json();if(!response.ok)throw new Error(data.error);form.innerHTML="<div class=status></div>";form.firstElementChild.textContent=data.successMessage+" Codice: "+data.code}catch(reason){error(reason instanceof Error?reason.message:"Prenotazione non riuscita.")}};resize();</script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp, "Cache-Control": "no-store", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const status = error instanceof BookingWidgetError ? error.status : 500;
    return new Response("Widget non disponibile.", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
  }
}
