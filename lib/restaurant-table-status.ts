import "server-only";

import type {
  Prisma,
  RestaurantTablePhysicalStatus,
  RestaurantTableStatus,
} from "@/generated/prisma/client";

/**
 * Single source of truth for what a table's status means.
 *
 * `RestaurantTable.status` used to be an independent column written by six
 * different call sites (orders, reassignment, bill closing, two reservation
 * services, the legacy admin form). Nothing kept them consistent, so a table
 * could read OCCUPIED with no order, or AVAILABLE while a waiter was serving it.
 *
 * Only two states are genuinely physical and cannot be derived: DIRTY (set when
 * a bill closes, cleared by an operator) and OUT_OF_SERVICE. Everything else is
 * a function of the rows in RestaurantOrderTable and RestaurantReservationTable.
 *
 * The SQL predicates and the in-memory derivation live in this one file on
 * purpose: it was exactly their divergence that produced the original defects.
 * Change one, change the other.
 */

/** Orders that still hold their tables. */
export const OPEN_ORDER_STATUSES = ["CLOSED", "CANCELLED"] as const;

/** Reservations that still hold their tables. */
export const HOLDING_RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SEATED",
] as const;

/**
 * How long before its start time a confirmed reservation colours the table.
 * Chosen to match the shortest turnaround a floor actually plans for: earlier
 * and tables look blocked for most of the service, later and the staff has no
 * warning while seating a walk-in.
 */
export const RESERVED_LEAD_MINUTES = 45;

export type DerivedTableStatusInput = {
  physicalStatus: RestaurantTablePhysicalStatus;
  hasOpenOrder: boolean;
  hasImminentReservation: boolean;
};

/**
 * Precedence, strongest first:
 *   OUT_OF_SERVICE — physical, overrides everything
 *   OCCUPIED       — an order is open on the table
 *   DIRTY          — physical; beats RESERVED because a table that needs
 *                    clearing cannot seat the next booking
 *   RESERVED       — a confirmed booking is imminent
 *   AVAILABLE      — none of the above
 */
export function deriveTableStatus({
  physicalStatus,
  hasOpenOrder,
  hasImminentReservation,
}: DerivedTableStatusInput): RestaurantTableStatus {
  if (physicalStatus === "OUT_OF_SERVICE") return "OUT_OF_SERVICE";
  if (hasOpenOrder) return "OCCUPIED";
  if (physicalStatus === "DIRTY") return "DIRTY";
  if (hasImminentReservation) return "RESERVED";
  return "AVAILABLE";
}

/** Window in which a reservation is considered imminent for a given instant. */
export function reservedWindow(at: Date, leadMinutes = RESERVED_LEAD_MINUTES) {
  return { from: at, until: new Date(at.getTime() + leadMinutes * 60000) };
}

/** Relation filter: the table is held by an order that is neither closed nor cancelled. */
export function tableHasOpenOrderWhere(): Prisma.RestaurantTableWhereInput {
  return {
    orderTables: {
      some: { order: { status: { notIn: [...OPEN_ORDER_STATUSES] } } },
    },
  };
}

/** Relation filter: a reservation still holding the table overlaps the window. */
export function tableHasReservationWhere(
  from: Date,
  until: Date,
): Prisma.RestaurantTableWhereInput {
  return {
    reservations: {
      some: {
        reservation: {
          deletedAt: null,
          status: { in: [...HOLDING_RESERVATION_STATUSES] },
          startTime: { lt: until },
          endTime: { gt: from },
        },
      },
    },
  };
}

/**
 * Relation filter for a table that can take a walk-in right now: physically
 * ready and with no open order. Reservations are deliberately not excluded —
 * a booking later tonight does not stop the table being used now.
 */
export function tableIsFreeNowWhere(): Prisma.RestaurantTableWhereInput {
  return {
    physicalStatus: "READY",
    NOT: tableHasOpenOrderWhere(),
  };
}

/** Shape needed to derive a status from a query result. */
export type TableStatusRelations = {
  physicalStatus: RestaurantTablePhysicalStatus;
  orderTables?: { order: { status: string } }[];
  reservations?: { reservation: { startTime: Date; endTime: Date | null; status: string } }[];
};

/**
 * Derive from a row loaded with its relations. Callers that do not include a
 * relation get `false` for that signal, which is why the include is part of the
 * contract below rather than optional in practice.
 */
export function deriveTableStatusFromRow(
  row: TableStatusRelations,
  at = new Date(),
  leadMinutes = RESERVED_LEAD_MINUTES,
): RestaurantTableStatus {
  const { from, until } = reservedWindow(at, leadMinutes);
  const hasOpenOrder = (row.orderTables ?? []).some(
    ({ order }) => !OPEN_ORDER_STATUSES.includes(order.status as never),
  );
  const hasImminentReservation = (row.reservations ?? []).some(
    ({ reservation }) =>
      HOLDING_RESERVATION_STATUSES.includes(reservation.status as never) &&
      reservation.startTime < until &&
      (reservation.endTime ?? reservation.startTime) > from,
  );
  return deriveTableStatus({
    physicalStatus: row.physicalStatus,
    hasOpenOrder,
    hasImminentReservation,
  });
}

/**
 * The include every caller that derives a status must use. Exported so the
 * shape cannot drift between call sites.
 */
export const tableStatusInclude = {
  orderTables: { select: { order: { select: { status: true } } } },
  reservations: {
    select: {
      reservation: { select: { startTime: true, endTime: true, status: true } },
    },
  },
} as const;

/**
 * Maps a legacy status onto the physical column. Used while both columns are
 * maintained: the derived states collapse to READY because they are recomputed
 * from relations.
 */
export function toPhysicalStatus(
  status: RestaurantTableStatus,
): RestaurantTablePhysicalStatus {
  if (status === "OUT_OF_SERVICE") return "OUT_OF_SERVICE";
  if (status === "DIRTY") return "DIRTY";
  return "READY";
}
