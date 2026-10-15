import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url)),dist=resolve(root,'dist');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const assets={};
async function collect(directory){for(const e of await readdir(directory,{withFileTypes:true})){if(e.name==='server'||e.name==='.openai'||e.name==='market-archives'||e.name.startsWith('.'))continue;const path=resolve(directory,e.name);if(e.isDirectory())await collect(path);else{const text=await readFile(path,'utf8');assets['/'+relative(dist,path).split('\\').join('/')]=[text,mime[extname(path)]||'text/plain; charset=utf-8','"'+createHash('sha256').update(text).digest('hex').slice(0,24)+'"'];}}}
await collect(dist);
const assetBytes=Object.values(assets).reduce((n,a)=>n+Buffer.byteLength(a[0]),0);
if(assetBytes>60*1024*1024)throw Error('Embedded assets exceed the bounded Worker size; move additional history to R2.');
if(!assets['/index.html'])throw Error('Missing application entry');
const api=await readFile(resolve(root,'worker/api.mjs'),'utf8');
const {marketArchives}=await import(resolve(dist,'market-archives.mjs'));
const curatedParts=Object.fromEntries(marketArchives.flatMap(a=>a.parts.map(p=>[p.id,p])));
const worker=api+'\nconst curatedParts='+JSON.stringify(curatedParts)+';\nconst assets='+JSON.stringify(assets)+';\n'+`
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return api(request,env,curatedParts);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
  if(!asset)return new Response('Not found',{status:404});
  const headers={'Content-Type':asset[1],'ETag':asset[2],'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
  if(request.headers.get('if-none-match')===asset[2])return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:asset[0],{headers});
 }
};
`;
await mkdir(resolve(dist,'server'),{recursive:true});await mkdir(resolve(dist,'.openai'),{recursive:true});
await writeFile(resolve(dist,'server/index.js'),worker);
await writeFile(resolve(dist,'.openai/hosting.json'),await readFile(resolve(root,'.openai/hosting.json')));
console.log('Built Worker with '+Object.keys(assets).length+' assets ('+Buffer.byteLength(worker)+' bytes).');
