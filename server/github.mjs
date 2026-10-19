const empty = () => ({ version: 1, records: {}, searches: [] });
export class StorageError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }
export function createStore(config = process.env, request = fetch) {
  const { GITHUB_TOKEN: token, GITHUB_OWNER: owner, GITHUB_REPO: repo, GITHUB_BRANCH: branch = 'main', GITHUB_DATA_PATH: path = 'data/veille.json' } = config;
  const enabled = Boolean(token && owner && repo);
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const fileURL = `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  async function api(url, init = {}) {
    try { return await request(url, { ...init, signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...init.headers } }); }
    catch { throw new StorageError('Connexion à GitHub impossible. Aucune modification sauvegardée.'); }
  }
  async function ensurePrivate() {
    if (!enabled) throw new StorageError('GitHub non configuré. Renseignez les variables serveur du fichier .env.', 503);
    const res = await api(base);
    if (!res.ok) throw new StorageError(`Accès au dépôt GitHub refusé (HTTP ${res.status}). Vérifiez la configuration.`, 503);
    const repository = await res.json();
    if (!repository.private) throw new StorageError('La sauvegarde nécessite un dépôt GitHub privé.', 503);
  }
  async function read() {
    await ensurePrivate();
    const response = await api(`${fileURL}?ref=${encodeURIComponent(branch)}`);
    if (response.status === 404) {
      // Une branche manquante ne doit pas passer pour un fichier absent.
      const check = await api(`${base}/branches/${encodeURIComponent(branch)}`);
      if (!check.ok) throw new StorageError('Branche GitHub introuvable. Créez-la ou corrigez GITHUB_BRANCH.', 503);
      return { state: empty(), revision: null };
    }
    if (!response.ok) throw new StorageError(`Lecture GitHub impossible (HTTP ${response.status}).`);
    const file = await response.json();
    try {
      const state = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      validateState(state);
      return { state, revision: file.sha };
    } catch { throw new StorageError('Le fichier de veille est invalide. Il n’a pas été modifié.', 503); }
  }
  async function write(state, revision) {
    validateState(state);
    const current = await read();
    if (current.revision !== revision) throw new StorageError('La veille a été modifiée dans une autre session. Rechargez les données avant de réessayer.', 409);
    const response = await api(fileURL, { method: 'PUT', body: JSON.stringify({ message: 'Mettre à jour la veille Weser', branch, content: Buffer.from(JSON.stringify(state, null, 2) + '\n').toString('base64'), ...(revision ? { sha: revision } : {}) }) });
    if ([409, 422].includes(response.status)) throw new StorageError('Conflit de sauvegarde. Rechargez les données avant de réessayer.', 409);
    if (!response.ok) throw new StorageError(`Sauvegarde GitHub impossible (HTTP ${response.status}).`);
    const data = await response.json();
    return { state, revision: data.content.sha };
  }
  return { enabled, read, write };
}
export function validateState(state) {
  if (!state || state.version !== 1 || !state.records || Array.isArray(state.records) || typeof state.records !== 'object' || !Array.isArray(state.searches)) throw new StorageError('Format de sauvegarde invalide.', 400);
  if (JSON.stringify(state).length > 700000 || Object.keys(state.records).length > 300 || state.searches.length > 30) throw new StorageError('Limite de stockage atteinte (300 opportunités, 30 recherches).', 400);
  for (const [id, record] of Object.entries(state.records)) {
    if (!/^(BOAMP|TED):[\w-]+$/.test(id) || !record || !['À examiner', 'Pertinent', 'Écarté', 'Traité'].includes(record.status) || typeof record.favorite !== 'boolean' || typeof record.note !== 'string' || record.note.length > 4000 || !record.notice || record.notice.id !== id) throw new StorageError('Opportunité invalide.', 400);
  }
  for (const s of state.searches) if (!s || typeof s.id !== 'string' || typeof s.name !== 'string' || s.name.length > 100 || !s.filters || typeof s.filters !== 'object') throw new StorageError('Recherche enregistrée invalide.', 400);
}
