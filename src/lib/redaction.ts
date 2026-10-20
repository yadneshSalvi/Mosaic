import type { Region, Source, Workspace } from "./types";
import { findRoutes } from "./graph";
import { pixelRect, assertMaskPlan, verifyKeptPixels } from "./geometry";
export { pixelRect } from "./geometry";
export const MASK = [24, 27, 34, 255] as const;
export function verifyPixels(
  original: Uint8ClampedArray | Uint8Array,
  output: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  regions: Region[],
) {
  if (
    original.length !== width * height * 4 ||
    output.length !== original.length
  )
    throw new Error("Export dimensions do not match source");
  const covered = new Uint8Array(width * height);
  const verified: string[] = [];
  for (const region of regions) {
    const rect = pixelRect(region.rect, width, height);
    let correct = true;
    for (let y = rect.y; y < rect.y + rect.height; y++)
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const p = y * width + x;
        covered[p] = 1;
        for (let c = 0; c < 4; c++)
          if (output[p * 4 + c] !== MASK[c]) correct = false;
      }
    if (correct) verified.push(region.id);
  }
  let preserved = true;
  for (let p = 0; p < covered.length; p++)
    if (!covered[p])
      for (let c = 0; c < 4; c++)
        if (original[p * 4 + c] !== output[p * 4 + c]) preserved = false;
  return {
    verified,
    preserved,
    passed: preserved && verified.length === regions.length,
  };
}
async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("An image could not be decoded"));
    img.src = url;
  });
  return img;
}
function canvasFor(image: HTMLImageElement, flatten = true) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable");
  // Flatten transparency onto paper; the exported image contains no source layers.
  if (flatten) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx };
}
export type ExportFile = {
  sourceId: string;
  keptRegionIds: string[];
  name: string;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  maskedRegions: number;
  verifiedRegions: string[];
  preserved: boolean;
};
export type ExportResult = {
  keptRegionIds: string[];
  files: ExportFile[];
  remainingRoutes: number;
  complete: boolean;
  verifiedRegionIds: string[];
  passed: boolean;
};
export async function exportSource(
  source: Source,
  regions: Region[],
  index: number,
  kept: Region[] = [],
): Promise<ExportFile> {
  assertMaskPlan(
    [...regions, ...kept.filter((k) => !regions.some((r) => r.id === k.id))],
    [source],
    new Set(regions.map((r) => r.id)),
    new Set(kept.map((r) => r.id)),
  );
  const original = await decode(source.url);
  const { canvas, ctx } = canvasFor(original);
  if (canvas.width !== source.width || canvas.height !== source.height)
    throw new Error("Source dimensions changed; reload this bundle");
  const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (const region of regions) {
    const r = pixelRect(region.rect, canvas.width, canvas.height);
    ctx.fillStyle = `rgb(${MASK[0]},${MASK[1]},${MASK[2]})`;
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob);
  try {
    const reopened = await decode(url);
    const decoded = canvasFor(reopened, false);
    if (
      reopened.naturalWidth !== canvas.width ||
      reopened.naturalHeight !== canvas.height
    )
      throw new Error("Export dimensions changed");
    const after = decoded.ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data;
    const keptRegionIds = verifyKeptPixels(
      before,
      after,
      canvas.width,
      canvas.height,
      kept,
    );
    const check = verifyPixels(
      before,
      after,
      canvas.width,
      canvas.height,
      regions,
    );
    if (!check.passed || keptRegionIds.length !== kept.length)
      throw new Error(
        "Exported pixels did not match the requested repair. No verified output was produced.",
      );
    return {
      sourceId: source.id,
      keptRegionIds,
      name: `mosaic-${String(index + 1).padStart(2, "0")}.png`,
      url,
      blob,
      width: canvas.width,
      height: canvas.height,
      maskedRegions: regions.length,
      verifiedRegions: check.verified,
      preserved: check.preserved,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
export async function exportWorkspace(
  workspace: Workspace,
  removed: Set<string>,
  kept: Set<string> = new Set(),
): Promise<ExportResult> {
  assertMaskPlan(workspace.regions, workspace.sources, removed, kept);
  const files: ExportFile[] = [];
  try {
    for (let i = 0; i < workspace.sources.length; i++)
      files.push(
        await exportSource(
          workspace.sources[i],
          workspace.regions.filter(
            (r) => r.sourceId === workspace.sources[i].id && removed.has(r.id),
          ),
          i,
          workspace.regions.filter(
            (r) => r.sourceId === workspace.sources[i].id && kept.has(r.id),
          ),
        ),
      );
    const verifiedRegionIds = files.flatMap((f) => f.verifiedRegions);
    const result = findRoutes(workspace, new Set(verifiedRegionIds));
    return {
      files,
      keptRegionIds: files.flatMap((f) => f.keptRegionIds),
      remainingRoutes: result.paths.length,
      complete: result.complete,
      verifiedRegionIds,
      passed:
        result.complete &&
        result.paths.length === 0 &&
        verifiedRegionIds.length === removed.size,
    };
  } catch (error) {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    throw error;
  }
}
