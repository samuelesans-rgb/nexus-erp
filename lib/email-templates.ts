import "server-only";

import type { EmailMessage } from "@/lib/email";

export type BookingEmailDetails = {
  code: string;
  locationName: string;
  startTime: Date;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  notes?: string | null;
  restaurantContact?: string | null;
  cancellationUrl?: string;
};

const formatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" });
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);

function summary(details: BookingEmailDetails) {
  return [
    `Codice: ${details.code}`,
    `Sede: ${details.locationName}`,
    `Data e ora: ${formatter.format(details.startTime)}`,
    `Persone: ${details.partySize}`,
    details.notes ? `Note: ${details.notes}` : null,
    details.restaurantContact ? `Contatti ristorante: ${details.restaurantContact}` : null,
  ].filter(Boolean).join("\n");
}

function summaryHtml(details: BookingEmailDetails) {
  const rows = [
    ["Codice", details.code],
    ["Sede", details.locationName],
    ["Data e ora", formatter.format(details.startTime)],
    ["Persone", String(details.partySize)],
    details.notes ? ["Note", details.notes] : null,
    details.restaurantContact ? ["Contatti ristorante", details.restaurantContact] : null,
  ].filter((row): row is string[] => Boolean(row));
  return `<dl>${rows.map(([label, value]) => `<dt><strong>${escapeHtml(label)}</strong></dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
}

export function bookingCustomerConfirmation(details: BookingEmailDetails): EmailMessage {
  const cancellation = details.cancellationUrl ? `\nPer annullare in sicurezza: ${details.cancellationUrl}` : "";
  const cancellationHtml = details.cancellationUrl ? `<p><a href="${escapeHtml(details.cancellationUrl)}">Annulla la prenotazione</a></p>` : "";
  return {
    to: details.guestEmail,
    subject: `Prenotazione ricevuta · ${details.locationName}`,
    text: `Ciao ${details.guestName},\n\nabbiamo ricevuto la tua prenotazione.\n\n${summary(details)}${cancellation}`,
    html: `<p>Ciao ${escapeHtml(details.guestName)},</p><p>abbiamo ricevuto la tua prenotazione.</p>${summaryHtml(details)}${cancellationHtml}`,
  };
}

export function bookingRestaurantNotification(details: BookingEmailDetails, to: string): EmailMessage {
  return {
    to,
    subject: `Nuova prenotazione · ${details.code}`,
    text: `Nuova prenotazione pubblica.\n\n${summary(details)}\nCliente: ${details.guestName}\nTelefono: ${details.guestPhone ?? "—"}\nEmail: ${details.guestEmail}`,
    html: `<p>Nuova prenotazione pubblica.</p>${summaryHtml(details)}<p><strong>Cliente</strong>: ${escapeHtml(details.guestName)}<br><strong>Telefono</strong>: ${escapeHtml(details.guestPhone ?? "—")}<br><strong>Email</strong>: ${escapeHtml(details.guestEmail)}</p>`,
  };
}

export function bookingCustomerCancellation(details: BookingEmailDetails): EmailMessage {
  return {
    to: details.guestEmail,
    subject: `Prenotazione annullata · ${details.locationName}`,
    text: `Ciao ${details.guestName},\n\nla prenotazione è stata annullata.\n\n${summary(details)}`,
    html: `<p>Ciao ${escapeHtml(details.guestName)},</p><p>la prenotazione è stata annullata.</p>${summaryHtml(details)}`,
  };
}

export function bookingRestaurantCancellation(details: BookingEmailDetails, to: string): EmailMessage {
  return {
    to,
    subject: `Prenotazione annullata · ${details.code}`,
    text: `Prenotazione annullata.\n\n${summary(details)}\nCliente: ${details.guestName}`,
    html: `<p>Prenotazione annullata.</p>${summaryHtml(details)}<p><strong>Cliente</strong>: ${escapeHtml(details.guestName)}</p>`,
  };
}
