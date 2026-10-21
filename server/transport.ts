import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { del, get, list } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { z } from "zod";
import type { Express } from "express";
import express from "express";
import { AnalysisError } from "./analysis";

export const MAX_REQUEST_BYTES = 34 * 1024 * 1024;
const Ticket = z
  .object({
    path: z.string().regex(/^mosaic-temp\/[0-9a-f-]{36}\.json$/),
    expires: z.number().int(),
    bytes: z.number().int().positive().max(MAX_REQUEST_BYTES),
    operation: z.enum(["analyze", "recipient-check"]),
  })
  .strict();
function key() {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw new AnalysisError(
      "Temporary private upload storage is unavailable.",
      503,
    );
  return process.env.BLOB_READ_WRITE_TOKEN;
}
export function signTicket(value: z.infer<typeof Ticket>) {
  const payload = Buffer.from(JSON.stringify(Ticket.parse(value))).toString(
    "base64url",
  );
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
export function verifyTicket(raw: unknown, operation?: string) {
  if (typeof raw !== "string" || raw.length > 2048)
    throw new AnalysisError("Invalid upload ticket.");
  const parts = raw.split(".");
  if (parts.length !== 2) throw new AnalysisError("Invalid upload ticket.");
  const expected = createHmac("sha256", key()).update(parts[0]).digest();
  const signature = Buffer.from(parts[1], "base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    throw new AnalysisError("Invalid upload ticket.");
  let ticket;
  try {
    ticket = Ticket.parse(
      JSON.parse(Buffer.from(parts[0], "base64url").toString()),
    );
  } catch {
    throw new AnalysisError("Invalid upload ticket.");
  }
  if (
    ticket.expires < Date.now() ||
    (operation && ticket.operation !== operation)
  )
    throw new AnalysisError(
      "Upload ticket expired or does not match this operation. Retry the request.",
    );
  return ticket;
}
export async function deleteUpload(path: string) {
  try {
    await del(path, { token: key() });
  } catch {
    console.error(
      "Temporary upload cleanup failed; scheduled cleanup will retry.",
    );
  }
}
export async function readUpload(
  raw: unknown,
  operation: string,
  signal: AbortSignal,
) {
  const manifest = z
    .object({ ticket: z.string().max(2048) })
    .strict()
    .safeParse(raw);
  if (!manifest.success)
    throw new AnalysisError("Send a signed upload manifest.");
  const ticket = verifyTicket(manifest.data.ticket, operation);
  try {
    const result = await get(ticket.path, {
      access: "private",
      token: key(),
      useCache: false,
      abortSignal: signal,
    });
    if (!result?.stream || result.blob.size !== ticket.bytes)
      throw new AnalysisError(
        "The temporary upload is missing or incomplete. Retry.",
      );
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > ticket.bytes)
          throw new AnalysisError("Upload exceeds its declared size.");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    if (size !== ticket.bytes) throw new AnalysisError("Incomplete upload.");
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AnalysisError("Invalid uploaded JSON.");
    }
  } finally {
    await deleteUpload(ticket.path);
  }
}
export function registerTransport(app: Express) {
  app.post(
    "/api/upload-session",
    express.json({ limit: "4kb" }),
    (req, res) => {
      const input = Ticket.pick({ bytes: true, operation: true })
        .extend({ consent: z.literal(true) })
        .strict()
        .safeParse(req.body);
      if (!input.success) {
        res
          .status(400)
          .json({ error: "Invalid upload request or missing consent." });
        return;
      }
      const ticket = {
        path: `mosaic-temp/${randomUUID()}.json`,
        expires: Date.now() + 5 * 60_000,
        bytes: input.data.bytes,
        operation: input.data.operation,
      };
      res.json({ path: ticket.path, ticket: signTicket(ticket) });
    },
  );
  app.post("/api/upload", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      const result = await handleUpload({
        body: req.body,
        request: req,
        token: key(),
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const ticket = verifyTicket(clientPayload);
          if (pathname !== ticket.path)
            throw new AnalysisError("Upload path does not match ticket.");
          return {
            allowedContentTypes: ["application/json"],
            maximumSizeInBytes: ticket.bytes,
            validUntil: ticket.expires,
            addRandomSuffix: false,
            allowOverwrite: false,
          };
        },
      });
      res.json(result);
    } catch {
      res
        .status(400)
        .json({
          error: "The temporary upload could not be authorized. Retry.",
        });
    }
  });
  app.get("/api/cleanup", async (req, res) => {
    if (
      !process.env.CRON_SECRET ||
      req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      res.status(401).end();
      return;
    }
    let cursor: string | undefined;
    let removed = 0;
    do {
      const page = await list({
        prefix: "mosaic-temp/",
        limit: 1000,
        cursor,
        token: key(),
      });
      const stale = page.blobs.filter(
        (blob) => blob.uploadedAt.getTime() < Date.now() - 60 * 60_000,
      );
      if (stale.length) {
        await del(
          stale.map((blob) => blob.url),
          { token: key() },
        );
        removed += stale.length;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    res.json({ removed });
  });
}
