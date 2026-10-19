import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
test('production : protège interface et API, refuse les écritures intersites',async t=>{
 const port=24000+Math.floor(Math.random()*15000);
 const child=spawn(process.execPath,['server/index.mjs','--production'],{env:{...process.env,PORT:String(port),ADMIN_USER:'test',ADMIN_PASSWORD:'test-only',GITHUB_TOKEN:''},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Serveur non démarré');}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timeout serveur')),5000).unref())]);
 const url=`http://127.0.0.1:${port}`;
 assert.equal((await fetch(url+'/api/config')).status,401);
 const headers={Authorization:'Basic '+Buffer.from('test:test-only').toString('base64')};
 const r=await fetch(url+'/api/config',{headers});assert.equal(r.status,200);assert.equal((await r.json()).protected,true);
 assert.equal((await fetch(url+'/api/state',{method:'PUT',headers:{...headers,Origin:'https://example.org','Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(url,{headers})).status,200);
});
