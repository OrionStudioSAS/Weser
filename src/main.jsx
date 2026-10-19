import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, Bookmark, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, ExternalLink, FileText, FolderSearch, Github, LayoutDashboard, LoaderCircle, MapPin, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Star, Trash2, X } from 'lucide-react';
import './styles.css';
import { api } from './api.mjs';

const initialFilters = { q: '', category: 'all', source: 'all', days: '180', country: 'FR', open: 'true' };
const blankState = () => ({ version: 1, records: {}, searches: [] });
const statuses = ['À examiner', 'Pertinent', 'Écarté', 'Traité'];
const familyNames = { appuis: 'Appuis de fenêtre', seuils: 'Seuils de porte' };
const localKey = 'weser-veille-v1';
const date = value => value ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value.slice(0,10) + 'T12:00:00')) : 'Non renseignée';
const isUrgent = n => n.deadline && (new Date(n.deadline.slice(0,10) + 'T23:59:59') - Date.now()) / 86400000 <= 10 && new Date(n.deadline.slice(0,10) + 'T23:59:59') >= new Date();
const safeLink = url => { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : '#'; } catch { return '#'; } };

function App() {
  const [view, setView] = useState('opportunities');
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [result, setResult] = useState({ notices: [], errors: [], totals: {} });
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const [state, setState] = useState(blankState), [revision, setRevision] = useState(null);
  const [config, setConfig] = useState(null), [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(''), [searchError, setSearchError] = useState('');
  const [saving, setSaving] = useState(false), [toast, setToast] = useState('');
  const [selected, setSelected] = useState(null), [note, setNote] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchName, setSearchName] = useState(''), [saveDialog, setSaveDialog] = useState(false);
  const requestId = useRef(0), savingLock = useRef(false);

  async function loadStorage() {
    setReady(false); setStorageError('');
    try {
      const conf = await api('/api/config'); setConfig(conf);
      if (conf.githubConfigured) { const saved = await api('/api/state'); setState(saved.state); setRevision(saved.revision); }
      else { const raw = localStorage.getItem(localKey); setState(raw ? JSON.parse(raw) : blankState()); }
      setReady(true);
    } catch (e) { setStorageError(e.message); }
  }
  async function runSearch(next = filters, append = false) {
    const id = ++requestId.current;
    append ? setLoadingMore(true) : setLoading(true);
    setSearchError('');
    try {
      const query = new URLSearchParams({ ...next, page: append ? String(result.page + 1) : '1' });
      const data = await api(`/api/search?${query}`);
      if (id !== requestId.current) return;
      setResult(prev => ({ ...data, notices: append ? [...new Map([...prev.notices, ...data.notices].map(n => [n.id, n])).values()] : data.notices }));
      setApplied(next);
    } catch (e) { if (id === requestId.current) setSearchError(e.message); }
    finally { if (id === requestId.current) { setLoading(false); setLoadingMore(false); } }
  }
  useEffect(() => { loadStorage(); runSearch(initialFilters); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => {
    if (!selected && !saveDialog) return;
    const handleKey = e => { if (e.key === 'Escape') { setSelected(null); setSaveDialog(false); } };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selected, saveDialog]);

  async function persist(next) {
    if (!ready || savingLock.current) return false;
    savingLock.current = true; setSaving(true);
    try {
      if (config.githubConfigured) { const response = await api('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: next, revision }) }); setRevision(response.revision); }
      else localStorage.setItem(localKey, JSON.stringify(next));
      setState(next); setToast(config.githubConfigured ? 'Modifications enregistrées sur GitHub' : 'Modifications enregistrées dans ce navigateur'); return true;
    } catch (e) { setStorageError(e.message); return false; }
    finally { savingLock.current = false; setSaving(false); }
  }
  async function updateRecord(n, patch) {
    const record = state.records[n.id] || { status: 'À examiner', favorite: false, note: '', notice: n };
    return persist({ ...state, records: { ...state.records, [n.id]: { ...record, ...patch, notice: { ...n, description: n.description.slice(0, 1200) }, updatedAt: new Date().toISOString() } } });
  }
  function inspect(n) { setNote(state.records[n.id]?.note || ''); setSelected(n); }
  async function saveSearch(e) {
    e.preventDefault();
    const ok = await persist({ ...state, searches: [...state.searches, { id: crypto.randomUUID(), name: searchName.trim(), filters: applied }] });
    if (ok) { setSaveDialog(false); setSearchName(''); }
  }
  const tracked = Object.values(state.records).map(r => r.notice);
  const list = (view === 'tracked' ? tracked : result.notices).filter(n => statusFilter === 'all' || (state.records[n.id]?.status || 'À examiner') === statusFilter);
  const urgent = result.notices.filter(isUrgent).length;
  const mentioned = result.notices.filter(n => n.relevance === 'Mention produit').length;
  function exportCSV() {
    const columns = ['Référence', 'Source', 'Objet', 'Acheteur', 'Lieu', 'Publication', 'Échéance', 'Statut', 'Lien'];
    const quote = value => '"' + String(value || '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const rows = list.map(n => [n.reference, n.source, n.title, n.buyer, n.location, n.published, n.deadline, state.records[n.id]?.status || 'À examiner', n.url]);
    const blob = new Blob(['\ufeff' + [columns, ...rows].map(row => row.map(quote).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'weser-opportunites.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="app">
    <aside className="sidebar">
      <a href="#" className="brand" aria-label="Weser accueil" onClick={e => { e.preventDefault(); setView('opportunities'); }}>weser<span>®</span><small>L’INSPIRATION DE LA PIERRE</small></a>
      <div className="workspace-label">ESPACE COMMERCIAL</div>
      <nav aria-label="Navigation principale">
        <button className={view === 'opportunities' ? 'active' : ''} onClick={() => { setView('opportunities'); setStatusFilter('all'); }}><LayoutDashboard size={18}/> Opportunités <span className="nav-count">{result.notices.length}</span></button>
        <button className={view === 'tracked' ? 'active' : ''} onClick={() => { setView('tracked'); setStatusFilter('all'); }}><Bookmark size={18}/> Mon suivi <span className="nav-count">{tracked.length}</span></button>
        <button className={view === 'searches' ? 'active' : ''} onClick={() => setView('searches')}><FolderSearch size={18}/> Mes recherches</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="watch-card"><span className="small-label">VOTRE VEILLE PRODUITS</span><div className="watch-mark">Des projets à bâtir.<br/>Des occasions à saisir.</div><span>Appuis, seuils & éléments béton</span><div className="line-art" aria-hidden="true"><i/><i/><i/></div></div>
        <button className={view === 'settings' ? 'settings active' : 'settings'} onClick={() => setView('settings')}><Settings2 size={18}/> Connexion & paramètres</button>
        <div className="profile"><div className="avatar">W</div><div>Équipe Weser<small>Administration commerciale</small></div><ShieldCheck size={17}/></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div>Weser <ChevronRight size={13}/> Veille des marchés</div><button className="top-settings" onClick={() => setView('settings')}><Settings2 size={14}/> Paramètres <span className="internal"><span/> Espace interne</span></button><form method="post" action="/auth/logout"><button className="text-button" type="submit">Se déconnecter</button></form></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">DÉVELOPPEMENT COMMERCIAL</div><h1>{view === 'tracked' ? 'Votre sélection, votre suivi.' : view === 'searches' ? 'Vos recherches enregistrées.' : view === 'settings' ? 'Un espace bien connecté.' : 'Les bons projets commencent ici.'}</h1><p>{view === 'opportunities' ? 'Repérez les appels d’offres qui donnent une place à vos produits.' : view === 'tracked' ? 'Retrouvez les opportunités qualifiées par votre équipe.' : view === 'searches' ? 'Relancez vos critères de veille en un clic.' : 'Deux sources publiques. Une sauvegarde partagée sur GitHub.'}</p></div>{['opportunities','tracked'].includes(view) && <button className="button secondary export" onClick={exportCSV} disabled={!list.length}><ArrowDownToLine size={16}/> Exporter</button>}</div>
        {storageError && <div className="alert error" role="alert">{storageError}<button onClick={loadStorage}>Recharger la sauvegarde</button></div>}
        {!config?.githubConfigured && config && <div className="storage-notice"><Github size={15}/> Mode local : votre suivi reste dans ce navigateur. <button onClick={() => setView('settings')}>Connecter GitHub <ArrowRight size={13}/></button></div>}
        {view === 'opportunities' && <div className="storage-notice"><CircleHelp size={15}/><span>Périmètre actuel : commande publique via BOAMP et TED. Les appels d’offres privés ne sont pas encore connectés.</span></div>}
        {view === 'opportunities' && <>
          <section className="stats" aria-label="Indicateurs des résultats chargés"><Stat label="Avis chargés" value={loading ? '—' : result.notices.length} icon={<FileText size={18}/>} subtitle="sur les pages consultées"/><Stat label="Mentions de produits" value={loading ? '—' : mentioned} icon={<Search size={18}/>} subtitle="dans les textes disponibles"/><Stat label="Dans votre suivi" value={tracked.length} icon={<Bookmark size={18}/>} subtitle="opportunités enregistrées"/><Stat label="Échéances proches" value={loading ? '—' : urgent} icon={<Clock3 size={18}/>} subtitle="dans les 10 prochains jours" warm/></section>
          <section className="search-panel" aria-label="Recherche des appels d’offres"><div className="section-title"><div><SlidersHorizontal size={17}/><h2>Votre périmètre de recherche</h2></div><span>BOAMP + TED</span></div>
            <form onSubmit={e => { e.preventDefault(); runSearch(); }}>
              <div className="search-row"><div className="search-input"><Search size={19}/><input aria-label="Mots-clés" placeholder="Un produit, une expression…" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })}/></div><button className="button primary" disabled={loading}><Search size={17}/>{loading ? 'Recherche…' : 'Rechercher'}</button></div>
              <div className="filter-row"><Filter label="Famille de produits" value={filters.category} onChange={category => setFilters({ ...filters, category })} items={[["all","Appuis & seuils"],["appuis","Appuis de fenêtre"],["seuils","Seuils de porte"]]}/><Filter label="Sources" value={filters.source} onChange={source => setFilters({ ...filters, source })} items={[["all","Toutes les sources"],["BOAMP","BOAMP · France"],["TED","TED · Europe"]]}/><Filter label="Publication" value={filters.days} onChange={days => setFilters({ ...filters, days })} items={[["30","30 derniers jours"],["90","90 derniers jours"],["180","6 derniers mois"],["365","12 derniers mois"]]}/><Filter label="Périmètre TED" value={filters.country} onChange={country => setFilters({ ...filters, country })} items={[["FR","France"],["EU","Tous les pays TED"]]}/></div>
              <div className="search-footer"><label className="checkbox"><input type="checkbox" checked={filters.open === 'true'} onChange={e => setFilters({ ...filters, open: String(e.target.checked) })}/> Échéances à venir ou non renseignées</label><span>Les mots-clés remplacent la famille sélectionnée.</span></div>
            </form>
          </section>
        </>}
        {['opportunities','tracked'].includes(view) && <section className="results">
          <div className="results-heading"><div><h2>{view === 'tracked' ? 'Opportunités suivies' : 'Appels d’offres'} <span className="count">{loading && view !== 'tracked' ? '…' : list.length}</span></h2><p>{view === 'tracked' ? 'Vos favoris, notes et décisions au même endroit.' : result.fetchedAt ? `Consultation à ${new Date(result.fetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · Avis de marché uniquement` : 'Consultation des sources publiques en cours…'}</p></div>{view === 'opportunities' && <button className="text-button" disabled={!ready || saving || loading} onClick={() => { setSearchName(applied.q || familyNames[applied.category] || 'Appuis & seuils'); setSaveDialog(true); }}><Plus size={16}/> Enregistrer la recherche</button>}</div>
          <div className="tabs" aria-label="Filtrer par statut">{[['all','Tous les avis'], ...statuses.map(s => [s,s])].map(([value,label]) => <button key={value} onClick={() => setStatusFilter(value)} className={statusFilter === value ? 'selected' : ''}>{label}</button>)}</div>
          {searchError && view === 'opportunities' && <div className="alert error" role="alert">{searchError}<button onClick={() => runSearch(applied)}>Réessayer</button></div>}
          {view === 'opportunities' && result.errors.map(e => <div key={e.source} className="alert" role="alert"><strong>{e.source}</strong> : {e.message} Les résultats peuvent être incomplets.</div>)}
          {loading && view === 'opportunities' ? <div className="loading" role="status"><LoaderCircle className="spin" size={25}/><h3>À la recherche de vos prochains projets</h3><p>Nous interrogeons BOAMP et TED. Cela peut prendre quelques secondes.</p>{[1,2,3].map(n => <div className="skeleton" key={n}/>)}</div> : list.length ? <div className="notice-list">{list.map(n => <article className="notice" key={n.id}>
            <div className="notice-top"><div className="badges">{(n.links || [{ source: n.source }]).map((link,i) => <span key={i} className={`badge source-${link.source.toLowerCase()}`}>{link.source}</span>)}<span className={`relevance ${n.score < 50 ? 'muted' : ''}`}><span/>{n.relevance}</span></div><button className={`icon-button favorite ${state.records[n.id]?.favorite ? 'is-favorite' : ''}`} aria-label={state.records[n.id]?.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={Boolean(state.records[n.id]?.favorite)} disabled={!ready || saving} onClick={() => updateRecord(n, { favorite: !state.records[n.id]?.favorite })}><Star size={19}/></button></div>
            <button className="notice-title" onClick={() => inspect(n)}>{n.title}</button><p className="buyer">{n.buyer}</p><div className="notice-meta"><span><MapPin size={14}/>{n.source === 'BOAMP' ? `Département(s) ${n.location}` : n.location}</span><span><FileText size={14}/>Publié le {date(n.published)}</span>{n.categories.map(k => <span className="product-tag" key={k}>{familyNames[k]}</span>)}</div>
            <div className="notice-bottom"><span className={isUrgent(n) ? 'deadline urgent' : 'deadline'}><Clock3 size={15}/>{n.deadline ? `Réponse avant le ${date(n.deadline)}` : 'Date limite non renseignée'}</span><div>{state.records[n.id] && <span className="status-pill">{state.records[n.id].status}</span>}<button className="text-button" onClick={() => inspect(n)}>Examiner l’avis <ArrowRight size={15}/></button></div></div>
          </article>)}</div> : <div className="empty"><FolderSearch size={34}/><h3>{view === 'tracked' ? 'Votre suivi commence ici' : 'Aucun avis dans cette sélection'}</h3><p>{view === 'tracked' ? 'Ajoutez un favori ou qualifiez un avis pour le retrouver ici.' : 'Essayez une période plus large, une autre expression ou un autre statut.'}</p></div>}
          {!loading && view === 'opportunities' && result.hasMore && <button className="button secondary load-more" disabled={loadingMore} onClick={() => runSearch(applied, true)}>{loadingMore ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} Charger la page suivante</button>}
          <div className="results-note"><CircleHelp size={15}/><p>La veille porte sur les textes des avis disponibles dans les API. Les pièces techniques (CCTP) ne sont pas analysées. Vérifiez la pertinence et les échéances dans l’avis d’origine. Les doublons sont regroupés lorsqu’un identifiant de procédure commun est disponible.</p></div>
        </section>}
        {view === 'searches' && <section className="saved-searches">{state.searches.length ? state.searches.map(s => <article key={s.id}><div className="saved-icon"><FolderSearch size={22}/></div><div><h2>{s.name}</h2><p>{s.filters.source === 'all' ? 'BOAMP + TED' : s.filters.source} · {s.filters.days} derniers jours · {s.filters.country === 'FR' ? 'France' : 'Tous les pays TED'}</p></div><button className="button secondary" onClick={() => { const f = { ...initialFilters, ...s.filters }; setFilters(f); setView('opportunities'); setStatusFilter('all'); runSearch(f); }}>Relancer <ArrowRight size={15}/></button><button className="icon-button" aria-label={`Supprimer ${s.name}`} disabled={!ready || saving} onClick={() => persist({ ...state, searches: state.searches.filter(item => item.id !== s.id) })}><Trash2 size={17}/></button></article>) : <div className="empty"><FolderSearch size={34}/><h3>Gardez vos critères à portée de main</h3><p>Lancez une recherche, puis cliquez sur « Enregistrer la recherche ».</p><button className="button primary" onClick={() => setView('opportunities')}>Explorer les opportunités <ArrowRight size={16}/></button></div>}</section>}
        {view === 'settings' && <section className="connection-panel"><div className="section-title"><div><Github size={20}/><h2>Sauvegarde GitHub</h2></div><span className="badge">{config?.githubConfigured ? ready ? 'Connecté' : 'À vérifier' : 'À configurer'}</span></div><p>Les recherches et le suivi commercial sont conservés dans un fichier JSON versionné au sein d’un dépôt privé. Le code de l’application peut être hébergé dans le même dépôt.</p><div className="settings-grid"><div><h3>Configuration côté serveur</h3><p>Renseignez les variables du fichier <code>.env</code>, puis redémarrez le serveur.</p><pre>GITHUB_TOKEN=…{'\n'}GITHUB_OWNER=OrionStudioSAS{'\n'}GITHUB_REPO=Weser{'\n'}GITHUB_BRANCH=main{'\n'}GITHUB_DATA_PATH=data/veille.json</pre><p>Le jeton doit autoriser la lecture et l’écriture du contenu de ce seul dépôt. Aucun secret n’est stocké dans l’interface.</p></div><div><h3>Accès administrateur</h3><p>{config?.protected ? 'L’accès est protégé par un formulaire de connexion et une session de huit heures.' : 'L’aperçu local est accessible sans mot de passe.'}</p><pre>ADMIN_USER=weser{'\n'}ADMIN_PASSWORD=…</pre><p>Le mot de passe est obligatoire en production. Utilisez HTTPS sur l’hébergement cible. Le serveur Node héberge l’interface et les API ; GitHub Pages seul ne suffit pas.</p></div></div><div className="alert"><CircleHelp size={16}/> Le mode local et GitHub sont distincts : les données du navigateur ne sont pas transférées automatiquement. Chaque sauvegarde GitHub crée un commit ; les anciennes versions peuvent contenir vos notes.</div><button className="button secondary" onClick={loadStorage}>Vérifier la connexion <ArrowRight size={16}/></button></section>}
        <footer><span>WESER <span className="footer-divider">/</span> Veille commerciale</span><span>Des données publiques, de nouvelles perspectives.</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    {selected && <div className="drawer-overlay" onClick={() => setSelected(null)}><section className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Tab') { const focusable = [...e.currentTarget.querySelectorAll('button:not(:disabled),a[href],select:not(:disabled),textarea:not(:disabled)')]; const first = focusable[0], last = focusable.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}><div className="drawer-header"><span className="eyebrow">DÉTAIL DE L’OPPORTUNITÉ</span><button autoFocus className="icon-button" onClick={() => setSelected(null)} aria-label="Fermer le détail"><X size={20}/></button></div><span className="badge">{selected.source} · {selected.reference}</span><h2 id="drawer-title">{selected.title}</h2><p className="buyer">{selected.buyer}</p><div className="detail-dates"><div><span>Publication</span><strong>{date(selected.published)}</strong></div><div><span>Échéance</span><strong>{date(selected.deadline)}</strong></div></div><div className="drawer-section"><h3>Qualification commerciale</h3><label>Statut<select disabled={!ready || saving} value={state.records[selected.id]?.status || 'À examiner'} onChange={e => updateRecord(selected, { status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><label>Notes de l’équipe<textarea value={note} maxLength={4000} onChange={e => setNote(e.target.value)} placeholder="Pertinence produit, contact, prochaine action…" rows={4}/></label><button className="button primary" disabled={!ready || saving} onClick={() => updateRecord(selected, { note })}>{saving ? 'Enregistrement…' : 'Enregistrer le suivi'}<Check size={16}/></button>{!ready && <p className="muted-text">La sauvegarde n’est pas disponible. Vérifiez la connexion dans les paramètres.</p>}</div>{state.records[selected.id] && <button className="text-button remove-record" disabled={!ready || saving} onClick={() => { const records = { ...state.records }; delete records[selected.id]; persist({ ...state, records }); }}><Trash2 size={14}/> Retirer du suivi</button>}<div className="drawer-section"><h3>Texte disponible dans l’avis</h3><p className="description">{selected.description || 'Aucune description disponible. Consultez l’avis d’origine.'}</p></div><div className="drawer-links">{(selected.links || [selected]).map((l,i) => <a key={i} className="button secondary" href={safeLink(l.url)} target="_blank" rel="noreferrer">Consulter sur {l.source}<ExternalLink size={15}/></a>)}</div></section></div>}
    {saveDialog && <div className="modal-overlay"><form className="modal" onSubmit={saveSearch} role="dialog" aria-modal="true" aria-labelledby="save-title"><button type="button" className="icon-button modal-close" onClick={() => setSaveDialog(false)} aria-label="Fermer"><X size={20}/></button><h2 id="save-title">Enregistrer cette recherche</h2><p>Vous pourrez relancer ces critères depuis « Mes recherches ».</p><label>Nom de la recherche<input autoFocus required maxLength={100} value={searchName} onChange={e => setSearchName(e.target.value)}/></label><button className="button primary" disabled={saving || !searchName.trim()}>Enregistrer <Check size={16}/></button></form></div>}
  </div>;
}
function Stat({ label, value, subtitle, icon, warm }) { return <div className={`stat ${warm ? 'warm' : ''}`}><div>{label}<span>{icon}</span></div><strong>{value}</strong><small>{subtitle}</small></div>; }
function Filter({ label, value, onChange, items }) { return <label className="filter"><span>{label}</span><div><select value={value} onChange={e => onChange(e.target.value)}>{items.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select><ChevronDown size={14}/></div></label>; }
createRoot(document.getElementById('root')).render(<App/>);
