export const families = {
  appuis: { label: 'Appuis de fenêtre', terms: ['appui de fenêtre', 'appuis de fenêtres', 'appuis de fenêtre', 'rebord de fenêtre'] },
  seuils: { label: 'Seuils de porte', terms: ['seuil de porte', 'seuils de portes', 'seuil PMR', 'seuils en béton'] },
  marches: { label: 'Marches d’escalier', terms: ['marche en béton', 'marches préfabriquées', 'marches d’escalier'] },
};
export function plain(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join(' · ');
  if (typeof value === 'object') return plain(value.fra ?? value.fr ?? value.eng ?? Object.values(value));
  return String(value);
}
export const normalize = value => plain(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ');
export function classify(text) {
  const s = normalize(text);
  const hits = [];
  if (/appuis? (?:de |des |pour )?fenetres?|rebords? (?:de |des )?fenetres?/.test(s)) hits.push('appuis');
  if (/seuils? (?:de |des )?portes?|seuils? pmr|seuils? en beton/.test(s)) hits.push('seuils');
  if (/marches? (?:d escalier|en beton|prefabriquees?)/.test(s)) hits.push('marches');
  const building = /beton|prefabri|maconnerie|gros œuvre|gros oeuvre|construction|rehabilitation|renovation/.test(s);
  const cleaning = /nettoyage|vitrerie|proprete/.test(s) && !building;
  return { categories: hits, relevance: cleaning ? 'À vérifier' : hits.length ? 'Mention produit' : 'À vérifier', score: cleaning ? 20 : hits.length ? 90 : 35 };
}
const quoted = term => JSON.stringify(term);
export function options(input = {}) {
  const category = ['all', ...Object.keys(families)].includes(input.category) ? input.category : 'all';
  const q = String(input.q || '').trim().slice(0, 120);
  if (q && !/[a-zA-ZÀ-ÿ0-9]{3}/.test(q)) throw Object.assign(new Error('Saisissez au moins trois lettres ou chiffres.'), { status: 400 });
  const days = [30, 90, 180, 365].includes(Number(input.days)) ? Number(input.days) : 180;
  const page = Math.min(100, Math.max(1, Number.parseInt(input.page, 10) || 1));
  const terms = q ? [q] : (category === 'all' ? ['appuis', 'seuils'] : [category]).flatMap(k => families[k].terms);
  return { category, q, days, page, terms, source: ['BOAMP', 'TED'].includes(input.source) ? input.source : 'all', country: input.country === 'EU' ? 'EU' : 'FR', open: input.open !== 'false' };
}
function since(days) { return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); }
export async function remoteJSON(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Service indisponible (HTTP ${response.status}). Réessayez dans un instant.`);
  return response.json();
}
export function boampURL(o) {
  // LIKE évite la recherche floue de search(), qui confond notamment « porte » et « port ».
  const tokenQuery = term => {
    const tokens = normalize(term).split(/[^a-z0-9]+/).filter(t => t.length > 2 && !['des', 'pour', 'les', 'une'].includes(t));
    return '(' + tokens.map(t => `(objet like ${quoted(t)} OR donnees like ${quoted(t)})`).join(' AND ') + ')';
  };
  const where = [`(${o.terms.map(tokenQuery).join(' OR ')})`, `dateparution >= date'${since(o.days)}'`, 'nature = "APPEL_OFFRE"', 'etat != "ANNULATION"'];
  if (o.open) where.push('(datelimitereponse >= now() OR datelimitereponse IS NULL)');
  const params = new URLSearchParams({ where: where.join(' AND '), order_by: 'dateparution DESC', limit: '50', offset: String((o.page - 1) * 50) });
  return `https://www.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records?${params}`;
}
export function tedBody(o) {
  const terms = `(${o.terms.map(t => `FT ~ ${quoted(t)}`).join(' OR ')})`;
  const clauses = [terms, `PD >= ${since(o.days).replaceAll('-', '')}`, 'notice-type IN (cn-standard, cn-social)'];
  if (o.country === 'FR') clauses.push('CY = FRA');
  return { query: `${clauses.join(' AND ')} SORT BY PD DESC`, fields: ['publication-number', 'notice-title', 'publication-date', 'buyer-name', 'description-proc', 'description-lot', 'deadline-receipt-tender-date-lot', 'procedure-identifier', 'notice-type'], limit: 50, page: o.page };
}
const safeDate = value => plain(value).slice(0, 10);
export function fromBoamp(r) {
  let detail = r.donnees || '';
  try { detail = plain(JSON.parse(detail)); } catch { /* Certains anciens avis ont un format texte. */ }
  const description = detail.slice(0, 35000);
  return { id: `BOAMP:${r.idweb}`, reference: r.idweb, source: 'BOAMP', title: r.objet || 'Avis sans titre', buyer: r.nomacheteur || 'Acheteur non renseigné', location: plain(r.code_departement_prestation || r.code_departement) || 'Non renseignée', published: safeDate(r.dateparution), deadline: r.datelimitereponse || null, description, procedure: r.contractfolderid || null, url: `https://www.boamp.fr/pages/avis/?q=idweb:${encodeURIComponent(r.idweb)}`, ...classify(`${r.objet} ${detail}`) };
}
export function fromTed(r) {
  const description = [plain(r['description-proc']), plain(r['description-lot'])].filter(Boolean).join('\n\n').slice(0, 35000);
  const dates = (r['deadline-receipt-tender-date-lot'] || []).map(safeDate).filter(Boolean).sort();
  // Plusieurs lots : conserver l'échéance future la plus proche, sinon la dernière connue.
  const deadline = dates.find(d => d >= new Date().toISOString().slice(0, 10)) || dates.at(-1) || null;
  const title = plain(r['notice-title']) || 'Avis sans titre';
  return { id: `TED:${r['publication-number']}`, reference: r['publication-number'], source: 'TED', title, buyer: plain(r['buyer-name']) || 'Acheteur non renseigné', location: 'Voir l’avis TED', published: safeDate(r['publication-date']), deadline, description, procedure: plain(r['procedure-identifier']) || null, url: `https://ted.europa.eu/fr/notice/-/detail/${encodeURIComponent(r['publication-number'])}`, ...classify(`${title} ${description}`) };
}
// Fusion uniquement sur un identifiant de procédure commun : pas de rapprochement incertain par titre.
export function deduplicate(notices) {
  const groups = new Map();
  for (const n of notices) {
    const key = n.procedure ? `procedure:${n.procedure}` : n.id;
    if (groups.has(key)) {
      const existing = groups.get(key);
      if (!existing.links.some(l => l.id === n.id)) existing.links.push({ id: n.id, source: n.source, url: n.url });
    } else groups.set(key, { ...n, links: [{ id: n.id, source: n.source, url: n.url }] });
  }
  return [...groups.values()].sort((a,b) => b.published.localeCompare(a.published));
}
export async function search(input) {
  const o = options(input);
  const sources = o.source === 'all' ? ['BOAMP', 'TED'] : [o.source];
  const responses = await Promise.allSettled(sources.map(async source => {
    const raw = source === 'BOAMP' ? await remoteJSON(boampURL(o)) : await remoteJSON('https://api.ted.europa.eu/v3/notices/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tedBody(o)) });
    if (raw.timedOut) throw new Error('La recherche TED a dépassé son délai. Réessayez.');
    const notices = source === 'BOAMP' ? raw.results.map(fromBoamp) : raw.notices.map(fromTed);
    return { source, total: source === 'BOAMP' ? raw.total_count : raw.totalNoticeCount, notices };
  }));
  const errors = [], results = [], totals = {};
  responses.forEach((r, i) => {
    if (r.status === 'rejected') errors.push({ source: sources[i], message: r.reason.message });
    else { totals[r.value.source] = r.value.total; results.push(...r.value.notices); }
  });
  const today = new Date().toISOString().slice(0, 10);
  const filtered = results.filter(n => (!o.open || !n.deadline || n.deadline.slice(0,10) >= today) && (o.q ? normalize(n.title + ' ' + n.description).includes(normalize(o.q)) : o.category === 'all' ? n.categories.some(k => ['appuis', 'seuils'].includes(k)) : n.categories.includes(o.category)));
  return { notices: deduplicate(filtered), totals, errors, page: o.page, hasMore: Object.values(totals).some(t => t > o.page * 50) && o.page < 100, fetchedAt: new Date().toISOString() };
}
