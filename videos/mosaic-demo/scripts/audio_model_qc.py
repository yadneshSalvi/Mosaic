#!/usr/bin/env python3
"""Optional independent model observation of one frozen synthetic audition mix.

No human listening claim. One generation request per project; no automatic retry.
The general-purpose reviewer does not generate or replace the requested TTS.
"""
import argparse
import base64
import json
from pathlib import Path

from audio_production import private_env, provider_request, dump, sha


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project",type=Path,default=Path(__file__).resolve().parents[1])
    args=parser.parse_args()
    project=args.project.resolve()
    repo=project.parents[1]
    env=private_env(repo)
    model="gemini-3.1-pro-preview"
    headers={"x-goog-api-key":env["GEMINI_API_KEY"],"Content-Type":"application/json"}
    info=provider_request("GET",f"https://generativelanguage.googleapis.com/v1beta/models/{model}",headers,tries=1)
    source=project/"assets/audio/master-audition.flac"
    binary=source.read_bytes()
    output=project/"assets/audio/model-audio-qc.json"
    digest=sha(binary)
    if output.exists() and json.loads(output.read_text()).get("audio_sha256")==digest:
        print(f"{repo.name}: reuse frozen model audio observation")
        return
    prompt="""Listen to the supplied complete synthetic product-demo audio master.
Provide an independent audio-quality observation, not a human listening assertion.
Do not infer defects from the topic; assess audible evidence. Be specific and
bounded about confidence. Return a JSON object with these fields:
summary, narrator_voice_description, pace_observation,
voice_identity_changes (array of {timestamp_s,observation,confidence}),
unwanted_spoken_instructions (array),
truncated_or_missing_ending_observation,
music_audibility_and_speech_masking,
clicks_hiss_mouth_noises_or_other_artifacts (array of {timestamp_s,type,confidence}),
overall_recommendation (pass/review/fail), limitations.
For Mosaic only, additionally transcribe the spoken sentence beginning 'The
operations channel' around 53-57 seconds, based on the audio rather than guessing.
For Every Hand leave that additional transcription field empty.
"""
    payload={"contents":[{"role":"user","parts":[{"text":prompt},
               {"inlineData":{"mimeType":"audio/flac","data":base64.b64encode(binary).decode()}}]}],
             "generationConfig":{"responseMimeType":"application/json","maxOutputTokens":8192}}
    response=provider_request("POST",f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",headers,payload=payload,tries=1)
    candidate=(response.get("candidates") or [{}])[0]
    text="".join(p.get("text","") for p in candidate.get("content",{}).get("parts",[]))
    try:observation=json.loads(text)
    except ValueError:observation={"unparsed_response":text}
    report={"method":"Independent multimodal model observation of actual final synthetic audition master; not human listening",
            "model":model,"model_catalog_name":info.get("name"),"audio_sha256":digest,
            "finish_reason":candidate.get("finishReason"),"usage":response.get("usageMetadata"),"observation":observation}
    dump(output,report)
    print(json.dumps({"project":repo.name,"model_audio_observation":observation},ensure_ascii=False),flush=True)


if __name__=="__main__":
    try:main()
    except Exception as error:
        print(f"Optional model audio review unavailable: {type(error).__name__}: {str(error)[:160]}")
        raise SystemExit(1)
