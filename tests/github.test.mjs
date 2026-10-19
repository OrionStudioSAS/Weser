import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, validateState } from '../server/github.mjs';
const config={GITHUB_TOKEN:'test-only',GITHUB_OWNER:'owner',GITHUB_REPO:'repo'};
const state={version:1,records:{},searches:[]};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('ne lit ni ne modifie un dépôt public', async()=>{
  let calls=0;
  const store=createStore(config,async()=>{calls++;return reply({private:false});});
  await assert.rejects(store.write(state,null),/privé/);assert.equal(calls,1);
});
test('refuse un conflit avant toute écriture', async()=>{
  const methods=[];
  const store=createStore(config,async(url,init)=>{methods.push(init.method||'GET');return url.includes('/contents/')?reply({sha:'changed',content:Buffer.from(JSON.stringify(state)).toString('base64')}):reply({private:true});});
  await assert.rejects(store.write(state,'old'),e=>e.status===409);assert.ok(!methods.includes('PUT'));
});
test('encode en UTF-8 et transmet le SHA pour la sauvegarde',async()=>{
  const next={...state,searches:[{id:'one',name:'Seuils béton',filters:{}}]};let written;
  const store=createStore(config,async(url,init)=>{
    if(init.method==='PUT'){written=JSON.parse(init.body);return reply({content:{sha:'new'}});}
    return url.includes('/contents/')?reply({sha:'old',content:Buffer.from(JSON.stringify(state)).toString('base64')}):reply({private:true});
  });
  const saved=await store.write(next,'old');assert.equal(written.sha,'old');assert.equal(saved.revision,'new');assert.deepEqual(JSON.parse(Buffer.from(written.content,'base64').toString('utf8')),next);
});
test('un fichier manquant ne masque pas une branche absente',async()=>{
 const store=createStore(config,async url=>url.includes('/contents/')||url.includes('/branches/')?reply({},404):reply({private:true}));
 await assert.rejects(store.read(),/Branche/);
});
test('ne remplace pas un fichier JSON corrompu',async()=>{
 const store=createStore(config,async url=>url.includes('/contents/')?reply({sha:'old',content:Buffer.from('broken').toString('base64')}):reply({private:true}));
 await assert.rejects(store.write(state,null),/invalide/);
});
test('valide les limites et le format avant sauvegarde',()=>{
 assert.throws(()=>validateState({...state,searches:new Array(31).fill({})}),/Limite/);
 assert.throws(()=>validateState({...state,records:{'BOAMP:1':{status:'inconnu'}}}),/invalide/);
});
