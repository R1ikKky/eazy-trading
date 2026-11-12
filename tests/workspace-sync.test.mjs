import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkspaces } from '../frontend/src/replay/workspace-merge.ts';
import { Replay } from '../frontend/src/replay/engine.ts';
const bars = [0,1,2,3].map(i=>({time:1704205800+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:1}));
const blank = () => ({version:1,revision:1,sessions:[],playbooks:[],settings:{theme:'dark'}});
const session = () => ({id:'session-1', name:'Session', symbol:'NQ',from:'2024-01-02',to:'2024-01-02',session:'all',source:'hf_market_data',datasetId:'test-bars',capital:50000,strategyId:'',createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:01Z',snapshot:new Replay(bars,'NQ').snapshot(),notes:'',annotations:{},drawings:[]});
test('three-way sync retains independent settings and record edits, additions and deletions',()=>{
 const base=blank(); base.sessions=[session()];
 const local=structuredClone(base), remote=structuredClone(base); remote.revision=2;
 local.settings.theme='light'; local.sessions[0].notes='Local journal note';
 remote.settings.timezone='Europe/Moscow'; remote.sessions[0].name='Remote title';
 const result=mergeWorkspaces(base,local,remote);
 assert.deepEqual(result.settings,{theme:'light',timezone:'Europe/Moscow'});
 assert.equal(result.sessions.length,1); assert.equal(result.sessions[0].name,'Remote title'); assert.equal(result.sessions[0].notes,'Local journal note');
 local.sessions=[]; assert.equal(mergeWorkspaces(base,local,base).sessions.length,0);
 remote.sessions=[]; assert.equal(mergeWorkspaces(base,base,remote).sessions.length,0);
});
test('incompatible replay progress remains two independently valid trading snapshots',()=>{
 const base=blank(); base.sessions=[session()];
 const local=structuredClone(base), remote=structuredClone(base); remote.revision=2;
 const a=new Replay(bars,'NQ'), b=new Replay(bars,'NQ');
 a.queue(1,{qty:1,stop:10,target:20,fee:0,slip:0}); a.step();
 b.queue(-1,{qty:1,stop:10,target:20,fee:0,slip:0}); b.step();
 local.sessions[0].snapshot=a.snapshot(); remote.sessions[0].snapshot=b.snapshot();
 const result=mergeWorkspaces(base,local,remote);
 assert.equal(result.sessions.length,2);
 assert.equal(result.sessions[0].id,'session-1'); assert.notEqual(result.sessions[1].id,'session-1');
 assert.deepEqual(Replay.restore(bars,'NQ',result.sessions[0].snapshot).snapshot(),a.snapshot());
 assert.deepEqual(Replay.restore(bars,'NQ',result.sessions[1].snapshot).snapshot(),b.snapshot());
 assert.equal(result.sessions[1].name,'Session · sync copy');
 const again=mergeWorkspaces(remote,result,remote); assert.equal(again.sessions.length,2,'Retry against the same remote must not create more copies');
});
test('legacy offline drafts retain both conflicting session notes without an acknowledged baseline',()=>{
 const local=blank(),remote=blank(); local.sessions=[session()]; remote.sessions=[session()];
 local.sessions[0].notes='Offline note'; remote.sessions[0].notes='Other device note'; remote.revision=3;
 const result=mergeWorkspaces(null,local,remote);
 assert.deepEqual(result.sessions.map(s=>s.notes),['Offline note','Other device note']);
});
