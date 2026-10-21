import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourcePose, focusRect, stageCss, stageMarkup, mediaMarkup, cameraCode, escapeHtml, STAGE } from './lib/screen-stage.mjs';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(PROJECT, path), 'utf8');
const json = path => JSON.parse(read(path));
const put = (path, value) => writeFileSync(resolve(PROJECT, path), String(value).replace(/[ \t]+$/gm, '').trimEnd() + '\n');
const q = value => Math.round(value * 60) / 60;
const fmt = value => Number(value.toFixed(4));
const capture = json('capture/manifest.json');
const captures = new Map(capture.steps.map(s => [s.id, s]));
const narration = json('script.json');
const audio = existsSync(resolve(PROJECT, 'audio_meta.json')) ? json('audio_meta.json') : null;
const canonicalStarts = [0, 30, 62, 96, 132];
const total = audio?.total_duration_s ?? 165;
const normalize = text => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
const timingReport = [];
const fonts = read('src/fonts.css').replaceAll('../assets/', 'assets/');
const actualBrandSvg = read('assets/brand/favicon.svg').replace('<svg ', '<svg aria-hidden="true" ');
const P = { paper: '#f8f8f5', ink: '#24272f', accent: '#3655e7', line: '#e5e6e3' };

function voiceFor(id) { return audio?.voices?.find(v => v.id === id); }
function actWindow(index) {
  const voice = voiceFor(narration[index].id);
  const start = q(voice?.act_start_s ?? canonicalStarts[index]);
  const end = q(voice?.act_end_s ?? (canonicalStarts[index + 1] ?? total));
  return { start, end, duration: fmt(end - start) };
}

/** Finds the real Deepgram word onset; estimates are explicitly reported until audio is ready. */
function cue(index, phrase, estimate, offset = 0) {
  const id = narration[index].id;
  const voice = voiceFor(id);
  const wanted = normalize(phrase);
  const words = voice?.words ?? [];
  let actual = null;
  for (let i = 0; i < words.length; i++) {
    let joined = '';
    for (let j=i; j<words.length && joined.length<wanted.length; j++) joined += normalize(words[j].word ?? words[j].text);
    if (joined === wanted) {
      actual = words[i].start - actWindow(index).start;
      break;
    }
  }
  const value = q(Math.max(0, (actual ?? estimate) + offset));
  timingReport.push({ act: id, phrase, time_s: value, basis: actual === null ? 'planned estimate' : 'Deepgram word onset', offset_s: offset });
  return value;
}

function imageClip(id, src, start, end, track = 2) {
  if (!(end > start)) return '';
  return `<img id="${id}" class="clip" src="${escapeHtml(src)}" alt="Actual captured Mosaic software state" data-start="${fmt(start)}" data-duration="${fmt(end-start)}" data-track-index="${track}" />`;
}

function actualMedia(prefix, events, duration) {
  return events.map((event, i) => {
    const step = captures.get(event.source);
    if (!step) throw new Error(`Missing accepted capture ${event.source}`);
    const end = events[i + 1]?.at ?? duration;
    const videoLength = event.motion === false ? 0 : Math.min(step.timing.encoded_clip_duration_seconds, end - event.at);
    const parts = [];
    if (videoLength > 0) parts.push(mediaMarkup({ id: `${prefix}-motion-${i}`, src: step.video.path, kind: 'video', start: event.at, duration: videoLength }));
    if (end > event.at + videoLength + .001) parts.push(imageClip(`${prefix}-still-${i}`, step.still.path, event.at + videoLength, end, 2 + Math.floor(i / 3)));
    return parts.join('\n');
  }).join('\n');
}

function proofTag(prefix, text, start, end) {
  return `<div id="${prefix}-tag-${Math.round(start*100)}" class="clip proof-tag" data-start="${fmt(start)}" data-duration="${fmt(end-start)}" data-track-index="5"><span>${escapeHtml(text)}</span></div>`;
}

function scene(index, { events, poses, initial, extras = '', extraCss = '', extraTimeline = '', stageStart = 0, stageEnd, footer, chapter }) {
  const id = narration[index].id;
  const window = actWindow(index);
  const duration = window.duration;
  events.forEach((event,i) => {
    if (event.at < 0 || event.at >= duration || (i && event.at < events[i-1].at)) throw new Error(`Invalid source event window in ${id}: ${event.source}`);
  });
  poses.forEach(pose => {
    if (pose.at < 0 || pose.at + (pose.duration ?? .9) > duration + .01) throw new Error(`Camera pose leaves ${id}: ${pose.label}`);
  });
  stageEnd ??= duration;
  const shotMedia = actualMedia(id, events, duration);
  const stage = stageMarkup(id, shotMedia, {
    brand: 'mosaic.', chapter, ordinal: String(index + 1).padStart(2, '0'),
    footer: footer ?? 'Fictional sample · Actual software',
    note: index === 4 ? 'Separate test · Deliberately omitted link' : 'Build with AI: Basics'
  });
  const camera = cameraCode(id, poses, { initial: initial ?? sourcePose({ fit: 'cover' }) });
  const stageWindow = stageStart > 0
    ? `tl.fromTo('#${id}-stage',{opacity:0},{opacity:1,duration:.45,immediateRender:false},${Math.max(0,stageStart-.2)});`
    : '';
  const stageExit = stageEnd < duration
    ? `tl.to('#${id}-stage',{opacity:0,duration:.3},${stageEnd});`
    : '';
  return `<template>
  <style>
  ${fonts}
  #root{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;color:${P.ink};font-family:"DM Sans Variable",sans-serif;font-synthesis:none;container-type:size;}
  .clip{position:absolute;inset:0;}
  .ground{background:${P.paper};}
  ${stageCss(id,P)}
  .proof-tag{z-index:5;pointer-events:none;display:flex;justify-content:flex-end;align-items:flex-start;padding:84px 96px 0;}
  .proof-tag>span{font-size:22px;font-weight:500;line-height:1.2;background:${P.paper};color:${P.ink};border:1px solid ${P.line};border-radius:6px;padding:8px 13px;}
  ${extraCss}
  </style>
  <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="${duration}" data-fps="60">
    <div id="${id}-ground" class="clip ground" data-start="0" data-duration="${duration}" data-track-index="0"></div>
    ${stage}
    ${extras}
  </div>
  <script>
  const tl = gsap.timeline({paused:true});
  ${camera}
  ${stageWindow}
  ${stageExit}
  ${extraTimeline}
  window.__timelines[${JSON.stringify(id)}] = tl;
  </script>
</template>\n`;
}

const plans = [];
mkdirSync(resolve(PROJECT, 'compositions/frames'), { recursive: true });

// ACT 1 — the real credit is the opening image, then the actual publishing workspace.
{
  const i=0, d=actWindow(i).duration;
  const workspace = cue(i,'For a designer',7.1,-.25);
  const mosaic = cue(i,'Mosaic helps',12.4,-.7);
  const files = cue(i,'This is a fictional bundle',18,-.3);
  const support = cue(i,'a support incident',22.7,-.7);
  const registry = cue(i,'a project registry',24.7,-.65);
  const directory = cue(i,'and a customer directory',26.6,-.65);
  const events=[{at:workspace,source:'01-overview',motion:false},{at:files,source:'02-sources'}];
  const poses=[
    {at:workspace,pose:sourcePose({fit:'contain'}),duration:.01,label:'real-workspace'},
    {at:mosaic,rect:[60,241,1480,92],duration:1.05,label:'publishing-brief'},
    {at:files+.7,rect:[80,488,1130,318],duration:.85,label:'three-real-source-images'},
    {at:support,rect:[94,505,345,232],duration:.8,label:'support-incident'},
    {at:registry,rect:[474,505,341,232],duration:.75,label:'project-registry'},
    {at:directory,rect:[852,505,340,232],duration:.8,label:'public-credit'}
  ];
  const extras=`<div id="act-01-intro-clip" class="clip" data-start="0" data-duration="${workspace+.3}" data-track-index="5"><div id="act-01-intro">
    <div id="act-01-intro-copy"><div class="intro-kicker">A publishing decision</div><h1><span>Keep the</span><span>credit.</span></h1><p id="act-01-thesis">Break the connection.</p></div>
    <div id="act-01-credit-label">Actual public project credit</div>
    <div id="act-01-credit-crop"><img id="act-01-credit-image" src="assets/outputs/verified/mosaic-03.png" alt="Actual emitted customer directory showing Northstar Health credit" /></div>
  </div></div>`;
  const extraCss=`#act-01-intro{position:absolute;inset:0;background:${P.paper};z-index:4;}
    #act-01-intro-copy{position:absolute;left:96px;top:215px;width:870px;}
    .intro-kicker{font-size:25px;letter-spacing:.08em;text-transform:uppercase;color:${P.accent};font-weight:600;}
    #act-01-intro h1{font-family:"Manrope Variable",sans-serif;font-size:158px;line-height:.98;letter-spacing:-.075em;font-weight:750;margin:35px 0 40px;}
    #act-01-thesis{font-size:48px;line-height:1.2;letter-spacing:-.035em;margin:0;color:${P.accent};}
    #act-01-credit-label{position:absolute;left:1040px;top:226px;font-size:24px;color:${P.ink};}
    #act-01-credit-crop{position:absolute;left:1040px;top:280px;width:784px;height:560px;overflow:hidden;background:${P.paper};border-top:1px solid ${P.line};border-bottom:1px solid ${P.line};}
    #act-01-credit-image{position:absolute;left:-60px;top:-90px;width:1000px;height:700px;transform-origin:0 0;}
    #act-01-header,#act-01-footer{z-index:6;}
    #act-01-intro h1>span{display:block;}`;
  const extraTimeline=`tl.fromTo('#act-01-intro-copy',{x:-25,opacity:.5},{x:0,opacity:1,duration:.55,ease:'power3.out'},0);
    tl.fromTo('#act-01-credit-image',{scale:1.08,x:0,y:0},{scale:1.14,x:-28,y:-8,duration:2.1,ease:'power2.out'},0);
    tl.fromTo('#act-01-thesis',{y:14,opacity:0},{y:0,opacity:1,duration:.6,ease:'power3.out'},${cue(i,'Its connection',2.4,-.1)});
    tl.to('#act-01-intro',{opacity:0,duration:.3},${Math.max(0,workspace-.02)});`;
  put('compositions/frames/act-01.html',scene(i,{events,poses,initial:sourcePose({fit:'contain'}),extras,extraCss,extraTimeline,stageStart:workspace,chapter:'The publishing decision'}));
  plans.push({id:'act-01',events,poses});
}

// ACT 2 — the native graph, exact source pixels, then the surviving route.
{
  const i=1;
  const inspect=cue(i,'These are source-backed links',9.1,-.2);
  const pixels=cue(i,'inspect the exact pixels',12,-.65);
  const mask=cue(i,'Now try hiding',14.3,-.15);
  const remains=cue(i,'but one route remains',18.4,-.7);
  const channel=cue(i,'The operations channel',20.1,-.1);
  const alternate=cue(i,'The alternate route',25,-.65);
  const events=[{at:0,source:'03-read-together'},{at:inspect,source:'04-inspect-client'},{at:mask,source:'05-incomplete-mask'},{at:channel,source:'06-channel-evidence'}];
  const poses=[
    {at:1.3,rect:[224,232,870,85],duration:.9,label:'read-real-route'},
    {at:cue(i,'through client',3.3,-.65),rect:[225,333,555,253],duration:.85,label:'client-to-registry'},
    {at:cue(i,'to Northstar',6,-.65),rect:[514,333,554,253],duration:.85,label:'registry-to-credit'},
    {at:inspect,pose:sourcePose({cx:800,cy:500,scale:1.1}),duration:.01,label:'open-real-inspector'},
    {at:pixels,rect:[752,344,578,230],duration:.8,label:'exact-client-pixels-and-source-quote'},
    {at:mask,pose:sourcePose({fit:'cover'}),duration:.01,label:'run-client-mask-trial'},
    {at:remains,rect:[80,430,1130,325],duration:.85,label:'one-route-still-remains'},
    {at:channel,pose:sourcePose({cx:800,cy:500,scale:1.1}),duration:.01,label:'open-surviving-evidence'},
    {at:alternate,rect:[305,475,1024,280],duration:.9,label:'surviving-channel-source-evidence'}
  ];
  put('compositions/frames/act-02.html',scene(i,{events,poses,initial:sourcePose({fit:'cover'}),chapter:'The obvious mask leaves a route'}));
  plans.push({id:'act-02',events,poses});
}

// ACT 3 — show the one-mask cost before preserving the public credit.
{
  const i=2,d=actWindow(i).duration;
  const one=cue(i,'Mosaic finds a one-mask repair',1.6,-.1);
  const customer=cue(i,'cover the shared customer name',5,-.2);
  const butCredit=cue(i,'But that erases',10.7,-.7);
  const keep=cue(i,'Mark that region Keep visible',15.4,-.15);
  const two=cue(i,'Two identifiers',21.7,-.3);
  const intact=cue(i,'the public credit stays intact',25,-.65);
  const fewest=cue(i,'Mosaic finds the fewest',27,-.65);
  const events=[{at:0,source:'07-undo-trial'},{at:one,source:'08-one-mask-repair'},{at:customer,source:'09-customer-mask'},{at:keep,source:'10-keep-credit'},{at:two,source:'11-two-mask-repair'}];
  const poses=[
    {at:one,pose:sourcePose({cx:800,cy:450,scale:1.08}),duration:.01,label:'one-mask-repair'},
    {at:customer,pose:sourcePose({cx:800,cy:500,scale:1.1}),duration:.01,label:'covered-customer-credit'},
    {at:butCredit,rect:[320,355,660,285],duration:.85,label:'cost-of-customer-name-mask'},
    {at:keep,rect:[1035,355,300,365],duration:.7,label:'actual-keep-visible-control'},
    {at:keep+1.4,rect:[320,355,660,285],duration:.8,label:'credit-preserved'},
    {at:two,pose:sourcePose({cx:800,cy:450,scale:1.08}),duration:.01,label:'new-two-mask-repair'},
    {at:two+1.0,rect:[225,237,265,256],duration:.9,label:'two-identifiers-in-incident'},
    {at:intact,rect:[801,237,268,295],duration:.8,label:'public-credit-intact'},
    {at:fewest,rect:[1228,99,292,210],duration:.9,label:'two-edits-both-routes-broken'},
    {at:cue(i,'allowed by that preservation choice',27,-.7),rect:[80,872,750,60],duration:.9,label:'bounded-candidate-masks-under-keep-visible-choice'}
  ];
  const extras=proofTag('act-03','Keep the credit',intact,d);
  put('compositions/frames/act-03.html',scene(i,{events,poses,chapter:'Keep the credit',extras}));
  plans.push({id:'act-03',events,poses});
}

// ACT 4 — native verification, the actual emitted PNGs, then precise request scope.
{
  const i=3,d=actWindow(i).duration;
  const decoded=cue(i,'decodes those actual files again',4.8,-.65);
  const outputCheck=cue(i,'This is an output check',10,-.7);
  const outputs=cue(i,'Open the outputs',14.5,-.15);
  const credit=cue(i,'public credit intact in the directory',19.4,-.4);
  const scope=cue(i,'A separate consented fresh reading',23,-.1);
  const sent=cue(i,'sends only exported images',27,-1);
  const withheld=cue(i,'The protected answer',31,-1);
  const events=[{at:0,source:'12-export-verify'},{at:scope,source:'12-export-verify',motion:false}];
  const poses=[
    {at:decoded,rect:[275,118,1050,125],duration:.9,label:'actual-export-verification-checklist'},
    {at:outputCheck,rect:[275,118,1050,125],duration:.4,label:'check-the-emitted-bytes'},
    {at:scope,rect:[290,725,1015,245],duration:.01,label:'separate-fresh-reader-request-scope'},
    {at:sent,rect:[295,870,390,65],duration:.9,label:'only-exported-pixels-and-starting-fact'},
    {at:withheld,rect:[690,870,610,65],duration:.9,label:'protected-hint-and-original-graph-withheld'}
  ];
  const extras=`<div id="act-04-outputs" class="clip" data-start="${outputs}" data-duration="${fmt(scope-outputs)}" data-track-index="5">
    <div id="act-04-output-heading">Actual exported PNG files</div>
    <div class="actual-output" id="act-04-output-support"><img id="act-04-output-support-image" src="assets/outputs/verified/mosaic-01.png" alt="Actual exported support image with two opaque masks" /><div>mosaic-01.png <span>Two opaque masks</span></div></div>
    <div class="actual-output" id="act-04-output-credit"><img id="act-04-output-credit-image" src="assets/outputs/verified/mosaic-03.png" alt="Actual exported directory with public customer credit intact" /><div>mosaic-03.png <span>Public credit intact</span></div></div>
  </div>`;
  const extraCss=`#act-04-outputs{z-index:4;background:${P.paper};}
    #act-04-header,#act-04-footer{z-index:6;}
    #act-04-output-heading{position:absolute;left:96px;top:142px;font-size:39px;font-family:"Manrope Variable",sans-serif;font-weight:650;letter-spacing:-.035em;}
    .actual-output{position:absolute;top:250px;width:830px;height:662px;}
    #act-04-output-support{left:96px;}#act-04-output-credit{left:994px;}
    .actual-output>img{display:block;width:830px;height:581px;border:1px solid ${P.line};border-radius:7px;object-fit:contain;}
    .actual-output>div{display:flex;justify-content:space-between;gap:24px;padding-top:25px;font-size:25px;line-height:1.35;font-weight:600;}
    .actual-output>div>span{font-weight:400;font-size:24px;}
  `;
  const extraTimeline=`tl.fromTo('#act-04-output-support',{y:15,opacity:0},{y:0,opacity:1,duration:.55,ease:'power3.out'},${outputs});
    tl.fromTo('#act-04-output-credit',{y:15,opacity:.55},{y:0,opacity:1,duration:.65,ease:'power2.out'},${credit});`;
  put('compositions/frames/act-04.html',scene(i,{events,poses,initial:sourcePose({cx:800,cy:500,scale:1.1}),extras,extraCss,extraTimeline,chapter:'The exported files carry the proof',footer:'Fictional sample · Actual output files'}));
  plans.push({id:'act-04',events,poses,outputs:{start:outputs,end:scope}});
}

// ACT 5 — visibly separate branch; shorten waiting with an explicit label; inspect the finding.
{
  const i=4,d=actWindow(i).duration;
  const omitted=cue(i,'one channel link was left out',4,-.7);
  const after=cue(i,'After export',8,-.2);
  const proposes=cue(i,'the fresh reader proposes',9.4,-.1);
  const returned=cue(i,'Inspect its returned region',13.5,-.1);
  const reopen=cue(i,'then reopen the exported bundle',17.5,-.15);
  const checks=cue(i,'This checks known evidence',22,-.1);
  const privacy=cue(i,'It does not certify privacy',26,-.3);
  const closing=cue(i,'Keep the useful story',29,-.1);
  const consentStart=Math.max(0,after-.9);
  const running=Math.max(consentStart+.75,proposes-1.05);
  const result=Math.max(running+.7,proposes+.15);
  const summary=Math.max(returned+1.5,reopen-.7);
  const inspector=Math.max(reopen+1.2,checks-.1);
  const events=[
    {at:0,source:'13-separate-test-omit'},
    {at:omitted+1.0,source:'14-separate-test-export'},
    {at:consentStart,source:'15-fresh-reading-consent'},
    {at:running,source:'16-fresh-reading-start'},
    {at:result,source:'17-fresh-reader-result'},
    {at:returned,source:'18-proposed-output-region'},
    {at:summary,source:'19-fresh-reader-summary',motion:false},
    {at:reopen,source:'20-review-exported-bundle'},
    {at:inspector,source:'21-review-proposed-link'}
  ];
  const poses=[
    {at:.6,rect:[1030,240,310,500],duration:.8,label:'deliberately-rejected-channel-link'},
    {at:omitted+1,pose:sourcePose({cx:800,cy:500,scale:1.08}),duration:.01,label:'separate-incomplete-export'},
    {at:consentStart,rect:[290,570,1020,290],duration:.01,label:'real-consent-and-run'},
    {at:running,rect:[290,570,1020,290],duration:.01,label:'real-running-state'},
    {at:result,rect:[300,463,1000,234],duration:.01,label:'actual-positive-fresh-reader-result'},
    {at:result+.8,rect:[322,548,955,125],duration:.7,label:'proposed-association-with-source-path'},
    {at:returned,rect:[385,350,680,200],duration:.01,label:'returned-region-on-exported-pixels'},
    {at:returned+.5,rect:[325,385,955,355],duration:.7,label:'channel-region-and-returned-relation'},
    {at:summary,rect:[300,463,1000,234],duration:.01,label:'inspectable-proposal'},
    {at:reopen,pose:sourcePose({cx:800,cy:450,scale:1.08}),duration:.01,label:'review-exported-bundle'},
    {at:inspector,pose:sourcePose({cx:800,cy:500,scale:1.1}),duration:.01,label:'proposal-requires-human-review'},
    {at:privacy-.6,rect:[1035,433,300,230],duration:.75,label:'needs-review-not-privacy-certification'}
  ];
  const extras=proofTag('act-05','Processing time shortened',running,result+.8)+`
    <div id="act-05-close-clip" class="clip" data-start="${closing}" data-duration="${fmt(d-closing)}" data-track-index="6"><div id="act-05-close">
      <div id="act-05-close-brand">${actualBrandSvg}<span>mosaic.</span></div>
      <h2 id="act-05-close-line">Keep the useful story.</h2>
      <p id="act-05-close-second">Inspect what you actually publish.</p>
      <div id="act-05-repo">github.com/yadneshSalvi/Mosaic</div>
      <div id="act-05-boundary">Known evidence checks. An inspectable model observation.</div>
      <div id="act-05-close-image"><img src="assets/outputs/verified/mosaic-03.png" alt="The actual fully repaired bundle preserves public credit" /></div>
    </div></div>`;
  const extraCss=`#act-05-close{position:absolute;inset:0;background:${P.paper};z-index:6;}
    #act-05-close-brand{position:absolute;left:96px;top:160px;display:flex;align-items:center;gap:22px;font-family:"Manrope Variable",sans-serif;font-size:74px;letter-spacing:-.06em;font-weight:750;}
    #act-05-close-brand>svg{display:block;width:64px;height:64px;}
    #act-05-close-line{position:absolute;left:96px;top:327px;width:1150px;margin:0;font-family:"Manrope Variable",sans-serif;font-size:92px;line-height:1.08;font-weight:700;letter-spacing:-.065em;}
    #act-05-close-second{position:absolute;left:96px;top:464px;width:1050px;font-size:45px;line-height:1.3;letter-spacing:-.03em;margin:0;color:${P.accent};}
    #act-05-repo{position:absolute;left:96px;top:700px;font-size:31px;letter-spacing:-.01em;line-height:1.4;border-top:1px solid ${P.line};padding-top:28px;width:1000px;}
    #act-05-boundary{position:absolute;left:96px;top:910px;font-size:24px;line-height:1.4;}
    #act-05-close-image{position:absolute;right:96px;top:640px;width:540px;height:225px;overflow:hidden;border-top:1px solid ${P.line};border-bottom:1px solid ${P.line};}
    #act-05-close-image>img{position:absolute;left:-28px;top:-132px;width:650px;height:455px;}
  `;
  const extraTimeline=`tl.fromTo('#act-05-close',{opacity:0},{opacity:1,duration:.45,immediateRender:false},${closing});
    tl.fromTo('#act-05-close-line',{x:-16,opacity:.3},{x:0,opacity:1,duration:.65,ease:'power3.out',immediateRender:false},${closing});
    tl.fromTo('#act-05-close-second',{y:12,opacity:0},{y:0,opacity:1,duration:.6,ease:'power2.out',immediateRender:false},${Math.min(d-1,closing+.6)});`;
  put('compositions/frames/act-05.html',scene(i,{events,poses,initial:sourcePose({cx:800,cy:500,scale:1.1}),extras,extraCss,extraTimeline,stageEnd:closing,chapter:'Another reading, an inspectable finding',footer:'Fictional sample · Separate incomplete review'}));
  plans.push({id:'act-05',events,poses,closing});
}

if (audio && timingReport.some(cue => cue.basis !== 'Deepgram word onset')) throw new Error(`Final narration cues must all match actual words: ${timingReport.filter(cue=>cue.basis!=='Deepgram word onset').map(cue=>cue.phrase).join('; ')}`);
const audioFormat = ['narration','music','effects'].every(n => existsSync(resolve(PROJECT,`assets/audio/${n}.flac`))) ? 'flac' : 'wav';
const audioAvailable = ['narration','music','effects'].every(n => existsSync(resolve(PROJECT,`assets/audio/${n}.${audioFormat}`)));
const audioMarkup = audioAvailable ? `
  <audio id="mosaic-voice" data-audio-group="mosaic-voiceover" src="assets/audio/narration.${audioFormat}" data-start="0" data-duration="${total}" data-track-index="10" data-volume="1"></audio>
  <audio id="mosaic-music" data-audio-group="mosaic-music-bed" src="assets/audio/music.${audioFormat}" data-start="0" data-duration="${total}" data-track-index="11" data-volume="1" data-fx-carve='{"enabled":true,"sources":["mosaic-voiceover"],"strength":0.8}'></audio>
  <audio id="mosaic-effects" data-audio-group="mosaic-sfx" src="assets/audio/effects.${audioFormat}" data-start="0" data-duration="${total}" data-track-index="12" data-volume="1"></audio>` : '<!-- Audio stems are pending; re-run the generator when audio_meta.json is ready. -->';

const hosts = narration.map((v,i) => {
  const w=actWindow(i);
  return `<div id="scene-${v.id}" class="clip" data-composition-id="${v.id}" data-composition-src="compositions/frames/${v.id}.html" data-start="${w.start}" data-duration="${w.duration}" data-track-index="${i+1}" data-width="1920" data-height="1080"></div>`;
}).join('\n');
put('index.html',`<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=1920,height=1080"/><title>Mosaic — Keep the useful story</title><script src="assets/vendor/gsap.min.js"></script>
<style>${fonts}
*{box-sizing:border-box;}html,body{margin:0;padding:0;background:${P.paper};overflow:hidden;}#root{position:relative;width:100%;height:100%;overflow:hidden;background:${P.paper};color:${P.ink};font-family:"DM Sans Variable",sans-serif;}.clip{position:absolute;inset:0;}
</style></head><body><div id="root" data-composition-id="mosaic-film" data-width="1920" data-height="1080" data-duration="${total}" data-fps="60">
${hosts}${audioMarkup}
</div><script>const tl=gsap.timeline({paused:true});window.__timelines['mosaic-film']=tl;</script></body></html>\n`);
put('shotplan.json',JSON.stringify({schema:'mosaic-actual-demo/v1',total_duration_s:total,word_timing_ready:Boolean(audio),audio_stems_ready:audioAvailable,canvas:{width:1920,height:1080,fps:60},source:{width:1600,height:1000},stage:STAGE,acts:plans.map((plan,i)=>({...actWindow(i),...plan})),cues:timingReport},null,2)+'\n');
put('src/production-readme.md',`# Mosaic production source\n\nRebuild with \`node scripts/build-video.mjs\`. The generator consumes the accepted browser-capture manifest and actual output PNGs. It never reconstructs product UI. Five act sub-compositions mount into index.html. All media timing is declared; GSAP only animates non-timed camera wrappers. No runtime network, clock, randomness, or media playback commands are used.\n\n${audio ? 'Real Deepgram word onsets in audio_meta.json drive camera departure cues (arrivals precede the phrase by their move duration).' : 'Audio is pending. Estimated cues are explicit in shotplan.json and must be replaced by a rebuild with audio_meta.json before delivery.'}\n\nAfter rebuilding with final audio, run the native music carve and the full HyperFrames check, then inspect representative source/evidence frames and the exact final frame. Captions are delivered separately as SRT; narration is not burned into the software evidence.\n\nThe first four acts follow the fully searched repair; the output proof uses assets/outputs/verified/mosaic-01.png and mosaic-03.png. Act five has a persistent separate-test label, uses the deliberately omitted channel-link branch, labels its waiting-time cut, and ends with inspectable proposed evidence rather than a privacy verdict.\n`);
console.log(JSON.stringify({ok:true,acts:plans.length,total_duration_s:total,word_timing_ready:Boolean(audio),audio_stems_ready:audioAvailable,cues:timingReport.length,unmatched_cues:timingReport.filter(c=>c.basis==='planned estimate').map(c=>({act:c.act,phrase:c.phrase}))},null,2));
