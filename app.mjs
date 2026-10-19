import express from 'express';
import { configureApp } from './server/app.mjs';

// Point d’entrée reconnu par Vercel : aucune écoute de port ni import de Vite.
const app = express();
app.use(express.json({ limit: '800kb' }));
configureApp(app, { production: true });
export default app;
