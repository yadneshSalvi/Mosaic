import { postImages } from "./lib/api";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CircleHelp,
  Eye,
  LoaderCircle,
  ScanLine,
  X,
} from "lucide-react";
import {
  buildReaderRequest,
  buildReaderReview,
  compareReaderLocally,
  parseReaderResponse,
  type ReaderResponse,
} from "./lib/recipient";
import type { ExportResult } from "./lib/redaction";
import { readablePredicate, type Workspace } from "./lib/types";

export function FreshReader({
  result,
  workspace,
  onReview,
}: {
  result: ExportResult;
  workspace: Workspace;
  onReview: (next: Workspace) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [reading, setReading] = useState<ReaderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [activeSource, setActiveSource] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
      controller.current?.abort();
    },
    [],
  );
  const start = workspace.entities.find(
    (e) => e.id === workspace.protectedFrom,
  )!;
  const target = workspace.entities.find(
    (e) => e.id === workspace.protectedTo,
  )!;
  const supportedScope = target.type === "customer";
  const outcome = reading ? compareReaderLocally(reading, target.label) : null;
  async function run() {
    if (!consent || !supportedScope) return;
    const version = ++epoch.current;
    const abort = new AbortController();
    controller.current = abort;
    setReading(null);
    setError("");
    setBusy(true);
    try {
      const request = await buildReaderRequest(result.files, start.label);
      if (version !== epoch.current || abort.signal.aborted) return;
      const raw = await postImages("recipient-check", request, abort.signal);
      const parsed = parseReaderResponse(
        raw,
        request.sources.map((s) => s.id),
        start.label,
      );
      if (version === epoch.current) setReading(parsed);
    } catch (error) {
      if (version === epoch.current)
        setError(
          error instanceof Error && error.name === "AbortError"
            ? "Cancelled. No fresh-reading conclusion is available."
            : error instanceof Error
              ? error.message
              : "Fresh reading failed. No conclusion is available.",
        );
    } finally {
      if (version === epoch.current) {
        setBusy(false);
        setConsent(false);
      }
    }
  }
  async function openReview() {
    if (!reading) return;
    const version = epoch.current;
    setOpening(true);
    setError("");
    try {
      const next = await buildReaderReview(workspace, reading, result);
      if (version === epoch.current) onReview(next);
    } catch {
      if (version === epoch.current)
        setError(
          "These findings exceed the bounded workspace or contain invalid references. Inspect the exported evidence below; no links were added.",
        );
    } finally {
      if (version === epoch.current) setOpening(false);
    }
  }
  const statusTitle =
    outcome === "recovered"
      ? "The fresh reader proposed the protected association."
      : outcome === "review"
        ? "A customer attribution needs your review."
        : outcome === "starting_fact_absent"
          ? "The reader could not locate the starting fact."
          : "No supported customer attribution was returned.";
  const file = result.files[activeSource];
  const regions =
    reading?.regions.filter(
      (r) => r.sourceId === `output-${activeSource + 1}`,
    ) ?? [];
  return (
    <section className="fresh-reader" aria-label="Optional fresh reading">
      <div className="reader-heading">
        <span className="reader-icon">
          <Eye size={21} />
        </span>
        <div>
          <span className="micro-label">
            OPTIONAL · ANOTHER LOOK AT THE OUTPUT
          </span>
          <h3>What could a fresh reader connect?</h3>
        </div>
        <span className="reader-state">
          {busy
            ? "Reading"
            : reading
              ? "Reading complete"
              : error
                ? "Unavailable"
                : "Not run"}
        </span>
      </div>
      <p className="reader-intro">
        Ask a new model context:{" "}
        <strong>
          “Which customer, if any, can be linked to {start.label}?”
        </strong>
      </p>
      <div className="reader-scope">
        <span>
          <strong>Sent</strong> Exported PNG pixels + the starting fact.
        </span>
        <span>
          <strong>Withheld</strong> The protected-name hint, original graph,
          annotations and filenames.
        </span>
      </div>
      <p className="reader-boundary">
        The same provider gets a fresh context. A customer name you kept visible
        is still in the image pixels. This reading can miss evidence or propose
        wrong links; it cannot certify privacy.
      </p>
      {!supportedScope ? (
        <div className="info-box">
          <CircleHelp size={16} /> This bounded check currently looks for
          customer organizations. Choose a customer as the protected target to
          use it; pixel verification applies to your current export.
        </div>
      ) : (
        <>
          {!busy && (
            <label className="reader-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I agree to send these exported PNGs and “{start.label}” to
                OpenAI for this fresh reading. Hosted requests temporarily use
                private Vercel storage, deleted after retrieval; abandoned
                uploads are checked for cleanup hourly.
              </span>
            </label>
          )}
          <div className="reader-actions">
            {busy ? (
              <>
                <span role="status">
                  <LoaderCircle size={17} className="spin" /> Reading the actual
                  exported images…
                </span>
                <button
                  className="outline-button"
                  onClick={() => {
                    epoch.current++;
                    controller.current?.abort();
                    setBusy(false);
                    setConsent(false);
                    setReading(null);
                    setError(
                      "Cancelled. No fresh-reading conclusion is available.",
                    );
                  }}
                >
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <button
                className="outline-button"
                disabled={!consent || opening}
                onClick={run}
              >
                <ScanLine size={16} />
                {reading ? "Run another fresh reading" : "Run fresh reading"}
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <div className="reader-error" role="alert">
          {error} Pixel checks are unchanged.
        </div>
      )}
      {reading && (
        <div
          className={`reader-result ${outcome === "recovered" ? "reader-warning" : ""}`}
          aria-live="polite"
        >
          <h4>{statusTitle}</h4>
          <p>
            {outcome === "recovered"
              ? "An exact customer-name match was made locally in this browser. Inspect its proposed evidence before deciding whether the association is real."
              : outcome === "review"
                ? "The returned name differs or its attribution is ambiguous. That is an unresolved finding, not a clean privacy result."
                : outcome === "starting_fact_absent"
                  ? "This pass could not answer the attribution question. Check whether the starting fact remains legible."
                  : "This is one model observation, not proof that the association cannot be inferred."}
          </p>
          {reading.attributions.map((a) => (
            <div className="reader-attribution" key={a.customerEntityId}>
              <strong>
                {
                  reading.entities.find((e) => e.id === a.customerEntityId)
                    ?.label
                }
              </strong>
              <span>
                {a.status === "supported"
                  ? "Proposed supported path"
                  : "Ambiguous candidate"}
              </span>
              <p>{a.explanation}</p>
            </div>
          ))}
          <p className="reader-uncertainty">{reading.uncertainty}</p>
          {reading.regions.length > 0 && (
            <details className="reader-evidence">
              <summary>
                Inspect {reading.regions.length} proposed evidence region
                {reading.regions.length === 1 ? "" : "s"} on the exported pixels
              </summary>
              <div className="reader-file-tabs">
                {result.files.map((f, i) => (
                  <button
                    key={f.name}
                    className={i === activeSource ? "active" : ""}
                    onClick={() => setActiveSource(i)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="reader-image">
                <img src={file.url} alt={`Actual exported ${file.name}`} />
                {regions.map((r) => (
                  <span
                    key={r.id}
                    title={r.quote}
                    style={{
                      left: `${r.rect.x * 100}%`,
                      top: `${r.rect.y * 100}%`,
                      width: `${r.rect.width * 100}%`,
                      height: `${r.rect.height * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className="reader-quotes">
                {regions.length ? (
                  regions.map((r) => (
                    <div key={r.id}>
                      <strong>{r.label}</strong>
                      <q>{r.quote}</q>
                      {reading.relations
                        .filter((e) => e.regionId === r.id)
                        .map((e) => (
                          <p key={e.id}>
                            {
                              reading.entities.find((n) => n.id === e.from)
                                ?.label
                            }{" "}
                            →{" "}
                            {reading.entities.find((n) => n.id === e.to)?.label}{" "}
                            <span>({readablePredicate(e.predicate)})</span>
                          </p>
                        ))}
                    </div>
                  ))
                ) : (
                  <p>No proposed evidence in this exported image.</p>
                )}
              </div>
            </details>
          )}
          {reading.relations.length > 0 && (
            <div className="reader-review">
              <p>
                Continue with the exported pixels as a new bundle. Known masked
                evidence is removed; new findings enter review as unconfirmed
                proposals.
              </p>
              <button
                className="primary-button"
                disabled={opening || busy}
                onClick={openReview}
              >
                {opening ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Eye size={16} />
                )}
                Review exported bundle <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
