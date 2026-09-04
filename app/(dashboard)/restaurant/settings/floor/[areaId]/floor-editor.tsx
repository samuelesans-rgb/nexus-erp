"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveLayoutConfigAction, saveTableConfigAction } from "../actions";

type Table = {
  id: string;
  code: string;
  name: string;
  seats: number;
  shape: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  sortOrder: number;
  active: boolean;
  visibleInFloor: boolean;
  fusionTableNumber: number | null;
  status: string;
};
type Area = {
  id: string;
  name: string;
  layoutWidth: number;
  layoutHeight: number;
  backgroundImage: string | null;
  backgroundOpacity: number;
  updatedAt: string;
  tables: Table[];
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const draft = (): Table => ({
  id: `draft-${crypto.randomUUID()}`,
  code: "",
  name: "",
  seats: 2,
  shape: "RECTANGLE",
  positionX: 40,
  positionY: 40,
  width: 120,
  height: 80,
  rotation: 0,
  sortOrder: 0,
  active: true,
  visibleInFloor: true,
  fusionTableNumber: null,
  status: "AVAILABLE",
});

export function FloorEditor({ area }: { area: Area }) {
  const canvas = useRef<HTMLDivElement>(null),
    [pending, startTransition] = useTransition();
  const [tables, setTables] = useState(area.tables),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [dirty, setDirty] = useState(false),
    [snap, setSnap] = useState(true),
    [feedback, setFeedback] = useState("");
  const selected = useMemo(
    () => tables.find(({ id }) => id === selectedId) ?? null,
    [selectedId, tables],
  );
  const update = (id: string, values: Partial<Table>) => {
    setTables((current) =>
      current.map((table) =>
        table.id === id ? { ...table, ...values } : table,
      ),
    );
    setDirty(true);
  };
  const pointer = (
    event: React.PointerEvent,
    table: Table,
    mode: "move" | "resize",
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvas.current!.getBoundingClientRect(),
      startX = event.clientX,
      startY = event.clientY,
      original = { ...table },
      grid = snap ? 20 : 1;
    const move = (next: PointerEvent) => {
      const dx = ((next.clientX - startX) * area.layoutWidth) / rect.width,
        dy = ((next.clientY - startY) * area.layoutHeight) / rect.height;
      if (mode === "move")
        update(table.id, {
          positionX:
            Math.round(
              clamp(
                original.positionX + dx,
                0,
                area.layoutWidth - original.width,
              ) / grid,
            ) * grid,
          positionY:
            Math.round(
              clamp(
                original.positionY + dy,
                0,
                area.layoutHeight - original.height,
              ) / grid,
            ) * grid,
        });
      else {
        const side =
          original.shape === "ROUND" || original.shape === "SQUARE"
            ? Math.max(dx, dy)
            : 0;
        const width = clamp(
            original.width + (side || dx),
            60,
            area.layoutWidth - original.positionX,
          ),
          height = clamp(
            original.height + (side || dy),
            60,
            area.layoutHeight - original.positionY,
          );
        update(table.id, {
          width: Math.round(width / grid) * grid,
          height: Math.round(height / grid) * grid,
        });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const saveLayout = () =>
    startTransition(async () => {
      setFeedback("");
      const result = await saveLayoutConfigAction(
        area.id,
        area.updatedAt,
        tables
          .filter(({ id }) => !id.startsWith("draft-"))
          .map(({ id, positionX, positionY, width, height, rotation }) => ({
            id,
            positionX,
            positionY,
            width,
            height,
            rotation,
          })),
      );
      setFeedback(result.message);
      if (result.ok) {
        window.location.reload();
      }
    });
  const saveTable = () => {
    if (!selected) return;
    startTransition(async () => {
      const result = await saveTableConfigAction(area.id, {
        ...selected,
        id: selected.id.startsWith("draft-") ? undefined : selected.id,
        areaId: area.id,
      });
      setFeedback(result.message);
      if (result.ok) {
        window.location.reload();
      }
    });
  };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/restaurant/settings/floor"
            className="text-sm text-slate-500"
          >
            ← Configurazione Sala
          </Link>
          <h1 className="text-3xl font-bold">Pianta · {area.name}</h1>
          <p className="text-sm text-slate-500">
            Canvas virtuale {area.layoutWidth} × {area.layoutHeight}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
            <input
              type="checkbox"
              checked={snap}
              onChange={(event) => setSnap(event.target.checked)}
            />{" "}
            Snap 20
          </label>
          <button
            onClick={() => {
              setTables(area.tables);
              setSelectedId(null);
              setDirty(false);
            }}
            disabled={!dirty}
            className="rounded-lg border px-4"
          >
            Annulla
          </button>
          <button
            onClick={saveLayout}
            disabled={
              !dirty ||
              pending ||
              tables.some(({ id }) => id.startsWith("draft-"))
            }
            className="rounded-lg bg-emerald-700 px-4 font-bold text-white disabled:opacity-40"
          >
            Salva pianta
          </button>
        </div>
      </header>
      {dirty && (
        <p role="status" className="rounded bg-amber-50 p-2 text-amber-800">
          Modifiche non salvate
        </p>
      )}
      {feedback && (
        <p role="status" className="rounded bg-slate-100 p-2">
          {feedback}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          ref={canvas}
          className="relative w-full touch-none overflow-hidden rounded-2xl border-2 bg-slate-100"
          style={{
            aspectRatio: `${area.layoutWidth}/${area.layoutHeight}`,
            backgroundImage: area.backgroundImage
              ? `linear-gradient(rgb(255 255 255 / ${1 - area.backgroundOpacity}),rgb(255 255 255 / ${1 - area.backgroundOpacity})),url(${area.backgroundImage})`
              : undefined,
            backgroundSize: "cover",
          }}
        >
          {tables.map((table) => (
            <button
              key={table.id}
              aria-label={`Tavolo ${table.code || "nuovo"}, ${table.status}`}
              onClick={() => setSelectedId(table.id)}
              onPointerDown={(event) => pointer(event, table, "move")}
              onKeyDown={(event) => {
                const delta = event.shiftKey ? 20 : 5;
                if (event.key === "ArrowLeft")
                  update(table.id, {
                    positionX: clamp(
                      table.positionX - delta,
                      0,
                      area.layoutWidth - table.width,
                    ),
                  });
                if (event.key === "ArrowRight")
                  update(table.id, {
                    positionX: clamp(
                      table.positionX + delta,
                      0,
                      area.layoutWidth - table.width,
                    ),
                  });
                if (event.key === "ArrowUp")
                  update(table.id, {
                    positionY: clamp(
                      table.positionY - delta,
                      0,
                      area.layoutHeight - table.height,
                    ),
                  });
                if (event.key === "ArrowDown")
                  update(table.id, {
                    positionY: clamp(
                      table.positionY + delta,
                      0,
                      area.layoutHeight - table.height,
                    ),
                  });
              }}
              className={`absolute flex min-h-11 min-w-11 items-center justify-center border-2 bg-white text-center font-bold shadow ${selectedId === table.id ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-500"}`}
              style={{
                left: `${(table.positionX / area.layoutWidth) * 100}%`,
                top: `${(table.positionY / area.layoutHeight) * 100}%`,
                width: `${(table.width / area.layoutWidth) * 100}%`,
                height: `${(table.height / area.layoutHeight) * 100}%`,
                transform: `rotate(${table.rotation}deg)`,
                borderRadius: table.shape === "ROUND" ? "9999px" : undefined,
              }}
            >
              {table.code || "NUOVO"}
              {selectedId === table.id && (
                <span
                  aria-label="Ridimensiona tavolo"
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    pointer(event, table, "resize");
                  }}
                  className="absolute -bottom-2 -right-2 size-6 cursor-se-resize rounded-full bg-blue-600"
                />
              )}
            </button>
          ))}
        </div>
        <aside className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Proprietà</h2>
            <button
              onClick={() => {
                const table = draft();
                setTables((current) => [...current, table]);
                setSelectedId(table.id);
                setDirty(true);
              }}
              className="rounded-lg bg-slate-950 px-3 py-2 text-white"
            >
              + Tavolo
            </button>
          </div>
          {selected ? (
            <div className="mt-4 space-y-3">
              {(
                [
                  ["code", "Numero / codice", "text"],
                  ["name", "Nome", "text"],
                  ["seats", "Capienza", "number"],
                  ["fusionTableNumber", "Tavolo FUSION", "number"],
                  ["width", "Larghezza", "number"],
                  ["height", "Altezza", "number"],
                  ["sortOrder", "Ordine", "number"],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key} className="block text-sm">
                  {label}
                  <input
                    aria-label={label}
                    className="mt-1 min-h-11 w-full rounded border px-3"
                    type={type}
                    min={type === "number" ? "0" : undefined}
                    value={selected[key] ?? ""}
                    onChange={(event) =>
                      update(selected.id, {
                        [key]:
                          type === "number"
                            ? event.target.value === ""
                              ? null
                              : Number(event.target.value)
                            : event.target.value,
                      })
                    }
                  />
                </label>
              ))}
              <label className="block text-sm">
                Forma
                <select
                  aria-label="Forma"
                  value={selected.shape}
                  onChange={(event) => {
                    const shape = event.target.value;
                    update(selected.id, {
                      shape,
                      height:
                        shape === "ROUND" || shape === "SQUARE"
                          ? selected.width
                          : selected.height,
                    });
                  }}
                  className="mt-1 min-h-11 w-full rounded border px-3"
                >
                  <option>RECTANGLE</option>
                  <option>SQUARE</option>
                  <option>ROUND</option>
                </select>
              </label>
              <button
                onClick={() =>
                  update(selected.id, {
                    rotation: (selected.rotation + 90) % 360,
                  })
                }
                className="min-h-11 w-full rounded border"
              >
                Ruota 90° · {selected.rotation}°
              </button>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={selected.active}
                  onChange={(event) =>
                    update(selected.id, { active: event.target.checked })
                  }
                />{" "}
                Attivo
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={selected.visibleInFloor}
                  onChange={(event) =>
                    update(selected.id, {
                      visibleInFloor: event.target.checked,
                    })
                  }
                />{" "}
                Visibile in Sala
              </label>
              {selected.status === "OCCUPIED" && (
                <p className="rounded bg-blue-50 p-2 text-sm">
                  OCCUPATO · geometria modificabile, disattivazione bloccata.
                </p>
              )}
              <button
                onClick={saveTable}
                disabled={pending}
                className="min-h-11 w-full rounded-lg bg-slate-950 font-bold text-white"
              >
                Salva tavolo
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Seleziona un tavolo o aggiungine uno.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
