import "server-only";

import { getAlertNotifier } from "@/lib/alert-notifier";
import {
  buildChannelDownMessage,
  buildChannelUpMessage,
  type ChannelAlertState,
  decideChannelAlert,
} from "@/lib/kitchen-channel-alert-policy";
import { getKitchenChannelHealth } from "@/lib/kitchen-connector";
import { prisma } from "@/lib/prisma";

const DOWN_EVENT = "KitchenChannelDown",
  UP_EVENT = "KitchenChannelUp";

/**
 * Lo stato dell'allarme vive nei DomainEvent invece che in una tabella nuova.
 *
 * L'ultimo evento fra i due dice dove siamo, e in piu' resta lo storico gratis:
 * quante cadute, quanto lunghe. Nessuna migrazione, e nessun campo derivato da
 * tenere allineato a mano — la stessa ragione per cui non scriviamo OFFLINE
 * sulla colonna status del device.
 */
async function lastTransition(companyId: string, locationId: string) {
  const event = await prisma.domainEvent.findFirst({
    where: {
      companyId,
      aggregateType: "KitchenChannel",
      aggregateId: locationId,
      eventType: { in: [DOWN_EVENT, UP_EVENT] },
    },
    // Spareggio sull'id: due transizioni nello stesso istante non devono
    // lasciare l'ordinamento al caso, o lo stato si legge a caso.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: { eventType: true, occurredAt: true },
  });
  if (!event) return { state: null as ChannelAlertState, since: null };
  return {
    state: (event.eventType === DOWN_EVENT ? "DOWN" : "UP") as ChannelAlertState,
    since: event.occurredAt,
  };
}

function romeHour(at: Date) {
  return Number(
    new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hour12: false,
    }).format(at),
  );
}

/**
 * Un tick del sorvegliante. Idempotente per costruzione: se lo stato non
 * cambia non scrive e non manda nulla, quindi puo' girare quanto si vuole.
 */
export async function runKitchenChannelAlertCheck(
  companyId: string,
  locationId: string,
  now = new Date(),
) {
  const [health, previous, location] = await Promise.all([
    getKitchenChannelHealth(companyId, locationId),
    lastTransition(companyId, locationId),
    prisma.location.findFirst({
      where: { companyId, id: locationId },
      select: { name: true },
    }),
  ]);
  const decision = decideChannelAlert({
    stale: health.stale,
    staleForMinutes: health.staleForMinutes,
    lastNotified: previous.state,
    hourOfDay: romeHour(now),
  });
  if (decision.action === "NONE")
    return {
      ...decision,
      stale: health.stale,
      sent: false,
      outcome: "SKIPPED" as const,
    };

  const locationName = location?.name ?? "Nexus";
  const message =
    decision.action === "NOTIFY_DOWN"
      ? buildChannelDownMessage({
          locationName,
          staleForMinutes: health.staleForMinutes,
          maxAgeMinutes: health.maxAgeMinutes,
        })
      : buildChannelUpMessage({
          locationName,
          outageMinutes: previous.since
            ? Math.max(
                0,
                Math.round((now.getTime() - previous.since.getTime()) / 60000),
              )
            : null,
        });

  const notifier = getAlertNotifier();
  // Il canale non configurato non conta come invio riuscito: viene registrato
  // per quello che e', cosi' non si finisce a credere di essere avvisati.
  let outcome: "SENT" | "NOT_CONFIGURED" | "FAILED" | "SKIPPED" = notifier
    ? "SENT"
    : "NOT_CONFIGURED";
  let error: string | null = null;
  if (notifier)
    try {
      await notifier.send(message);
    } catch (sendError) {
      outcome = "FAILED";
      error = sendError instanceof Error ? sendError.message : "invio fallito";
    }

  // La transizione si registra comunque, anche se l'invio e' fallito: altrimenti
  // il tick successivo riproverebbe all'infinito, ed e' proprio la tempesta che
  // stiamo evitando. L'esito resta nel payload per chi va a guardare.
  await prisma.domainEvent.create({
    data: {
      companyId,
      aggregateType: "KitchenChannel",
      aggregateId: locationId,
      eventType: decision.action === "NOTIFY_DOWN" ? DOWN_EVENT : UP_EVENT,
      payload: {
        outcome,
        error,
        staleForMinutes: health.staleForMinutes,
        title: message.title,
      },
      occurredAt: now,
    },
  });
  console.info(
    JSON.stringify({
      scope: "kitchen-channel-alert",
      action: decision.action,
      outcome,
      error,
    }),
  );
  return { ...decision, stale: health.stale, sent: outcome === "SENT", outcome };
}

/** Gira su tutte le sedi che hanno almeno un connector attivo. */
export async function runKitchenChannelAlertSweep(now = new Date()) {
  const targets = await prisma.kitchenConnectorDevice.findMany({
    where: { active: true, revokedAt: null },
    select: { companyId: true, locationId: true },
    distinct: ["companyId", "locationId"],
  });
  const results = [];
  for (const target of targets)
    results.push({
      ...target,
      ...(await runKitchenChannelAlertCheck(
        target.companyId,
        target.locationId,
        now,
      )),
    });
  return results;
}
