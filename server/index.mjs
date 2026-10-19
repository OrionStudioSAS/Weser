import express from 'express';
import { configureApp } from './app.mjs';
const production = process.argv.includes('--production');
const app = express();
app.use(express.json({ limit: '800kb' }));
configureApp(app, { production });
if (!production) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT) || 5173;
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Weser — http://localhost:${port}`));
