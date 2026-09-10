import assert from 'node:assert/strict';
import worker from './worker.mjs';
const env={SIRI_TOKEN:'a'.repeat(64),FIREBASE_REFRESH_TOKEN:'fake-refresh'};
let mode='ok',writes=0,calls=0;
globalThis.fetch=async(url,opt={})=>{calls++;
 if(url.includes('securetoken'))return mode==='expired'?new Response('{}',{status:400}):Response.json({id_token:'fake',user_id:'uid'});
 if(url.includes('accounts:lookup'))return Response.json({users:[{localId:'uid',email:mode==='unauthorized'?'other@example.org':'pirqueporton@gmail.com',emailVerified:true}]});
 if(opt.method==='PUT'){writes++;const d=JSON.parse(opt.body);assert.equal(d.preserve,'yes');assert.equal(d.timestamp['.sv'],'timestamp');assert.match(d.comando,/^abrir_\d+$/);assert.equal(opt.headers['If-Match'],'"v1"');if(mode==='timeout')throw Error();return new Response('{}',{status:mode==='race'?412:200});}
 return Response.json({ultima_conexion:Date.now()-(mode==='offline'?60000:1000),timestamp:mode==='recent'?Date.now():0,preserve:'yes'}, {headers:{ETag:'"v1"'}});
};
const req=(path='/abrir',token=env.SIRI_TOKEN,method='POST',body={accion:'abrir'})=>new Request('https://example.workers.dev'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
for(const [m,status] of [['ok',200],['offline',409],['recent',409],['unauthorized',403],['expired',401],['race',409],['timeout',502]]){mode=m;writes=0;const r=await worker.fetch(req(),env);assert.equal(r.status,status,m);assert.equal(writes,['ok','race','timeout'].includes(m)?1:0,m);}
mode='ok';writes=0;assert.equal((await worker.fetch(req('/verificar'),env)).status,200);assert.equal(writes,0);
calls=0;assert.equal((await worker.fetch(req('/abrir','bad'),env)).status,401);assert.equal(calls,0);
assert.equal((await worker.fetch(req('/abrir',env.SIRI_TOKEN,'GET'),env)).status,405);
assert.equal((await worker.fetch(req('/abrir',env.SIRI_TOKEN,'POST',{accion:'cerrar'}),env)).status,400);
console.log('PASS: auth, expired session, offline, recent command, ETag conflict, uncertain delivery, no retries, verify never writes, explicit command only. No real network requests.');
