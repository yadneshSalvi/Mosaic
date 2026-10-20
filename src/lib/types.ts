import { z } from "zod";
export const EntitySchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  type: z.enum([
    "incident",
    "client_code",
    "project",
    "customer",
    "channel",
    "other",
  ]),
});
export const RectSchema = z
  .object({
    x: z.number().min(0).lt(1),
    y: z.number().min(0).lt(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (r) => r.x + r.width <= 1 && r.y + r.height <= 1,
    "Region extends outside source",
  );
export const RegionSchema = z.object({
  id: z.string().min(1).max(80),
  sourceId: z.string().min(1).max(80),
  quote: z.string().min(1).max(500),
  label: z.string().min(1).max(120),
  rect: RectSchema,
});
export const RelationSchema = z.object({
  id: z.string().min(1).max(80),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  predicate: z.string().min(1).max(120),
  regionId: z.string().min(1).max(80),
  status: z.enum(["confirmed", "suggested", "rejected"]),
  confirmedBy: z.enum(["fixture", "user"]).optional(),
});
export const EvidenceSchema = z.object({
  entities: z.array(EntitySchema).min(2).max(24),
  regions: z.array(RegionSchema).max(24),
  relations: z.array(RelationSchema).max(32),
  protectedFrom: z.string(),
  protectedTo: z.string(),
});
export type Entity = z.infer<typeof EntitySchema>;
export type Rect = z.infer<typeof RectSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Source = {
  id: string;
  name: string;
  title: string;
  description: string;
  width: number;
  height: number;
  url: string;
};
export type Workspace = Evidence & {
  title: string;
  sources: Source[];
  origin: "sample" | "upload";
};
export function validateEvidence(raw: unknown, sourceIds: string[]): Evidence {
  const data = EvidenceSchema.parse(raw);
  for (const items of [data.entities, data.regions, data.relations])
    if (new Set(items.map((x) => x.id)).size !== items.length)
      throw new Error("Duplicate evidence identifiers");
  const entityIds = new Set(data.entities.map((e) => e.id));
  const regionIds = new Set(data.regions.map((r) => r.id));
  if (
    !entityIds.has(data.protectedFrom) ||
    !entityIds.has(data.protectedTo) ||
    data.protectedFrom === data.protectedTo
  )
    throw new Error("Two distinct protected endpoints are required");
  if (data.regions.some((r) => !sourceIds.includes(r.sourceId)))
    throw new Error("Unknown source reference");
  if (
    data.relations.some(
      (r) =>
        !entityIds.has(r.from) ||
        !entityIds.has(r.to) ||
        !regionIds.has(r.regionId) ||
        r.from === r.to,
    )
  )
    throw new Error("Unknown or invalid relation reference");
  // Identity is explicit: id AND type. No automatic token/fuzzy merging happens here.
  return data;
}

export const readablePredicate = (predicate: string) =>
  predicate.replace(/_+/g, " ");
