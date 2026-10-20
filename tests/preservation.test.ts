import { describe, it, expect } from "vitest";
import { minimumRegionCut, findRoutes } from "../src/lib/graph";
import { sampleWorkspace } from "../src/lib/sample";
import {
  maskConflicts,
  assertMaskPlan,
  verifyKeptPixels,
} from "../src/lib/geometry";
import type { Region } from "../src/lib/types";
const makeRegion = (
  id: string,
  x: number,
  width: number,
  sourceId = "s",
): Region => ({
  id,
  sourceId,
  quote: id,
  label: id,
  rect: { x, y: 0, width, height: 0.1 },
});
describe("preserve useful visible content", () => {
  it("replaces one customer-name mask with two identifier masks when public credit is kept", () => {
    const w = sampleWorkspace();
    const cut = minimumRegionCut(w, {
      keepRegionIds: new Set(["directory-customer"]),
      sources: w.sources,
    });
    expect(cut.exact).toBe(true);
    expect(cut.regionIds).toEqual(["support-channel", "support-client"]);
    expect(findRoutes(w, new Set(cut.regionIds)).paths).toHaveLength(0);
    expect(
      maskConflicts(
        w.regions,
        w.sources,
        new Set(cut.regionIds),
        new Set(["directory-customer"]),
      ),
    ).toEqual([]);
  });
  it("reports infeasibility when every candidate is kept, without claiming a zero-mask repair", () => {
    const w = sampleWorkspace();
    expect(
      minimumRegionCut(w, {
        keepRegionIds: new Set(w.regions.map((r) => r.id)),
        sources: w.sources,
      }),
    ).toMatchObject({ exact: true, feasible: false, regionIds: [] });
  });
  it("protects overlapping pixels even for distinct region IDs and nonoverlapping normalized rectangles", () => {
    const regions = [
      makeRegion("mask", 0.101, 0.001),
      makeRegion("keep", 0.108, 0.001),
    ];
    const sources = [{ id: "s", width: 100, height: 100 }];
    expect(
      maskConflicts(regions, sources, new Set(["mask"]), new Set(["keep"])),
    ).toEqual([{ maskId: "mask", keepId: "keep" }]);
    expect(() =>
      assertMaskPlan(regions, sources, new Set(["mask"]), new Set(["keep"])),
    ).toThrow(/Keep visible/);
  });
  it("allows touching half-open pixel boxes and identical coordinates on separate sources", () => {
    const regions = [
      makeRegion("mask", 0.1, 0.1),
      makeRegion("touch", 0.2, 0.1),
      makeRegion("other", 0.1, 0.1, "t"),
    ];
    expect(
      maskConflicts(
        regions,
        [
          { id: "s", width: 100, height: 100 },
          { id: "t", width: 100, height: 100 },
        ],
        new Set(["mask"]),
        new Set(["touch", "other"]),
      ),
    ).toEqual([]);
  });
  it("excludes all overlapping candidates, not only the kept ID", () => {
    const w = sampleWorkspace();
    w.regions.push({
      ...w.regions.find((r) => r.id === "directory-customer")!,
      id: "public-credit-overlay",
    });
    expect(
      minimumRegionCut(w, {
        keepRegionIds: new Set(["public-credit-overlay"]),
        sources: w.sources,
      }).regionIds,
    ).toEqual(["support-channel", "support-client"]);
  });
  it("checks actual kept RGBA pixels, including alpha, and rejects unknown IDs", () => {
    const region = makeRegion("keep", 0.1, 0.1);
    const source = new Uint8Array(400).fill(255),
      output = Uint8Array.from(source);
    expect(verifyKeptPixels(source, output, 10, 10, [region])).toEqual([
      "keep",
    ]);
    output[7] = 254;
    expect(verifyKeptPixels(source, output, 10, 10, [region])).toEqual([]);
    expect(() =>
      maskConflicts([region], [], new Set(), new Set(["unknown"])),
    ).toThrow(/Unknown/);
  });
  it("keeps provenance tied to edge-region-source references despite source order", () => {
    const w = sampleWorkspace();
    w.sources.reverse();
    const route = findRoutes(w).paths[0];
    expect(
      route.map((e) => w.regions.find((r) => r.id === e.regionId)?.sourceId),
    ).toEqual(["support", "registry", "directory"]);
  });
});
