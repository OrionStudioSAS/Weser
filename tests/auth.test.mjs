import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { configureApp } from '../server/app.mjs';
async function setup(t,env={}) {
 const app=express();app.use(express.json());configureApp(app,{production:true,env:{ADMIN_PASSWORD:'test-only',...env}});
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});t.after(()=>new Promise(resolve=>server.close(resolve)));
 return `http://127.0.0.1:${server.address().port}`;
}
function post(url,username='weser',password='test-only',headers={}) {return fetch(url+'/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({username,password}),redirect:'manual'});}
test('formulaire sans popup, échec explicite, cookie signé, falsification refusée et déconnexion',async t=>{
 const url=await setup(t);
 const page=await fetch(url);assert.match(await page.text(),/autocomplete="current-password"/);assert.equal(page.headers.get('www-authenticate'),null);
 const wrong=await post(url,'weser','<secret-test>');assert.equal(wrong.status,401);const text=await wrong.text();assert.match(text,/incorrect/);assert.ok(!text.includes('<secret-test>'));assert.equal(wrong.headers.get('set-cookie'),null);
 const ok=await post(url);assert.equal(ok.status,303);const cookie=ok.headers.get('set-cookie').split(';')[0];assert.ok(!cookie.includes('test-only'));
 assert.equal((await fetch(url+'/api/config',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await fetch(url+'/api/config',{headers:{Cookie:cookie+'tampered'}})).status,401);
 const logout=await fetch(url+'/auth/logout',{method:'POST',headers:{Cookie:cookie},redirect:'manual'});assert.equal(logout.status,303);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await fetch(url+'/api/config')).status,401);
});
test('login refuse les formulaires provenant d’une autre origine',async t=>{
 const url=await setup(t);assert.equal((await post(url,'weser','test-only',{Origin:'https://evil.example'})).status,403);
 assert.equal((await post(url,'weser','test-only',{Origin:url})).status,303);
});
test('cookie Secure et contrôle de l’origine HTTPS sur Vercel',async t=>{
 const url=await setup(t,{VERCEL:'1',APP_ORIGIN:'https://weser.example'});
 const ok=await post(url,'weser','test-only',{Origin:'https://weser.example'});assert.equal(ok.status,303);assert.match(ok.headers.get('set-cookie'),/; Secure/);
});
test('limite les essais répétés sans créer de session',async t=>{
 const url=await setup(t);for(let i=0;i<10;i++) assert.equal((await post(url,'weser','wrong')).status,401);
 const blocked=await post(url);assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);assert.equal(blocked.headers.get('set-cookie'),null);
});
