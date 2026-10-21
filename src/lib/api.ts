import { upload } from "@vercel/blob/client";

export async function postImages(
  operation: "analyze" | "recipient-check",
  request: unknown,
  signal: AbortSignal,
) {
  const health = await fetch("/api/health", { signal });
  if (!health.ok)
    throw new Error("The analysis service is unavailable. Try again.");
  const capabilities = await health.json();
  let body = JSON.stringify(request);
  if (capabilities.uploadTransport === "private-blob") {
    const blob = new Blob([body], { type: "application/json" });
    const session = await fetch("/api/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bytes: blob.size, operation, consent: true }),
      signal,
    });
    const grant = await session.json();
    if (!session.ok)
      throw new Error(
        grant.error ?? "Could not prepare temporary private upload.",
      );
    await upload(grant.path, blob, {
      access: "private",
      handleUploadUrl: "/api/upload",
      clientPayload: grant.ticket,
      contentType: "application/json",
      abortSignal: signal,
    });
    body = JSON.stringify({ ticket: grant.ticket });
  }
  const response = await fetch(`/api/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });
  const result = await response.json().catch(() => {
    throw new Error(
      "The analysis service did not return a result. Retry later.",
    );
  });
  if (!response.ok)
    throw new Error(result.error ?? "Analysis could not be completed.");
  return result;
}
