import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkspace} from '../frontend/src/replay/workspace-validation.ts';
import {Replay} from '../frontend/src/replay/engine.ts';

const bars = [0,1,2,3].map(i=>({time:1704205800+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:1}));
const blank=()=>({version:1,revision:0,sessions:[],playbooks:[],settings:{}});
function workspace(mode='closed') {
 const replay=new Replay(bars,'NQ');
 replay.queue(1,{qty:2,stop:10,target:20,fee:2,slip:0});
 if(mode!=='pending'){replay.step();if(mode==='partial'){replay.requestClose(1);replay.step();}if(mode==='closed'){replay.requestClose();replay.step();}}
 const w=blank();
 w.sessions=[{id:'session-1',name:'NY test',symbol:'NQ',from:'2024-01-02',to:'2024-01-02',session:'all',source:'hf_market_data',datasetId:'builtin-NQ-2024-01',capital:50000,strategyId:'strategy-1',createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:01Z',snapshot:replay.snapshot(),notes:'test',annotations:{},drawings:[]}];
 w.playbooks=[{id:'strategy-1',name:'Reversal',description:'Rules',rules:['Risk planned']}];
 w.settings={activeSessionId:'session-1',view:'replay',chartPreferences:{timezone:'America/New_York',colorOpacity:{up:100}},datasets:{'builtin-NQ-2024-01':{id:'builtin-NQ-2024-01',symbol:'NQ',name:'NQ source',source:'hf_market_data',from:'2024-01-02',to:'2024-01-31',count:30118}}};
 return w;
}
test('accepts blank and actual engine pending, partial and closed snapshots',()=>{
 assert.deepEqual(validateWorkspace(blank()),blank());
 for(const mode of ['pending','partial','closed']){
  const w=workspace(mode),out=validateWorkspace(w);
  assert.deepEqual(out.sessions[0].snapshot,w.sessions[0].snapshot);
  assert.deepEqual(Replay.restore(bars,'NQ',out.sessions[0].snapshot).snapshot(),w.sessions[0].snapshot);
  out.sessions[0].notes='changed';assert.equal(w.sessions[0].notes,'test');
 }
});
test('paired session keeps its exact secondary dataset through JSON recovery without changing trades',()=>{
 const w=workspace('partial');w.sessions[0].comparisonDatasetId='curated-ES-history-2024-2026';
 const recovered=validateWorkspace(JSON.parse(JSON.stringify(w)));
 assert.equal(recovered.sessions[0].comparisonDatasetId,'curated-ES-history-2024-2026');
 assert.deepEqual(Replay.restore(bars,'NQ',recovered.sessions[0].snapshot).snapshot(),w.sessions[0].snapshot);
 for(const bad of ['../private',null,w.sessions[0].datasetId]){const changed=structuredClone(w);changed.sessions[0].comparisonDatasetId=bad;assert.throws(()=>validateWorkspace(changed));}
 assert.equal(Object.hasOwn(validateWorkspace(workspace()).sessions[0],'comparisonDatasetId'),false);
});
test('rejects timestamp and session fields that previously broke rendering',()=>{
 for(const change of [s=>delete s.updatedAt,s=>s.createdAt='yesterday',s=>s.from='2024-02-30',s=>s.session='eth',s=>s.capital=NaN,s=>s.annotations=[]]){
  const w=workspace();change(w.sessions[0]);assert.throws(()=>validateWorkspace(w),/Некорректное/);
 }
});
test('rejects malformed financial values and duplicate identities',()=>{
 for(const change of [t=>t.entry='100',t=>t.pnl=Infinity,t=>t.exitTime=1704205801,t=>t.r='4',t=>t.side=0,t=>t.qty=0,t=>t.pnl+=100]){
  const w=workspace();change(w.sessions[0].snapshot.trades[0]);assert.throws(()=>validateWorkspace(w));
 }
 const session=workspace();session.sessions.push(structuredClone(session.sessions[0]));assert.throws(()=>validateWorkspace(session));
 const trade=workspace();trade.sessions[0].snapshot.trades.push(structuredClone(trade.sessions[0].snapshot.trades[0]));assert.throws(()=>validateWorkspace(trade));
 const playbook=workspace();playbook.playbooks.push(structuredClone(playbook.playbooks[0]));assert.throws(()=>validateWorkspace(playbook));
});
test('annotation whitelist preserves notes and strips financial overrides',()=>{
 const w=workspace(),tid=w.sessions[0].snapshot.trades[0].id;
 w.sessions[0].annotations[tid]={notes:'Context',tags:['discipline','discipline'],strategyId:'strategy-1',checklist:{0:true},pnl:9000,entry:'unsafe',id:'other',attachments:[{id:'image-1',url:'/api/attachments/image-1',name:'Chart'}]};
 const annotation=validateWorkspace(w).sessions[0].annotations[tid];
 assert.deepEqual(annotation,{notes:'Context',tags:['discipline'],strategyId:'strategy-1',checklist:{0:true},attachments:[{id:'image-1',url:'/api/attachments/image-1',name:'Chart'}]});
});
test('rejects executable, external and mismatched attachment links',()=>{
 for(const url of ['javascript:alert(1)','https://example.com/private.png','//example.com/private.png','/api/attachments/other','/api/attachments/image-1?copy=1']){
  const w=workspace(),tid=w.sessions[0].snapshot.trades[0].id;
  w.sessions[0].annotations[tid]={attachments:[{id:'image-1',url,name:'Chart'}]};
  assert.throws(()=>validateWorkspace(w));
 }
});
test('validates geometry and keeps only drawable properties',()=>{
 const w=workspace();w.sessions[0].drawings=[{id:'drawing-1',type:'trend',a:{time:bars[0].time,price:100},b:{time:bars[1].time,price:102},createdAt:bars[1].time,color:'#ffffff',width:2,opacity:20,dashed:true,hidden:false,html:'<script>'}];
 const out=validateWorkspace(w);assert.equal(out.sessions[0].drawings[0].html,undefined);
 w.sessions[0].drawings[0].a=null;assert.throws(()=>validateWorkspace(w));
});
test('rejects malformed registry and dangerous object structure',()=>{
 const w=workspace();w.settings.datasets['builtin-NQ-2024-01']=null;assert.throws(()=>validateWorkspace(w));
 const bad=blank();bad.settings=JSON.parse('{"__proto__":{"polluted":true}}');assert.throws(()=>validateWorkspace(bad));
 const cycle=blank();cycle.settings.self=cycle.settings;assert.throws(()=>validateWorkspace(cycle));
 assert.equal({}.polluted,undefined);
});
