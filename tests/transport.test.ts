import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  readUpload,
  signTicket,
  verifyTicket,
  MAX_REQUEST_BYTES,
} from "../server/transport";
const blob = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn().mockResolvedValue(undefined),
  list: vi.fn(),
}));
vi.mock("@vercel/blob", () => blob);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("private upload tickets", () => {
  const value = () => ({
    path: `mosaic-temp/${randomUUID()}.json`,
    expires: Date.now() + 60_000,
    bytes: 100,
    operation: "analyze" as const,
  });
  it("binds the operation and rejects tampering or expiry", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-secret");
    const ticket = value();
    const signed = signTicket(ticket);
    expect(verifyTicket(signed, "analyze")).toEqual(ticket);
    expect(() => verifyTicket(signed, "recipient-check")).toThrow(
      "does not match",
    );
    expect(() => verifyTicket(signed.replace(/.$/, "!"))).toThrow("Invalid");
    expect(() =>
      verifyTicket(signTicket({ ...ticket, expires: Date.now() - 1 })),
    ).toThrow("expired");
  });
  it("cannot authorize arbitrary URLs, paths, or oversized bodies", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-secret");
    for (const path of [
      "https://example.com/private",
      "../secret",
      "mosaic-temp/other.json",
    ])
      expect(() => signTicket({ ...value(), path })).toThrow();
    expect(() =>
      signTicket({ ...value(), bytes: MAX_REQUEST_BYTES + 1 }),
    ).toThrow();
  });
});

describe("private upload decoded stream size", () => {
  async function read(
    bytes: Uint8Array,
    declared: number,
    metadataSize: number,
  ) {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-secret");
    const path = `mosaic-temp/${randomUUID()}.json`;
    const ticket = signTicket({
      path,
      expires: Date.now() + 60_000,
      bytes: declared,
      operation: "analyze",
    });
    blob.get.mockResolvedValue({
      statusCode: 200,
      blob: { size: metadataSize },
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    return readUpload({ ticket }, "analyze", new AbortController().signal);
  }
  it.each([0, 3])(
    "accepts exact decoded bytes despite transfer metadata size %i",
    async (metadataSize) => {
      const bytes = new TextEncoder().encode('{"ok":true}');
      await expect(read(bytes, bytes.length, metadataSize)).resolves.toEqual({
        ok: true,
      });
      expect(blob.del).toHaveBeenCalledOnce();
    },
  );
  it.each([-1, 1])(
    "rejects decoded size different from ticket by %i and deletes upload",
    async (difference) => {
      const bytes = new TextEncoder().encode('{"ok":true}');
      await expect(
        read(bytes, bytes.length + difference, bytes.length + difference),
      ).rejects.toThrow(difference < 0 ? "exceeds" : "Incomplete");
      expect(blob.del).toHaveBeenCalledOnce();
    },
  );
});
