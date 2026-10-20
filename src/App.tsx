import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileImage,
  Fingerprint,
  FolderOpen,
  GitBranch,
  ImagePlus,
  Layers2,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { zipSync, strToU8 } from "fflate";
import { sampleWorkspace } from "./lib/sample";
import { FreshReader } from "./FreshReader";
import { retainedKeepIds } from "./lib/recipient";
import { maskConflicts } from "./lib/geometry";
import { findRoutes, minimumRegionCut } from "./lib/graph";
import { exportWorkspace, type ExportResult } from "./lib/redaction";
import {
  RectSchema,
  readablePredicate,
  validateEvidence,
  type Region,
  type Source,
  type Workspace,
} from "./lib/types";

function MosaicMark() {
  return (
    <span className="mosaic-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className={`dialog ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={onClose}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function SourceImage({
  source,
  regions,
  masked,
  active,
  onRegionClick,
  large = false,
  kept = new Set<string>(),
}: {
  source: Source;
  regions: Region[];
  masked: Set<string>;
  active?: string;
  onRegionClick?: (r: Region) => void;
  large?: boolean;
  kept?: Set<string>;
}) {
  return (
    <div className={`source-image ${large ? "large" : ""}`}>
      <img src={source.url} alt={source.title} draggable={false} />
      {regions.map((r) =>
        onRegionClick ? (
          <button
            key={r.id}
            className={`region-box ${kept.has(r.id) ? "kept" : ""} ${masked.has(r.id) ? "masked" : ""} ${active === r.id ? "active" : ""}`}
            style={{
              left: `${r.rect.x * 100}%`,
              top: `${r.rect.y * 100}%`,
              width: `${r.rect.width * 100}%`,
              height: `${r.rect.height * 100}%`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRegionClick?.(r);
            }}
            aria-label={`${masked.has(r.id) ? "Masked: " : ""}${r.label}`}
            title={r.label}
          />
        ) : (
          <span
            key={r.id}
            className={`region-box ${kept.has(r.id) ? "kept" : ""} ${masked.has(r.id) ? "masked" : ""}`}
            style={{
              left: `${r.rect.x * 100}%`,
              top: `${r.rect.y * 100}%`,
              width: `${r.rect.width * 100}%`,
              height: `${r.rect.height * 100}%`,
            }}
          />
        ),
      )}
    </div>
  );
}
function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(sampleWorkspace);
  const [activePath, setActivePath] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState("directory-customer");
  const [inspector, setInspector] = useState<string | null>(null);
  const [masks, setMasks] = useState<Set<string>>(new Set());
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"map" | "files">("map");
  const [modal, setModal] = useState<
    "import" | "about" | "goal" | "output" | null
  >(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const revision = useRef(0);
  const allRoutes = useMemo(() => findRoutes(workspace), [workspace]);
  const currentRoutes = useMemo(
    () => findRoutes(workspace, masks),
    [workspace, masks],
  );
  const recommendation = useMemo(
    () =>
      minimumRegionCut(workspace, {
        keepRegionIds: kept,
        sources: workspace.sources,
      }),
    [workspace, kept],
  );
  const pathIndex = Math.min(
    activePath,
    Math.max(0, allRoutes.paths.length - 1),
  );
  const path = allRoutes.paths[pathIndex] ?? [];
  useEffect(
    () =>
      setActivePath((index) =>
        Math.min(index, Math.max(0, allRoutes.paths.length - 1)),
      ),
    [allRoutes.paths.length],
  );
  useEffect(() => {
    if (inspector) return;
    const visiblePath = allRoutes.paths[pathIndex] ?? [];
    setSelectedRegion((current) =>
      visiblePath.some((edge) => edge.regionId === current)
        ? current
        : (visiblePath[0]?.regionId ?? ""),
    );
  }, [allRoutes, pathIndex, inspector]);
  const activeRegion = workspace.regions.find((r) => r.id === selectedRegion);
  const target = workspace.entities.find((e) => e.id === workspace.protectedTo);
  const start = workspace.entities.find(
    (e) => e.id === workspace.protectedFrom,
  );
  const suggested = workspace.relations.filter(
    (r) => r.status === "suggested",
  ).length;
  const repaired =
    masks.size > 0 &&
    currentRoutes.complete &&
    currentRoutes.paths.length === 0;
  const sourceForRegion = (id: string) =>
    workspace.sources.find(
      (s) => s.id === workspace.regions.find((r) => r.id === id)?.sourceId,
    );
  function discardResult() {
    revision.current++;
    setResult((previous) => {
      previous?.files.forEach((f) => URL.revokeObjectURL(f.url));
      return null;
    });
  }
  useEffect(
    () => () => {
      result?.files.forEach((f) => URL.revokeObjectURL(f.url));
    },
    [result],
  );
  function toggleMask(id: string) {
    if (
      !masks.has(id) &&
      maskConflicts(workspace.regions, workspace.sources, new Set([id]), kept)
        .length
    ) {
      setError(
        "This region overlaps pixels marked Keep visible. Release that choice or use the recommended repair.",
      );
      return;
    }
    setError("");
    discardResult();
    setMasks((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleKeep(id: string) {
    discardResult();
    setError("");
    const next = new Set(kept);
    next.has(id) ? next.delete(id) : next.add(id);
    setKept(next);
    const conflicts = maskConflicts(
      workspace.regions,
      workspace.sources,
      masks,
      next,
    );
    if (conflicts.length) {
      setMasks(
        (current) =>
          new Set(
            [...current].filter(
              (mask) => !conflicts.some((c) => c.maskId === mask),
            ),
          ),
      );
      setError(
        "Conflicting masks were removed to preserve your Keep visible choice. Find a new repair when ready.",
      );
    }
  }
  function updateEvidence(next: Workspace) {
    discardResult();
    setWorkspace(next);
    const conflicts = maskConflicts(next.regions, next.sources, masks, kept);
    if (conflicts.length) {
      setMasks(
        (current) =>
          new Set(
            [...current].filter(
              (id) => !conflicts.some((c) => c.maskId === id),
            ),
          ),
      );
      setError(
        "The edited region overlaps kept pixels. Conflicting masks were removed.",
      );
    }
  }
  function applyRepair() {
    setError("");
    if (!recommendation.exact || recommendation.feasible === false) {
      setError(recommendation.reason ?? "Unable to complete repair search");
      return;
    }
    discardResult();
    setMasks(new Set(recommendation.regionIds));
    const visible = path.find((edge) =>
      recommendation.regionIds.includes(edge.regionId),
    );
    setSelectedRegion(
      visible?.regionId ??
        path[0]?.regionId ??
        recommendation.regionIds[0] ??
        "",
    );
  }
  async function doExport() {
    setExporting(true);
    setError("");
    try {
      discardResult();
      const startedAt = revision.current;
      const output = await exportWorkspace(workspace, masks, kept);
      if (startedAt !== revision.current) {
        output.files.forEach((f) => URL.revokeObjectURL(f.url));
        return;
      }
      setResult(output);
      setModal("output");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed. Try again.");
    } finally {
      setExporting(false);
    }
  }
  function replaceWorkspace(next: Workspace) {
    discardResult();
    setWorkspace(next);
    setMasks(new Set());
    setKept(new Set());
    setSelectedRegion(next.regions[0]?.id ?? "");
    setActivePath(0);
    setError("");
    setModal(null);
  }
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setModal("about");
          }}
        >
          <MosaicMark />
          <span>
            mosaic<span className="brand-period">.</span>
          </span>
        </a>
        <div className="top-divider" />
        <span className="workspace-crumb">
          Workspace <ChevronRight size={13} />{" "}
          <strong>{workspace.title}</strong>
          <ChevronDown size={13} />
        </span>
        <div className="top-actions">
          <button
            className="quiet-button help-button"
            aria-label="How it works"
            onClick={() => setModal("about")}
          >
            <CircleHelp size={16} />
            <span>How it works</span>
          </button>
          <button className="dark-button" onClick={() => setModal("import")}>
            <Plus size={16} /> New bundle
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="live-dot" /> THE BIGGER PICTURE
            </div>
            <h1>
              Small clues. <span>Unexpected connections.</span>
            </h1>
            <p>
              Review a case-study bundle before you publish. Small clues can
              reveal more together.
            </p>
          </div>
          <div className="sample-label">
            <span className="sample-icon">
              <Layers2 size={20} />
            </span>
            <div>
              <strong>
                {workspace.origin === "sample"
                  ? "An interactive sample"
                  : "Your image bundle"}
              </strong>
              <span>
                {workspace.origin === "sample"
                  ? "Fictional data. Real evidence."
                  : "In memory for this session."}
              </span>
            </div>
          </div>
        </section>
        <section className="protection-bar">
          <div className="protection-icon">
            <LockKeyhole size={18} />
          </div>
          <div className="protection-copy">
            <span className="micro-label">THE ASSOCIATION TO PROTECT</span>
            <div>
              <strong>{start?.label}</strong>
              <span className="association-arrow">
                <Minus size={13} />
                <Link2 size={13} />
                <Minus size={13} />
              </span>
              <strong>{target?.label}</strong>
            </div>
          </div>
          <span className="protection-note">
            Keep this connection confidential.
          </span>
          <button className="text-button" onClick={() => setModal("goal")}>
            Edit <ChevronRight size={14} />
          </button>
        </section>
        <section className="workbench" aria-label="Evidence workspace">
          <div className="bench-toolbar">
            <div className="view-tabs">
              <button
                className={view === "map" ? "active" : ""}
                onClick={() => setView("map")}
              >
                <GitBranch size={16} /> Evidence map
              </button>
              <button
                className={view === "files" ? "active" : ""}
                onClick={() => setView("files")}
              >
                <FileImage size={16} /> Source files{" "}
                <span>{workspace.sources.length}</span>
              </button>
            </div>
            <div className="bench-meta">
              <span className="local-dot" />{" "}
              {workspace.origin === "sample"
                ? "Local sample · optional cloud check"
                : "Images held in memory"}
              <span className="bench-meta-divider" />
              <span>{workspace.sources.length} sources</span>
            </div>
          </div>
          <div className="bench-body">
            <div className="evidence-canvas">
              <div className="canvas-caption">
                <span className={`status-pill ${repaired ? "resolved" : ""}`}>
                  <span />
                  {repaired
                    ? "Detected routes disconnected"
                    : masks.size
                      ? `${currentRoutes.paths.length} of ${allRoutes.paths.length} routes remain`
                      : allRoutes.paths.length
                        ? `${allRoutes.paths.length} detected disclosure routes`
                        : "No detected route"}
                </span>
                <span className="canvas-hint">
                  Click any source to inspect the evidence{" "}
                  <ArrowUpRight size={13} />
                </span>
              </div>
              {view === "map" ? (
                <div className={`provenance-stage path-length-${path.length}`}>
                  {path.length === 0 ? (
                    <div className="no-path">
                      <GitBranch size={30} />
                      <strong>No supported path between these facts</strong>
                      <p>
                        Inspect the source files or choose another association.
                        No connection is drawn without evidence.
                      </p>
                    </div>
                  ) : (
                    <div className="provenance-route">
                      {path.map((edge, i) => {
                        const region = workspace.regions.find(
                          (r) => r.id === edge.regionId,
                        )!;
                        const source = workspace.sources.find(
                          (source) => source.id === region.sourceId,
                        )!;
                        const from = workspace.entities.find(
                          (e) => e.id === edge.from,
                        )!;
                        const to = workspace.entities.find(
                          (e) => e.id === edge.to,
                        )!;
                        const sourceNumber =
                          workspace.sources.findIndex(
                            (s) => s.id === source.id,
                          ) + 1;
                        return (
                          <div className="provenance-step" key={edge.id}>
                            <div
                              className={`provenance-relation ${masks.has(region.id) ? "severed" : ""}`}
                            >
                              <span>{from.label}</span>
                              <button
                                onClick={() => {
                                  setSelectedRegion(region.id);
                                  setInspector(source.id);
                                }}
                                aria-label={`Inspect ${from.label} ${readablePredicate(edge.predicate)} ${to.label}`}
                              >
                                {masks.has(region.id) ? (
                                  <X size={17} />
                                ) : (
                                  <ArrowRight size={17} />
                                )}
                              </button>
                              <strong>{to.label}</strong>
                            </div>
                            <span className="provenance-predicate">
                              {masks.has(region.id)
                                ? "Known link removed"
                                : readablePredicate(edge.predicate)}
                            </span>
                            <article
                              className={`document-card ${selectedRegion === region.id ? "selected" : ""} ${masks.has(region.id) ? "has-mask" : ""}`}
                            >
                              <button
                                className="document-top"
                                onClick={() => {
                                  setSelectedRegion(region.id);
                                  setInspector(source.id);
                                }}
                              >
                                <span className="doc-num">
                                  {String(sourceNumber).padStart(2, "0")}
                                </span>
                                <span>{source.title}</span>
                                <Maximize2 size={13} />
                              </button>
                              <div className="document-preview">
                                <SourceImage
                                  source={source}
                                  regions={workspace.regions.filter(
                                    (r) =>
                                      r.sourceId === source.id &&
                                      (r.id === region.id ||
                                        masks.has(r.id) ||
                                        kept.has(r.id)),
                                  )}
                                  masked={masks}
                                  kept={kept}
                                  active={selectedRegion}
                                  onRegionClick={(r) => {
                                    setSelectedRegion(r.id);
                                    setInspector(source.id);
                                  }}
                                />
                              </div>
                              <button
                                className="document-bottom"
                                onClick={() => {
                                  setSelectedRegion(region.id);
                                  setInspector(source.id);
                                }}
                              >
                                <FileImage size={13} />
                                <span>
                                  Source {sourceNumber} · {region.label}
                                </span>
                                <ArrowUpRight size={13} />
                              </button>
                            </article>
                            <button
                              className={`keep-chip ${kept.has(region.id) ? "active" : ""}`}
                              onClick={() => toggleKeep(region.id)}
                              aria-pressed={kept.has(region.id)}
                            >
                              <LockKeyhole size={12} />
                              {kept.has(region.id)
                                ? "Kept visible"
                                : "Keep visible"}
                            </button>
                            {i < path.length - 1 && (
                              <span
                                className="provenance-next"
                                aria-hidden="true"
                              >
                                <ChevronRight size={18} />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="provenance-legend">
                    <Fingerprint size={14} />
                    <span>
                      Every arrow has a source. The same file can support more
                      than one step.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="files-grid">
                  {workspace.sources.map((source) => (
                    <button
                      className="source-file-card"
                      key={source.id}
                      onClick={() => setInspector(source.id)}
                    >
                      <SourceImage
                        source={source}
                        regions={workspace.regions.filter(
                          (r) => r.sourceId === source.id,
                        )}
                        masked={masks}
                      />
                      <span>
                        <FileImage size={16} />
                        <strong>{source.title}</strong>
                        <ArrowUpRight size={16} />
                      </span>
                      <small>
                        {source.width} × {source.height} · {source.name}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              <div className="path-panel">
                <div className="path-panel-heading">
                  <span className="micro-label">FOLLOW THE CONNECTION</span>
                  <div className="path-switch">
                    <button
                      disabled={pathIndex === 0}
                      onClick={() => setActivePath((p) => p - 1)}
                      aria-label="Previous disclosure route"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span>
                      Route {allRoutes.paths.length ? pathIndex + 1 : 0} of{" "}
                      {allRoutes.paths.length}
                    </span>
                    <button
                      disabled={activePath >= allRoutes.paths.length - 1}
                      onClick={() => setActivePath((p) => p + 1)}
                      aria-label="Next disclosure route"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="path-chain">
                  <span className="chain-node start">
                    <span className="node-dot" />
                    {start?.label}
                  </span>
                  {path.map((edge) => (
                    <span className="chain-step" key={edge.id}>
                      <button
                        className={`chain-arrow ${masks.has(edge.regionId) ? "severed" : ""}`}
                        onClick={() => {
                          setSelectedRegion(edge.regionId);
                          setInspector(
                            sourceForRegion(edge.regionId)?.id ?? null,
                          );
                        }}
                        aria-label={`Inspect ${readablePredicate(edge.predicate)}`}
                        title={readablePredicate(edge.predicate)}
                      >
                        {masks.has(edge.regionId) ? (
                          <X size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}
                      </button>
                      <span
                        className={`chain-node ${edge.to === workspace.protectedTo ? "target" : ""}`}
                      >
                        {
                          workspace.entities.find((e) => e.id === edge.to)
                            ?.label
                        }
                      </span>
                    </span>
                  ))}
                </div>
                <p>
                  {path.length
                    ? `This route uses ${path.length} explicit links across ${new Set(path.map((edge) => workspace.regions.find((r) => r.id === edge.regionId)?.sourceId)).size} sources. Each arrow opens its exact evidence region.`
                    : "No supported path connects these endpoints in the current evidence."}
                </p>
              </div>
            </div>
            <aside className="insight-panel">
              <div className="insight-heading">
                <span className={`insight-icon ${repaired ? "resolved" : ""}`}>
                  {repaired ? (
                    <ShieldCheck size={19} />
                  ) : (
                    <ScanLine size={19} />
                  )}
                </span>
                <span className="micro-label">
                  {repaired ? "REPAIR PREVIEW" : "WHAT THE BUNDLE REVEALS"}
                </span>
              </div>
              <h2>
                {repaired ? (
                  <>
                    {masks.size === 1 ? "One edit." : `${masks.size} edits.`}
                    <br />
                    {allRoutes.paths.length === 2
                      ? "Both routes broken."
                      : `${allRoutes.paths.length} detected route${allRoutes.paths.length === 1 ? "" : "s"} broken.`}
                  </>
                ) : allRoutes.paths.length ? (
                  <>
                    The missing piece
                    <br />
                    is in another file.
                  </>
                ) : (
                  <>
                    No supported
                    <br />
                    connection found.
                  </>
                )}
              </h2>
              <p className="insight-description">
                {repaired ? (
                  "Selected evidence regions are masked. The rest of your screenshots remain unchanged. Verify the actual exported pixels next."
                ) : allRoutes.paths.length ? (
                  <>
                    These sources connect <strong>{start?.label}</strong> to{" "}
                    <strong>{target?.label}</strong>. The association emerges
                    when they’re read together.
                  </>
                ) : (
                  "The current evidence does not connect these endpoints. Review the sources; an absent detected route is not a privacy guarantee."
                )}
              </p>
              <div className="insight-rule" />
              <div className="evidence-heading">
                <span>Evidence links</span>
                <span>
                  {
                    workspace.relations.filter((r) => r.status !== "rejected")
                      .length
                  }
                </span>
              </div>
              <div className="evidence-list">
                {path.map((edge, i) => {
                  const region = workspace.regions.find(
                    (r) => r.id === edge.regionId,
                  );
                  return (
                    <button
                      key={edge.id}
                      className={`evidence-item ${edge.regionId === selectedRegion ? "active" : ""}`}
                      onClick={() => setSelectedRegion(edge.regionId)}
                    >
                      <span
                        className={`evidence-index ${masks.has(edge.regionId) ? "removed" : ""}`}
                      >
                        {masks.has(edge.regionId) ? <Check size={12} /> : i + 1}
                      </span>
                      <span>
                        <strong>{region?.label}</strong>
                        <small>
                          {masks.has(edge.regionId)
                            ? "Masked in preview"
                            : edge.status === "confirmed"
                              ? edge.confirmedBy === "fixture"
                                ? "Fixture annotation"
                                : "Confirmed by you"
                              : "Suggested · needs review"}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  );
                })}
              </div>
              {activeRegion && (
                <div className="quote-card">
                  <span className="micro-label">SOURCE EVIDENCE</span>
                  <blockquote>“{activeRegion.quote}”</blockquote>
                  <button
                    className="text-button"
                    onClick={() => setInspector(activeRegion.sourceId)}
                  >
                    Inspect exact region <ArrowUpRight size={13} />
                  </button>
                </div>
              )}
              <div className="scope-note">
                <CircleHelp size={14} />
                <p>
                  Detected links in these {workspace.sources.length} files. This
                  is an evidence check, not a guarantee of privacy.
                </p>
              </div>
            </aside>
          </div>
        </section>
        <section className={`repair-bar ${repaired ? "is-repaired" : ""}`}>
          <div className="repair-symbol">
            {repaired ? <CheckCheck size={22} /> : <Sparkles size={22} />}
          </div>
          <div className="repair-copy">
            <h3>
              {repaired
                ? "Keep the story. Remove the connection."
                : masks.size
                  ? `${currentRoutes.paths.length} detected route${currentRoutes.paths.length === 1 ? " still connects" : "s still connect"} these facts.`
                  : recommendation.exact && recommendation.regionIds.length
                    ? `${recommendation.regionIds.length === 1 ? "One precise edit" : `${recommendation.regionIds.length} precise edits`}. Less to give away.`
                    : "Review the evidence before sharing."}
            </h3>
            <p>
              {repaired
                ? `${masks.size} region${masks.size === 1 ? "" : "s"} selected · ${currentRoutes.paths.length} detected routes remaining`
                : recommendation.feasible === false
                  ? "Release a kept region to make a repair possible."
                  : masks.size
                    ? "This repair is incomplete. Find the minimal repair to cover every detected route."
                    : "Find the fewest evidence regions to mask while preserving the rest of your screenshots."}
            </p>
          </div>
          <div className="repair-actions">
            {masks.size > 0 && (
              <button
                className="quiet-button"
                onClick={() => {
                  setMasks(new Set());
                  discardResult();
                }}
              >
                <RotateCcw size={15} /> Reset
              </button>
            )}
            <button
              className="primary-button"
              disabled={
                exporting ||
                (!repaired && !allRoutes.paths.length) ||
                !allRoutes.complete ||
                recommendation.feasible === false ||
                (repaired && suggested > 0)
              }
              onClick={repaired ? doExport : applyRepair}
            >
              {exporting ? (
                <LoaderCircle size={17} className="spin" />
              ) : repaired ? (
                <ArrowDownToLine size={17} />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {exporting
                ? "Checking exported pixels…"
                : repaired
                  ? suggested > 0
                    ? "Review suggested links to export"
                    : "Export & verify"
                  : "Find minimal repair"}
              {!exporting && !repaired && <ArrowRight size={16} />}
            </button>
          </div>
        </section>
        {!allRoutes.complete && (
          <div className="notice" role="status">
            <CircleHelp size={16} />
            <span>
              This graph has too many routes for a complete search. Exact repair
              is unavailable; analyze a smaller bundle.
            </span>
          </div>
        )}
        {kept.size > 0 && (
          <div className="keep-summary">
            <LockKeyhole size={16} />
            <span>
              <strong>
                {kept.size} region{kept.size === 1 ? "" : "s"} kept visible.
              </strong>{" "}
              {!recommendation.exact
                ? (recommendation.reason ?? "An exact repair is unavailable.")
                : recommendation.feasible === false
                  ? "No known repair can satisfy every preservation choice."
                  : `${recommendation.regionIds.length} candidate mask${recommendation.regionIds.length === 1 ? "" : "s"} can disconnect the detected routes without changing kept pixels.`}
            </span>
            <button
              className="text-button"
              onClick={() => {
                discardResult();
                setKept(new Set());
                setError("");
              }}
            >
              Release all
            </button>
          </div>
        )}
        {recommendation.feasible === false && (
          <div className="notice" role="status">
            <LockKeyhole size={16} />
            <span>{recommendation.reason}</span>
          </div>
        )}
        {suggested > 0 && (
          <div className="notice">
            <ScanLine size={17} />
            <span>
              {suggested} proposed links need your review. Open each source,
              correct any region, then confirm or reject its evidence.
            </span>
            <button
              className="text-button"
              onClick={() => {
                const rel = workspace.relations.find(
                  (r) => r.status === "suggested",
                );
                if (rel) {
                  setSelectedRegion(rel.regionId);
                  setInspector(sourceForRegion(rel.regionId)?.id ?? null);
                }
              }}
            >
              Review next <ArrowRight size={14} />
            </button>
          </div>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <footer className="page-footer">
          <span>
            <MosaicMark /> A little context changes everything.
          </span>
          <span>
            {workspace.origin === "sample"
              ? "Sample stays local unless you run a fresh reading"
              : "Cloud analysis disclosed before upload"}
            <span className="footer-dot">·</span>
            <button onClick={() => setModal("about")}>
              About this proof of concept <ArrowUpRight size={12} />
            </button>
          </span>
        </footer>
      </main>
      {inspector && (
        <SourceInspector
          workspace={workspace}
          sourceId={inspector}
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
          masks={masks}
          toggleMask={toggleMask}
          kept={kept}
          toggleKeep={toggleKeep}
          onClose={() => setInspector(null)}
          onChange={updateEvidence}
        />
      )}
      {modal === "import" && (
        <ImportDialog
          onClose={() => setModal(null)}
          onImport={replaceWorkspace}
          onSample={() => replaceWorkspace(sampleWorkspace())}
        />
      )}
      {modal === "goal" && (
        <GoalDialog
          workspace={workspace}
          onClose={() => setModal(null)}
          onChange={(next) => replaceWorkspace(next)}
        />
      )}
      {modal === "about" && (
        <Dialog title="See the whole picture." onClose={() => setModal(null)}>
          <div className="about-body">
            <MosaicMark />
            <p className="lead">
              Mosaic finds what screenshots can reveal <em>together</em>.
            </p>
            <ol>
              <li>
                <strong>Trace the evidence.</strong> Follow explicit,
                source-backed relationships from an incident to the identity you
                want to protect.
              </li>
              <li>
                <strong>Make a precise edit.</strong> Find a small set of
                regions that disconnects every detected route, including
                alternate paths.
              </li>
              <li>
                <strong>Check the actual output.</strong> Export new, flattened
                PNGs. Mosaic reopens those bytes to check every mask pixel and
                preserved content.
              </li>
            </ol>
            <div className="info-box">
              This prototype checks known evidence in supplied files. It does
              not detect every possible inference or certify that a file is safe
              to share. Optional fresh reading sends exported pixels to a new
              model context, with separate consent. The demo is fictional and
              its annotations are deterministic. New bundles use OpenAI only
              after your consent.
            </div>
            <button className="primary-button" onClick={() => setModal(null)}>
              Explore the workspace <ArrowRight size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {modal === "output" && result && (
        <Dialog
          title="The pixels have the last word."
          onClose={() => setModal(null)}
          wide
        >
          <OutputPanel
            result={result}
            workspace={workspace}
            onReview={(next) => {
              const nextKept = retainedKeepIds(kept, next, result);
              replaceWorkspace(next);
              setKept(nextKept);
            }}
            onClose={() => setModal(null)}
          />
        </Dialog>
      )}
    </>
  );
}
function SourceInspector({
  workspace,
  sourceId,
  selectedRegion,
  setSelectedRegion,
  masks,
  kept,
  toggleKeep,
  toggleMask,
  onClose,
  onChange,
}: {
  workspace: Workspace;
  sourceId: string;
  selectedRegion: string;
  setSelectedRegion: (id: string) => void;
  masks: Set<string>;
  kept: Set<string>;
  toggleKeep: (id: string) => void;
  toggleMask: (id: string) => void;
  onClose: () => void;
  onChange: (w: Workspace) => void;
}) {
  const source = workspace.sources.find((s) => s.id === sourceId)!;
  const regions = workspace.regions.filter((r) => r.sourceId === sourceId);
  const selected = regions.find((r) => r.id === selectedRegion) ?? regions[0];
  const [editing, setEditing] = useState(false);
  const [showMasks, setShowMasks] = useState(false);
  const [rect, setRect] = useState(selected?.rect);
  const [quote, setQuote] = useState(selected?.quote ?? "");
  const [rectError, setRectError] = useState("");
  useEffect(() => {
    setRect(selected?.rect);
    setQuote(selected?.quote ?? "");
    setEditing(false);
    setRectError("");
  }, [selected?.id]);
  function saveRect() {
    const parsed = RectSchema.safeParse(rect);
    if (!parsed.success || !quote.trim() || quote.length > 500) {
      setRectError(
        "Use a nonempty quote and positive dimensions that stay within the image.",
      );
      return;
    }
    onChange({
      ...workspace,
      regions: workspace.regions.map((r) =>
        r.id === selected.id
          ? { ...r, rect: parsed.data, quote: quote.trim() }
          : r,
      ),
      relations: workspace.relations.map((r) =>
        r.regionId === selected.id
          ? { ...r, status: "suggested", confirmedBy: undefined }
          : r,
      ),
    });
    setEditing(false);
  }
  return (
    <Dialog title={source.title} onClose={onClose} wide>
      <div className="inspector-body">
        <div className="inspector-image">
          <div className="image-view-controls" aria-label="Source preview mode">
            <button
              className={!showMasks ? "active" : ""}
              onClick={() => setShowMasks(false)}
            >
              Original evidence
            </button>
            <button
              className={showMasks ? "active" : ""}
              onClick={() => setShowMasks(true)}
              disabled={!regions.some((r) => masks.has(r.id))}
            >
              Repair preview
            </button>
          </div>
          <SourceImage
            large
            source={source}
            regions={
              editing && rect && selected
                ? regions.map((r) =>
                    r.id === selected.id ? { ...r, rect } : r,
                  )
                : regions
            }
            masked={showMasks ? masks : new Set()}
            kept={kept}
            active={selected?.id}
            onRegionClick={(r) => setSelectedRegion(r.id)}
          />
          <div className="inspector-image-footer">
            <FileImage size={14} />
            {source.width} × {source.height}
            <span>{source.name}</span>
          </div>
        </div>
        <aside className="inspector-details">
          <span className="micro-label">EVIDENCE IN THIS SOURCE</span>
          <p className="inspector-guidance">
            Check the relationship and its highlighted region. The box must
            cover the text whose removal breaks this link.
          </p>
          <div className="region-selector">
            {regions.map((r) => (
              <button
                className={selected?.id === r.id ? "active" : ""}
                key={r.id}
                onClick={() => setSelectedRegion(r.id)}
              >
                {r.label}
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          {selected && (
            <>
              <blockquote>“{selected.quote}”</blockquote>
              {workspace.relations
                .filter((r) => r.regionId === selected.id)
                .map((edge) => (
                  <div className="relation-review" key={edge.id}>
                    <p>
                      <strong>
                        {
                          workspace.entities.find((e) => e.id === edge.from)
                            ?.label
                        }
                      </strong>{" "}
                      {readablePredicate(edge.predicate)}{" "}
                      <strong>
                        {
                          workspace.entities.find((e) => e.id === edge.to)
                            ?.label
                        }
                      </strong>
                    </p>
                    <span className={`review-status ${edge.status}`}>
                      {edge.status === "confirmed" ? (
                        <Check size={12} />
                      ) : (
                        <ScanLine size={12} />
                      )}{" "}
                      {edge.status === "confirmed"
                        ? edge.confirmedBy === "fixture"
                          ? "Fixture-confirmed"
                          : "Confirmed by you"
                        : edge.status === "rejected"
                          ? "Rejected"
                          : "Needs review"}
                    </span>
                    {(workspace.origin === "upload" ||
                      edge.status !== "confirmed" ||
                      edge.confirmedBy === "user") && (
                      <div className="review-buttons">
                        <button
                          disabled={edge.status === "confirmed"}
                          onClick={() =>
                            onChange({
                              ...workspace,
                              relations: workspace.relations.map((r) =>
                                r.id === edge.id
                                  ? {
                                      ...r,
                                      status: "confirmed",
                                      confirmedBy: "user",
                                    }
                                  : r,
                              ),
                            })
                          }
                        >
                          <Check size={13} /> Confirm
                        </button>
                        <button
                          disabled={edge.status === "rejected"}
                          onClick={() =>
                            onChange({
                              ...workspace,
                              relations: workspace.relations.map((r) =>
                                r.id === edge.id
                                  ? { ...r, status: "rejected" }
                                  : r,
                              ),
                            })
                          }
                        >
                          <X size={13} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              <button
                className={`outline-button full keep-action ${kept.has(selected.id) ? "active" : ""}`}
                onClick={() => toggleKeep(selected.id)}
                aria-pressed={kept.has(selected.id)}
              >
                <LockKeyhole size={15} />
                {kept.has(selected.id)
                  ? "Kept visible · release"
                  : "Keep this visible"}
              </button>
              <p className="keep-explanation">
                Preserve these pixels in every repair, even when another mask
                overlaps them.
              </p>
              <button
                className="outline-button full"
                disabled={
                  !masks.has(selected.id) &&
                  maskConflicts(
                    workspace.regions,
                    workspace.sources,
                    new Set([selected.id]),
                    kept,
                  ).length > 0
                }
                onClick={() => toggleMask(selected.id)}
              >
                {masks.has(selected.id) ? (
                  <RotateCcw size={15} />
                ) : (
                  <Minus size={15} />
                )}{" "}
                {masks.has(selected.id)
                  ? "Remove this mask"
                  : "Mask this region"}
              </button>
              <button
                className="text-button edit-region"
                onClick={() => setEditing((v) => !v)}
              >
                Adjust region bounds <ChevronDown size={14} />
              </button>
              {editing && rect && (
                <div className="rect-editor">
                  <p>
                    Percent of image. Adjust to cover the complete identifying
                    text.
                  </p>
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <label key={key}>
                      {key}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={Number((rect[key] * 100).toFixed(2))}
                        onChange={(e) =>
                          setRect({
                            ...rect,
                            [key]: Number(e.target.value) / 100,
                          })
                        }
                      />
                    </label>
                  ))}
                  <label className="quote-editor">
                    Visible text in region
                    <textarea
                      maxLength={500}
                      value={quote}
                      onChange={(e) => setQuote(e.target.value)}
                    />
                  </label>
                  {rectError && (
                    <p role="alert" className="inline-error">
                      {rectError}
                    </p>
                  )}
                  <button className="primary-button" onClick={saveRect}>
                    Save region
                  </button>
                </div>
              )}
            </>
          )}
          {!selected && (
            <p>No source-backed evidence was extracted from this image.</p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}
function GoalDialog({
  workspace,
  onClose,
  onChange,
}: {
  workspace: Workspace;
  onClose: () => void;
  onChange: (w: Workspace) => void;
}) {
  const [from, setFrom] = useState(workspace.protectedFrom),
    [to, setTo] = useState(workspace.protectedTo);
  return (
    <Dialog title="What connection should stay confidential?" onClose={onClose}>
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          onChange({ ...workspace, protectedFrom: from, protectedTo: to });
        }}
      >
        <p>
          Choose two known entities. Mosaic follows the directed evidence from
          the first to the second.
        </p>
        <label>
          Starting evidence
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {workspace.entities.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} · {n.type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Identity or fact to protect
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {workspace.entities.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} · {n.type}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" disabled={from === to}>
          Update association <ArrowRight size={15} />
        </button>
      </form>
    </Dialog>
  );
}
function ImportDialog({
  onClose,
  onImport,
  onSample,
}: {
  onClose: () => void;
  onImport: (w: Workspace) => void;
  onSample: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function selectFiles(list: FileList | null) {
    const next = Array.from(list ?? []);
    setError("");
    if (
      next.length > 6 ||
      next.some(
        (f) =>
          !["image/png", "image/jpeg"].includes(f.type) ||
          f.size > 6 * 1024 * 1024,
      ) ||
      next.reduce((s, f) => s + f.size, 0) > 24 * 1024 * 1024
    ) {
      setError(
        "Choose up to 6 PNG/JPEG images, each under 6 MB and 24 MB in total.",
      );
      return;
    }
    setFiles(next);
  }
  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    controller.current = new AbortController();
    try {
      const sources = await Promise.all(
        files.map(async (file, i) => ({
          id: `source-${i + 1}`,
          name: file.name,
          data: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () =>
              reject(new Error("Could not read a selected file"));
            reader.readAsDataURL(file);
          }),
        })),
      );
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources, from, to, consent }),
        signal: controller.current.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Analysis could not be completed");
      const evidence = validateEvidence(
        body.evidence,
        body.sources.map((s: Source) => s.id),
      );
      onImport({
        ...evidence,
        sources: body.sources,
        title: "Untitled case study",
        origin: "upload",
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError")
        setError("Analysis cancelled. Your previous workspace is unchanged.");
      else
        setError(
          e instanceof Error ? e.message : "Analysis failed. Try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Bring your own bigger picture."
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
    >
      <form className="form-body import-form" onSubmit={analyze}>
        <p>
          Add the screenshots you plan to share. Tell Mosaic which association
          you want to keep confidential.
        </p>
        <label className={`upload-drop ${files.length ? "has-files" : ""}`}>
          <ImagePlus size={27} />
          <strong>
            {files.length
              ? `${files.length} screenshots selected`
              : "Choose your screenshots"}
          </strong>
          <span>2–6 PNG or JPEG files · up to 6 MB each</span>
          <input
            aria-label="Choose screenshots"
            type="file"
            accept="image/png,image/jpeg"
            multiple
            disabled={busy}
            onChange={(e) => selectFiles(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <div className="selected-files">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`}>
                <FileImage size={13} />
                {f.name}
                <small>{formatSize(f.size)}</small>
              </span>
            ))}
          </div>
        )}
        <div className="input-pair">
          <label>
            Start with this incident or fact
            <input
              maxLength={120}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="e.g. Incident 042"
              disabled={busy}
              required
            />
          </label>
          <label>
            Protect its connection to
            <input
              maxLength={120}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="e.g. Northstar Health"
              disabled={busy}
              required
            />
          </label>
        </div>
        <div className="cloud-disclosure">
          <span className="micro-label">BEFORE ANY IMAGES ARE SENT</span>
          <p>
            Analysis sends these screenshots and your chosen association to{" "}
            <strong>OpenAI</strong> through the local Mosaic server. The app
            does not save them. OpenAI’s processing policies apply. Proposed
            links and coordinates need your review.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I agree to send these images to OpenAI for this analysis.
            </span>
          </label>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="import-actions">
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onSample}
          >
            Use the fictional sample
          </button>
          {busy ? (
            <button
              type="button"
              className="outline-button"
              onClick={() => controller.current?.abort()}
            >
              Cancel analysis
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={
                files.length < 2 || !consent || !from.trim() || !to.trim()
              }
            >
              <ScanLine size={16} /> Analyze bundle <ArrowRight size={15} />
            </button>
          )}
        </div>
        {busy && (
          <div className="analyzing" role="status">
            <LoaderCircle className="spin" size={19} />
            <span>
              Reading source evidence and checking relationships…
              <small>
                Usually takes a moment. Nothing is confirmed automatically.
              </small>
            </span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
function OutputPanel({
  result,
  workspace,
  onReview,
  onClose,
}: {
  result: ExportResult;
  workspace: Workspace;
  onReview: (next: Workspace) => void;
  onClose: () => void;
}) {
  const [packing, setPacking] = useState(false);
  function report() {
    return {
      version: 1,
      scope:
        "This report covers known-region pixels and detected routes only. Any optional fresh reading is separate. No privacy guarantee.",
      checks: {
        decodedExportedPngBytes: true,
        opaqueMaskPixels: true,
        preservedUnmaskedPixels: true,
        keptRegionsPreserved: result.keptRegionIds.length,
        remainingDetectedRoutes: result.remainingRoutes,
        completeRouteSearch: result.complete,
      },
      files: result.files.map((f) => ({
        name: f.name,
        width: f.width,
        height: f.height,
        bytes: f.blob.size,
        maskedRegions: f.maskedRegions,
      })),
      passed: result.passed,
    };
  }
  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadReport() {
    save(
      new Blob([JSON.stringify(report(), null, 2)], {
        type: "application/json",
      }),
      "mosaic-verification.json",
    );
  }
  async function downloadBundle() {
    setPacking(true);
    try {
      const entries: Record<string, Uint8Array> = {
        "mosaic-verification.json": strToU8(JSON.stringify(report(), null, 2)),
      };
      for (const file of result.files)
        entries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
      const zipped = zipSync(entries, { level: 0 });
      save(
        new Blob([new Uint8Array(zipped).buffer], { type: "application/zip" }),
        "mosaic-checked-bundle.zip",
      );
    } finally {
      setPacking(false);
    }
  }

  return (
    <div className="output-body">
      <div className={`output-status ${result.passed ? "passed" : ""}`}>
        <ShieldCheck size={28} />
        <div>
          <h3>
            {result.passed
              ? "Exported pixels checked. Detected routes disconnected."
              : "Pixel checks passed. Some detected routes remain."}
          </h3>
          <p>
            These are the newly encoded PNG files, reopened from their actual
            bytes.
          </p>
        </div>
      </div>
      <div className="output-checks">
        <span>
          <Check size={15} /> {result.files.length} PNGs decoded again
        </span>
        <span>
          <Check size={15} /> {result.verifiedRegionIds.length} opaque mask
          region{result.verifiedRegionIds.length === 1 ? "" : "s"}
        </span>
        <span>
          <Check size={15} /> Unmasked pixels preserved
        </span>
        {result.keptRegionIds.length > 0 && (
          <span>
            <LockKeyhole size={15} />
            {result.keptRegionIds.length} kept region
            {result.keptRegionIds.length === 1 ? "" : "s"} checked pixel by
            pixel
          </span>
        )}
      </div>
      <div className="output-files">
        {result.files.map((file) => (
          <div className="output-file" key={file.name}>
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${file.name}`}
            >
              <img src={file.url} alt={`Exported ${file.name}`} />
            </a>
            <div>
              <strong>{file.name}</strong>
              <span>
                {formatSize(file.blob.size)} · {file.width} × {file.height}
              </span>
            </div>
            <a className="outline-button" href={file.url} download={file.name}>
              <ArrowDownToLine size={15} /> Download PNG
            </a>
          </div>
        ))}
      </div>
      <div className="info-box">
        Checked: the selected source regions are opaque in the exported files,
        all other pixels are preserved.{" "}
        {result.passed
          ? "The verified regions disconnect every detected path."
          : `${result.remainingRoutes} detected route(s) remain; review your repair.`}{" "}
        Pixel checks do not assess missed evidence, new inferences, or other
        files. An optional fresh model reading below is a separate observation.
      </div>
      <FreshReader
        key={result.files[0]?.url}
        result={result}
        workspace={workspace}
        onReview={onReview}
      />
      <div className="output-actions">
        <button className="text-button" onClick={downloadReport}>
          <ArrowDownToLine size={14} /> Download verification report
        </button>
        <div className="output-main-actions">
          <button className="quiet-button" onClick={onClose}>
            Back to workspace
          </button>
          <button
            className="primary-button"
            disabled={packing}
            onClick={downloadBundle}
          >
            {packing ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <ArrowDownToLine size={15} />
            )}{" "}
            Download bundle
          </button>
        </div>
      </div>
    </div>
  );
}
