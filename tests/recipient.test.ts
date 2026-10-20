import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  ReaderRequestSchema,
  parseReaderResponse,
  compareReaderLocally,
  buildReaderRequest,
  type ReaderResponse,
} from "../src/lib/recipient";
import { prepareReaderSources, readExportedBundle } from "../server/recipient";
const response = (): ReaderResponse => ({
  status: "supported",
  startingEntityId: "start",
  entities: [
    { id: "start", label: "INC-88", type: "incident" },
    { id: "client", label: "Unknown Workshop", type: "customer" },
  ],
  regions: [
    {
      id: "r",
      sourceId: "output-1",
      label: "Attribution",
      quote: "INC-88 / Unknown Workshop",
      rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 },
    },
  ],
  relations: [
    {
      id: "e",
      from: "start",
      to: "client",
      predicate: "is attributed to",
      regionId: "r",
    },
  ],
  attributions: [
    {
      customerEntityId: "client",
      status: "supported",
      explanation: "Explicit attribution is visible.",
    },
  ],
  uncertainty: "Other evidence can be missed.",
});
async function request() {
  const png = await sharp({
    create: { width: 80, height: 60, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  const blob = new Blob([new Uint8Array(png)], { type: "image/png" });
  return buildReaderRequest([{ blob }, { blob }], "INC-88");
}
describe("context-separated fresh reader", () => {
  it("builds only consent, starting fact, neutral IDs and exact emitted bytes", async () => {
    const bytes = Uint8Array.of(1, 2, 3, 4),
      blob = new Blob([bytes]);
    const r = await buildReaderRequest([{ blob }, { blob }], "INC-88");
    expect(r).toEqual({
      consent: true,
      startingFact: "INC-88",
      sources: [
        { id: "output-1", data: "data:image/png;base64,AQIDBA==" },
        { id: "output-2", data: "data:image/png;base64,AQIDBA==" },
      ],
    });
  });
  it("rejects target/original graph/filenames/extra metadata at the request boundary", async () => {
    const r = await request();
    for (const field of [
      "protectedTo",
      "target",
      "to",
      "graph",
      "quotes",
      "filename",
    ])
      expect(
        ReaderRequestSchema.safeParse({ ...r, [field]: "Forbidden secret" })
          .success,
      ).toBe(false);
    expect(
      ReaderRequestSchema.safeParse({
        ...r,
        sources: [{ ...r.sources[0], name: "secret.png" }, r.sources[1]],
      }).success,
    ).toBe(false);
    await expect(
      prepareReaderSources({ ...r, consent: false }),
    ).rejects.toThrow(/consent/);
  });
  it("forwards original exported PNGs, has no target in text/schema and uses fresh stateless context", async () => {
    const r = await request();
    let payload: any;
    const result = await readExportedBundle(r, {
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        payload = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: JSON.stringify(response()) },
              },
            ],
          }),
        );
      },
    });
    expect(payload.messages).toHaveLength(2);
    expect(
      payload.messages[1].content
        .filter((c: any) => c.type === "image_url")
        .map((c: any) => c.image_url.url),
    ).toEqual(r.sources.map((s) => s.data));
    expect(JSON.stringify(payload)).not.toContain("Unknown Workshop");
    expect(payload.store).toBe(false);
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(compareReaderLocally(result, " Unknown   Workshop ")).toBe(
      "recovered",
    );
  });
  it("rejects unsupported attributions, unknown sources and contradictory negative headlines", () => {
    const r = response();
    expect(() =>
      parseReaderResponse({ ...r, relations: [] }, ["output-1"], "INC-88"),
    ).toThrow(/Unsupported/);
    expect(() => parseReaderResponse(r, ["output-2"], "INC-88")).toThrow(
      /source/,
    );
    expect(() =>
      parseReaderResponse(
        { ...r, status: "not_found", attributions: [] },
        ["output-1"],
        "INC-88",
      ),
    ).toThrow(/contradicts/);
    expect(() => parseReaderResponse(r, ["output-1"], "another-start")).toThrow(
      /differs/,
    );
  });
  it("separates absent start, abstention, and different/ambiguous customer from recovery", () => {
    const base = response();
    const absent = parseReaderResponse(
      {
        ...base,
        status: "starting_fact_not_found",
        startingEntityId: null,
        entities: [],
        regions: [],
        relations: [],
        attributions: [],
      },
      ["output-1"],
      "INC-88",
    );
    expect(compareReaderLocally(absent, "Unknown Workshop")).toBe(
      "starting_fact_absent",
    );
    const none = parseReaderResponse(
      {
        ...base,
        status: "not_found",
        regions: [],
        relations: [],
        attributions: [],
      },
      ["output-1"],
      "INC-88",
    );
    expect(compareReaderLocally(none, "Unknown Workshop")).toBe(
      "not_recovered",
    );
    expect(compareReaderLocally(base, "A different customer")).toBe("review");
    const ambiguous = parseReaderResponse(
      {
        ...base,
        status: "ambiguous",
        relations: [],
        attributions: [{ ...base.attributions[0], status: "ambiguous" }],
      },
      ["output-1"],
      "INC-88",
    );
    expect(compareReaderLocally(ambiguous, "Unknown Workshop")).toBe("review");
  });
  it("corrects one structural error using only the same images and its own previous response", async () => {
    const input = await request(),
      payloads: any[] = [],
      signals: any[] = [];
    const invalid = response();
    invalid.relations[0] = {
      ...invalid.relations[0],
      from: "client",
      to: "start",
    };
    const result = await readExportedBundle(input, {
      apiKey: "test-only",
      fetcher: async (_url, init) => {
        payloads.push(JSON.parse(String(init?.body)));
        signals.push(init?.signal);
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify(
                    payloads.length === 1 ? invalid : response(),
                  ),
                },
              },
            ],
          }),
        );
      },
    });
    expect(result.status).toBe("supported");
    expect(payloads).toHaveLength(2);
    expect(payloads[1].messages).toHaveLength(4);
    expect(payloads[1].messages[3].content).toContain(
      "Unsupported customer attribution",
    );
    expect(payloads[1].messages[3].content).toContain(
      "cannot traverse an edge backwards",
    );
    expect(payloads[1].messages[1]).toEqual(payloads[0].messages[1]);
    expect(signals[1]).toBe(signals[0]);
    expect(JSON.stringify(payloads)).not.toContain("protectedTo");
  });
  it("keeps a complete but explicitly uncertain proposal ambiguous", () => {
    const r = response();
    r.status = "ambiguous";
    r.attributions[0].status = "ambiguous";
    const result = parseReaderResponse(r, ["output-1"], "INC-88");
    expect(compareReaderLocally(result, "Unknown Workshop")).toBe("review");
  });
  it("rejects embedded PNG text and sanitized provider failures", async () => {
    const r = await request();
    const png = await sharp(
      Buffer.from(r.sources[0].data.split(",")[1], "base64"),
    )
      .withMetadata({ exif: { IFD0: { ImageDescription: "secret name" } } })
      .png()
      .toBuffer();
    await expect(
      prepareReaderSources({
        ...r,
        sources: [
          {
            id: "output-1",
            data: `data:image/png;base64,${png.toString("base64")}`,
          },
          r.sources[1],
        ],
      }),
    ).rejects.toThrow(/without embedded/);
    await expect(
      readExportedBundle(r, {
        apiKey: "test-only",
        fetcher: async () =>
          new Response("SECRET INTERNAL DETAIL", { status: 500 }),
      }),
    ).rejects.toThrow("No conclusion");
  });
});

import { buildReaderReview, retainedKeepIds } from "../src/lib/recipient";
import { sampleWorkspace } from "../src/lib/sample";
import type { ExportResult } from "../src/lib/redaction";
function mockExport(): ExportResult {
  const w = sampleWorkspace();
  return {
    files: w.sources.map((s, i) => ({
      sourceId: s.id,
      name: `mosaic-0${i + 1}.png`,
      width: s.width,
      height: s.height,
      blob: new Blob([Uint8Array.of(i, 1, 2)], { type: "image/png" }),
      url: "blob:old",
      verifiedRegions: [],
      keptRegionIds: [],
      maskedRegions: 0,
      preserved: true,
    })),
    remainingRoutes: 0,
    complete: true,
    verifiedRegionIds: ["support-client", "support-channel"],
    keptRegionIds: ["directory-customer"],
    passed: true,
  };
}
describe("review the emitted artifacts", () => {
  it("uses actual emitted blob bytes and removes masked source evidence", async () => {
    const w = sampleWorkspace(),
      out = mockExport();
    const r = response();
    r.startingEntityId = "start";
    r.entities[0].label = "Incident 042";
    r.regions[0].sourceId = "output-3";
    const next = await buildReaderReview(w, r, out);
    expect(next.sources[0].url).toBe("data:image/png;base64,AAEC");
    expect(next.regions.some((r) => r.id === "support-client")).toBe(false);
    expect(next.relations.some((e) => e.regionId === "support-channel")).toBe(
      false,
    );
    expect(next.relations.at(-1)?.status).toBe("suggested");
    expect(w.regions).toHaveLength(4);
  });
  it("deduplicates the same occurrence while preserving distinct locations and collision-free entity IDs", async () => {
    const w = sampleWorkspace(),
      out = mockExport(),
      r = response();
    r.entities = [
      { id: "a".repeat(79) + "1", label: "Unique A", type: "other" },
      { id: "a".repeat(79) + "2", label: "Unique B", type: "other" },
    ];
    r.relations = [];
    r.attributions = [];
    const existing = w.regions.find((r) => r.id === "directory-customer")!;
    r.regions = [
      { ...existing, id: "same", sourceId: "output-3" },
      {
        ...existing,
        id: "distinct",
        sourceId: "output-3",
        rect: { ...existing.rect, y: 0.1 },
      },
    ];
    const next = await buildReaderReview(w, r, out);
    expect(next.entities.at(-1)?.id).not.toBe(next.entities.at(-2)?.id);
    expect(next.regions).toHaveLength(3); // two old unmasked + one new location
  });
  it("drops stale confirmation for distinct old regions touched by actual masks", async () => {
    const w = sampleWorkspace();
    w.regions.push({ ...w.regions[0], id: "overlapping-old" });
    w.relations.push({
      ...w.relations[0],
      id: "old-link",
      regionId: "overlapping-old",
    });
    const next = await buildReaderReview(w, response(), mockExport());
    expect(next.regions.some((r) => r.id === "overlapping-old")).toBe(false);
    expect(next.relations.some((r) => r.id === "old-link")).toBe(false);
  });
  it("retains verified Keep visible choices through emitted-image review", async () => {
    const w = sampleWorkspace(),
      out = mockExport();
    const next = await buildReaderReview(w, response(), out);
    expect([
      ...retainedKeepIds(
        new Set(["directory-customer", "support-client"]),
        next,
        out,
      ),
    ]).toEqual(["directory-customer"]);
    expect([
      ...retainedKeepIds(new Set(["directory-customer"]), next, {
        ...out,
        keptRegionIds: [],
      }),
    ]).toEqual([]);
  });
  it("fails closed if findings exceed the bounded workspace", async () => {
    const w = sampleWorkspace();
    while (w.entities.length < 24)
      w.entities.push({
        id: `extra${w.entities.length}`,
        label: `Extra ${w.entities.length}`,
        type: "other",
      });
    await expect(
      buildReaderReview(w, response(), mockExport()),
    ).rejects.toThrow();
  });
});
