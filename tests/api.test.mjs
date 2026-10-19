import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.mjs';
test('une erreur Vercel en texte brut explique le défaut API sans tenter de parser du JSON',async()=>{
 await assert.rejects(api('/api/config',undefined,async()=>new Response('The page could not be found',{status:404,headers:{'content-type':'text/plain'}})),/non JSON \(HTTP 404\).*Vercel/);
});
test('préserve les erreurs JSON du serveur et retourne les réponses valides',async()=>{
 await assert.rejects(api('/api/config',undefined,async()=>Response.json({error:'Configuration serveur incomplète'},{status:503})),/Configuration serveur incomplète/);
 assert.deepEqual(await api('/api/config',undefined,async()=>Response.json({protected:true})),{protected:true});
});
