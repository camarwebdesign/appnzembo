const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'server', '.env') });

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const app = express();

function sendAppView(_req, res) {
  return res.sendFile(path.join(PUBLIC_DIR, 'app.html'));
}

// Endpoint client env.local.js (sert le fichier local en dev, ou expose la config publique depuis process.env en production)
app.get('/env.local.js', (_req, res) => {
  const localEnvFile = path.join(PUBLIC_DIR, 'env.local.js');
  if (fs.existsSync(localEnvFile)) {
    return res.sendFile(localEnvFile);
  }
  const clientEnv = {
    BACKEND_URL: process.env.BACKEND_URL || '',
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    ENGINE_BEARER_TOKEN: process.env.ENGINE_BEARER_TOKEN || process.env.NEXT_PUBLIC_ENGINE_BEARER_TOKEN || ''
  };
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(`window.__NZEMBO_ENV__ = ${JSON.stringify(clientEnv)};`);
});

// Montage des routes API Backend existantes (SasPay, Neon DB, Suno, Auth) sans altérer req.rawBody
let backendServer = null;
if (process.env.DATABASE_URL) {
  try {
    backendServer = require('./server/server');
    app.use('/api', async (_req, _res, next) => {
      if (backendServer && typeof backendServer.ensureDbReady === 'function') {
        await backendServer.ensureDbReady().catch(() => {});
      }
      next();
    });
    app.use(backendServer.app);
  } catch (err) {
    console.warn('⚠️ Backend DB non monté au démarrage:', err.message);
  }
}

if (!backendServer) {
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Nzembo Studio Application (app.nzembo.net)',
      database: 'not_configured'
    });
  });
  app.all('/api/*', (_req, res) => {
    res.status(503).json({
      success: false,
      error: 'DATABASE_URL non configurée pour cet environnement.'
    });
  });
}

// Repli compatibilité pour les assets demandés sous /public/* ou /app/*
app.get(['/public/:asset', '/app/:asset'], (req, res, next) => {
  const safeName = path.basename(req.params.asset || '');
  if (!safeName || !safeName.includes('.') || safeName.endsWith('.html')) {
    return next();
  }
  const candidate = path.join(PUBLIC_DIR, safeName);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return res.sendFile(candidate);
  }
  return next();
});

// Service des fichiers statiques (index désactivé pour contrôler le routage SPA)
app.use(express.static(PUBLIC_DIR, { index: false }));

// Routes principales du Studio utilisateur
app.get(['/', '/app', '/app/*', '/invite/*'], sendAppView);

// Fallback SPA (hors /api et fichiers statiques avec extension)
app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api/') && !path.extname(req.path)) {
    return sendAppView(req, res);
  }
  return next();
});

if (require.main === module) {
  const startServer = () => {
    app.listen(PORT, () => {
      console.log(`🎧 [Nzembo Studio - app.nzembo.net] Actif sur http://localhost:${PORT}`);
    });
  };
  if (backendServer && typeof backendServer.ensureDbReady === 'function') {
    backendServer.ensureDbReady().then(startServer).catch(startServer);
  } else {
    startServer();
  }
}

module.exports = app;
