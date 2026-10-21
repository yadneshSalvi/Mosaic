#!/usr/bin/env python3
"""Stage genuine browser captures, preserving recorded CDP timing.

Only JPEGs listed by recording.json are used. Run incrementally from either
project: python3 scripts/process-capture.py. Pending steps are safe to retry.
No browser control, application mutation, or synthesized interface is involved.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

VERSION = 1
FPS = 30
VIEWPORT = (1600, 1000)
STILL_SIZE = (3200, 2000)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def json_write(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, indent=2) + "\n")
    temp.replace(path)


def relative(path: Path, project: Path) -> str:
    return path.relative_to(project).as_posix()


def size_of(path: Path) -> tuple[int, int]:
    with Image.open(path) as im:
        im.verify()
    with Image.open(path) as im:
        return im.size


def signature(paths: list[Path]) -> list[tuple[str, int, int]]:
    return [(str(p), p.stat().st_size, p.stat().st_mtime_ns) for p in paths]


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,codec_name,pix_fmt,avg_frame_rate,nb_frames,duration",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    data = json.loads(result.stdout)
    stream = data["streams"][0]
    stream["duration"] = float(data["format"]["duration"])
    return stream


def ffconcat_path(path: Path) -> str:
    # ffconcat uses single-quoted strings with backslash escapes outside quotes.
    return "'" + str(path).replace("'", "'\\''") + "'"


def inspect_step(step: Path, project: Path, end_hold: float) -> dict:
    meta_path = step / "recording.json"
    final = step / "final.png"
    highres = step / "final@2x.png"
    for p in (meta_path, final, highres):
        if not p.is_file():
            raise ValueError("capture incomplete: missing " + p.name)
    meta = json.loads(meta_path.read_text())
    frames = meta.get("frames")
    if not isinstance(frames, list) or not frames:
        raise ValueError("recording has no listed frames")
    declared = meta.get("viewport", {})
    if (declared.get("width"), declared.get("height")) != VIEWPORT:
        raise ValueError("recorded viewport is not 1600x1000")
    paths, timestamps, frame_info = [], [], []
    seen = set()
    for frame in frames:
        name = frame.get("file")
        if not isinstance(name, str):
            raise ValueError("frame filename is missing")
        path = (step / name).resolve()
        if path.parent != step.resolve() or path.suffix.lower() not in (".jpg", ".jpeg"):
            raise ValueError("frame must be a JPEG directly inside its step")
        if name in seen:
            raise ValueError("duplicate filename in recording manifest")
        seen.add(name)
        stamp = frame.get("timestamp")
        if not isinstance(stamp, (float, int)) or not math.isfinite(stamp):
            raise ValueError("frame timestamp is not finite")
        if timestamps and stamp <= timestamps[-1]:
            raise ValueError("frame timestamps are not strictly increasing")
        if size_of(path) != VIEWPORT:
            raise ValueError("listed JPEG has wrong dimensions: " + name)
        paths.append(path)
        timestamps.append(float(stamp))
        frame_info.append({"file": name, "timestamp": stamp, "sha256": digest(path)})
    if size_of(final) != VIEWPORT:
        raise ValueError("final.png is not 1600x1000")
    if size_of(highres) != STILL_SIZE:
        raise ValueError("final@2x.png is not 3200x2000")
    all_paths = [meta_path, *paths, final, highres]
    fingerprints = {
        "recording_sha256": digest(meta_path),
        "frames": frame_info,
        "final_sha256": digest(final),
        "highres_sha256": digest(highres),
        "processor_version": VERSION,
        "end_hold_seconds": end_hold,
        "fps": FPS,
        "crf": 16,
        "webp_quality": 95,
    }
    source_key = hashlib.sha256(json.dumps(fingerprints, sort_keys=True).encode()).hexdigest()
    return {
        "meta": meta, "paths": paths, "timestamps": timestamps,
        "frame_info": frame_info, "all_paths": all_paths,
        "signature": signature(all_paths), "source_key": source_key,
        "highres": highres, "fingerprints": fingerprints,
    }


def process_step(step: Path, project: Path, prior: dict | None, args) -> dict:
    info = inspect_step(step, project, args.end_hold)
    name = step.name
    output = project / "assets" / "capture"
    still_path = output / (name + ".webp")
    video_path = output / (name + ".mp4")
    if (not args.force and prior and prior.get("source_fingerprint") == info["source_key"]
            and still_path.exists() and video_path.exists()
            and prior.get("still", {}).get("sha256") == digest(still_path)
            and prior.get("video", {}).get("sha256") == digest(video_path)):
        return {**prior, "cached": True}
    paths, timestamps = info["paths"], info["timestamps"]
    intervals = [b - a for a, b in zip(timestamps, timestamps[1:])]
    action_span = timestamps[-1] - timestamps[0]
    intended_duration = action_span + args.end_hold
    with tempfile.TemporaryDirectory(prefix="browser-capture-") as temporary:
        temp = Path(temporary)
        concat = temp / "frames.ffconcat"
        lines = ["ffconcat version 1.0"]
        for path, duration in zip(paths, intervals + [args.end_hold]):
            # Microsecond input time base avoids the image demuxer's usual 25fps
            # quantization before the explicit final 30fps conversion.
            lines.extend([
                "file " + ffconcat_path(path),
                "option framerate 1000000",
                "duration " + format(duration, ".9f"),
            ])
        lines.extend(["file " + ffconcat_path(paths[-1]), "option framerate 1000000"])
        concat.write_text("\n".join(lines) + "\n")
        temp_video = temp / "capture.mp4"
        command = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat),
            "-vf", "fps=30:round=near,scale=1600:1000:in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p,setsar=1",
            "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "medium",
            "-crf", "16", "-threads", "2", "-pix_fmt", "yuv420p",
            "-color_range", "tv", "-colorspace", "bt709",
            "-color_trc", "bt709", "-color_primaries", "bt709",
            "-movflags", "+faststart", "-an", "-t", format(intended_duration, ".9f"),
            str(temp_video),
        ]
        subprocess.run(command, check=True, capture_output=True, text=True)
        video_meta = probe(temp_video)
        if (video_meta["width"], video_meta["height"]) != VIEWPORT:
            raise ValueError("encoded video dimensions differ from capture")
        if video_meta["avg_frame_rate"] != "30/1":
            raise ValueError("encoded video is not 30fps")
        if abs(video_meta["duration"] - intended_duration) > 1 / FPS + 0.002:
            raise ValueError("encoded duration differs by more than one output frame")
        temp_still = temp / "capture.webp"
        with Image.open(info["highres"]) as image:
            image.convert("RGB").save(temp_still, "WEBP", quality=95, method=6)
        if signature(info["all_paths"]) != info["signature"]:
            raise ValueError("capture changed during processing; retry after take completes")
        output.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(temp_video, video_path.with_suffix(".mp4.tmp"))
        video_path.with_suffix(".mp4.tmp").replace(video_path)
        shutil.copyfile(temp_still, still_path.with_suffix(".webp.tmp"))
        still_path.with_suffix(".webp.tmp").replace(still_path)
    listed = set(p.name for p in paths)
    ignored = sorted(p.name for p in step.glob("*.jpg") if p.name not in listed)
    return {
        "id": name,
        "source": relative(step, project),
        "url": info["meta"].get("url"),
        "captured_at": info["meta"].get("capturedAt"),
        "source_fingerprint": info["source_key"],
        "source_manifest_sha256": info["fingerprints"]["recording_sha256"],
        "source_frame_count": len(paths),
        "source_first": {"file": paths[0].name, "timestamp": timestamps[0], "width": 1600, "height": 1000},
        "source_last": {"file": paths[-1].name, "timestamp": timestamps[-1], "width": 1600, "height": 1000},
        "source_frames": info["frame_info"],
        "source_unlisted_jpegs_ignored": ignored,
        "timing": {
            "source_timestamp_span_seconds": action_span,
            "recording_wall_duration_seconds": info["meta"].get("duration"),
            "source_interval_min_seconds": min(intervals) if intervals else None,
            "source_interval_max_seconds": max(intervals) if intervals else None,
            "source_timestamps_strictly_increasing": True,
            "end_hold_added_seconds": args.end_hold,
            "intended_clip_duration_seconds": intended_duration,
            "encoded_clip_duration_seconds": video_meta["duration"],
            "rate_multiplier": 1,
            "edit": f"CDP inter-frame intervals preserved; final listed frame held for {args.end_hold:g}s; resampled to 30fps without motion interpolation.",
            "composition_retiming": "Not applied here. Any later slow-down or trim belongs in the final composition edit metadata.",
        },
        "still": {
            "path": relative(still_path, project), "source": relative(info["highres"], project),
            "width": 3200, "height": 2000, "format": "webp", "quality": 95,
            "source_sha256": info["fingerprints"]["highres_sha256"], "sha256": digest(still_path),
        },
        "video": {
            "path": relative(video_path, project), "width": 1600, "height": 1000,
            "codec": video_meta["codec_name"], "pixel_format": video_meta["pix_fmt"],
            "fps": 30, "crf": 16, "audio": False, "sha256": digest(video_path),
            "frame_count": int(video_meta["nb_frames"]),
        },
        "cached": False,
    }


def contact_sheet(project: Path, entries: list[dict]) -> str | None:
    if not entries:
        return None
    columns, cell_w, image_h, label_h, header = 4, 480, 300, 38, 52
    rows = math.ceil(len(entries) / columns)
    sheet = Image.new("RGB", (columns * cell_w, header + rows * (image_h + label_h)), "#eeeae2")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    title_font = ImageFont.load_default(size=22)
    draw.text((18, 14), "REVIEW CONTACT SHEET - genuine final states; not a film asset", fill="#1e272b", font=title_font)
    for n, entry in enumerate(entries):
        x, y = n % columns * cell_w, header + n // columns * (image_h + label_h)
        with Image.open(project / entry["still"]["path"]) as im:
            thumb = im.convert("RGB").resize((cell_w, image_h), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x, y))
        draw.rectangle((x, y + image_h, x + cell_w, y + image_h + label_h), fill="#e1dbd0")
        draw.text((x + 12, y + image_h + 9), entry["id"], fill="#1e272b", font=font)
    path = project / "assets" / "capture" / "review-contact-sheet.webp"
    sheet.save(path, "WEBP", quality=92, method=6)
    return relative(path, project)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--end-hold", type=float, default=0.4)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not 0 < args.end_hold <= 5:
        parser.error("--end-hold must be greater than zero and at most five seconds")
    project = args.project.resolve()
    raw = project / "capture" / "raw"
    manifest_path = project / "capture" / "manifest.json"
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    previous = {step["id"]: step for step in old.get("steps", [])}
    entries, pending = [], []
    directories = sorted(p for p in raw.iterdir() if p.is_dir() and re.match(r"^\d{2,}-", p.name))
    for step in directories:
        try:
            entry = process_step(step, project, previous.get(step.name), args)
            entries.append(entry)
            print(f"{step.name}: {'cached' if entry['cached'] else 'encoded'} "
                  f"{entry['source_frame_count']} frames, "
                  f"{entry['timing']['encoded_clip_duration_seconds']:.3f}s, "
                  "1600x1000 MP4 + 3200x2000 WebP", flush=True)
        except (ValueError, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
            if isinstance(error, subprocess.CalledProcessError):
                reason = (error.stderr or str(error))[-1200:]
            else:
                reason = str(error)
            pending.append({"id": step.name, "reason": reason})
            print(f"{step.name}: pending — {reason}", flush=True)
    sheet = contact_sheet(project, entries)
    generated = datetime.now(timezone.utc).isoformat()
    manifest = {
        "schema": "actual-browser-capture/v1", "processor_version": VERSION,
        "generated_at": generated,
        "source": "Real local-browser screencast frames and final screenshots",
        "dimensions": {"video": [1600, 1000], "still": [3200, 2000]},
        "encoding": {"video": "H.264 CRF16, 30fps, yuv420p, BT.709", "still": "WebP quality95"},
        "excluded_directory_names": ["probe"],
        "review_contact_sheet": sheet, "steps": entries, "pending": pending,
    }
    json_write(manifest_path, manifest)
    lines = [
        "# Browser capture provenance", "",
        "These assets derive from actual interactions with the local applications. "
        "No interface, result, source rectangle, learner slot, or model finding was synthesized.", "",
        "Run \u0060python3 scripts/process-capture.py\u0060 to process completed numbered takes incrementally. "
        "The script excludes the probe directory and reads only JPEG filenames explicitly listed in each recording.json. "
        "Stray images from failed takes are ignored. Source hashes and first/last timestamps are recorded in manifest.json.", "",
        "For moving clips, successive CDP timestamps define each JPEG's duration. "
        "A microsecond concat input time base preserves these intervals before 30fps resampling. "
        f"The last listed frame receives a documented {args.end_hold:g}-second end hold. "
        "No motion interpolation or playback-rate change is applied here. "
        "MP4 output is 1600×1000 H.264, CRF16, yuv420p. Actual duration may differ by one 30fps frame. "
        "The wall duration field is retained as capture metadata; it is not confused with final film timing.", "",
        "Final WebP stills are encoded at quality95 directly from the actual 3200×2000 final@2x.png. "
        "The 1600×1000 final.png and every listed JPEG are dimension-checked. "
        "The known initial Mosaic overview replacement is therefore represented by its current correct final@2x.png. "
        "No generated output-image evidence is substituted; separately verified Mosaic PNG exports stay separate.", "",
        "Later slow-motion, trims, crop motion, holds, and processing-wait cuts must be recorded by the final film composition. "
        "A slowed interaction is still real footage; it must not imply real-time performance. "
        "The contact sheet is labeled for review and must not be used as film imagery.", "",
        f"Generated: {generated}", "", "| Step | Listed frames | CDP span | Clip duration | Still |", "| --- | ---: | ---: | ---: | --- |",
    ]
    for entry in entries:
        lines.append(f"| {entry['id']} | {entry['source_frame_count']} | "
                     f"{entry['timing']['source_timestamp_span_seconds']:.6f}s | "
                     f"{entry['timing']['encoded_clip_duration_seconds']:.3f}s | "
                     f"{entry['still']['path']} |")
    if pending:
        lines += ["", "## Pending captures", ""]
        lines += [f"- {p['id']}: {p['reason']}" for p in pending]
    (project / "capture" / "provenance.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"project": str(project), "steps": len(entries), "pending": len(pending),
                      "contact_sheet": sheet, "manifest": relative(manifest_path, project)}))


if __name__ == "__main__":
    main()
