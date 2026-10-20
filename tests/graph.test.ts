import { describe, it, expect } from 'vitest';
import { findRoutes, minimumRegionCut } from '../src/lib/graph';
import { sampleWorkspace } from '../src/lib/sample';
import { validateEvidence } from '../src/lib/types';
describe('evidence paths', () => {
 it('finds both independent disclosure routes',()=>{expect(findRoutes(sampleWorkspace()).paths.map(p=>p.length).sort()).toEqual([2,3]);});
 it('does not mistake an incomplete repair for disconnection',()=>{expect(findRoutes(sampleWorkspace(),new Set(['support-client'])).paths).toHaveLength(1);});
 it('cuts all paths with the smallest shared region',()=>{const w=sampleWorkspace();const cut=minimumRegionCut(w);expect(cut).toEqual({regionIds:['directory-customer'],exact:true});expect(findRoutes(w,new Set(cut.regionIds)).paths).toHaveLength(0);});
 it('retains suggested evidence conservatively and excludes rejected evidence',()=>{const w=sampleWorkspace();w.relations[0].status='suggested';expect(findRoutes(w).paths).toHaveLength(2);w.relations[0].status='rejected';expect(findRoutes(w).paths).toHaveLength(1);});
 it('never loops through a cycle',()=>{const w=sampleWorkspace();w.relations.push({...w.relations[0],id:'cycle',from:'project:cedar',to:'incident:042'});expect(findRoutes(w).paths).toHaveLength(2);});
 it('fails closed on a truncated path search',()=>{expect(findRoutes(sampleWorkspace(),new Set(),1).complete).toBe(false);});
 it('retains an unmasked independent duplicate occurrence',()=>{const w=sampleWorkspace();w.regions.push({...w.regions[2],id:'customer-duplicate'});w.relations.push({...w.relations[2],id:'duplicate',regionId:'customer-duplicate'});expect(findRoutes(w,new Set(['directory-customer'])).paths).toHaveLength(1);expect(minimumRegionCut(w).regionIds.length).toBe(2);});
 it('validates source references and region bounds',()=>{const w=sampleWorkspace();expect(validateEvidence(w,w.sources.map(s=>s.id))).toBeTruthy();w.regions[0].rect.width=2;expect(()=>validateEvidence(w,w.sources.map(s=>s.id))).toThrow();});
});
