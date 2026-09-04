export type FusionDispatchSourceLine = {
  id: string;
  itemId: string;
  plu?: number;
  quantity: number;
  hasNotes: boolean;
  modifiers: Array<{
    id: string;
    itemId: string | null;
    fusionPluId: number | null;
    fusionPlateVariation: boolean;
  }>;
};

export function buildFusionDispatchLines(
  lines: readonly FusionDispatchSourceLine[],
) {
  return lines.flatMap((line) => [
    {
      lineId: line.id,
      itemId: line.itemId,
      plu: line.plu,
      quantity: line.quantity,
      hasModifiers: false,
      hasNotes: line.hasNotes,
    },
    ...line.modifiers.flatMap((modifier) =>
      modifier.fusionPluId && modifier.fusionPlateVariation
        ? [
            {
              lineId: `${line.id}:modifier:${modifier.id}`,
              itemId: modifier.itemId ?? `modifier:${modifier.id}`,
              plu: modifier.fusionPluId,
              quantity: line.quantity,
              hasModifiers: false,
              hasNotes: false,
            },
          ]
        : [],
    ),
  ]);
}
