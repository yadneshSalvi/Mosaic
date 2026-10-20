import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../server/index";
let server: Server;
let base: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No test port");
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
describe("local HTTP boundary", () => {
  it("reports capabilities without key material", async () => {
    const res = await fetch(`${base}/api/health`);
    const data = await res.json();
    expect(data).toEqual({ ok: true, analysisAvailable: expect.any(Boolean) });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects an unrelated origin before analysis", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://unrelated.example",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });
  it("rejects non-JSON and malformed JSON", async () => {
    const plain = await fetch(`${base}/api/analyze`, {
      method: "POST",
      body: "{}",
    });
    expect(plain.status).toBe(415);
    const malformed = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toContain("could not be read");
  });
  it("rejects missing cloud consent without a provider call", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: false }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("agree to cloud analysis");
  });
});
