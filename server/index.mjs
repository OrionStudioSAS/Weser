import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from './search.mjs';
import { createStore } from './github.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const app = express();
const store = createStore();
const user = process.env.ADMIN_USER || 'weser', password = process.env.ADMIN_PASSWORD;
if (production && !password) throw new Error('ADMIN_PASSWORD est obligatoire en production.');
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (!password) return next();
  const expected = Buffer.from(`${user}:${password}`);
  const supplied = Buffer.from(req.headers.authorization?.startsWith('Basic ') ? req.headers.authorization.slice(6) : '', 'base64');
  if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Weser administration", charset="UTF-8"');
  return res.status(401).send('Authentification requise.');
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'PUT' && req.headers.origin && req.headers.origin !== (process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`)) return res.status(403).json({ error: 'Origine refusée.' });
  next();
});
app.use(express.json({ limit: '800kb' }));
app.get('/api/config', (_req, res) => res.json({ githubConfigured: store.enabled, protected: Boolean(password) }));
app.get('/api/search', async (req, res, next) => { try { res.json(await search(req.query)); } catch (e) { next(e); } });
app.get('/api/state', async (_req, res, next) => { try { res.json(await store.read()); } catch (e) { next(e); } });
app.put('/api/state', async (req, res, next) => { try { res.json(await store.write(req.body.state, req.body.revision ?? null)); } catch (e) { next(e); } });
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue.' }));
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Une erreur est survenue. Réessayez.' }));
if (production) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT) || 5173;
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Weser — http://localhost:${port}${store.enabled ? ' · GitHub configuré' : ' · sauvegarde locale au navigateur'}`));
