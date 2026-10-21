#!/usr/bin/env python3
"""Frozen local audio production. Credentials are read privately, never persisted.

Run from any directory: python3 scripts/audio_production.py [--stage all|tts|finish]
Requires Python 3.11+, numpy, scipy, requests, and ffmpeg. No runtime API calls.
"""
from __future__ import annotations

import argparse
import base64
import difflib
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time
import wave

import numpy as np
import requests
from scipy import signal

MODEL = "gemini-3.1-flash-tts-preview"
RATE = 24000
MIX_RATE = 48000
TARGET_STARTS = [0., 30., 62., 96., 132.]
TARGET_DURATION = 165.
STYLE = """Synthesize speech. Speak ONLY the transcript below. Do not read headings,
directions, or director's notes aloud. Recite the complete transcript exactly.

AUDIO PROFILE
A warm, articulate professional narrator explaining thoughtful software to curious
hackathon judges. Conversational, calm, confident, and engaged. A clean close studio
recording with a stable voice and consistent projection.

DIRECTOR'S NOTES
Speak at a measured natural pace, approximately one hundred and thirty-eight words
per minute. Breathe naturally at sentence boundaries, with gentle emphasis on the
meaningful evidence. Leave brief pauses after questions and between ideas. Avoid
rushing, whispering, theatrical sales delivery, or an artificial sing-song rhythm.
Say Every Hand as two words, Zara as ZAH-ra, and P N G as three individual letters.

#### TRANSCRIPT
"""


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def private_env(repo):
    result = {}
    for line in (repo / ".env").read_text().splitlines():
        m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if m:
            value = m[2]
            if value[:1] in ["'", '"'] and value[-1:] == value[:1]:
                value = value[1:-1]
            result[m[1]] = value
    return result


def provider_request(method, url, headers, *, payload=None, data=None, tries=5):
    for attempt in range(tries):
        try:
            response = requests.request(method, url, headers=headers, json=payload,
                                        data=data, timeout=(20, 300))
        except (requests.Timeout, requests.ConnectionError):
            if attempt + 1 == tries:
                raise RuntimeError("Provider connection failed after retries") from None
            print(f"Provider connection retry {attempt + 1}", flush=True)
            time.sleep(min(40, 4 * 2**attempt))
            continue
        if response.status_code in (408, 429, 500, 502, 503, 504) and attempt + 1 < tries:
            print(f"Provider HTTP {response.status_code}; retry {attempt + 1}", flush=True)
            time.sleep(min(50, 5 * 2**attempt))
            continue
        if not response.ok:
            # Never print request headers, URL query parameters, or credential values.
            try:
                body = response.json()
                error = body.get("error", {})
                status = error.get("status", "provider_error") if isinstance(error, dict) else "provider_error"
            except ValueError:
                status = "provider_error"
            raise RuntimeError(f"Provider HTTP {response.status_code}: {status}; no fallback was used")
        return response.json()
    raise RuntimeError("Retry budget exhausted")


def read_wav(path):
    with wave.open(str(path), "rb") as wav:
        if wav.getsampwidth() != 2:
            raise RuntimeError("Expected 16-bit WAV")
        count, rate, channels = wav.getnframes(), wav.getframerate(), wav.getnchannels()
        audio = np.frombuffer(wav.readframes(count), dtype="<i2").astype(np.float32) / 32768
    return audio.reshape(-1, channels), rate


def write_wav(path, audio, rate):
    path.parent.mkdir(parents=True, exist_ok=True)
    if audio.ndim == 1:
        audio = audio[:, None]
    pcm = np.round(np.clip(audio, -.999, .999) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(audio.shape[1])
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm.tobytes())


def trim_and_level(raw):
    audio = raw[:, 0].copy()
    win = 240
    padded = np.pad(audio, (0, (-len(audio)) % win))
    rms = np.sqrt(np.mean(padded.reshape(-1, win)**2, axis=1))
    occupied = np.flatnonzero(rms > max(.001, float(rms.max()) * .018))
    if not len(occupied):
        raise RuntimeError("Generated audio contains no measurable speech")
    left = max(0, int(occupied[0] * win - .10 * RATE))
    right = min(len(audio), int((occupied[-1] + 1) * win + .18 * RATE))
    audio = audio[left:right]
    active = audio[np.abs(audio) > .004]
    speech_rms = math.sqrt(float(np.mean(active**2))) if len(active) else .05
    gain = float(np.clip(10**(-20 / 20) / speech_rms, .5, 2.0))
    gain = min(gain, .72 / max(float(np.max(np.abs(audio))), .001))
    audio *= gain
    fade = min(120, len(audio)//2)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    return audio, {"trim_leading_s": left/RATE, "trim_trailing_s": (len(raw)-right)/RATE,
                   "gain_db": 20*math.log10(gain), "duration_s": len(audio)/RATE}


def tts(project, repo, script, voice, env):
    asset = project / "assets/audio"
    headers = {"x-goog-api-key": env["GEMINI_API_KEY"], "Content-Type": "application/json"}
    info = provider_request("GET", f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}", headers)
    dump(asset / "gemini-model.json", {k: info.get(k) for k in
        ("name", "inputTokenLimit", "outputTokenLimit", "supportedGenerationMethods")})
    print(f"{repo.name}: exact Gemini 3.1 model available", flush=True)
    results = []
    for act in script:
        prompt = STYLE + act["text"]
        if repo.name == "Mosaic" and act["id"] == "act-02":
            prompt = STYLE.replace("#### TRANSCRIPT", "Pronunciation: articulate incident as IN-sih-dent, three clear syllables. There is no R sound in incident.\n\n#### TRANSCRIPT") + re.sub(r"\bincident\b", "INCIDENT", act["text"], flags=re.I)
        request_hash = sha((MODEL + voice + prompt).encode())
        raw_path = asset / "acts" / f"{act['id']}.original.wav"
        path = asset / "acts" / f"{act['id']}.wav"
        metadata_path = asset / "acts" / f"{act['id']}.json"
        if metadata_path.exists() and raw_path.exists() and json.loads(metadata_path.read_text()).get("request_sha256") == request_hash:
            metadata = json.loads(metadata_path.read_text())
            print(f"{repo.name} {act['id']}: reuse frozen narration", flush=True)
        else:
            payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                       "generationConfig": {"responseModalities": ["AUDIO"],
                       "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
            for attempt in range(4):
                output = provider_request("POST", f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                          headers, payload=payload)
                candidate = (output.get("candidates") or [{}])[0]
                parts = candidate.get("content", {}).get("parts", [])
                blobs = [p["inlineData"] for p in parts if p.get("inlineData", {}).get("mimeType", "").startswith("audio/")]
                if blobs and candidate.get("finishReason") == "STOP":
                    break
                print(f"{repo.name} {act['id']}: incomplete audio retry {attempt + 1}", flush=True)
                time.sleep(3 * (attempt + 1))
            else:
                raise RuntimeError(f"{act['id']}: Gemini did not return complete audio; no fallback used")
            binary = b"".join(base64.b64decode(b["data"]) for b in blobs)
            mime = blobs[0]["mimeType"]
            if binary.startswith(b"RIFF"):
                raw_path.parent.mkdir(parents=True, exist_ok=True)
                raw_path.write_bytes(binary)
            else:
                rate_match = re.search(r"rate=(\d+)", mime)
                rate = int(rate_match[1]) if rate_match else RATE
                if rate != RATE:
                    raise RuntimeError(f"Unexpected TTS sample rate {rate}")
                write_wav(raw_path, np.frombuffer(binary, dtype="<i2").astype(np.float32)/32768, RATE)
            raw, rate = read_wav(raw_path)
            duration = len(raw)/rate
            words = len(act["text"].split())
            if not words/5 < duration < words/1.15 + 5:
                raise RuntimeError(f"{act['id']}: implausible duration {duration:.2f}s; inspect before proceeding")
            metadata = {"provider": "Google Gemini Developer API", "model": MODEL, "voice": voice,
                        "request_sha256": request_hash, "model_version": output.get("modelVersion"),
                        "finish_reason": candidate.get("finishReason"), "usage": output.get("usageMetadata"),
                        "source_mime_type": mime, "original_duration_s": duration}
        raw, rate = read_wav(raw_path)
        if rate != RATE:
            raise RuntimeError("Unexpected sample rate")
        trimmed, treatment = trim_and_level(raw)
        write_wav(path, trimmed, RATE)
        metadata.update(treatment)
        metadata["audio_sha256"] = sha(path.read_bytes())
        dump(metadata_path, metadata)
        results.append({"id": act["id"], "title": act["title"], "text": act["text"],
                        "path": str(path.relative_to(project)), **treatment})
        print(f"{repo.name} {act['id']}: {treatment['duration_s']:.2f}s finished", flush=True)
    return results


def assemble(project, results):
    cursor = 0.
    locked_path = project/"assets/audio/locked-act-starts.json"
    starts = json.loads(locked_path.read_text())["act_starts_s"] if locked_path.exists() else TARGET_STARTS
    for index, act in enumerate(results):
        start = max(starts[index], cursor + .35) if index else 0.
        act["act_start_s"] = round(start, 6)
        act["speech_start_s"] = round(start + .65, 6)
        act["speech_end_s"] = round(act["speech_start_s"] + act["duration_s"], 6)
        cursor = act["speech_end_s"]
    locked_minimum = json.loads(locked_path.read_text()).get("minimum_total_duration_s", TARGET_DURATION) if locked_path.exists() else TARGET_DURATION
    total = max(TARGET_DURATION, locked_minimum, cursor + 2.4)
    if total >= 180:
        raise RuntimeError(f"Narration requires {total:.2f}s; revise script instead of stretching voice")
    count = int(math.ceil(total * RATE))
    dry = np.zeros(count, dtype=np.float32)
    for index, act in enumerate(results):
        audio, _ = read_wav(project/act["path"])
        offset = round(act["speech_start_s"] * RATE)
        dry[offset:offset+len(audio)] += audio[:, 0]
        end = results[index+1]["act_start_s"] if index+1 < len(results) else total
        act["act_end_s"] = end
        act["allocated_duration_s"] = end-act["act_start_s"]
    write_wav(project/"assets/audio/narration.wav", dry, RATE)
    return dry, total


def srt_time(value):
    ms = round(value*1000)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def subtitles(project, words):
    groups, group = [], []
    for word in words:
        proposed = " ".join(x["text"] for x in group+[word])
        if group and (len(proposed)>76 or len(group)>=10 or word["end"]-group[0]["start"]>4.3 or word["start"]-group[-1]["end"]>.6):
            groups.append(group)
            group=[]
        group.append(word)
        if len(group)>=4 and re.search(r"[.!?]$", word["text"]):
            groups.append(group)
            group=[]
    if group:
        groups.append(group)
    blocks=[]
    cues=[]
    for i, group in enumerate(groups):
        text=" ".join(w["text"] for w in group)
        if len(text)>40:
            spaces=[m.start() for m in re.finditer(" ", text)]
            split=min(spaces, key=lambda x:abs(x-len(text)/2))
            text=text[:split]+"\n"+text[split+1:]
        end=group[-1]["end"]+.14
        if i+1<len(groups):
            end=min(end,groups[i+1][0]["start"]-.04)
        end=max(end, group[0]["start"]+.08)
        blocks.append(f"{i+1}\n{srt_time(group[0]['start'])} --> {srt_time(end)}\n{text}\n")
        cues.append({"id":f"caption-{i+1:03}","start":group[0]["start"],"end":end,"text":text})
    (project/"transcript.srt").write_text("\n".join(blocks))
    return cues


def transcribe(project, repo, env, acts):
    path=project/"assets/audio/narration.wav"
    data=path.read_bytes()
    digest=sha(data)
    json_path=project/"assets/audio/deepgram.json"
    cache_path=project/"assets/audio/deepgram.meta.json"
    if json_path.exists() and cache_path.exists() and json.loads(cache_path.read_text()).get("audio_sha256")==digest:
        response=json.loads(json_path.read_text())
        print(f"{repo.name}: reuse frozen Deepgram timestamps",flush=True)
    else:
        terms=["Mosaic","Every Hand","Zara","PNG","Incident"]
        query="model=nova-3&language=en&smart_format=true&utterances=true"+"".join("&keyterm="+requests.utils.quote(t) for t in terms)
        response=provider_request("POST","https://api.deepgram.com/v1/listen?"+query,
                {"Authorization":"Token "+env["DEEPGRAM_API_KEY"],"Content-Type":"audio/wav"},data=data)
        dump(json_path,response)
        dump(project/f"assets/audio/deepgram-{digest[:12]}.json",response)
        dump(cache_path,{"provider":"Deepgram","model":"nova-3","audio_sha256":digest,
                         "metadata":response.get("metadata",{})})
    alternative=response["results"]["channels"][0]["alternatives"][0]
    raw_words=alternative.get("words",[])
    if not raw_words:
        raise RuntimeError("Deepgram returned no word timestamps")
    words=[{"id":f"w{i}","text":w.get("punctuated_word",w["word"]),"word":w["word"],
            "start":w["start"],"end":w["end"],"confidence":w["confidence"]} for i,w in enumerate(raw_words)]
    dump(project/"transcript.json",words)
    captions=subtitles(project,words)
    for act in acts:
        act["words"]=[w for w in words if act["speech_start_s"]-.1 <= w["start"] < act["speech_end_s"]+.1]
        act["word_count_recognized"]=len(act["words"])
    spoken=alternative.get("transcript","").lower()
    if any(term in spoken for term in ["director's notes","audio profile","speak only the transcript","hackathon judges"]):
        # The script itself may say judges, but not these production directions.
        if any(term in spoken for term in ["director's notes","audio profile","speak only the transcript"]):
            raise RuntimeError("Directions appear in transcript; inspect TTS before delivery")
    print(f"{repo.name}: Deepgram aligned {len(words)} words, confidence {alternative.get('confidence',0):.3f}",flush=True)
    return words,captions,alternative.get("confidence")


def normalized_tokens(text):
    text=text.lower().replace("’", "'")
    text=re.sub(r"[^a-z0-9' ]", " ", text)
    text=re.sub(r"\s+", " ", text).strip()
    # Smart Format changes spoken numbers and letter groups; these are display
    # differences, not missing narration. Keep substantive mismatches visible.
    small=["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"]
    tens=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"]
    mapping={name:str(i) for i,name in enumerate(small)}
    for i in range(20,100):
        name=tens[i//10]+(" "+small[i%10] if i%10 else "")
        mapping[name]=str(i)
    for source in sorted(mapping,key=len,reverse=True):
        text=re.sub(r"\b"+source+r"\b",mapping[source],text)
    text=re.sub(r"\b0 42\b","42",text)
    text=re.sub(r"\b0+(\d+)\b",r"\1",text)
    text=re.sub(r"\bnorth star\b","northstar",text)
    text=re.sub(r"\bp n g\b","png",text)
    return text.split()


def coverage_qc(project, script, words, acts):
    expected=normalized_tokens(" ".join(a["text"] for a in script))
    actual=normalized_tokens(" ".join(w["text"] for w in words))
    matcher=difflib.SequenceMatcher(None,expected,actual,autojunk=False)
    mismatches=[]
    for tag,i,j,k,l in matcher.get_opcodes():
        if tag!="equal":
            mismatches.append({"type":tag,"script":" ".join(expected[i:j]),"recognized":" ".join(actual[k:l])})
    invalid=[w["id"] for w in words if w["start"]<0 or w["end"]<w["start"]]
    report={"method":"Actual Deepgram words compared against locked script; punctuation, number formatting and named compound normalization only",
            "normalized_similarity":matcher.ratio(),"substantive_mismatches":mismatches,
            "word_timestamp_errors":invalid,"low_confidence_words":[w for w in words if w["confidence"]<.75],
            "acts": [{"id":a["id"],"script_words":len(a["text"].split()),"recognized_words":a["word_count_recognized"],
                      "speech_duration_s":a["duration_s"],"effective_words_per_minute":60*len(a["text"].split())/a["duration_s"]} for a in acts]}
    dump(project/"assets/audio/script-coverage.json",report)
    return report


def flac_exports(project, acts):
    for name in ["narration","music","effects","master-audition"]:
        source=project/f"assets/audio/{name}.wav"
        output=source.with_suffix(".flac")
        subprocess.run(["ffmpeg","-v","error","-y","-i",str(source),"-c:a","flac","-compression_level","8",str(output)],check=True)
    for act in acts:
        source=project/act["path"]
        subprocess.run(["ffmpeg","-v","error","-y","-i",str(source),"-c:a","flac","-compression_level","8",str(source.with_suffix('.flac'))],check=True)


def loudness_qc(project):
    result={}
    for name in ["narration","music","effects","master-audition"]:
        source=project/f"assets/audio/{name}.flac"
        run=subprocess.run(["ffmpeg","-hide_banner","-nostats","-i",str(source),"-af","loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json","-f","null","-"],capture_output=True,text=True,check=True)
        match=re.search(r"\{\s*\"input_i\".*?\}",run.stderr,re.S)
        if not match:raise RuntimeError("Could not measure audio loudness")
        measured=json.loads(match[0])
        probe=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration,size","-of","json",str(source)],capture_output=True,text=True,check=True)
        props=json.loads(probe.stdout)["format"]
        result[name]={"integrated_lufs":float(measured["input_i"]),"true_peak_dbtp":float(measured["input_tp"]),
                      "loudness_range_lu":float(measured["input_lra"]),"duration_s":float(props["duration"]),"bytes":int(props["size"])}
    dump(project/"assets/audio/loudness-qc.json",result)
    return result


def add_event(audio, at, sound, pan=0.):
    offset=int(at*MIX_RATE)
    count=min(len(sound),len(audio)-offset)
    if count<=0 or offset<0:return
    audio[offset:offset+count,0]+=sound[:count]*math.sqrt((1-pan)/2)
    audio[offset:offset+count,1]+=sound[:count]*math.sqrt((1+pan)/2)


def score(project, repo, narration, total, acts):
    n=round(total*MIX_RATE)
    music=np.zeros((n,2),dtype=np.float32)
    effects=np.zeros_like(music)
    beat=60/88
    chords=[[45,52,57,60],[41,48,53,57],[48,55,60,64],[43,50,55,59]]
    if repo.name=="EveryHand":
        chords=[[48,55,60,64],[43,50,55,59],[45,52,57,60],[41,48,53,57]]
    def freq(note):return 440*2**((note-69)/12)
    bar=beat*4
    for step,at in enumerate(np.arange(0,total,bar*2)):
        dur=min(bar*2+.7,total-at)
        t=np.arange(round(dur*MIX_RATE),dtype=np.float32)/MIX_RATE
        envelope=(1-np.exp(-t/.6))*np.exp(-t/12)*np.minimum(1,(dur-t)/.7)
        chord=chords[step%4]
        for j,note in enumerate(chord):
            phase=2*np.pi*freq(note)*t
            sound=(np.sin(phase)+.13*np.sin(2*phase+.2))*envelope*.008
            add_event(music,at,sound,(j-1.5)/2.3)
    pattern=[12,19,24,19,16,19,24,28]
    for step,at in enumerate(np.arange(1.2,total-2,beat*2)):
        chord=chords[int(at/(bar*2))%4]
        note=chord[0]+pattern[step%len(pattern)]
        t=np.arange(round(1.8*MIX_RATE),dtype=np.float32)/MIX_RATE
        env=(1-np.exp(-t/.018))*np.exp(-t/0.4)
        pluck=(np.sin(2*np.pi*freq(note)*t)+.16*np.sin(4*np.pi*freq(note)*t))*env*.009
        add_event(music,at,pluck,.45 if step%2 else -.45)
    # Subtle pulse; no busy drums under technical narration.
    for step,at in enumerate(np.arange(0,total,beat*4)):
        t=np.arange(round(.45*MIX_RATE),dtype=np.float32)/MIX_RATE
        pulse=np.sin(2*np.pi*(52*t+18*.07*(1-np.exp(-t/.07))))*np.exp(-t/.10)*.011
        add_event(music,at,pulse)
    # Deterministic original synthetic chapter sweeps and confirmation bells.
    rng=np.random.default_rng(4319 if repo.name=="Mosaic" else 5821)
    events=[]
    for index,act in enumerate(acts):
        at=act["act_start_s"]+.18
        t=np.arange(round(.55*MIX_RATE),dtype=np.float32)/MIX_RATE
        noise=rng.normal(0,1,len(t)).astype(np.float32)
        noise=signal.sosfilt(signal.butter(2,[650,2800],btype="bandpass",fs=MIX_RATE,output="sos"),noise).astype(np.float32)
        sweep=noise*np.sin(np.pi*t/.55)**2*.010
        add_event(effects,at,sweep,-.2 if index%2 else .2)
        bell=(np.sin(2*np.pi*freq(76+index%3)*t)+.25*np.sin(2*np.pi*freq(88+index%3)*t))*np.exp(-t/.14)*.013
        add_event(effects,at+.14,bell,.15)
        events.append({"id":f"chapter-{index+1}","start":at,"duration":.69,"type":"original noise sweep + soft sine bell"})
    fade_in=np.minimum(1,np.arange(n,dtype=np.float32)/(MIX_RATE*1.6))
    fade_out=np.minimum(1,np.maximum(0,(n-1-np.arange(n,dtype=np.float32))/(MIX_RATE*3.8)))
    music*= (fade_in*fade_out)[:,None]
    write_wav(project/"assets/audio/music.wav",music,MIX_RATE)
    write_wav(project/"assets/audio/effects.wav",effects,MIX_RATE)
    voice=signal.resample_poly(narration,2,1).astype(np.float32)[:n]
    if len(voice)<n:voice=np.pad(voice,(0,n-len(voice)))
    # Audition-only dynamic spectral carve: dry music stem remains available to
    # HyperFrames' native voiceover carve for the deliverable composition.
    block=480
    pads=np.pad(voice,(0,(-len(voice))%block))
    rms=np.sqrt(np.mean(pads.reshape(-1,block)**2,axis=1))
    envelope=np.clip((rms-.002)/.035,0,1)
    smooth=np.empty_like(envelope)
    value=0.
    for i,v in enumerate(envelope):
        coefficient=.30 if v>value else .012
        value+=(v-value)*coefficient
        smooth[i]=value
    weight=np.interp(np.arange(n)/block,np.arange(len(smooth)),smooth).astype(np.float32)
    carved=music.copy()
    for center in [400,900,1600,2500]:
        b,a=signal.iirnotch(center,1.7,fs=MIX_RATE)
        carved=signal.lfilter(b,a,carved,axis=0).astype(np.float32)
    music_audition=(music*(1-weight[:,None]*.75)+carved*(weight[:,None]*.75))*(1-weight[:,None]*.57)
    mix=voice[:,None]*np.ones((1,2),np.float32)+music_audition+effects
    peak=float(np.max(np.abs(mix)))
    if peak>.86:mix*=.86/peak
    temp=project/"assets/audio/master-premaster.wav"
    write_wav(temp,mix,MIX_RATE)
    master=project/"assets/audio/master-audition.wav"
    subprocess.run(["ffmpeg","-v","error","-y","-i",str(temp),"-af","loudnorm=I=-16:TP=-1.5:LRA=9","-ar","48000","-c:a","pcm_s16le",str(master)],check=True)
    temp.unlink()
    print(f"{repo.name}: original music, effects and audition master complete ({total:.2f}s)",flush=True)
    return events


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project",type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument("--stage",choices=["all","tts","finish"],default="all")
    args=parser.parse_args()
    project=args.project.resolve()
    repo=project.parents[1]
    script=json.loads((project/"script.json").read_text())
    if len(script)!=5:raise RuntimeError("Expected locked five-act script")
    env=private_env(repo)
    for key in ["GEMINI_API_KEY","DEEPGRAM_API_KEY"]:
        if not env.get(key):raise RuntimeError(f"Missing {key} in repo .env")
    voice="Charon" if repo.name=="Mosaic" else "Sulafat"
    asset=project/"assets/audio"
    if args.stage in ("all","tts"):
        results=tts(project,repo,script,voice,env)
        dump(asset/"acts.json",results)
        if args.stage=="tts":return
    else:
        results=json.loads((asset/"acts.json").read_text())
    narration,total=assemble(project,results)
    words,captions,confidence=transcribe(project,repo,env,results)
    coverage=coverage_qc(project,script,words,results)
    events=score(project,repo,narration,total,results)
    flac_exports(project,results)
    levels=loudness_qc(project)
    for act in results:
        act["path"]=str(Path(act["path"]).with_suffix(".flac"))
    metadata={"provider":"gemini","tts_model":MODEL,"voice":voice,"language":"en",
              "script_sha256":sha((project/"script.json").read_bytes()),"total_duration_s":total,
              "voices":results,"bgm":{"path":"assets/audio/music.flac","duration_s":total,"origin":"original deterministic DSP","bpm":88},
              "sfx":events,"stems":{"narration":"assets/audio/narration.flac","music":"assets/audio/music.flac","effects":"assets/audio/effects.flac"},
              "audition_master":"assets/audio/master-audition.flac","transcription":{"provider":"Deepgram","model":"nova-3","confidence":confidence,"word_count":len(words)},
              "quality":{"script_coverage_similarity":coverage["normalized_similarity"],"substantive_mismatches":coverage["substantive_mismatches"],"loudness":levels},
              "captions":captions}
    dump(project/"audio_meta.json",metadata)
    (project/"audio-production.md").write_text(f"""# Audio production\n\nGenerated with `{MODEL}` using the {voice} prebuilt voice. Five locked acts were synthesized separately with the same professional narrator profile. Only leading/trailing silence was trimmed; each act received one fixed gain adjustment and tiny edge fades. No voice speed change was used. Raw provider WAVs and sanitized per-act metadata remain in `assets/audio/acts/`.\n\nThe assembled dry narration is {total:.3f} seconds, including chapter holds and the closing card. Deepgram Nova-3 returned {len(words)} word timestamps at confidence {confidence:.4f}; `transcript.json` contains actual recognition timestamps and `transcript.srt` contains readable caption phrases. Deepgram processed the final assembled narration before music or effects.\n\nMusic and effects are original deterministic Python/NumPy/SciPy synthesis, with no external samples. The 88 BPM score uses soft sine pads, sparse plucks, and a quiet pulse. Effects are chapter sweeps and confirmation bells. Public lossless stems: `assets/audio/narration.flac`, `music.flac`, and `effects.flac`. WAV equivalents and raw provider files are local intermediates. `master-audition.flac` is a local audition mix with dynamic spectral carving and a -16 LUFS / -1.5 dBTP loudnorm target. The composition should use the separate stems and apply the HyperFrames native voiceover carve to its music element against the narration group. Do not layer the audition master together with stems.\n\nReproduce: `python3 scripts/audio_production.py`. Python dependencies: numpy, scipy, requests; system dependency: ffmpeg. The script privately reads `GEMINI_API_KEY` and `DEEPGRAM_API_KEY` from the repository `.env`, never saves credentials, and reuses assets when request/audio hashes match. Transient provider failures retry; an unavailable explicit model fails visibly without substituting another model. All audio is frozen locally; playback/render has no provider requests.\n\nQuality reports: `assets/audio/script-coverage.json` compares actual Deepgram recognition to the locked script, and `assets/audio/loudness-qc.json` records measured LUFS, true peak, duration and file size for every final stem. Independent model observation, when available, is in `assets/audio/model-audio-qc.json`; this is not a human listening claim.\n\nOfficial contracts: [Gemini API](https://ai.google.dev/api/generate-content), [3.1 model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-tts-preview), [Deepgram prerecorded API](https://developers.deepgram.com/docs/pre-recorded-audio). Gemini 3.1 is a legacy preview with earliest shutdown November 17, 2026.\n""")
    print(json.dumps({"project":repo.name,"duration_s":total,"acts":[{"id":a["id"],"start":a["act_start_s"],"speech_start":a["speech_start_s"],"speech_end":a["speech_end_s"]} for a in results]}),flush=True)


if __name__=="__main__":
    try:main()
    except Exception as error:
        # Restrict failure output: full HTTP objects can contain credentials.
        print(f"Audio production failed: {type(error).__name__}: {str(error)[:240]}",flush=True)
        raise SystemExit(1)
