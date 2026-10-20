import { describe,it,expect } from 'vitest';
import sharp from 'sharp';
import { analyzeImages, parseProviderEvidence, prepareSources } from '../server/analysis';
import { sampleWorkspace } from '../src/lib/sample';
async function request(){const bytes=await sharp({create:{width:120,height:80,channels:3,background:'#fff'}}).png().toBuffer();return {consent:true,from:'Incident',to:'Customer',sources:[{id:'a',name:'a.png',data:`data:image/png;base64,${bytes.toString('base64')}`},{id:'b',name:'b.png',data:`data:image/png;base64,${bytes.toString('base64')}`}]}}
describe('analysis trust boundary',()=>{
 it('requires affirmative consent and rejects duplicated sources',async()=>{const body=await request();await expect(prepareSources({...body,consent:false})).rejects.toThrow();body.sources[1].id='a';await expect(prepareSources(body)).rejects.toThrow('unique');});
 it('decodes actual image bytes and strips metadata',async()=>{const body=await request();const prepared=await prepareSources(body);expect(prepared.sources[0].width).toBe(120);expect((await sharp(Buffer.from(prepared.sources[0].url.split(',')[1],'base64')).metadata()).exif).toBeUndefined();body.sources[0].data='data:image/png;base64,aGVsbG8=';await expect(prepareSources(body)).rejects.toThrow('type');});
 it('does not call the provider when key is missing',async()=>{await expect(analyzeImages(await request(),{})).rejects.toThrow('OPENAI_API_KEY')});
 it('never trusts model-supplied confirmation status',()=>{const w=sampleWorkspace();const evidence=parseProviderEvidence(w,w.sources.map(s=>s.id));expect(evidence.relations.every(r=>r.status==='suggested'&&r.confirmedBy===undefined)).toBe(true)});
 it('rejects invalid model region/reference without leaking payload',()=>{const w=sampleWorkspace();w.regions[0].sourceId='private-secret-provider';expect(()=>parseProviderEvidence(w,w.sources.map(s=>s.id))).toThrow('could not be grounded');});
 it('sanitizes provider errors',async()=>{await expect(analyzeImages(await request(),{apiKey:'test-not-real',fetcher:async()=>new Response('secret provider details',{status:401})})).rejects.toThrow('provider could not complete')});
});
