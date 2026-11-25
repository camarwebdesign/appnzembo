const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'server', '.env') });

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3001;
const app = express();

const { renderAppHtmlWithSeo, buildAppSitemapXml } = require('./server/seo');

async function sendAppView(req, res) {
  try {
    const html = await renderAppHtmlWithSeo(req, PUBLIC_DIR, backendServer);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    return res.sendFile(path.join(PUBLIC_DIR, 'app.html'));
  }
}

// Endpoint client env.local.js (sert le fichier local en dev, ou expose la config publique depuis process.env en production)
app.get('/env.local.js', (_req, res) => {
  const localEnvFile = path.join(PUBLIC_DIR, 'env.local.js');
  if (fs.existsSync(localEnvFile)) {
    return res.sendFile(localEnvFile);
  }
  const clientEnv = {
    BACKEND_URL: (process.env.BACKEND_URL || '').trim(),
    SUPABASE_URL: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xmkdtbwurwtigkdjehhz.supabase.co').trim(),
    SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhta2R0Ynd1cnd0aWdrZGplaGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzU2NTEsImV4cCI6MjEwOTkxMTY1MX0.Yt9RqMgyHgQIbqK7SHZRgaAgltjQELZtylqGc1kM--Y').trim(),
    ENGINE_BEARER_TOKEN: (
      process.env.ENGINE_BEARER_TOKEN ||
      process.env.NEXT_PUBLIC_ENGINE_BEARER_TOKEN ||
      process.env.SUNO_BEARER_TOKEN ||
      process.env.SUNO_API_KEY ||
      '6114d500a8a51a212812c2d3832d5dc5'
    ).trim()
  };
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(`window.__NZEMBO_ENV__ = ${JSON.stringify(clientEnv)};`);
});

// Montage des routes API Backend existantes (Neon DB, SasPay, Proxy Moteur Audio) sans altérer req.rawBody
let backendServer = null;
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

if (!backendServer) {
  app.use('/api', express.json({ limit: '30mb' }));
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Nzembo App Studio (app.nzembo.net)',
      database: 'not_configured',
      engine: Boolean(process.env.SUNO_API_KEY || process.env.SUNO_BEARER_TOKEN || process.env.ENGINE_BEARER_TOKEN)
    });
  });

  // Garantir que le proxy moteur audio reste opérationnel même sans DATABASE_URL
  const SUNO_HOSTS = ['https://api.sunoapi.org/api/v1', 'https://apibox.erweima.ai/api/v1'];
  app.all('/api/engine/*', async (req, res) => {
    const key = (process.env.SUNO_API_KEY || process.env.SUNO_BEARER_TOKEN || process.env.ENGINE_BEARER_TOKEN || '6114d500a8a51a212812c2d3832d5dc5').trim();
    if (!key) return res.status(500).json({ code: 500, msg: 'Clé moteur non configurée.' });
    const subPath = String(req.originalUrl || req.url).replace(/^\/api\/engine/, '') || '/';
    const cleanSub = subPath.startsWith('/') ? subPath : `/${subPath}`;
    if (cleanSub === '/upload-base64' && req.method.toUpperCase() === 'POST') {
      try {
        const { base64Data, uploadPath = 'nzembo/audio', fileName = `audio_${Date.now()}.mp3` } = req.body || {};
        const r = await fetch('https://sunoapiorg.redpandaai.co/api/file-base64-upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data, uploadPath, fileName }),
        });
        return res.status(r.status).json(await r.json().catch(() => ({})));
      } catch (e) {
        return res.status(502).json({ success: false, error: e.message });
      }
    }
    for (const host of SUNO_HOSTS) {
      try {
        const opts = { method: req.method, headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          opts.headers['Content-Type'] = 'application/json';
          opts.body = JSON.stringify(req.body || {});
        }
        const upstream = await fetch(`${host}${cleanSub === '/health' ? '/generate/credit' : cleanSub}`, opts);
        const parsed = await upstream.json().catch(() => ({}));
        if (upstream.ok || upstream.status === 400 || upstream.status === 429) return res.status(upstream.status).json(parsed);
      } catch {}
    }
    return res.status(502).json({ code: 502, msg: 'Moteur injoignable.' });
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

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain; charset=utf-8');
  return res.sendFile(path.join(PUBLIC_DIR, 'robots.txt'));
});

app.get(['/sitemap.xml', '/api/sitemap.xml'], async (_req, res) => {
  try {
    const xml = await buildAppSitemapXml(backendServer);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.send(xml);
  } catch (err) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://app.nzembo.net/</loc></url></urlset>`);
  }
});

app.use(express.static(PUBLIC_DIR, { index: false }));
app.get(['/', '/explorer', '/tarifs', '/studio', '/decouvrir', '/auth/callback', '/callback', '/app', '/app/*', '/invite', '/invite/*', '/share', '/share/*'], sendAppView);

app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api/') && !path.extname(req.path)) {
    return sendAppView(req, res);
  }
  return next();
});

if (require.main === module) {
  const startServer = () => {
    app.listen(PORT, () => {
      console.log(`🎵 [Nzembo Studio - app.nzembo.net] Actif sur http://localhost:${PORT}`);
    });
  };
  if (backendServer && typeof backendServer.ensureDbReady === 'function') {
    backendServer.ensureDbReady().catch((err) => {
      console.error('❌ [DB Init Error]:', err.message);
    }).finally(startServer);
  } else {
    startServer();
  }
}

module.exports = app;
