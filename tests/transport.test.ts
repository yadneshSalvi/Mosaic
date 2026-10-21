import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  signTicket,
  verifyTicket,
  MAX_REQUEST_BYTES,
} from "../server/transport";
afterEach(() => vi.unstubAllEnvs());
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
