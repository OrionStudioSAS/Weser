import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, fromBoamp, fromTed, deduplicate, options, boampURL, tedBody } from '../server/search.mjs';
test('les seuils financiers et les ports ne deviennent pas des produits', () => {
  assert.deepEqual(classify('Marché au-dessus des seuils européens pour le port de pêche').categories, []);
  assert.equal(classify('Fourniture de seuils de portes en béton').relevance, 'Mention produit');
  assert.equal(classify('Vitrerie et nettoyage des appuis de fenêtres').relevance, 'À vérifier');
  assert.deepEqual(classify('Appuis de fenêtre et marches d’escalier préfabriquées').categories, ['appuis','marches']);
});
test('requêtes bornées, mots-clés échappés et marches hors périmètre par défaut', () => {
  const o = options({page:9999,category:'invalid'});
  assert.equal(o.page,100); assert.equal(o.category,'all'); assert.ok(o.terms.every(t=>!t.includes('marche')));
  const where = new URL(boampURL(options({q:'porte" OR true'}))).searchParams.get('where');
  assert.ok(!where.includes('search(')); assert.match(where,/nature = "APPEL_OFFRE"/);
  assert.match(tedBody(o).query,/CY = FRA/);
  assert.ok(!tedBody(options({country:'EU'})).query.includes('CY = FRA'));
  assert.throws(()=>options({q:'"()'}));
});
test('normalisation des champs multilingues et des dates TED par lot', () => {
  const n=fromTed({'publication-number':'123-2026','notice-title':{fra:'Appuis de fenêtres'},'buyer-name':{fra:['Acheteur A']},'publication-date':'2026-10-01+02:00','deadline-receipt-tender-date-lot':['2099-12-01+02:00','2099-11-01+02:00'],'description-lot':{fra:['Pose de seuils de porte']}});
  assert.equal(n.published,'2026-10-01');assert.equal(n.deadline,'2099-11-01');assert.equal(n.buyer,'Acheteur A');assert.deepEqual(n.categories,['appuis','seuils']);
});
test('BOAMP lit les produits dans le texte des lots et résiste aux anciens formats', () => {
  const n=fromBoamp({idweb:'26-1',objet:'Réhabilitation',donnees:JSON.stringify({lot:{description:'Fourniture de seuils PMR'}})});
  assert.deepEqual(n.categories,['seuils']); assert.ok(fromBoamp({idweb:'26-2',donnees:'Texte simple'}).description);
});
test('fusion intersource uniquement avec un identifiant de procédure commun', () => {
  const base={published:'2026-10-01',title:'Même titre',procedure:'uuid'};
  const merged=deduplicate([{...base,id:'BOAMP:1',source:'BOAMP',url:'https://boamp.fr'},{...base,id:'TED:2',source:'TED',url:'https://ted.europa.eu'}]);
  assert.equal(merged.length,1);assert.equal(merged[0].links.length,2);
  assert.equal(deduplicate([{...base,id:'BOAMP:1',procedure:null},{...base,id:'TED:2',procedure:null}]).length,2);
});
