import { installAdminAuth } from './auth.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from './search.mjs';
import { createStore } from './github.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Partagé entre le serveur local et le point d’entrée Express de Vercel.
export function configureApp(app, { production = true, env = process.env, store = createStore(env) } = {}) {
  const password = env.ADMIN_PASSWORD;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'private, no-store');
    const isAPI = req.path === '/api' || req.path.startsWith('/api/');
    if (production && !password) {
      const error = 'Configuration serveur incomplète : renseignez ADMIN_PASSWORD puis redéployez.';
      return isAPI ? res.status(503).json({ error }) : res.status(503).type('text').send(error);
    }
    next();
  });
  installAdminAuth(app, { production, env });
  app.use('/api', (req, res, next) => {
    const origin = env.APP_ORIGIN || `${env.VERCEL ? 'https' : req.protocol}://${req.get('host')}`;
    if (req.method === 'PUT' && req.headers.origin && req.headers.origin !== origin) return res.status(403).json({ error: 'Origine refusée.' });
    next();
  });
  // express.json() est fourni par le point d’entrée pour garder Vite hors du bundle de production.
  app.get('/api/config', (_req, res) => res.json({ githubConfigured: store.enabled, protected: Boolean(password) }));
  app.get('/api/search', async (req, res, next) => { try { res.json(await search(req.query)); } catch (e) { next(e); } });
  app.get('/api/state', async (_req, res, next) => { try { res.json(await store.read()); } catch (e) { next(e); } });
  app.put('/api/state', async (req, res, next) => { try { res.json(await store.write(req.body.state, req.body.revision ?? null)); } catch (e) { next(e); } });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue.' }));
  if (production) {
    // Vercel ignore express.static(). sendFile() conserve la protection d’accès,
    // y compris pour le build React inclus dans le bundle de la fonction.
    app.get('/assets/{*asset}', (req, res, next) => res.sendFile(req.path.slice(1), { root: path.join(root, 'dist'), dotfiles: 'deny' }, error => { if (error) next(error); }));
    app.get('/{*page}', (_req, res, next) => res.sendFile(path.join(root, 'dist/index.html'), error => { if (error) next(error); }));
  }
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Une erreur est survenue. Réessayez.' });
  });
  return app;
}
