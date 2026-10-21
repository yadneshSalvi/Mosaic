import type { Evidence, Relation, Source } from "./types.ts";
import { maskConflicts } from "./geometry.ts";
export type RouteResult = { paths: Relation[][]; complete: boolean };
export function findRoutes(
  evidence: Evidence,
  removed = new Set<string>(),
  limit = 256,
): RouteResult {
  const paths: Relation[][] = [];
  let complete = true;
  let visits = 0;
  const adjacency = new Map<string, Relation[]>();
  for (const edge of evidence.relations) {
    if (edge.status === "rejected" || removed.has(edge.regionId)) continue;
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
  }
  function visit(id: string, path: Relation[], seen: Set<string>) {
    if (!complete) return;
    if (++visits > 20000) {
      complete = false;
      return;
    }
    if (id === evidence.protectedTo) {
      if (paths.length >= limit) {
        complete = false;
        return;
      }
      paths.push(path);
      return;
    }
    for (const edge of adjacency.get(id) ?? []) {
      if (!seen.has(edge.to))
        visit(edge.to, [...path, edge], new Set([...seen, edge.to]));
    }
  }
  if (evidence.protectedFrom === evidence.protectedTo)
    return { paths: [], complete: false };
  visit(evidence.protectedFrom, [], new Set([evidence.protectedFrom]));
  return { paths, complete };
}
export type CutResult = {
  regionIds: string[];
  exact: boolean;
  feasible?: boolean;
  reason?: string;
};
export function minimumRegionCut(
  evidence: Evidence,
  options: {
    keepRegionIds?: Set<string>;
    sources?: Pick<Source, "id" | "width" | "height">[];
  } = {},
): CutResult {
  const result = findRoutes(evidence);
  if (!result.complete)
    return {
      regionIds: [],
      exact: false,
      reason:
        "The graph has too many routes for a complete search. Review a smaller bundle.",
    };
  if (!result.paths.length) return { regionIds: [], exact: true };
  const allCandidates = [
    ...new Set(result.paths.flatMap((p) => p.map((e) => e.regionId))),
  ];
  const keep = options.keepRegionIds ?? new Set<string>();
  if (keep.size && !options.sources)
    throw new Error(
      "Source dimensions are required for keep-visible constraints",
    );
  const candidates = allCandidates
    .filter(
      (id) =>
        !keep.size ||
        maskConflicts(evidence.regions, options.sources!, new Set([id]), keep)
          .length === 0,
    )
    .sort();
  if (candidates.length > 20)
    return {
      regionIds: [],
      exact: false,
      reason:
        "There are too many candidate regions for an exact minimal repair.",
    };
  const routeSets = result.paths.map((p) => new Set(p.map((e) => e.regionId)));
  const areas = new Map(
    evidence.regions.map((r) => [r.id, r.rect.width * r.rect.height]),
  );
  for (let size = 1; size <= candidates.length; size++) {
    let best: string[] | null = null;
    let bestArea = Infinity;
    function choose(start: number, chosen: string[]) {
      if (chosen.length === size) {
        if (routeSets.every((p) => chosen.some((id) => p.has(id)))) {
          const area = chosen.reduce(
            (sum, id) => sum + (areas.get(id) ?? 1),
            0,
          );
          if (area < bestArea) {
            best = [...chosen];
            bestArea = area;
          }
        }
        return;
      }
      for (let i = start; i <= candidates.length - (size - chosen.length); i++)
        choose(i + 1, [...chosen, candidates[i]]);
    }
    choose(0, []);
    if (best) return { regionIds: best, exact: true };
  }
  return {
    regionIds: [],
    exact: true,
    feasible: false,
    reason:
      "No repair satisfies all your Keep visible choices. Release a kept region or review the surviving route.",
  };
}
