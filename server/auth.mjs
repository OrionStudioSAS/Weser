import express from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const cookieName = 'weser_session';
const lifetime = 8 * 60 * 60;
const same = (a, b) => {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};
function loginPage(error = '') {
  // Aucun identifiant saisi n'est réinjecté dans la page.
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion — Weser</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f6f7f2;color:#243b32;font:15px system-ui,sans-serif}.card{width:100%;max-width:430px;padding:40px;background:white;border:1px solid #dfe5da;border-radius:12px;box-shadow:0 15px 60px #20392f08}.brand{font:bold 47px Georgia,serif;letter-spacing:-3px;color:#264a3b}.eyebrow{font-size:10px;letter-spacing:2px;color:#86967d;margin:30px 0 12px}h1{font-size:26px;font-weight:600;letter-spacing:-.8px;margin:0 0 12px}p{font-size:13px;color:#819075;line-height:1.7}label{display:block;font-size:12px;margin-top:22px;color:#526947}input{display:block;width:100%;margin-top:9px;padding:13px;border:1px solid #d7e0ce;border-radius:5px;font:inherit;color:#294832}input:focus{outline:2px solid #64835a;outline-offset:2px}button{display:block;width:100%;margin-top:28px;padding:14px;border:0;border-radius:5px;background:#294c3f;color:white;font:600 13px system-ui;cursor:pointer}button:hover{background:#1e3c30}.error{padding:12px;background:#fff0eb;color:#9a5545;border-radius:5px;font-size:12px;line-height:1.7;margin-top:20px}.foot{font-size:10px;margin-top:22px;color:#93a087;text-align:center}</style></head><body><main class="card"><div class="brand">weser<sup style="font:12px system-ui;vertical-align:top;letter-spacing:0">®</sup></div><div class="eyebrow">ESPACE COMMERCIAL</div><h1>Bienvenue dans votre veille.</h1><p>Connectez-vous pour retrouver les appels d’offres et le suivi de votre équipe.</p>${error ? `<div class="error" role="alert">${error}</div>` : ''}<form method="post" action="/auth/login"><label for="username">Identifiant</label><input id="username" name="username" autocomplete="username" required maxlength="200" autofocus><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1000"><button type="submit">Se connecter</button></form><div class="foot">WESER · Administration commerciale</div></main></body></html>`;
}
export function installAdminAuth(app, { production, env }) {
  const username = env.ADMIN_USER || 'weser', password = env.ADMIN_PASSWORD;
  const sign = value => createHmac('sha256', password).update(`weser-session-v1:${username}:${value}`).digest('base64url');
  const attempts = new Map(); // Limite par instance ; aucune donnée durable en mémoire.
  const validOrigin = req => !req.headers.origin || req.headers.origin === (env.APP_ORIGIN || `${env.VERCEL ? 'https' : req.protocol}://${req.get('host')}`);
  const cookie = (req, value, maxAge) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.VERCEL || req.secure || env.APP_ORIGIN?.startsWith('https://') ? '; Secure' : ''}`;
  const isAuthenticated = req => {
    if (!password) return !production;
    const token = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!token || token.length > 500) return false;
    const parts = token.split('.');
    if (parts.length !== 2 || !same(sign(parts[0]), parts[1])) return false;
    try {
      const session = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      return Number.isFinite(session.exp) && session.exp > Date.now() / 1000 && session.exp <= Date.now() / 1000 + lifetime + 5;
    } catch { return false; }
  };
  app.get('/login', (req, res) => {
    if (isAuthenticated(req)) return res.redirect(303, '/');
    res.type('html').send(loginPage());
  });
  app.post('/auth/login', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    if (!validOrigin(req)) return res.status(403).type('html').send(loginPage('Origine de connexion refusée. Ouvrez le site depuis son adresse habituelle.'));
    if (!password) return res.redirect(303, '/');
    const now = Date.now();
    for (const [key, record] of attempts) if (record.until < now) attempts.delete(key);
    const key = req.ip;
    const record = attempts.get(key);
    if (record && record.count >= 10) return res.status(429).set('Retry-After', String(Math.ceil((record.until - now) / 1000))).type('html').send(loginPage('Trop de tentatives. Réessayez dans quelques minutes.'));
    const suppliedUser = typeof req.body?.username === 'string' ? req.body.username : '';
    const suppliedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    const validUser = same(suppliedUser, username), validPassword = same(suppliedPassword, password);
    if (!validUser || !validPassword) {
      if (attempts.size < 5000 || attempts.has(key)) attempts.set(key, { count: (record?.count || 0) + 1, until: record?.until || now + 10 * 60 * 1000 });
      return res.status(401).type('html').send(loginPage('Identifiant ou mot de passe incorrect.'));
    }
    attempts.delete(key);
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + lifetime, nonce: randomBytes(18).toString('base64url') })).toString('base64url');
    res.setHeader('Set-Cookie', cookie(req, `${payload}.${sign(payload)}`, lifetime));
    res.redirect(303, '/');
  });
  app.post('/auth/logout', (req, res) => {
    if (!validOrigin(req)) return res.status(403).json({ error: 'Origine refusée.' });
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    res.redirect(303, '/login');
  });
  app.use((req, res, next) => {
    if (isAuthenticated(req)) return next();
    if (req.path === '/api' || req.path.startsWith('/api/')) return res.status(401).json({ error: 'Session expirée ou absente. Rechargez la page pour vous connecter.' });
    res.redirect(303, '/login');
  });
}
