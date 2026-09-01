import { randomUUID } from "node:crypto";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { getPrintQueue } from "@/lib/restaurant-kitchen";
import { kitchenPrintAction } from "../../actions";

export default async function Page() {
  const context = await requireRestaurantContext(MODULE_CODES.RESTAURANT_KITCHEN, "kitchen");
  const jobs = await getPrintQueue(context.companyId, context.locationId);
  return <div className="space-y-4"><h1 className="text-2xl font-bold">Coda stampa cucina</h1><div className="grid gap-3">{jobs.map((job) => <article className="border p-4" key={job.id}>
    <div className="flex flex-wrap justify-between gap-2"><b>{job.station.name} · {job.ticket ? `${job.ticket.orderCode} · #${job.ticket.dispatchNumber}` : job.printType}</b><span>{job.type} · {job.status} · tentativi {job.attempts}</span></div>
    {job.connectorId && <p className="text-sm text-neutral-600">Connector {job.connectorId} · lease {job.leaseExpiresAt?.toISOString() ?? "concluso"}</p>}{job.lastError && <p className="text-red-700">{job.lastError}</p>}
    <div className="mt-2 flex gap-2">{job.status === "PENDING" && <form action={kitchenPrintAction}><input type="hidden" name="jobId" value={job.id}/><button className="border px-3 py-1" name="operation" value="process">Stampa locale</button></form>}{job.status === "FAILED" && <form action={kitchenPrintAction}><input type="hidden" name="jobId" value={job.id}/><button className="border px-3 py-1" name="operation" value="retry">Retry</button></form>}{job.status === "PRINTED" && job.ticketId && <form action={kitchenPrintAction}><input type="hidden" name="ticketId" value={job.ticketId}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><button className="border px-3 py-1" name="operation" value="reprint">Ristampa</button></form>}</div>
  </article>)}</div></div>;
}
