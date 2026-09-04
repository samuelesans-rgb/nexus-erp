import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFusionDispatchLines } from "../../lib/restaurant-fusion-dispatch";
import { hasRestaurantCapability } from "../../lib/restaurant-access";

test("SALA ha soltanto le capability operative del ristorante", () => {
  assert.equal(hasRestaurantCapability(["SALA"], "read"), false);
  assert.equal(hasRestaurantCapability(["SALA"], "floor"), true);
  assert.equal(hasRestaurantCapability(["SALA"], "operate"), false);
  assert.equal(hasRestaurantCapability(["SALA"], "manage"), false);
  assert.equal(hasRestaurantCapability(["SALA"], "kitchen"), false);
  assert.equal(hasRestaurantCapability(["SALA"], "inventory"), false);
  assert.equal(hasRestaurantCapability(["SALA"], "accounting"), false);
});

test("FUSION preserva MAIN -> modifier e più piatti senza inviare note o modifier locali", () => {
  const lines = buildFusionDispatchLines([
    {
      id: "line-1",
      itemId: "main-1",
      plu: 250,
      quantity: 1,
      hasNotes: true,
      modifiers: [
        {
          id: "m-1",
          itemId: null,
          fusionPluId: 501,
          fusionPlateVariation: true,
        },
        {
          id: "m-local",
          itemId: null,
          fusionPluId: null,
          fusionPlateVariation: false,
        },
        {
          id: "m-disabled",
          itemId: null,
          fusionPluId: 999,
          fusionPlateVariation: false,
        },
        {
          id: "m-2",
          itemId: null,
          fusionPluId: 502,
          fusionPlateVariation: true,
        },
      ],
    },
    {
      id: "line-2",
      itemId: "main-2",
      plu: 300,
      quantity: 2,
      hasNotes: false,
      modifiers: [],
    },
  ]);
  assert.deepEqual(
    lines.map((line) => line.plu),
    [250, 501, 502, 300],
  );
  assert.deepEqual(
    lines.map((line) => line.quantity),
    [1, 1, 1, 2],
  );
  assert.equal(
    lines.every((line) => !line.hasModifiers),
    true,
  );
});
