import { z } from "zod";
import {
  EntitySchema,
  RegionSchema,
  validateEvidence,
  type Workspace,
} from "./types";
import { findRoutes } from "./graph";
import { maskConflicts, pixelRect } from "./geometry";
import type { ExportResult } from "./redaction";

// This deliberately has no protected target, original graph, filenames or annotations.
export const ReaderRequestSchema = z
  .object({
    consent: z.literal(true),
    startingFact: z.string().trim().min(1).max(120),
    sources: z
      .array(
        z
          .object({
            id: z.string().regex(/^output-[1-6]$/),
            data: z.string().max(9 * 1024 * 1024),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict();
export type ReaderRequest = z.infer<typeof ReaderRequestSchema>;
const ReaderRelationSchema = z
  .object({
    id: z.string().min(1).max(80),
    from: z.string().min(1).max(80),
    to: z.string().min(1).max(80),
    predicate: z.string().min(1).max(120),
    regionId: z.string().min(1).max(80),
  })
  .strict();
export const ReaderResponseSchema = z
  .object({
    status: z.enum([
      "supported",
      "ambiguous",
      "not_found",
      "starting_fact_not_found",
    ]),
    startingEntityId: z.string().min(1).max(80).nullable(),
    entities: z.array(EntitySchema.strict()).max(12),
    regions: z.array(RegionSchema.strict()).max(16),
    relations: z.array(ReaderRelationSchema).max(20),
    attributions: z
      .array(
        z
          .object({
            customerEntityId: z.string().min(1).max(80),
            status: z.enum(["supported", "ambiguous"]),
            explanation: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(3),
    uncertainty: z.string().min(1).max(500),
  })
  .strict();
export type ReaderResponse = z.infer<typeof ReaderResponseSchema>;
export const normalizeLabel = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export function parseReaderResponse(
  raw: unknown,
  sourceIds: string[],
  startingFact: string,
): ReaderResponse {
  const result = ReaderResponseSchema.parse(raw);
  const entities = new Map(result.entities.map((e) => [e.id, e]));
  const regions = new Set(result.regions.map((r) => r.id));
  for (const items of [result.entities, result.regions, result.relations])
    if (new Set(items.map((x) => x.id)).size !== items.length)
      throw new Error("Duplicate reader identifiers");
  if (result.regions.some((r) => !sourceIds.includes(r.sourceId)))
    throw new Error("Unknown reader source");
  if (
    result.relations.some(
      (r) =>
        !entities.has(r.from) ||
        !entities.has(r.to) ||
        r.from === r.to ||
        !regions.has(r.regionId),
    )
  )
    throw new Error("Invalid reader relation");
  if (
    result.startingEntityId !== null &&
    normalizeLabel(entities.get(result.startingEntityId)?.label ?? "") !==
      normalizeLabel(startingFact)
  )
    throw new Error("Reader starting fact differs");
  if (
    result.startingEntityId === null &&
    result.entities.some(
      (entity) => normalizeLabel(entity.label) === normalizeLabel(startingFact),
    )
  )
    throw new Error("Absent starting fact contradicts returned entities");
  if (
    (result.status === "starting_fact_not_found") !==
    (result.startingEntityId === null)
  )
    throw new Error("Inconsistent starting fact status");
  if (
    new Set(result.attributions.map((a) => a.customerEntityId)).size !==
    result.attributions.length
  )
    throw new Error("Duplicate attribution");
  for (const attribution of result.attributions) {
    if (entities.get(attribution.customerEntityId)?.type !== "customer")
      throw new Error("Attribution must reference a customer");
    if (attribution.status === "supported") {
      if (!result.startingEntityId) throw new Error("Missing starting fact");
      const paths = findRoutes({
        ...result,
        protectedFrom: result.startingEntityId,
        protectedTo: attribution.customerEntityId,
        relations: result.relations.map((r) => ({
          ...r,
          status: "suggested" as const,
        })),
      });
      if (!paths.complete || !paths.paths.length)
        throw new Error("Unsupported customer attribution");
    }
  }
  // Do not accept a negative headline that contradicts its own returned graph.
  if (result.startingEntityId) {
    for (const entity of result.entities.filter((e) => e.type === "customer")) {
      const paths = findRoutes({
        ...result,
        protectedFrom: result.startingEntityId,
        protectedTo: entity.id,
        relations: result.relations.map((r) => ({
          ...r,
          status: "suggested" as const,
        })),
      });
      if (!paths.complete) throw new Error("Reader graph search incomplete");
      if (
        paths.paths.length &&
        !result.attributions.some((a) => a.customerEntityId === entity.id)
      )
        throw new Error("Reader headline contradicts supported evidence");
    }
  }
  const supported = result.attributions.some((a) => a.status === "supported");
  if ((result.status === "supported") !== supported)
    throw new Error("Inconsistent supported status");
  if (result.status === "ambiguous" && !result.attributions.length)
    throw new Error("Missing ambiguous candidate");
  if (
    ["not_found", "starting_fact_not_found"].includes(result.status) &&
    result.attributions.length
  )
    throw new Error("Unexpected attribution");
  return result;
}
export function compareReaderLocally(
  result: ReaderResponse,
  protectedLabel: string,
) {
  const matching = result.attributions.filter(
    (a) =>
      normalizeLabel(
        result.entities.find((e) => e.id === a.customerEntityId)!.label,
      ) === normalizeLabel(protectedLabel),
  );
  if (matching.some((a) => a.status === "supported"))
    return "recovered" as const;
  if (result.attributions.length) return "review" as const;
  if (result.status === "starting_fact_not_found")
    return "starting_fact_absent" as const;
  return "not_recovered" as const;
}
export async function blobDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:image/png;base64,${btoa(binary)}`;
}
export async function buildReaderRequest(
  files: Pick<ExportResult["files"][number], "blob">[],
  startingFact: string,
): Promise<ReaderRequest> {
  return ReaderRequestSchema.parse({
    consent: true,
    startingFact,
    sources: await Promise.all(
      files.map(async (file, i) => ({
        id: `output-${i + 1}`,
        data: await blobDataUrl(file.blob),
      })),
    ),
  });
}
// Review fresh findings against emitted pixels, never originals behind a removed region.
export async function buildReaderReview(
  workspace: Workspace,
  result: ReaderResponse,
  exported: ExportResult,
): Promise<Workspace> {
  const entities = [...workspace.entities];
  const ids = new Map<string, string>();
  const prefix = `reader-${crypto.randomUUID().slice(0, 8)}-`;
  result.entities.forEach((entity, index) => {
    const existing = entities.find(
      (e) =>
        e.type === entity.type &&
        normalizeLabel(e.label) === normalizeLabel(entity.label),
    );
    const id = existing?.id ?? `${prefix}n${index}`;
    ids.set(entity.id, id);
    if (!existing) entities.push({ ...entity, id });
  });
  const removed = new Set(exported.verifiedRegionIds);
  for (const conflict of maskConflicts(
    workspace.regions,
    workspace.sources,
    removed,
    new Set(workspace.regions.map((r) => r.id)),
  ))
    removed.add(conflict.keepId);
  const regions = workspace.regions.filter((r) => !removed.has(r.id));
  const relations = workspace.relations.filter((r) => !removed.has(r.regionId));
  const regionIds = new Map<string, string>();
  result.regions.forEach((region, index) => {
    const file =
      exported.files[Number(region.sourceId.replace("output-", "")) - 1];
    if (!file) throw new Error("Missing exported source");
    const sourceId = file.sourceId;
    const existing = regions.find(
      (r) =>
        r.sourceId === sourceId &&
        normalizeLabel(r.quote) === normalizeLabel(region.quote) &&
        JSON.stringify(pixelRect(r.rect, file.width, file.height)) ===
          JSON.stringify(pixelRect(region.rect, file.width, file.height)),
    );
    const id = existing?.id ?? `${prefix}r${index}`;
    regionIds.set(region.id, id);
    if (!existing) regions.push({ ...region, id, sourceId });
  });
  result.relations.forEach((relation, index) => {
    const from = ids.get(relation.from)!,
      to = ids.get(relation.to)!,
      regionId = regionIds.get(relation.regionId)!;
    if (
      !relations.some(
        (r) =>
          r.from === from &&
          r.to === to &&
          r.regionId === regionId &&
          r.status !== "rejected",
      )
    )
      relations.push({
        ...relation,
        id: `${prefix}e${index}`,
        from,
        to,
        regionId,
        status: "suggested",
      });
  });
  const evidence = validateEvidence(
    { ...workspace, entities, regions, relations },
    workspace.sources.map((s) => s.id),
  );
  const sources = await Promise.all(
    exported.files.map(async (file, i) => ({
      id: file.sourceId,
      name: file.name,
      title: `Exported source ${i + 1}`,
      description: "Actual flattened PNG from the previous export",
      width: file.width,
      height: file.height,
      url: await blobDataUrl(file.blob),
    })),
  );
  return {
    ...evidence,
    sources,
    title: "Exported bundle · fresh review",
    origin: "upload",
  };
}

export function retainedKeepIds(
  previous: Set<string>,
  review: Workspace,
  exported: ExportResult,
) {
  const verified = new Set(exported.keptRegionIds);
  const existing = new Set(review.regions.map((r) => r.id));
  return new Set(
    [...previous].filter((id) => verified.has(id) && existing.has(id)),
  );
}
