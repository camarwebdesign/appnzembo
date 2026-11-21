const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const { pool, query, initDb } = require('./db');
const { registerSaspayRoutes } = require('./saspay');
const { renderOtpEmailHtml, renderCollabInviteEmailHtml, sendNzemboEmail } = require('./emails');

const app = express();
const PORT = process.env.PORT || 3000;
const SUNO_HOSTS = ['https://api.sunoapi.org/api/v1', 'https://apibox.erweima.ai/api/v1'];
const FILE_UPLOAD_BASE = 'https://sunoapiorg.redpandaai.co/api';

const DEFAULT_SUPABASE_URL = 'https://xmkdtbwurwtigkdjehhz.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhta2R0Ynd1cnd0aWdrZGplaGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzU2NTEsImV4cCI6MjEwOTkxMTY1MX0.Yt9RqMgyHgQIbqK7SHZRgaAgltjQELZtylqGc1kM--Y';

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();
  return { url, anonKey };
}

function getEngineApiKey() {
  return (process.env.SUNO_API_KEY || process.env.SUNO_BEARER_TOKEN || process.env.ENGINE_BEARER_TOKEN || '').trim();
}

app.use(cors());
app.use(express.json({
  limit: '30mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

let dbInitPromise = null;
function ensureDbReady() {
  if (!dbInitPromise) {
    dbInitPromise = initDb().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

if (require.main === module) {
  ensureDbReady().catch((err) => {
    console.error('❌ [Startup DB Init Warning]:', err.message);
  });
}

// Vérification cryptographique d'un token Supabase JWT auprès de Supabase Auth API
async function verifySupabaseJwt(authHeader) {
  const header = String(authHeader || '').trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) return null;

  try {
    const resp = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) return null;
    const user = await resp.json().catch(() => null);
    if (!user || !user.id || !user.email) return null;
    return { ...user, accessToken: token };
  } catch {
    return null;
  }
}

const ROLE_DEFAULT_PERMISSIONS = {
  super_admin: { overview: true, users: true, finances: true, promos: true, songs: true, messages: true, affiliation: true, traffic: true, team: true },
  admin: { overview: true, users: true, finances: true, promos: true, songs: true, messages: true, affiliation: true, traffic: true, team: true },
  finance: { overview: true, users: false, finances: true, promos: true, songs: false, messages: false, affiliation: true, traffic: false, team: false },
  moderator: { overview: true, users: true, finances: false, promos: false, songs: true, messages: true, affiliation: false, traffic: true, team: false },
  support: { overview: true, users: true, finances: false, promos: false, songs: true, messages: true, affiliation: true, traffic: false, team: false },
  collaborator: { overview: true, users: true, finances: false, promos: false, songs: true, messages: true, affiliation: false, traffic: true, team: false },
};

function requireAdminAuth(requiredPerm = null) {
  return async (req, res, next) => {
    try {
      await ensureDbReady();
      const sbUser = await verifySupabaseJwt(req.headers.authorization);
      if (!sbUser) {
        return res.status(401).json({ success: false, error: 'Authentification requise.' });
      }
      const resCol = await query(
        `SELECT * FROM admin_collaborators WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [sbUser.email]
      );
      if (!resCol.rows || resCol.rows.length === 0) {
        return res.status(403).json({ success: false, error: 'Accès refusé : compte non autorisé dans l\'administration.' });
      }
      const collab = resCol.rows[0];
      if (collab.status === 'revoked') {
        return res.status(403).json({ success: false, error: 'Accès révoqué par l\'administrateur principal.' });
      }
      if (collab.status === 'invited' || !collab.supabase_user_id) {
        await query(
          `UPDATE admin_collaborators SET status = 'active', supabase_user_id = $2, updated_at = NOW() WHERE id = $1`,
          [collab.id, sbUser.id]
        );
        collab.status = 'active';
        collab.supabase_user_id = sbUser.id;
      }

      const perms = (collab.permissions && typeof collab.permissions === 'object')
        ? collab.permissions
        : (ROLE_DEFAULT_PERMISSIONS[collab.role] || ROLE_DEFAULT_PERMISSIONS.collaborator);

      if (requiredPerm && collab.role !== 'super_admin' && !perms[requiredPerm]) {
        return res.status(403).json({ success: false, error: `Permission « ${requiredPerm} » requise.` });
      }

      req.adminUser = {
        id: collab.id,
        supabaseUserId: sbUser.id,
        email: sbUser.email,
        name: collab.name || sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email.split('@')[0],
        role: collab.role,
        permissions: collab.role === 'super_admin' ? ROLE_DEFAULT_PERMISSIONS.super_admin : perms,
        accessToken: sbUser.accessToken,
      };
      next();
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };
}

// ======================= PROXY MOTEUR AUDIO UNIVERSEL (/api/engine/*) =======================
function registerEngineProxyRoutes(targetApp) {
  // Vérification santé moteur
  targetApp.get('/api/engine/health', async (_req, res) => {
    const key = getEngineApiKey();
    if (!key) {
      return res.status(500).json({ success: false, connected: false, error: 'Clé moteur non configurée sur le serveur.' });
    }
    for (const host of SUNO_HOSTS) {
      try {
        const r = await fetch(`${host}/generate/credit`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data && data.code === 200) {
          return res.json({ success: true, connected: true, credits: data.data });
        }
      } catch {}
    }
    return res.status(502).json({ success: false, connected: false, error: 'Moteur musical temporairement injoignable.' });
  });

  // Upload fichier audio Base64 sans CORS client ni exposition du token
  targetApp.post('/api/engine/upload-base64', async (req, res) => {
    try {
      const key = getEngineApiKey();
      if (!key) return res.status(500).json({ success: false, error: 'Clé moteur absente côté serveur.' });
      const { base64Data, uploadPath = 'nzembo/audio', fileName = `audio_${Date.now()}.mp3` } = req.body || {};
      if (!base64Data) return res.status(400).json({ success: false, error: 'base64Data requis.' });

      const r = await fetch(`${FILE_UPLOAD_BASE}/file-base64-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64Data, uploadPath, fileName }),
      });
      const json = await r.json().catch(() => ({}));
      return res.status(r.status).json(json);
    } catch (err) {
      return res.status(502).json({ success: false, error: err.message });
    }
  });

  // Proxy universel vers tous les endpoints Suno (/generate, /upload-cover, /add-vocals, /add-instrumental, /lyrics, /vocal-removal, /mp4, /wav, /suno/cover, /voice/*)
  targetApp.all('/api/engine/*', async (req, res) => {
    const key = getEngineApiKey();
    if (!key) {
      return res.status(500).json({ code: 500, success: false, msg: 'Moteur audio non configuré côté serveur.' });
    }
    const subPath = String(req.originalUrl || req.url).replace(/^\/api\/engine/, '') || '/';
    const cleanSub = subPath.startsWith('/') ? subPath : `/${subPath}`;
    const method = req.method.toUpperCase();

    let lastStatus = 502;
    let lastPayload = { code: 502, msg: 'Service moteur indisponible.' };

    for (const host of SUNO_HOSTS) {
      try {
        const fetchOpts = {
          method,
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
          },
        };
        if (method !== 'GET' && method !== 'HEAD') {
          fetchOpts.headers['Content-Type'] = 'application/json';
          fetchOpts.body = JSON.stringify(req.body || {});
        }
        const upstream = await fetch(`${host}${cleanSub}`, fetchOpts);
        const text = await upstream.text();
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { msg: text }; }
        lastStatus = upstream.status;
        lastPayload = parsed;
        if (upstream.ok || upstream.status === 400 || upstream.status === 422 || upstream.status === 429) {
          return res.status(upstream.status).json(parsed);
        }
      } catch (err) {
        lastPayload = { code: 502, msg: err.message };
      }
    }
    return res.status(lastStatus).json(lastPayload);
  });
}

registerEngineProxyRoutes(app);

// ======================= ROUTES EXISTANTES COMPATIBILITÉ =======================
app.get('/api/health', async (_req, res) => {
  try {
    await ensureDbReady();
    const dbCheck = await query('SELECT NOW() AS time');
    return res.json({ status: 'ok', database: 'connected', engine: Boolean(getEngineApiKey()), time: dbCheck.rows[0].time });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Authentification / Synchronisation utilisateur vers Neon PostgreSQL (solde initial STRICTEMENT = 0)
app.post('/api/auth/login', async (req, res) => {
  try {
    await ensureDbReady();
    const { id, name, email, country, referral_code, referred_by } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const normEmail = String(email).trim().toLowerCase();

    const existing = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [normEmail]);
    if (existing.rows.length > 0) {
      return res.json({ user: existing.rows[0] });
    }

    const userId = id || 'usr_' + Date.now();
    const refCode = referral_code || 'NZ-' + Math.floor(10000 + Math.random() * 90000);
    const result = await query(
      `INSERT INTO users (id, name, email, credits, country, referral_code, referred_by)
       VALUES ($1, $2, $3, 0, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
       RETURNING *`,
      [userId, name || normEmail.split('@')[0], normEmail, country || 'RD Congo', refCode, referred_by || null]
    );
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Login sync error:', err);
    return res.status(500).json({ error: 'Erreur serveur base de données' });
  }
});

// Synchronisation utilisateur authentifié (Supabase -> Neon) avec protection solde 0 à l'inscription
app.post('/api/users/sync', async (req, res) => {
  try {
    await ensureDbReady();
    const sbUser = await verifySupabaseJwt(req.headers.authorization);
    const body = req.body || {};
    const uid = sbUser ? sbUser.id : String(body.id || '').trim();
    const email = (sbUser ? sbUser.email : String(body.email || '')).trim().toLowerCase();
    if (!uid || !email) {
      return res.status(400).json({ success: false, error: 'id et email requis.' });
    }

    const isNewSignup = Boolean(body.isNewSignup);
    const name = String(body.name || sbUser?.user_metadata?.full_name || sbUser?.user_metadata?.name || email.split('@')[0]).trim();
    const refCode = String(body.referral_code || sbUser?.user_metadata?.referral_code || ('NZ-' + uid.slice(0, 5).toUpperCase()));
    const referredBy = body.referred_by || sbUser?.user_metadata?.referral_code_used || null;

    const existing = await query(`SELECT * FROM users WHERE id = $1 OR LOWER(email) = LOWER($2) LIMIT 1`, [uid, email]);
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const upd = await query(
        `UPDATE users SET id = $1, name = COALESCE(NULLIF($2, ''), name), email = $3 WHERE id = $4 RETURNING *`,
        [uid, name, email, row.id]
      );
      return res.json({ success: true, user: upd.rows[0], credits: Number(upd.rows[0].credits) || 0 });
    }

    // Nouvel enregistrement : TOUJOURS initialiser à 0 crédit. Pour un compte historique préexistant, préserver ses crédits connus (sauf défaut 3 jamais rechargé sur compte tout neuf).
    let initialCredits = 0;
    if (!isNewSignup && sbUser) {
      const createdAtMs = new Date(sbUser.created_at || 0).getTime();
      const accountAgeSec = (Date.now() - createdAtMs) / 1000;
      const cand = Math.max(0, Number(body.existingProfileCredits) || 0);
      if (accountAgeSec > 300 && cand > 0) {
        initialCredits = cand;
      }
    }

    const ins = await query(
      `INSERT INTO users (id, name, email, credits, country, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
       RETURNING *`,
      [uid, name, email, initialCredits, body.country || 'RD Congo', refCode, referredBy]
    );
    return res.json({ success: true, user: ins.rows[0], credits: Number(ins.rows[0].credits) || 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Déduction atomique de crédits en base de données (bloque si solde insuffisant)
app.post('/api/credits/deduct', async (req, res) => {
  try {
    await ensureDbReady();
    const sbUser = await verifySupabaseJwt(req.headers.authorization);
    const body = req.body || {};
    const uid = sbUser ? sbUser.id : String(body.userId || '').trim();
    const email = (sbUser ? sbUser.email : String(body.email || '')).trim().toLowerCase();
    const cost = Math.max(0, parseInt(body.amount, 10) || 1);
    const reason = String(body.reason || 'Action studio').slice(0, 140);

    if (!uid && !email) {
      return res.status(401).json({ success: false, error: 'Utilisateur requis.' });
    }
    if (cost === 0) {
      const uRes = await query(`SELECT credits FROM users WHERE id = $1 OR LOWER(email) = LOWER($2) LIMIT 1`, [uid, email]);
      return res.json({ success: true, credits: uRes.rows[0] ? Number(uRes.rows[0].credits) : 0 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let uRes = await client.query(
        `SELECT id, credits FROM users WHERE id = $1 OR LOWER(email) = LOWER($2) LIMIT 1 FOR UPDATE`,
        [uid, email]
      );
      if (uRes.rows.length === 0) {
        const seedBal = (!sbUser || (Date.now() - new Date(sbUser.created_at || 0).getTime()) > 300000)
          ? Math.max(0, Number(body.fallbackCredits) || 0)
          : 0;
        const ins = await client.query(
          `INSERT INTO users (id, name, email, credits) VALUES ($1, $2, $3, $4) RETURNING id, credits`,
          [uid || ('usr_' + Date.now()), body.name || 'Créateur nZembo', email || `${uid}@users.nzembo.local`, seedBal]
        );
        uRes = ins;
      }

      const row = uRes.rows[0];
      const current = Math.max(0, Number(row.credits) || 0);
      if (current < cost) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          success: false,
          insufficient: true,
          credits: current,
          required: cost,
          error: `Solde insuffisant (${current} disponible, ${cost} requis).`,
        });
      }

      const upd = await client.query(
        `UPDATE users SET credits = credits - $1 WHERE id = $2 RETURNING credits`,
        [cost, row.id]
      );
      const nextCredits = Math.max(0, Number(upd.rows[0].credits) || 0);

      // Synchroniser aussi le solde Supabase profiles côté serveur avec le token utilisateur si disponible
      if (sbUser && sbUser.accessToken) {
        const { url, anonKey } = getSupabaseEnv();
        fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(sbUser.id)}`, {
          method: 'PATCH',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${sbUser.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ credits: nextCredits }),
        }).catch(() => {});
      }

      await client.query('COMMIT');
      return res.json({ success: true, credits: nextCredits, deducted: cost, reason });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Enregistrement création dans Neon PostgreSQL
app.post('/api/songs', async (req, res) => {
  try {
    await ensureDbReady();
    const s = req.body || {};
    if (!s.id && !s.taskId) return res.status(400).json({ success: false, error: 'id ou taskId requis.' });
    const rowId = String(s.id || s.taskId);
    await query(
      `INSERT INTO songs (id, user_id, title, style, occasion, recipient, lyrics, audio_url, video_url, cover_url, task_id, audio_id, tool_category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         title = COALESCE(NULLIF(EXCLUDED.title, ''), songs.title),
         audio_url = COALESCE(NULLIF(EXCLUDED.audio_url, ''), songs.audio_url),
         video_url = COALESCE(NULLIF(EXCLUDED.video_url, ''), songs.video_url),
         cover_url = COALESCE(NULLIF(EXCLUDED.cover_url, ''), songs.cover_url),
         lyrics = COALESCE(NULLIF(EXCLUDED.lyrics, ''), songs.lyrics),
         audio_id = COALESCE(NULLIF(EXCLUDED.audio_id, ''), songs.audio_id),
         status = COALESCE(NULLIF(EXCLUDED.status, ''), songs.status)`,
      [
        rowId,
        s.userId || s.user_id || '',
        s.title || 'Création nZembo',
        s.style || '',
        s.occasion || '',
        s.recipient || '',
        s.lyrics || '',
        s.audioUrl || s.audio_url || '',
        s.videoUrl || s.video_url || '',
        s.albumCover || s.coverUrl || s.cover_url || '',
        s.taskId || s.task_id || rowId,
        s.audioId || s.audio_id || '',
        s.toolCategory || s.tool_category || 'generation',
        s.status || 'processing',
      ]
    );
    return res.json({ success: true, id: rowId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Consulter profil utilisateur & stats
app.get('/api/users/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const { id } = req.params;
    const uRes = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (uRes.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const songsRes = await query('SELECT * FROM songs WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    return res.json({ user: uRes.rows[0], songs: songsRes.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Compatibilité génération musicale directe
app.post('/api/music/generate', async (req, res) => {
  try {
    await ensureDbReady();
    const apiKey = getEngineApiKey();
    const { userId, title, prompt, style, occasion, recipient, lyrics, isInstrumental } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({ error: 'Clé moteur musical manquante dans .env' });
    }

    const payload = {
      customMode: true,
      style: style || 'Rumba Congolaise',
      instrumental: Boolean(isInstrumental),
      model: 'V6',
      prompt: lyrics || prompt,
      title: title || `Nzembo - ${recipient || occasion || 'Création'}`,
      callBackUrl: 'https://nzembo.net/api/webhook-noop',
    };

    let data = {};
    let upstreamOk = false;
    for (const host of SUNO_HOSTS) {
      try {
        const r = await fetch(`${host}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
        data = await r.json().catch(() => ({}));
        if (r.ok && data.code === 200 && data.data && data.data.taskId) {
          upstreamOk = true;
          break;
        }
      } catch {}
    }

    if (!upstreamOk || !data.data || !data.data.taskId) {
      return res.status(400).json({ error: data.msg || 'Échec de génération musicale' });
    }

    const taskId = data.data.taskId;
    const songId = 'nz-' + Date.now();

    if (userId) {
      await query(
        `INSERT INTO songs (id, user_id, title, style, occasion, recipient, lyrics, task_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing')`,
        [songId, userId, title || 'Nouvelle Chanson', style, occasion, recipient, lyrics, taskId]
      ).catch(() => {});
    }

    return res.json({ success: true, taskId, songId, eta: 120 });
  } catch (err) {
    console.error('Generation Error:', err);
    return res.status(500).json({ error: 'Erreur interne lors de la création' });
  }
});

app.get('/api/music/status/:taskId', async (req, res) => {
  try {
    await ensureDbReady();
    const { taskId } = req.params;
    const apiKey = getEngineApiKey();

    let data = {};
    for (const host of SUNO_HOSTS) {
      try {
        const r = await fetch(`${host}/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        data = await r.json().catch(() => ({}));
        if (data && data.data) break;
      } catch {}
    }

    if (!data || !data.data) {
      return res.json({ completed: false, status: 'IN_PROGRESS' });
    }

    const taskData = data.data;
    const status = taskData.status;

    if (status === 'SUCCESS' && taskData.response && taskData.response.sunoData) {
      const tracks = taskData.response.sunoData;
      const track1 = tracks[0] || {};
      const track2 = tracks[1] || {};
      const audioUrl1 = track1.audio_url || '';
      const audioUrl2 = track2.audio_url || null;
      const cover = track1.image_url || '';
      const cleanLyrics = track1.prompt || '';

      await query(
        `UPDATE songs SET audio_url = $1, cover_url = $2, status = 'completed', lyrics = COALESCE(NULLIF($3, ''), lyrics) WHERE task_id = $4`,
        [audioUrl1, cover, cleanLyrics, taskId]
      ).catch(() => {});

      return res.json({
        completed: true,
        status: 'COMPLETED',
        audioUrl: audioUrl1,
        audioUrl2,
        albumCover: cover,
        lyrics: cleanLyrics,
        duration: track1.duration || 180,
      });
    }

    if (status === 'GENERATE_AUDIO_FAILED' || status === 'CREATE_TASK_FAILED') {
      await query(`UPDATE songs SET status = 'failed' WHERE task_id = $1`, [taskId]).catch(() => {});
      return res.json({ completed: false, failed: true, error: taskData.errorMessage || 'Échec de génération' });
    }

    return res.json({ completed: false, status: status || 'IN_PROGRESS' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/songs/user/:userId', async (req, res) => {
  try {
    await ensureDbReady();
    const { userId } = req.params;
    const r = await query('SELECT * FROM songs WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.json({ songs: r.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ======================= ANALYTICS & NOTIFICATIONS INTERNES =======================
app.post('/api/analytics/visit', async (req, res) => {
  try {
    await ensureDbReady();
    const { sessionId, userId, referrerSource, deviceType, browser, country, path: visitPath } = req.body || {};
    const id = `vis_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await query(
      `INSERT INTO visit_events (id, session_id, user_id, referrer_source, device_type, browser, country, path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        String(sessionId || id).slice(0, 120),
        userId ? String(userId).slice(0, 120) : null,
        String(referrerSource || 'direct').slice(0, 80),
        String(deviceType || 'desktop').slice(0, 60),
        String(browser || 'Navigateur').slice(0, 60),
        String(country || 'International').slice(0, 100),
        String(visitPath || '/').slice(0, 255),
      ]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    await ensureDbReady();
    const userId = String(req.query.userId || '').trim();
    const r = await query(
      `SELECT * FROM user_notifications
       WHERE target = 'all' OR target = $1 OR user_id = $1
       ORDER BY created_at DESC LIMIT 80`,
      [userId || 'guest']
    );
    return res.json({ success: true, notifications: r.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    await ensureDbReady();
    const { userId, category = 'error', categoryLabel = 'Erreur / Alerte', badgeColor, title, subject = '', content, isError = true } = req.body || {};
    if (!title && !content) return res.status(400).json({ success: false, error: 'title ou content requis.' });
    const id = `notif_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const uid = String(userId || 'guest');
    const colBadge = badgeColor || (isError ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-amber-100 text-amber-800');
    await query(
      `INSERT INTO user_notifications (id, user_id, target, category, category_label, badge_color, title, subject, content, is_error)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, uid, category, categoryLabel, colBadge, String(title || 'Notification nZembo').slice(0, 250), String(subject).slice(0, 250), String(content || ''), Boolean(isError)]
    );
    return res.json({ success: true, id });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ======================= OTP CUSTOM MAILER (SI RESEND CONFIGURÉ) =======================
app.post('/api/auth/otp/send', async (req, res) => {
  try {
    await ensureDbReady();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const purpose = String(req.body?.purpose || 'auth').trim();
    const userName = String(req.body?.userName || '').trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse e-mail invalide.' });
    }
    if (!process.env.RESEND_API_KEY) {
      return res.json({ success: true, useSupabaseOtp: true, providerConfigured: false });
    }

    const code = String(crypto.randomInt(100000, 999999));
    const codeHash = crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
    const id = `otp_${crypto.randomUUID()}`;
    await query(`DELETE FROM otp_codes WHERE LOWER(email) = LOWER($1) AND purpose = $2`, [email, purpose]);
    await query(
      `INSERT INTO otp_codes (id, email, purpose, code_hash, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [id, email, purpose, codeHash]
    );

    const mail = renderOtpEmailHtml({ code, email, purpose, userName });
    const sentRes = await sendNzemboEmail({ to: email, ...mail });
    if (!sentRes.sent) {
      return res.json({ success: true, useSupabaseOtp: true, providerError: sentRes.error || 'fallback' });
    }
    return res.json({ success: true, useSupabaseOtp: false, sent: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/otp/verify', async (req, res) => {
  try {
    await ensureDbReady();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const purpose = String(req.body?.purpose || 'auth').trim();
    const code = String(req.body?.code || '').trim();
    if (!email || !code) return res.status(400).json({ success: false, error: 'E-mail et code requis.' });

    const r = await query(
      `SELECT * FROM otp_codes WHERE LOWER(email) = LOWER($1) AND purpose = $2 AND verified = FALSE ORDER BY created_at DESC LIMIT 1`,
      [email, purpose]
    );
    if (!r.rows || r.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun code actif pour cet e-mail. Redemande un code.' });
    }
    const row = r.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ success: false, error: 'Code expiré. Demande un nouveau code.' });
    }
    if (row.attempts >= 5) {
      return res.status(429).json({ success: false, error: 'Trop de tentatives. Demande un nouveau code.' });
    }

    const expectedHash = crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
    if (expectedHash !== row.code_hash) {
      await query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
      return res.status(400).json({ success: false, error: 'Code incorrect. Vérifie les 6 chiffres reçus.' });
    }

    await query(`UPDATE otp_codes SET verified = TRUE WHERE id = $1`, [row.id]);
    return res.json({ success: true, verified: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ======================= ROUTES ADMIN PROTÉGÉES SUPABASE + NEON =======================
// 1. Bootstrap Super Admin (strictement si aucun super_admin actif n'existe encore)
app.post('/api/admin/auth/bootstrap', async (req, res) => {
  try {
    await ensureDbReady();
    const sbUser = await verifySupabaseJwt(req.headers.authorization);
    if (!sbUser) {
      return res.status(401).json({ success: false, error: 'Session requise.' });
    }

    const existingAdmins = await query(`SELECT COUNT(*)::int AS c FROM admin_collaborators WHERE role = 'super_admin' AND status = 'active'`);
    const existingSelf = await query(`SELECT * FROM admin_collaborators WHERE LOWER(email) = LOWER($1) LIMIT 1`, [sbUser.email]);

    if (existingSelf.rows.length > 0) {
      const col = existingSelf.rows[0];
      if (col.status === 'revoked') {
        return res.status(403).json({ success: false, error: 'Accès révoqué.' });
      }
      await query(`UPDATE admin_collaborators SET status = 'active', supabase_user_id = $2, updated_at = NOW() WHERE id = $1`, [col.id, sbUser.id]);
      return res.json({ success: true, authorized: true, member: { ...col, status: 'active' } });
    }

    if (Number(existingAdmins.rows[0]?.c || 0) > 0) {
      return res.status(403).json({
        success: false,
        authorized: false,
        error: 'Un administrateur principal existe déjà. Demande-lui de t\'ajouter comme collaborateur.',
      });
    }

    const id = `adm_${crypto.randomUUID()}`;
    const name = String(req.body?.name || sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email.split('@')[0]).trim();
    const ins = await query(
      `INSERT INTO admin_collaborators (id, supabase_user_id, email, name, role, permissions, status, invited_by)
       VALUES ($1, $2, $3, $4, 'super_admin', $5::jsonb, 'active', 'system_bootstrap')
       RETURNING *`,
      [id, sbUser.id, sbUser.email.toLowerCase(), name, JSON.stringify(ROLE_DEFAULT_PERMISSIONS.super_admin)]
    );
    return res.json({ success: true, authorized: true, bootstrapped: true, member: ins.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Vérifier si un super_admin existe déjà (pour adapter le UI d'inscription Admin sans fuite de données)
app.get('/api/admin/auth/setup-status', async (_req, res) => {
  try {
    await ensureDbReady();
    const r = await query(`SELECT COUNT(*)::int AS c FROM admin_collaborators WHERE role = 'super_admin' AND status = 'active'`);
    return res.json({ success: true, needsBootstrap: Number(r.rows[0]?.c || 0) === 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/auth/me', requireAdminAuth(), async (req, res) => {
  return res.json({ success: true, authorized: true, user: req.adminUser });
});

// 2. Vue complète temps réel Admin (Neon + Supabase profiles & creations)
app.get('/api/admin/overview', requireAdminAuth('overview'), async (req, res) => {
  try {
    await ensureDbReady();
    const [uRes, sRes, txRes, payRes, wRes, promoRes, collabRes, visRes] = await Promise.all([
      query('SELECT id, name, email, credits, role, country, referral_code, referred_by, created_at FROM users ORDER BY created_at DESC'),
      query('SELECT * FROM songs ORDER BY created_at DESC LIMIT 200'),
      query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 200'),
      query('SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 200'),
      query('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 100'),
      query('SELECT * FROM promo_codes ORDER BY created_at DESC'),
      query('SELECT id, supabase_user_id, email, name, role, permissions, status, invited_by, created_at FROM admin_collaborators ORDER BY created_at ASC'),
      query('SELECT * FROM visit_events ORDER BY created_at DESC LIMIT 1000'),
    ]);

    // Lire également les profils et créations existants dans Supabase
    const { url: sbUrl, anonKey: sbKey } = getSupabaseEnv();
    const authHdr = { apikey: sbKey, Authorization: `Bearer ${req.adminUser.accessToken}` };
    let sbProfiles = [];
    let sbCreations = [];
    try {
      const [pr, cr] = await Promise.all([
        fetch(`${sbUrl}/rest/v1/profiles?select=*&order=created_at.desc&limit=500`, { headers: authHdr }),
        fetch(`${sbUrl}/rest/v1/creations?select=*&order=created_at.desc&limit=500`, { headers: authHdr }),
      ]);
      if (pr.ok) sbProfiles = await pr.json().catch(() => []);
      if (cr.ok) sbCreations = await cr.json().catch(() => []);
    } catch {}

    // Fusionner utilisateurs Neon + Supabase Profiles sans doublons
    const userMap = new Map();
    const songCountByUser = new Map();
    const spentByUser = new Map();

    // Compter créations fusionnées
    const songMap = new Map();
    for (const s of (sbCreations || [])) {
      const sid = String(s.task_id || s.id);
      if (s.user_id) songCountByUser.set(s.user_id, (songCountByUser.get(s.user_id) || 0) + 1);
      songMap.set(sid, {
        id: s.id,
        userId: s.user_id || '',
        title: s.title || 'Création Studio',
        style: s.style || '',
        occasion: s.occasion || '',
        recipient: s.recipient || '',
        toolCategory: s.tool_category || 'generation',
        audioUrl: s.audio_url || '',
        videoUrl: s.video_url || '',
        albumCover: s.album_cover || s.cover_url || '',
        status: s.status || (s.is_processing ? 'processing' : 'completed'),
        createdAt: s.created_at,
      });
    }
    for (const s of (sRes.rows || [])) {
      const sid = String(s.task_id || s.id);
      if (!songMap.has(sid)) {
        if (s.user_id) songCountByUser.set(s.user_id, (songCountByUser.get(s.user_id) || 0) + 1);
        songMap.set(sid, {
          id: s.id,
          userId: s.user_id || '',
          title: s.title || 'Création Studio',
          style: s.style || '',
          occasion: s.occasion || '',
          recipient: s.recipient || '',
          toolCategory: s.tool_category || 'generation',
          audioUrl: s.audio_url || '',
          videoUrl: s.video_url || '',
          albumCover: s.cover_url || '',
          status: s.status || 'completed',
          createdAt: s.created_at,
        });
      }
    }

    for (const tx of (txRes.rows || [])) {
      if (tx.user_id) {
        const cur = spentByUser.get(tx.user_id) || { usd: 0, cdf: 0 };
        cur.usd += Number(tx.amount_usd || 0);
        cur.cdf += Number(tx.amount_cdf || 0);
        spentByUser.set(tx.user_id, cur);
      }
    }

    for (const p of (sbProfiles || [])) {
      const key = String(p.email || p.id).toLowerCase();
      const sp = spentByUser.get(p.id) || { usd: 0, cdf: 0 };
      userMap.set(key, {
        id: p.id,
        name: p.name || (p.email ? p.email.split('@')[0] : 'Artiste'),
        email: p.email || '',
        country: 'International',
        credits: Math.max(0, Number(p.credits) || 0),
        songs: songCountByUser.get(p.id) || 0,
        spentUSD: +sp.usd.toFixed(2),
        spentCDF: Math.round(sp.cdf),
        referralCode: p.referral_code || '',
        referrals: 0,
        createdAt: p.created_at,
      });
    }

    for (const u of (uRes.rows || [])) {
      const key = String(u.email || u.id).toLowerCase();
      const sp = spentByUser.get(u.id) || { usd: 0, cdf: 0 };
      if (userMap.has(key)) {
        const prev = userMap.get(key);
        prev.country = u.country || prev.country;
        prev.spentUSD = +(Math.max(prev.spentUSD, sp.usd)).toFixed(2);
        prev.spentCDF = Math.max(prev.spentCDF, Math.round(sp.cdf));
        if (Number(u.credits) !== prev.credits && Number(u.credits) > prev.credits) {
          prev.credits = Number(u.credits);
        }
      } else {
        userMap.set(key, {
          id: u.id,
          name: u.name || u.email.split('@')[0],
          email: u.email,
          country: u.country || 'RD Congo',
          credits: Math.max(0, Number(u.credits) || 0),
          songs: songCountByUser.get(u.id) || 0,
          spentUSD: +sp.usd.toFixed(2),
          spentCDF: Math.round(sp.cdf),
          referralCode: u.referral_code || '',
          referrals: 0,
          createdAt: u.created_at,
        });
      }
    }

    const users = Array.from(userMap.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const songs = Array.from(songMap.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Mapper les transactions réelles (transactions + payment_transactions)
    const txList = (txRes.rows || []).map((t) => {
      const usr = users.find((u) => u.id === t.user_id);
      return {
        id: t.id,
        userId: t.user_id,
        client: usr ? usr.name : (t.user_id || 'Client nZembo'),
        pack: t.pack || 'Recharge Crédits',
        credits: Number(t.credits) || 0,
        amountUSD: Number(t.amount_usd) || 0,
        amountCDF: Number(t.amount_cdf) || 0,
        method: t.method || 'SasPay',
        status: t.status || 'Payé',
        createdAt: t.created_at,
      };
    });

    // Inclure également les commandes payment_transactions PENDING / FAILED pour transparence temps réel
    const knownPayTxIds = new Set(txList.map((x) => x.id));
    for (const pt of (payRes.rows || [])) {
      if (!pt.credited && !knownPayTxIds.has(pt.id)) {
        txList.push({
          id: pt.id,
          userId: pt.user_id,
          client: pt.user_name || pt.user_email || pt.user_id,
          pack: `${pt.pack_name || 'Recharge'} (${pt.credits} cr.)${pt.promo_code ? ' · Promo ' + pt.promo_code : ''}`,
          credits: Number(pt.credits) || 0,
          amountUSD: Number(pt.amount) || 0,
          amountCDF: Math.round((Number(pt.amount) || 0) * 2850),
          method: 'SasPay',
          status: pt.status || 'PENDING',
          createdAt: pt.created_at,
        });
      }
    }

    const paidTxs = txList.filter((t) => String(t.status).toLowerCase() === 'payé' || String(t.status).toUpperCase() === 'SUCCESS');
    const creditsSold = paidTxs.reduce((acc, t) => acc + (Number(t.credits) || 0), 0);
    const grossRevenueUSD = +paidTxs.reduce((acc, t) => acc + (Number(t.amountUSD) || 0), 0).toFixed(2);
    const grossRevenueCDF = Math.round(grossRevenueUSD * 2850);

    // Agrégation du trafic réel depuis visit_events
    const visits = visRes.rows || [];
    const totalVisits = visits.length;
    const countGroup = (arr, keyFn) => {
      const map = new Map();
      arr.forEach((v) => {
        const k = keyFn(v);
        map.set(k, (map.get(k) || 0) + 1);
      });
      return Array.from(map.entries())
        .map(([name, count]) => ({ name, count, pct: totalVisits > 0 ? Math.round((count / totalVisits) * 100) : 0 }))
        .sort((a, b) => b.count - a.count);
    };

    const traffic = {
      totalVisits,
      sources: countGroup(visits, (v) => v.referrer_source || 'direct'),
      devices: countGroup(visits, (v) => v.device_type || 'desktop'),
      browsers: countGroup(visits, (v) => v.browser || 'Navigateur'),
      geography: countGroup(visits, (v) => v.country || 'International'),
    };

    return res.json({
      success: true,
      stats: {
        totalUsers: users.length,
        totalSongs: songs.length,
        creditsSold,
        grossRevenueUSD,
        grossRevenueCDF,
      },
      users: req.adminUser.permissions.users || req.adminUser.role === 'super_admin' ? users : [],
      songs: req.adminUser.permissions.songs || req.adminUser.role === 'super_admin' ? songs : [],
      transactions: req.adminUser.permissions.finances || req.adminUser.role === 'super_admin' ? txList : [],
      withdrawals: wRes.rows || [],
      promos: promoRes.rows || [],
      collaborators: collabRes.rows || [],
      traffic,
    });
  } catch (err) {
    console.error('❌ [Admin Overview Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Créditer un utilisateur depuis l'Admin (réel Neon + Supabase)
app.post('/api/admin/users/credit', requireAdminAuth('users'), async (req, res) => {
  try {
    await ensureDbReady();
    const { userId, email, name, amount } = req.body || {};
    const num = parseInt(amount, 10);
    if (!Number.isInteger(num) || num === 0) {
      return res.status(400).json({ success: false, error: 'Quantité de crédits invalide.' });
    }

    let uRes = await query(`SELECT * FROM users WHERE id = $1 OR LOWER(email) = LOWER($2) LIMIT 1`, [userId || '', email || '']);
    let dbUserId = userId || ('usr_' + Date.now());
    let newBalance = Math.max(0, num);

    if (uRes.rows.length > 0) {
      dbUserId = uRes.rows[0].id;
      const upd = await query(`UPDATE users SET credits = GREATEST(0, COALESCE(credits, 0) + $1) WHERE id = $2 RETURNING *`, [num, dbUserId]);
      newBalance = Number(upd.rows[0].credits) || 0;
    } else {
      const ins = await query(
        `INSERT INTO users (id, name, email, credits) VALUES ($1, $2, $3, $4) RETURNING *`,
        [dbUserId, name || 'Artiste nZembo', (email || `${dbUserId}@users.nzembo.local`).toLowerCase(), Math.max(0, num)]
      );
      newBalance = Number(ins.rows[0].credits) || 0;
    }

    // Mettre à jour Supabase profiles si UUID
    if (String(dbUserId).includes('-')) {
      const { url: sbUrl, anonKey: sbKey } = getSupabaseEnv();
      await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(dbUserId)}`, {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${req.adminUser.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credits: newBalance }),
      }).catch(() => {});
    }

    await query(
      `INSERT INTO user_notifications (id, user_id, target, category, category_label, badge_color, title, subject, content, is_error)
       VALUES ($1, $2, $2, 'info', 'Crédits Admin', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', $3, $4, $5, FALSE)`,
      [
        `notif_adm_${Date.now()}`,
        dbUserId,
        num > 0 ? 'Crédits ajoutés par l\'équipe nZembo' : 'Ajustement de crédits',
        `${num > 0 ? '+' : ''}${num} crédits (solde : ${newBalance})`,
        `L'administration nZembo a mis à jour ton solde (${num > 0 ? '+' : ''}${num} crédits). Nouveau solde : ${newBalance} crédits.`,
      ]
    );

    return res.json({ success: true, userId: dbUserId, credits: newBalance });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. CRUD Codes Promos réel
app.get('/api/admin/promos', requireAdminAuth('promos'), async (_req, res) => {
  try {
    await ensureDbReady();
    const r = await query(`SELECT * FROM promo_codes ORDER BY created_at DESC`);
    return res.json({ success: true, promos: r.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/promos', requireAdminAuth('promos'), async (req, res) => {
  try {
    await ensureDbReady();
    const { code, discountType = 'percent', discountValue, minCredits = 1, maxUses = null, expiresAt = null, isActive = true, description = '' } = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const val = Number(discountValue);
    if (!cleanCode || cleanCode.length < 2) {
      return res.status(400).json({ success: false, error: 'Code promo requis (min. 2 caractères alphanumériques).' });
    }
    if (!Number.isFinite(val) || val <= 0) {
      return res.status(400).json({ success: false, error: 'Valeur de réduction invalide.' });
    }
    if (discountType === 'percent' && val > 95) {
      return res.status(400).json({ success: false, error: 'La réduction en pourcentage ne peut pas dépasser 95%.' });
    }

    const id = `prm_${crypto.randomUUID()}`;
    const r = await query(
      `INSERT INTO promo_codes (id, code, discount_type, discount_value, min_credits, max_uses, expires_at, is_active, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        cleanCode,
        discountType === 'fixed_usd' ? 'fixed_usd' : 'percent',
        val,
        Math.max(1, parseInt(minCredits, 10) || 1),
        maxUses ? Math.max(1, parseInt(maxUses, 10)) : null,
        expiresAt ? new Date(expiresAt) : null,
        Boolean(isActive),
        String(description || '').slice(0, 250),
        req.adminUser.email,
      ]
    );
    return res.json({ success: true, promo: r.rows[0] });
  } catch (err) {
    if (/unique|duplicate/i.test(err.message)) {
      return res.status(409).json({ success: false, error: 'Ce code promo existe déjà.' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/promos/:id', requireAdminAuth('promos'), async (req, res) => {
  try {
    await ensureDbReady();
    const { isActive, discountValue, discountType, maxUses, expiresAt } = req.body || {};
    const r = await query(
      `UPDATE promo_codes
       SET is_active = COALESCE($2, is_active),
           discount_value = COALESCE($3, discount_value),
           discount_type = COALESCE($4, discount_type),
           max_uses = CASE WHEN $5::text = 'UNSET' THEN NULL ELSE COALESCE($6::int, max_uses) END,
           expires_at = CASE WHEN $7::text = 'UNSET' THEN NULL ELSE COALESCE($8::timestamp, expires_at) END,
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        isActive === undefined ? null : Boolean(isActive),
        discountValue === undefined ? null : Number(discountValue),
        discountType || null,
        maxUses === null ? 'UNSET' : '',
        maxUses === null || maxUses === undefined ? null : parseInt(maxUses, 10),
        expiresAt === null ? 'UNSET' : '',
        expiresAt ? new Date(expiresAt) : null,
      ]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Code promo introuvable.' });
    return res.json({ success: true, promo: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/promos/:id', requireAdminAuth('promos'), async (req, res) => {
  try {
    await ensureDbReady();
    await query(`DELETE FROM promo_codes WHERE id = $1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Gestion des collaborateurs Admin
app.get('/api/admin/collaborators', requireAdminAuth('team'), async (_req, res) => {
  try {
    await ensureDbReady();
    const r = await query(`SELECT id, supabase_user_id, email, name, role, permissions, status, invited_by, created_at FROM admin_collaborators ORDER BY created_at ASC`);
    return res.json({ success: true, collaborators: r.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/collaborators', requireAdminAuth('team'), async (req, res) => {
  try {
    await ensureDbReady();
    const { email, name = '', role = 'collaborator', permissions } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse e-mail valide requise.' });
    }
    const safeRole = ['admin', 'finance', 'moderator', 'support', 'collaborator'].includes(role) ? role : 'collaborator';
    const perms = permissions && typeof permissions === 'object' ? permissions : (ROLE_DEFAULT_PERMISSIONS[safeRole] || ROLE_DEFAULT_PERMISSIONS.collaborator);

    const id = `adm_${crypto.randomUUID()}`;
    const r = await query(
      `INSERT INTO admin_collaborators (id, email, name, role, permissions, status, invited_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'invited', $6)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, permissions = EXCLUDED.permissions, status = 'active', updated_at = NOW()
       RETURNING *`,
      [id, cleanEmail, String(name || cleanEmail.split('@')[0]).trim(), safeRole, JSON.stringify(perms), req.adminUser.email]
    );

    const invEmail = renderCollabInviteEmailHtml({
      name: r.rows[0].name,
      role: safeRole,
      adminUrl: process.env.ADMIN_URL || 'https://admin.nzembo.net',
      invitedBy: req.adminUser.name || req.adminUser.email,
    });
    sendNzemboEmail({ to: cleanEmail, ...invEmail }).catch(() => {});

    return res.json({ success: true, collaborator: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/collaborators/:id', requireAdminAuth('team'), async (req, res) => {
  try {
    await ensureDbReady();
    const { role, status, permissions, name } = req.body || {};
    const r = await query(`SELECT * FROM admin_collaborators WHERE id = $1`, [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Collaborateur introuvable.' });
    if (r.rows[0].role === 'super_admin' && status === 'revoked') {
      return res.status(400).json({ success: false, error: 'Impossible de révoquer l\'administrateur principal.' });
    }

    const upd = await query(
      `UPDATE admin_collaborators
       SET role = COALESCE($2, role),
           status = COALESCE($3, status),
           permissions = COALESCE($4::jsonb, permissions),
           name = COALESCE(NULLIF($5, ''), name),
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        role || null,
        status || null,
        permissions ? JSON.stringify(permissions) : null,
        name || '',
      ]
    );
    return res.json({ success: true, collaborator: upd.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/collaborators/:id', requireAdminAuth('team'), async (req, res) => {
  try {
    await ensureDbReady();
    const r = await query(`SELECT role FROM admin_collaborators WHERE id = $1`, [req.params.id]);
    if (r.rows[0] && r.rows[0].role === 'super_admin') {
      return res.status(400).json({ success: false, error: 'Impossible de supprimer l\'administrateur principal.' });
    }
    await query(`DELETE FROM admin_collaborators WHERE id = $1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Retraits & Diffusion messages Admin
app.post('/api/admin/withdrawals/:id/decision', requireAdminAuth('affiliation'), async (req, res) => {
  try {
    await ensureDbReady();
    const { decision } = req.body || {};
    const status = decision === 'approve' ? 'Validé' : 'Refusé';
    const r = await query(`UPDATE withdrawals SET status = $2 WHERE id = $1 RETURNING *`, [req.params.id, status]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Demande introuvable.' });
    const w = r.rows[0];
    await query(
      `INSERT INTO user_notifications (id, user_id, target, category, category_label, badge_color, title, subject, content, is_error)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, FALSE)`,
      [
        `notif_w_${Date.now()}`,
        w.user_id || 'all',
        decision === 'approve' ? 'promo' : 'info',
        decision === 'approve' ? 'Retrait confirmé' : 'Statut retrait',
        decision === 'approve' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
        decision === 'approve' ? 'Virement effectué' : 'Demande de retrait refusée',
        `${w.amount_local} (${w.credits_converted} crédits)`,
        decision === 'approve'
          ? `Ta demande de retrait (${w.amount_local}) via ${w.method} a été validée.`
          : `Ta demande de retrait (${w.amount_local}) a été refusée.`,
      ]
    );
    return res.json({ success: true, withdrawal: w });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/broadcast', requireAdminAuth('messages'), async (req, res) => {
  try {
    await ensureDbReady();
    const { category = 'annonce', categoryLabel = 'Annonce nZembo', title, subject = '', content, target = 'all' } = req.body || {};
    if (!title || !content) return res.status(400).json({ success: false, error: 'Titre et message requis.' });
    const badgeMap = {
      annonce: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
      promo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      info: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      update: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    };
    const id = `msg_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    await query(
      `INSERT INTO user_notifications (id, user_id, target, category, category_label, badge_color, title, subject, content, is_error)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, FALSE)`,
      [id, target, category, categoryLabel, badgeMap[category] || badgeMap.annonce, title, subject, content]
    );
    return res.json({ success: true, id });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

registerSaspayRoutes(app);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 [Nzembo Backend Server] Actif sur http://localhost:${PORT}`);
  });
}

module.exports = { app, ensureDbReady, registerEngineProxyRoutes };
