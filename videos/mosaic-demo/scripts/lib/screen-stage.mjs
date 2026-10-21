/**
 * Actual-footage stage and camera source generator.
 * Geometry adapts the installed ui-focus-zoom camera law: T = center - S * anchor.
 * Native source coordinates stay 1600×1000 for both normal and @2x stills.
 * Use this in the authoring generator, never as a media playback controller.
 */
export const FRAME = Object.freeze({ width: 1920, height: 1080 });
export const SOURCE = Object.freeze({ width: 1600, height: 1000 });
export const STAGE = Object.freeze({ x: 96, y: 126, width: 1728, height: 858 });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clean = n => Number(Number(n).toFixed(4));
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Pose in CSS pixels; the media world uses transform-origin 0 0. */
export function sourcePose({ cx = 800, cy = 500, scale, zoom = 1, fit = 'cover', source = SOURCE, stage = STAGE } = {}) {
  if (![cx, cy, zoom].every(Number.isFinite)) throw new TypeError('Camera coordinates must be finite.');
  const fitScale = (fit === 'contain' ? Math.min : Math.max)(stage.width / source.width, stage.height / source.height);
  const s = scale ?? fitScale * zoom;
  if (!(s > 0 && Number.isFinite(s))) throw new RangeError('Camera scale must be positive.');
  const axis = (point, dimension, viewport) => dimension * s <= viewport
    ? (viewport - dimension * s) / 2
    : clamp(viewport / 2 - point * s, viewport - dimension * s, 0);
  return { x: clean(axis(cx, source.width, stage.width)), y: clean(axis(cy, source.height, stage.height)), scale: clean(s) };
}

/** Source rectangle -> legible camera pose with an 88% proof-region headroom budget. */
export function focusRect(rect, { padding = 0.07, maxScale = 3.1, cover = true, source = SOURCE, stage = STAGE } = {}) {
  const [x, y, width, height] = Array.isArray(rect) ? rect : [rect.x, rect.y, rect.width, rect.height];
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new TypeError('A focus rect requires x/y and positive width/height.');
  if (x < 0 || y < 0 || x + width > source.width || y + height > source.height) throw new RangeError('Focus rectangle is outside the recorded source.');
  const base = Math.max(stage.width / source.width, stage.height / source.height);
  const room = Math.max(0.12, padding * 2);
  const ideal = Math.min(stage.width / (width * (1 + room)), stage.height / (height * (1 + room)));
  const scale = Math.min(maxScale, cover ? Math.max(base, ideal) : ideal);
  return sourcePose({ cx: x + width / 2, cy: y + height / 2, scale, source, stage });
}

/** Styles are scoped to a per-scene prefix. Fonts are intentionally inherited. */
export function stageCss(prefix, { paper = '#f8f8f5', ink = '#24272f', accent = '#3655e7', line = '#e5e6e3', stage = STAGE } = {}) {
  return `
  #${prefix}-stage{position:absolute;left:${stage.x}px;top:${stage.y}px;width:${stage.width}px;height:${stage.height}px;overflow:hidden;background:${paper};border:1px solid ${line};border-radius:12px;isolation:isolate;}
  #${prefix}-world{position:absolute;left:0;top:0;width:1600px;height:1000px;transform-origin:0 0;will-change:transform;}
  #${prefix}-world>img,#${prefix}-world>video{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:fill;}
  #${prefix}-header{position:absolute;left:96px;right:96px;top:43px;display:flex;align-items:center;justify-content:space-between;gap:40px;color:${ink};}
  #${prefix}-brand{font-size:30px;line-height:1.2;letter-spacing:-.04em;font-weight:700;display:flex;align-items:center;gap:13px;}
  #${prefix}-brand>img{display:block;width:32px;height:32px;}
  #${prefix}-chapter{font-size:24px;line-height:1.25;font-weight:500;letter-spacing:.015em;}
  #${prefix}-chapter>span{color:${accent};margin-right:14px;font-variant-numeric:tabular-nums;}
  #${prefix}-footer{position:absolute;left:96px;right:96px;top:1016px;display:flex;justify-content:space-between;align-items:center;gap:32px;font-size:22px;line-height:1.4;color:${ink};}
  #${prefix}-proof{position:absolute;z-index:3;left:32px;bottom:24px;max-width:70%;padding:13px 18px;background:${paper};border:1px solid ${line};border-radius:7px;color:${ink};font-size:27px;font-weight:500;line-height:1.25;}
  `;
}

/** Only real captured files go here. A still can be 3200×2000, but its CSS box is native. */
export function mediaMarkup({ id, src, kind = 'image', start = 0, duration, mediaStart = 0, playbackRate = 1 }) {
  if (!id || !src) throw new TypeError('Real source path and unique media id are required.');
  if (/^(?:https?:)?\/\//.test(src)) throw new Error('Freeze media into the local project before authoring.');
  if (kind === 'image') return `<img id="${escapeHtml(id)}" src="${escapeHtml(src)}" alt="Actual app capture" />`;
  if (kind !== 'video' || !(duration > 0)) throw new TypeError('A video needs a positive duration.');
  return `<video id="${escapeHtml(id)}" class="clip" src="${escapeHtml(src)}" data-start="${start}" data-duration="${duration}" data-media-start="${mediaStart}" data-playback-rate="${playbackRate}" data-track-index="1" muted playsinline preload="auto"></video>`;
}

/** No timing on stage wrappers: the scene composition owns timing; videos declare their source range. */
export function stageMarkup(prefix, media, { brand = '', logo = 'assets/brand/favicon.svg', chapter = '', ordinal = '', footer = 'Fictional sample', note = '', proof = '' } = {}) {
  return `<div id="${prefix}-header"><div id="${prefix}-brand"><img src="${escapeHtml(logo)}" alt="" /><span>${escapeHtml(brand)}</span></div><div id="${prefix}-chapter"><span>${escapeHtml(ordinal)}</span>${escapeHtml(chapter)}</div></div>
  <div id="${prefix}-stage"><div id="${prefix}-world" data-layout-allow-overflow="true">${media}</div>${proof ? `<div id="${prefix}-proof">${escapeHtml(proof)}</div>` : ''}</div>
  <div id="${prefix}-footer"><span>${escapeHtml(footer)}</span><span>${escapeHtml(note)}</span></div>`;
}

/**
 * Emit explicit from/to GSAP poses. Beats are local seconds, matched to transcript words.
 * `at` means departure, so set at = spoken proof cue - move duration.
 * Each move ends in a true steady hold; no source-text micro-drift.
 */
export function cameraCode(prefix, beats, { timeline = 'tl', initial = sourcePose({ fit: 'contain' }), duration = 0.9, maxScale = 3.1 } = {}) {
  let last = initial;
  let end = 0;
  const target = JSON.stringify(`#${prefix}-world`);
  const result = [`${timeline}.set(${target}, ${JSON.stringify({ ...initial, transformOrigin: '0 0' })}, 0);`];
  beats.forEach((beat, index) => {
    const d = beat.duration ?? duration;
    if (!Number.isFinite(beat.at) || beat.at < end - 0.0001 || d < 0) throw new Error(`Camera beat ${index} overlaps or has an invalid time.`);
    const pose = beat.pose ?? (beat.rect ? focusRect(beat.rect, { maxScale: beat.maxScale ?? maxScale, ...beat.options }) : sourcePose(beat));
    result.push(`${timeline}.addLabel(${JSON.stringify(beat.label ?? `focus-${index + 1}`)}, ${beat.at});`);
    result.push(`${timeline}.fromTo(${target}, ${JSON.stringify(last)}, ${JSON.stringify({ ...pose, duration: d, ease: beat.ease ?? 'power3.inOut', immediateRender: false })}, ${beat.at});`);
    last = pose;
    end = beat.at + d;
  });
  return result.join('\n');
}
