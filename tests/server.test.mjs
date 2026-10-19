import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
async function login(url,username,password) {
 const response=await fetch(url+'/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password}),redirect:'manual'});
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/');
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
 return {Cookie:cookie.split(';')[0]};
}

test('production : protège interface et API, refuse les écritures intersites',async t=>{
 const port=24000+Math.floor(Math.random()*15000);
 const child=spawn(process.execPath,['server/index.mjs','--production'],{env:{...process.env,PORT:String(port),ADMIN_USER:'test',ADMIN_PASSWORD:'test-only',GITHUB_TOKEN:''},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Serveur non démarré');}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timeout serveur')),5000).unref())]);
 const url=`http://127.0.0.1:${port}`;
 const page=await fetch(url);assert.match(await page.text(),/action="\/auth\/login"/);
 assert.equal((await fetch(url+'/api/config')).status,401);
 const headers=await login(url,'test','test-only');
 const r=await fetch(url+'/api/config',{headers});assert.equal(r.status,200);assert.equal((await r.json()).protected,true);
 assert.equal((await fetch(url+'/api/state',{method:'PUT',headers:{...headers,Origin:'https://example.org','Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(url,{headers})).status,200);
});

test('entrée Vercel : export sans écoute, API JSON et assets protégés',async t=>{
 const {createServer}=await import('node:http');
 const oldPassword=process.env.ADMIN_PASSWORD;
 process.env.ADMIN_PASSWORD='test-only';
 let app;
 try { ({default:app}=await import('../app.mjs')); }
 finally { if(oldPassword===undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD=oldPassword; }
 const server=createServer(app); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const headers=await login(url,'weser','test-only');
 const unauthorized=await fetch(url+'/api/config');assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('content-type').includes('application/json'),true);assert.match((await unauthorized.json()).error,/Session/);
 const config=await fetch(url+'/api/config',{headers});assert.equal(config.status,200);assert.equal((await config.json()).protected,true);
 const html=await (await fetch(url,{headers})).text();const asset=html.match(/src="([^"]+\.js)"/)[1];
 const script=await fetch(url+asset,{headers});assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
 const redirect=await fetch(url+asset,{redirect:'manual'});assert.equal(redirect.status,303);assert.equal(redirect.headers.get('location'),'/login');
 assert.equal((await fetch(url+'/api/absente',{headers})).status,404);
});

test('configuration absente sur Vercel : bloque l’accès et renvoie une erreur JSON exploitable',async t=>{
 const express=(await import('express')).default; const {configureApp}=await import('../server/app.mjs');
 const app=express();configureApp(app,{production:true,env:{VERCEL:'1'}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const r=await fetch(`http://127.0.0.1:${server.address().port}/api/config`);assert.equal(r.status,503);assert.match((await r.json()).error,/ADMIN_PASSWORD/);
});
