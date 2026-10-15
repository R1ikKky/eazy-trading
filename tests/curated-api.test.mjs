import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {api} from '../worker/api.mjs';
import {curatedArchives} from '../dist/curated-data.mjs';

test('private Site service upload accepts only exact published market bytes and leaves personal records alone',async()=>{
 const a=curatedArchives[0],p=a.parts[0],catalog={[p.id]:p};
 const encoded=await readFile(new URL('../market-archives/'+p.id+'.b64',import.meta.url),'utf8');
 const files=new Map([['users/personal/workspace',{body:'personal record'}]]);let writes=0;
 const env={DB:{prepare(){throw Error('Market data must never touch personal records.');}},BUCKET:{
  async get(key){const f=files.get(key);return f?{body:new Response(f.body).body}:null;},
  async head(key){return files.get(key)||null;},
  async put(key,body){writes++;files.set(key,{body});},
 }};
 const origin='https://replay.example',path='/api/market-data/'+p.id;
 const request=(method='GET',body,extra={})=>new Request(origin+path,{method,headers:{origin,'Content-Type':'text/plain',...extra},...(body===undefined?{}:{body})});
 assert.equal((await api(request('POST',encoded,{origin:'https://other.example'}),env,catalog)).status,403);
 assert.equal((await api(request('POST',encoded.slice(1)),env,catalog)).status,400);
 const damaged=(encoded[0]==='A'?'B':'A')+encoded.slice(1);
 assert.equal((await api(request('POST',damaged),env,catalog)).status,400);
 assert.equal(writes,0);
 assert.equal((await api(new Request(origin+'/api/market-data/unrecognized',{method:'POST',body:encoded}),env,catalog)).status,404);
 const posted=await api(request('POST',encoded),env,catalog);assert.equal(posted.status,201);assert.equal((await posted.json()).sha256,p.sha256);
 assert.equal(writes,1);assert.equal((await api(request('POST',encoded),env,catalog)).status,200);assert.equal(writes,1,'Retry is idempotent.');
 const saved=await api(request(),env,catalog);assert.equal(saved.status,200);assert.equal(await saved.text(),encoded);assert.match(saved.headers.get('cache-control'),/private/);
 assert.equal((await api(new Request(origin+path+'?v=wrong'),env,catalog)).status,404);
 assert.equal((await api(request('DELETE'),env,catalog)).status,405);
 assert.equal(files.get('users/personal/workspace').body,'personal record');
 assert.equal((await api(new Request(origin+'/api/workspace'),env,catalog)).status,401,'Service access is never visitor identity.');
});
