#!/usr/bin/env python3
"""Verify one finished MP4's actual mixed audio without changing canonical assets.

Usage: python3 scripts/audio_final_mix_qc.py --input /absolute/final-normalized.mp4
Uses Deepgram once (cached by final file hash), saving separate final-mix reports.
"""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

import requests

from audio_production import dump, normalized_tokens, private_env, provider_request


def file_hash(path):
    digest=hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda:stream.read(1024*1024),b""):
            digest.update(block)
    return digest.hexdigest()


def comparison(expected_text,actual_text):
    expected=normalized_tokens(expected_text)
    actual=normalized_tokens(actual_text)
    matcher=difflib.SequenceMatcher(None,expected,actual,autojunk=False)
    matched=sum(block.size for block in matcher.get_matching_blocks())
    differences=[]
    for tag,i,j,k,l in matcher.get_opcodes():
        if tag!="equal":
            differences.append({"type":tag,"expected":" ".join(expected[i:j]),"recognized":" ".join(actual[k:l])})
    return {"normalized_similarity":matcher.ratio(),"expected_token_coverage":matched/max(1,len(expected)),
            "expected_token_count":len(expected),"recognized_token_count":len(actual),"differences":differences}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",type=Path,required=True,help="Finished normalized MP4 supplied by the render owner")
    parser.add_argument("--project",type=Path,default=Path(__file__).resolve().parents[1])
    args=parser.parse_args()
    project=args.project.resolve()
    source=args.input.resolve()
    if not source.is_file():
        raise RuntimeError("Final rendered file does not exist; no provider call was made")
    repo=project.parents[1]
    asset=project/"assets/audio"
    canonical={name:file_hash(project/name) for name in ["script.json","transcript.json","transcript.srt","audio_meta.json"]}
    script=json.loads((project/"script.json").read_text())
    metadata=json.loads((project/"audio_meta.json").read_text())
    original_stat=source.stat()
    probe=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration,size:stream=index,codec_type,codec_name,sample_rate,channels,duration","-of","json",str(source)],capture_output=True,text=True,check=True)
    media=json.loads(probe.stdout)
    streams=[s for s in media.get("streams",[]) if s.get("codec_type")=="audio"]
    if not streams:
        raise RuntimeError("Final rendered file has no audio stream; no provider call was made")
    duration=float(media["format"]["duration"])
    source_hash=file_hash(source)
    prior=asset/"final-mix-qc.json"
    raw_path=asset/"final-mix-deepgram.json"
    cached=prior.exists() and raw_path.exists() and json.loads(prior.read_text()).get("source_sha256")==source_hash
    if cached:
        response=json.loads(raw_path.read_text())
        print(f"{repo.name}: reuse frozen final-mix recognition",flush=True)
    else:
        # Decode the actual mixed track completely. The temporary FLAC is never
        # used in the composition and does not replace any dry narration asset.
        with tempfile.TemporaryDirectory(prefix="final-mix-qc-") as directory:
            extracted=Path(directory)/"mixed-audio.flac"
            subprocess.run(["ffmpeg","-v","error","-y","-i",str(source),"-map","0:a:0","-vn","-ac","1","-ar","24000","-c:a","flac",str(extracted)],check=True)
            final_stat=source.stat()
            if final_stat.st_size!=original_stat.st_size or final_stat.st_mtime_ns!=original_stat.st_mtime_ns:
                raise RuntimeError("Rendered file changed during extraction; no provider call was made")
            env=private_env(repo)
            if not env.get("DEEPGRAM_API_KEY"):
                raise RuntimeError("Missing DEEPGRAM_API_KEY")
            terms=["Mosaic","Every Hand","Zara","PNG","Incident"]
            query="model=nova-3&language=en&smart_format=true&utterances=true"+"".join("&keyterm="+requests.utils.quote(t) for t in terms)
            response=provider_request("POST","https://api.deepgram.com/v1/listen?"+query,
                {"Authorization":"Token "+env["DEEPGRAM_API_KEY"],"Content-Type":"audio/flac"},data=extracted.read_bytes(),tries=3)
        if raw_path.exists():
            # Keep preceding raw evidence immutable if another final render is
            # supplied later, rather than silently overwriting its only copy.
            previous=json.loads(raw_path.read_text())
            archive_hash=hashlib.sha256(raw_path.read_bytes()).hexdigest()[:12]
            archive=asset/f"final-mix-deepgram-{archive_hash}.json"
            if not archive.exists():dump(archive,previous)
        dump(raw_path,response)
    alternative=response["results"]["channels"][0]["alternatives"][0]
    words=alternative.get("words",[])
    if not words:
        raise RuntimeError("Final mix returned no speech timestamps")
    transcript=alternative.get("transcript","")
    full=comparison(" ".join(a["text"] for a in script),transcript)
    chapters=[]
    for index,(act,timing) in enumerate(zip(script,metadata["voices"])):
        lo=timing["act_start_s"]-.10
        hi=metadata["voices"][index+1]["act_start_s"]-.10 if index+1<len(script) else duration+.10
        actual=[w for w in words if lo<=w["start"]<hi]
        text=" ".join(w.get("punctuated_word",w["word"]) for w in actual)
        result=comparison(act["text"],text)
        chapters.append({"id":act["id"],"title":act["title"],"window_start_s":lo,"window_end_s":hi,
            "recognized_first_word_s":actual[0]["start"] if actual else None,
            "recognized_last_word_s":actual[-1]["end"] if actual else None,
            "possibly_dropped_or_truncated":not actual or result["expected_token_coverage"]<.88,
            **result})
    closing_expected=" ".join(normalized_tokens(script[-1]["text"])[-9:])
    closing_actual=" ".join(normalized_tokens(transcript))
    ending_present=closing_expected in closing_actual
    dry_words=json.loads((project/"transcript.json").read_text())
    measured=subprocess.run(["ffmpeg","-hide_banner","-nostats","-i",str(source),"-map","0:a:0","-af","loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json","-f","null","-"],capture_output=True,text=True,check=True)
    match=re.search(r"\{\s*\"input_i\".*?\}",measured.stderr,re.S)
    level=json.loads(match[0]) if match else {}
    unchanged={name:file_hash(project/name)==digest for name,digest in canonical.items()}
    report={"method":"Fresh Deepgram Nova-3 recognition of the actual finished MP4 mix; dry transcript/SRT/stems unchanged",
        "source_path":str(source),"source_sha256":source_hash,"source_duration_s":duration,"source_audio_streams":streams,
        "recognition_provider":"Deepgram","recognition_model":"nova-3","confidence":alternative.get("confidence"),
        "recognized_word_count":len(words),"full_script_comparison":full,"chapters":chapters,
        "dropped_or_truncated_chapters":[a["id"] for a in chapters if a["possibly_dropped_or_truncated"]],
        "closing_nine_word_phrase_present":ending_present,"closing_expected_normalized":closing_expected,
        "final_recognized_words":" ".join(w.get("punctuated_word",w["word"]) for w in words[-20:]),
        "first_word_offset_from_dry_s":words[0]["start"]-dry_words[0]["start"],
        "last_word_offset_from_dry_s":words[-1]["end"]-dry_words[-1]["end"],
        "measured_loudness":{"integrated_lufs":level.get("input_i"),"true_peak_dbtp":level.get("input_tp"),"loudness_range_lu":level.get("input_lra")},
        "canonical_files_unchanged":unchanged,
        "status":"pass" if full["expected_token_coverage"]>=.99 and ending_present and all(not a["possibly_dropped_or_truncated"] for a in chapters) and all(unchanged.values()) else "review"}
    dump(prior,report)
    print(json.dumps({"project":repo.name,"status":report["status"],"duration_s":duration,
        "script_coverage":full["expected_token_coverage"],"differences":full["differences"],
        "dropped_chapters":report["dropped_or_truncated_chapters"],"closing_present":ending_present,
        "loudness":report["measured_loudness"],"canonical_unchanged":all(unchanged.values())}),flush=True)


if __name__=="__main__":
    try:main()
    except Exception as error:
        print(f"Final mixed-audio QC failed: {type(error).__name__}: {str(error)[:200]}",flush=True)
        raise SystemExit(1)
