import type { Rect, Region, Source } from "./types.ts";
export type PixelRect = { x: number; y: number; width: number; height: number };
export function pixelRect(
  rect: Rect,
  width: number,
  height: number,
): PixelRect {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n > 0) ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x >= 1 ||
    rect.y >= 1 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x + rect.width > 1 ||
    rect.y + rect.height > 1
  )
    throw new Error("Invalid redaction bounds");
  const x = Math.floor(rect.x * width),
    y = Math.floor(rect.y * height);
  const result = {
    x,
    y,
    width: Math.min(width, Math.ceil((rect.x + rect.width) * width)) - x,
    height: Math.min(height, Math.ceil((rect.y + rect.height) * height)) - y,
  };
  if (result.width < 1 || result.height < 1)
    throw new Error("Redaction region has no pixels");
  return result;
}

export function intersects(a: PixelRect, b: PixelRect) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}
export function maskConflicts(
  regions: Region[],
  sources: Pick<Source, "id" | "width" | "height">[],
  maskIds: Set<string>,
  keepIds: Set<string>,
) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  for (const id of [...maskIds, ...keepIds])
    if (!byId.has(id))
      throw new Error("Unknown evidence region in repair plan");
  const conflicts: { maskId: string; keepId: string }[] = [];
  for (const maskId of maskIds) {
    const mask = byId.get(maskId)!;
    const source = sources.find((s) => s.id === mask.sourceId);
    if (!source)
      throw new Error("Missing source dimensions for pixel constraints");
    const box = pixelRect(mask.rect, source.width, source.height);
    for (const keepId of keepIds) {
      const keep = byId.get(keepId)!;
      if (
        keep.sourceId === mask.sourceId &&
        intersects(box, pixelRect(keep.rect, source.width, source.height))
      )
        conflicts.push({ maskId, keepId });
    }
  }
  return conflicts;
}
export function assertMaskPlan(
  regions: Region[],
  sources: Pick<Source, "id" | "width" | "height">[],
  maskIds: Set<string>,
  keepIds: Set<string>,
) {
  if (maskConflicts(regions, sources, maskIds, keepIds).length)
    throw new Error(
      "This mask would change pixels marked Keep visible. Release the constraint or choose another repair.",
    );
}
export function verifyKeptPixels(
  original: Uint8ClampedArray | Uint8Array,
  output: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  kept: Region[],
) {
  if (
    original.length !== width * height * 4 ||
    output.length !== original.length
  )
    throw new Error("Source and export dimensions differ");
  return kept
    .filter((region) => {
      const box = pixelRect(region.rect, width, height);
      for (let y = box.y; y < box.y + box.height; y++)
        for (let x = box.x; x < box.x + box.width; x++)
          for (let c = 0; c < 4; c++)
            if (
              original[(y * width + x) * 4 + c] !==
              output[(y * width + x) * 4 + c]
            )
              return false;
      return true;
    })
    .map((r) => r.id);
}
