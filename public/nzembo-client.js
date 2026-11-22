// nzembo-client.js - Moteur client autonome Nzembo Full-Stack
// Intégration complète : Auth OTP & OAuth, Base PostgreSQL unifiée, Stockage média,
// Crédits autoritaires (0 à l'inscription) & Proxy Moteur Audio IA Multi-Outils.

(function(window) {
  function resolveNzemboEnv() {
    if (typeof window !== 'undefined' && window.__NZEMBO_ENV__) {
      return window.__NZEMBO_ENV__;
    }
    if (typeof process !== 'undefined' && process.env) {
      if (!process.env.SUPABASE_ANON_KEY && typeof require !== 'undefined') {
        try {
          const fs = require('fs');
          const path = require('path');
          for (const dir of [__dirname, path.join(__dirname, '..')]) {
            const envPath = path.join(dir, '.env');
            if (fs.existsSync(envPath)) {
              for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line || line.startsWith('#')) continue;
                const eq = line.indexOf('=');
                if (eq === -1) continue;
                const k = line.slice(0, eq).trim();
                let v = line.slice(eq + 1).trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                  v = v.slice(1, -1);
                }
                if (!process.env[k]) process.env[k] = v;
              }
            }
          }
        } catch (e) {}
      }
      return process.env;
    }
    return {};
  }

  const DEFAULT_PUBLIC_AUTH_URL = "https://xmkdtbwurwtigkdjehhz.supabase.co";
  const DEFAULT_PUBLIC_AUTH_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhta2R0Ynd1cnd0aWdrZGplaGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzU2NTEsImV4cCI6MjEwOTkxMTY1MX0.Yt9RqMgyHgQIbqK7SHZRgaAgltjQELZtylqGc1kM--Y";
  const DEFAULT_ENGINE_BEARER_TOKEN = "6114d500a8a51a212812c2d3832d5dc5";

  function getEnvConfig() {
    const e = resolveNzemboEnv() || {};
    return {
      BACKEND_URL: (e.BACKEND_URL || '').trim(),
      SUPABASE_URL: (e.SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_PUBLIC_AUTH_URL).trim(),
      SUPABASE_ANON_KEY: (e.SUPABASE_ANON_KEY || e.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_PUBLIC_AUTH_KEY).trim(),
      ENGINE_BEARER_TOKEN: (e.ENGINE_BEARER_TOKEN || e.NEXT_PUBLIC_ENGINE_BEARER_TOKEN || e.SUNO_BEARER_TOKEN || e.SUNO_API_KEY || DEFAULT_ENGINE_BEARER_TOKEN).trim()
    };
  }

  const STORAGE_BUCKET = "nzembo-media";
  const DIRECT_ENGINE_BASE = "https://api.sunoapi.org/api/v1";
  const MIRROR_ENGINE_BASE = "https://apibox.erweima.ai/api/v1";
  const FILE_UPLOAD_BASE = "https://sunoapiorg.redpandaai.co/api";
  const WEBHOOK_NOOP_URL = "https://nzembo.net/api/webhook-noop";
  const SESSION_KEY = 'nzembo_auth_user';
  const PENDING_OTP_KEY = 'nzembo_pending_otp';
  const OTP_VERIFIED_UID_KEY = 'nzembo_otp_verified_uid';

  function getBackendApiBase() {
    const env = getEnvConfig();
    if (env.BACKEND_URL) return env.BACKEND_URL.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.location) {
      const proto = window.location.protocol;
      if (proto === 'http:' || proto === 'https:') {
        return window.location.origin.replace(/\/+$/, '');
      }
    }
    return 'https://app.nzembo.net';
  }

  function formatAuthError(errOrMsg, fallback = "Une erreur est survenue lors de l'authentification.") {
    const rawMsg = (errOrMsg && typeof errOrMsg === 'object') ? (errOrMsg.message || errOrMsg.error_description || errOrMsg.msg || '') : String(errOrMsg || '');
    const statusCode = (errOrMsg && typeof errOrMsg === 'object' && errOrMsg.status) ? Number(errOrMsg.status) : 0;
    const str = String(rawMsg || '').trim();

    if (/Invalid login credentials/i.test(str)) return "E-mail ou mot de passe incorrect.";
    if (/Email not confirmed/i.test(str)) return "Entre le code de validation reçu par e-mail pour activer ton compte.";
    if (/User already registered|already been registered|email_exists/i.test(str)) return "Un compte existe déjà avec cette adresse e-mail. Connecte-toi.";
    if (/Password should be at least|weak_password/i.test(str)) return "Le mot de passe doit comporter au moins 6 caractères.";
    if (/Unable to validate email address|invalid.*email|validation_failed/i.test(str)) return "Adresse e-mail invalide. Vérifie le format saisi.";
    if (/Signups not allowed|signup_disabled/i.test(str)) return "La création de compte est temporairement désactivée.";
    if (/security purposes|rate limit|too many requests|over_email_send_rate_limit/i.test(str)) {
      return "Un code vient déjà d'être envoyé. Patiente quelques instants avant de renvoyer.";
    }
    if (/Token has expired|invalid token|otp_expired|invalid.*otp/i.test(str)) {
      return "Code invalide ou expiré. Vérifie les 6 chiffres reçus ou demande un nouveau code.";
    }
    if (/Unsupported provider|provider is not enabled/i.test(str)) {
      return "La connexion Google (OAuth) n'est pas encore activée côté serveur.";
    }
    if (/redirect_uri_mismatch|redirect_to|not allowed/i.test(str)) {
      const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'https://app.nzembo.net';
      return `URL de redirection non autorisée (${origin}).`;
    }
    if (/Database error saving new user/i.test(str)) {
      return "Erreur base de données lors de la création de ton profil.";
    }
    if (/Invalid API key|No API key found|apikey/i.test(str)) {
      return "Configuration d'authentification Nzembo manquante côté serveur.";
    }
    if (/failed to fetch|networkerror|network error|load failed|err_network|timeout/i.test(str)) {
      return "Impossible de joindre le serveur Nzembo. Vérifie ta connexion internet.";
    }
    if (/access_denied|user_cancelled|cancelled/i.test(str)) {
      return "Connexion Google annulée.";
    }

    const cleaned = str
      .replace(/https?:\/\/[^\s"'<>]*/gi, '')
      .replace(/\b(?:supabase|postgres|postgresql|neon|jwt)\b/gi, 'Nzembo')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (cleaned) return statusCode && cleaned === str ? `${cleaned} (Code ${statusCode})` : cleaned;
    return fallback;
  }

  function sanitizeApiErrorMessage(rawMsg, fallback = "Une erreur est survenue lors du traitement, réessaie.") {
    if (!rawMsg) return fallback;
    const str = String(rawMsg);
    if (/Invalid login credentials/i.test(str)) return "E-mail ou mot de passe incorrect.";
    if (/Email not confirmed/i.test(str)) return "Valide ton compte avec le code reçu par e-mail.";
    if (/User already registered/i.test(str)) return "Un compte existe déjà avec cette adresse e-mail.";
    if (/Password should be at least/i.test(str)) return "Le mot de passe doit comporter au moins 6 caractères.";
    if (/security purposes|rate limit|too many requests/i.test(str)) return "Trop de tentatives, réessaie dans quelques instants.";
    if (/Token has expired|invalid token|otp_expired/i.test(str)) return "Le code est expiré ou invalide. Demande un nouveau code.";

    const cleaned = str
      .replace(/https?:\/\/[^\s"'<>]*/gi, '')
      .replace(/\b(?:suno|erweima|redpandaai|supabase|postgres|postgresql|database|storage|cloud|bucket|neon|jwt|oauth|api_key|bearer)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!cleaned || cleaned.length < 4 || /failed to fetch|network error|status code|internal server/i.test(cleaned)) {
      return fallback;
    }
    return cleaned;
  }

  function buildAuthRedirectUrl(hashSuffix = '') {
    let baseOrigin = 'https://app.nzembo.net';
    let basePath = '';
    if (typeof window !== 'undefined' && window.location && /^https?:/i.test(window.location.protocol)) {
      const host = String(window.location.hostname || '').toLowerCase();
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        baseOrigin = window.location.origin.replace(/\/+$/, '');
        const p = window.location.pathname || '/';
        basePath = p.startsWith('/app') ? '/app' : (p.startsWith('/admin') ? '/admin' : '');
      }
    }
    const suffix = String(hashSuffix || '').trim();
    if (!suffix) return baseOrigin + (basePath || '/');
    if (suffix.startsWith('#')) return baseOrigin + (basePath || '/') + suffix;
    return baseOrigin + basePath + (suffix.startsWith('/') ? suffix : '/' + suffix);
  }

  let _supabaseInstance = null;
  let _supabaseInitError = '';

  function getSupabase() {
    if (_supabaseInstance) {
      _supabaseInitError = '';
      return _supabaseInstance;
    }
    if (typeof window !== 'undefined' && window.supabaseClient) {
      _supabaseInstance = window.supabaseClient;
      _supabaseInitError = '';
      return _supabaseInstance;
    }
    const env = getEnvConfig();
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      _supabaseInitError = 'Configuration du service d\'authentification Nzembo introuvable.';
      return null;
    }
    if (typeof window !== 'undefined') {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        try {
          _supabaseInstance = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          window.supabaseClient = _supabaseInstance;
          _supabaseInitError = '';
          return _supabaseInstance;
        } catch (e) {
          _supabaseInitError = 'Initialisation du module de connexion échouée : ' + (e && e.message ? e.message : 'erreur');
        }
      } else {
        _supabaseInitError = "Le module d'authentification Nzembo n'a pas pu se charger (vérifie ta connexion internet).";
      }
    }
    if (typeof require !== 'undefined') {
      try {
        const { createClient } = require('@supabase/supabase-js');
        _supabaseInstance = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        _supabaseInitError = '';
        return _supabaseInstance;
      } catch (e) {}
    }
    return null;
  }

  function getSupabaseOrThrow() {
    const sb = getSupabase();
    if (!sb) {
      throw new Error(_supabaseInitError || 'Service d\'authentification Nzembo indisponible : vérifie ta connexion internet.');
    }
    return sb;
  }

  async function getAccessToken() {
    try {
      const sb = getSupabase();
      if (!sb || !sb.auth) return '';
      const { data } = await sb.auth.getSession();
      return (data && data.session && data.session.access_token) ? data.session.access_token : '';
    } catch {
      return '';
    }
  }

  // Fetch moteur audio ultra-résilient :
  // 1) Proxy backend Nzembo (/api/engine/* — zéro CORS, utilise clé serveur)
  // 2) Hôtes API Suno directs (api.sunoapi.org / apibox.erweima.ai) avec clé Bearer
  async function fetchAudioEngine(path, options = {}) {
    const env = getEnvConfig();
    const token = env.ENGINE_BEARER_TOKEN || DEFAULT_ENGINE_BEARER_TOKEN;
    const baseHeaders = { ...(options.headers || {}) };
    if (!baseHeaders['Content-Type'] && !(options.body instanceof FormData)) {
      baseHeaders['Content-Type'] = 'application/json';
    }
    if (token && !baseHeaders['Authorization']) {
      baseHeaders['Authorization'] = `Bearer ${token}`;
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const isBrowserHttp = (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol));

    // 1. Proxy Same-Origin Nzembo Backend (/api/engine/*)
    if (isBrowserHttp) {
      try {
        const backendBase = getBackendApiBase();
        const proxyOpts = { ...options, headers: { ...baseHeaders } };
        if (!proxyOpts.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          proxyOpts.signal = AbortSignal.timeout(25000);
        }
        const serverRes = await fetch(`${backendBase}/api/engine${cleanPath}`, proxyOpts);
        if (serverRes.ok || serverRes.status === 400 || serverRes.status === 422 || serverRes.status === 429) {
          return serverRes;
        }
      } catch (e) {}
    }

    // 2. Appel direct vers les hôtes Suno avec clé Bearer
    const directOpts = { ...options, headers: { ...baseHeaders } };

    try {
      const directRes = await fetch(`${DIRECT_ENGINE_BASE}${cleanPath}`, directOpts);
      if (directRes.ok || directRes.status === 400 || directRes.status === 429) {
        return directRes;
      }
    } catch (e) {}

    return await fetch(`${MIRROR_ENGINE_BASE}${cleanPath}`, directOpts);
  }

  const LOCAL_ID_PREFIXES = ['task_', 'vid_', 'upload_', 'studio_', 'audio_', 'meta_', 'nz_', 'nz-', 'track_', 'temp_', 'local_'];
  function isValidEngineId(id) {
    if (!id || typeof id !== 'string') return false;
    const v = id.trim();
    if (v.length < 16) return false;
    const low = v.toLowerCase();
    if (LOCAL_ID_PREFIXES.some(p => low.startsWith(p))) return false;
    return /^[a-z0-9-]+$/i.test(v);
  }

  function formatVttTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = (s % 60).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${r}`;
  }

  function buildLyricsVtt(alignedWords) {
    if (!Array.isArray(alignedWords) || alignedWords.length === 0) return '';
    const cues = [];
    let cur = null;
    const flush = () => {
      if (cur && cur.words.length) {
        const end = Math.max(cur.end, cur.start + 0.5);
        cues.push({ start: cur.start, end, text: cur.words.join(' ') });
      }
      cur = null;
    };
    for (const w of alignedWords) {
      if (!w || typeof w.startS !== 'number') continue;
      if (cur && (w.startS - cur.end) > 1.5) flush();
      const parts = String(w.word || '').replace(/\[[^\]]*\]/g, '').split('\n');
      parts.forEach((part, i) => {
        if (i > 0) flush();
        const t = part.trim();
        if (!t) return;
        if (!cur) cur = { start: w.startS, end: w.endS || w.startS, words: [] };
        cur.words.push(t);
        cur.end = w.endS || cur.end;
      });
      if (cur && cur.words.length >= 10) flush();
    }
    flush();
    if (!cues.length) return '';
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${esc(c.text)}`).join('\n\n') + '\n';
  }

  const AUDIO_EXT_MIME_MAP = {
    '.mp3': 'audio/mpeg', '.mpeg': 'audio/mpeg', '.mpga': 'audio/mpeg', '.mp2': 'audio/mpeg',
    '.wav': 'audio/wav', '.wave': 'audio/wav',
    '.m4a': 'audio/mp4', '.m4b': 'audio/mp4', '.m4r': 'audio/mp4',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.spx': 'audio/ogg',
    '.flac': 'audio/flac', '.webm': 'audio/webm', '.amr': 'audio/amr',
    '.3gp': 'audio/3gpp', '.3gpp': 'audio/3gpp', '.wma': 'audio/x-ms-wma',
    '.aiff': 'audio/aiff', '.aif': 'audio/aiff', '.caf': 'audio/x-caf', '.mp4': 'audio/mp4'
  };

  function resolveUploadMimeType(fileOrBlob, fileName = 'track.mp3') {
    const low = String(fileName || '').toLowerCase().trim();
    const rawType = (fileOrBlob && fileOrBlob.type) ? String(fileOrBlob.type).split(';')[0].trim().toLowerCase() : '';
    if (low.endsWith('.mp4') && rawType.startsWith('video/')) return 'audio/mp4';
    if (rawType === 'image/png' || low.endsWith('.png')) return 'image/png';
    if (rawType === 'image/jpeg' || rawType === 'image/jpg' || low.endsWith('.jpg') || low.endsWith('.jpeg')) return 'image/jpeg';
    if (rawType === 'image/webp' || low.endsWith('.webp')) return 'image/webp';
    for (const [ext, mime] of Object.entries(AUDIO_EXT_MIME_MAP)) {
      if (low.endsWith(ext)) return mime;
    }
    if (rawType === 'audio/mpeg' || rawType === 'audio/mp3') return 'audio/mpeg';
    if (rawType === 'audio/wav' || rawType === 'audio/x-wav' || rawType === 'audio/wave') return 'audio/wav';
    if (rawType === 'audio/x-m4a' || rawType === 'audio/mp4' || rawType === 'audio/m4a') return 'audio/mp4';
    if (rawType === 'audio/aac' || rawType === 'audio/x-aac') return 'audio/aac';
    if (rawType === 'audio/ogg' || rawType === 'audio/opus' || rawType === 'application/ogg') return 'audio/ogg';
    if (rawType === 'audio/flac' || rawType === 'audio/x-flac') return 'audio/flac';
    if (rawType === 'audio/webm' || rawType === 'video/webm') return 'audio/webm';
    if (rawType === 'audio/amr' || rawType === 'audio/amr-wb') return 'audio/amr';
    if (rawType === 'audio/3gpp' || rawType === 'audio/3gpp2' || rawType === 'video/3gpp') return 'audio/3gpp';
    if (rawType.startsWith('audio/')) return rawType;
    return 'audio/mpeg';
  }

  function ensureAudioFileName(fileName, fileOrBlob) {
    let clean = String(fileName || (fileOrBlob && fileOrBlob.name) || 'audio_track').replace(/[^a-zA-Z0-9._-]/g, '_');
    const dotIdx = clean.lastIndexOf('.');
    const ext = dotIdx !== -1 ? clean.slice(dotIdx).toLowerCase() : '';
    if (ext && AUDIO_EXT_MIME_MAP[ext]) return clean.slice(0, dotIdx) + ext;
    const rawType = (fileOrBlob && fileOrBlob.type) ? String(fileOrBlob.type).split(';')[0].trim().toLowerCase() : '';
    const mimeToExt = {
      'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav',
      'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/m4a': '.m4a',
      'audio/aac': '.aac', 'audio/x-aac': '.aac',
      'audio/ogg': '.ogg', 'audio/opus': '.ogg', 'application/ogg': '.ogg',
      'audio/flac': '.flac', 'audio/x-flac': '.flac',
      'audio/webm': '.webm', 'video/webm': '.webm',
      'audio/3gpp': '.3gp', 'audio/amr': '.amr',
      'audio/mpeg': '.mp3', 'audio/mp3': '.mp3'
    };
    return (clean || 'audio_track') + (mimeToExt[rawType] || '.mp3');
  }

  function encodeAudioBufferToWavBlob(audioBuffer) {
    const numChannels = 1;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.getChannelData(0);
    const dataLength = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, dataLength, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function transcodeAudioBlobToWav(fileOrBlob) {
    if (typeof window === 'undefined' || !fileOrBlob || typeof fileOrBlob.arrayBuffer !== 'function') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioCtx || !OfflineCtx) return null;
    let ctx = null;
    try {
      ctx = new AudioCtx();
      const rawBuf = await fileOrBlob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(rawBuf.slice(0));
      const maxDurSec = Math.min(decoded.duration || 0, 480);
      if (maxDurSec <= 0.1) return null;
      const targetRate = maxDurSec > 200 ? 16000 : 22050;
      const frameCount = Math.max(1, Math.ceil(maxDurSec * targetRate));
      const offline = new OfflineCtx(1, frameCount, targetRate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0);
      const rendered = await offline.startRendering();
      return encodeAudioBufferToWavBlob(rendered);
    } catch (e) {
      return null;
    } finally {
      if (ctx && typeof ctx.close === 'function') {
        try { await ctx.close(); } catch (e) {}
      }
    }
  }

  function getSavedAvatarForUser(userId) {
    if (typeof localStorage === 'undefined') return null;
    try {
      if (userId) {
        const scoped = localStorage.getItem(`nzembo_user_avatar_${userId}`);
        if (scoped) return scoped;
      }
      return localStorage.getItem('nzembo_user_avatar') || null;
    } catch (e) {
      return null;
    }
  }

  function saveLocalAvatarForUser(userId, avatarUrl) {
    if (typeof localStorage === 'undefined' || !avatarUrl) return;
    try {
      localStorage.setItem('nzembo_user_avatar', avatarUrl);
      if (userId) localStorage.setItem(`nzembo_user_avatar_${userId}`, avatarUrl);
    } catch (e) {}
  }

  async function uploadMediaToSupabase(fileOrBlob, fileName = 'track.mp3', folder = 'audio') {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const safeName = (fileName || 'media').replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniquePath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeName}`;
      const contentType = resolveUploadMimeType(fileOrBlob, safeName);
      const { error } = await sb.storage.from(STORAGE_BUCKET).upload(uniquePath, fileOrBlob, {
        contentType: contentType,
        upsert: true
      });
      if (error) return null;
      const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(uniquePath);
      return urlData ? urlData.publicUrl : null;
    } catch (err) {
      return null;
    }
  }

  async function persistMediaLocally(remoteUrl, category = 'audio', fileId = '') {
    if (!remoteUrl) return remoteUrl;
    if (remoteUrl.includes('supabase.co/storage') || remoteUrl.startsWith('/') || remoteUrl.includes('/media/')) {
      return remoteUrl;
    }
    try {
      const sb = getSupabase();
      if (sb) {
        const timeoutMs = category === 'video' ? 35000 : 15000;
        const resp = await fetch(remoteUrl, { signal: AbortSignal.timeout(timeoutMs) });
        if (resp.ok) {
          const blob = await resp.blob();
          const ext = category === 'video' ? 'mp4' : (category === 'image' ? 'jpg' : 'mp3');
          const fileName = `${fileId || ('nz_media_' + Date.now())}.${ext}`;
          const uploadedUrl = await uploadMediaToSupabase(blob, fileName, category === 'video' ? 'videos' : (category === 'image' ? 'covers' : 'audio'));
          if (uploadedUrl) return uploadedUrl;
        }
      }
    } catch (e) {}
    return remoteUrl;
  }

  function getPersistedCredits(userId, fallback = null) {
    try {
      if (typeof localStorage !== 'undefined') {
        if (userId) {
          const byUser = localStorage.getItem('nzembo_credits_' + userId);
          if (byUser !== null && byUser !== '' && !isNaN(Number(byUser))) {
            return Math.max(0, Number(byUser));
          }
        }
        const globalCreds = localStorage.getItem('nzembo_user_credits');
        if (globalCreds !== null && globalCreds !== '' && !isNaN(Number(globalCreds))) {
          return Math.max(0, Number(globalCreds));
        }
      }
    } catch (e) {}
    return fallback;
  }

  function savePersistedCredits(val, userId) {
    const clean = Math.max(0, Number(val) || 0);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nzembo_user_credits', String(clean));
        localStorage.setItem('nzembo_credits_updated_at', String(Date.now()));
        if (userId) {
          localStorage.setItem('nzembo_credits_' + userId, String(clean));
        }
      }
    } catch (e) {}
    return clean;
  }

  function getPendingOtp() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(PENDING_OTP_KEY);
      }
    } catch {}
    return null;
  }

  function setPendingOtp(_info) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(PENDING_OTP_KEY);
      }
    } catch {}
  }

  function isUserOtpVerified(userId) {
    return Boolean(userId);
  }

  function setUserOtpVerified(userId) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (userId) {
        localStorage.setItem(OTP_VERIFIED_UID_KEY, String(userId));
      } else {
        localStorage.removeItem(OTP_VERIFIED_UID_KEY);
      }
    } catch {}
  }

  function clearPendingOtp() {
    setPendingOtp(null);
  }

  function getCurrentUser() {
    try {
      if (typeof localStorage !== 'undefined') {
        if (getPendingOtp()) return null;
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object' && parsed.id) {
            if (!isUserOtpVerified(parsed.id)) {
              return null;
            }
            const persisted = getPersistedCredits(parsed.id, null);
            if (persisted !== null) {
              parsed.credits = persisted;
            }
            return parsed;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function setCurrentUser(user) {
    try {
      if (typeof localStorage !== 'undefined') {
        if (user) {
          if (user.credits !== undefined && user.credits !== null && !isNaN(Number(user.credits))) {
            user.credits = savePersistedCredits(user.credits, user.id);
          }
          localStorage.setItem(SESSION_KEY, JSON.stringify(user));
          localStorage.setItem('nzembo_user_logged_in', '1');
          if (user.credits !== undefined && typeof window !== 'undefined' && window.NzemboStore && typeof window.NzemboStore.setUserCredits === 'function') {
            window.NzemboStore.setUserCredits(user.credits);
          }
        } else {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem('nzembo_user_logged_in');
          localStorage.removeItem('nzembo_demo_session');
          localStorage.removeItem('nzembo_user_credits');
          localStorage.removeItem('nzembo_credits_updated_at');
        }
      }
    } catch (e) {}
  }

  async function syncSongToNeon(creation) {
    try {
      if (!creation) return;
      const u = getCurrentUser();
      await fetch(`${getBackendApiBase()}/api/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: creation.id || creation.taskId,
          userId: (u && u.id) || creation.userId || '',
          title: creation.title,
          style: creation.style,
          occasion: creation.occasion,
          recipient: creation.recipient,
          lyrics: creation.lyrics,
          audioUrl: creation.audioUrl,
          videoUrl: creation.videoUrl,
          coverUrl: creation.coverUrl || creation.albumCover,
          taskId: creation.taskId,
          audioId: creation.audioId,
          toolCategory: creation.toolCategory || 'generation',
          status: creation.status || (creation.isProcessing ? 'processing' : 'completed')
        })
      }).catch(() => {});
    } catch {}
  }

  async function saveCreation(creation) {
    if (!creation) return null;
    syncSongToNeon(creation);
    const sb = getSupabase();
    if (!sb) return creation;

    const user = getCurrentUser();
    const creationId = String(creation.id || creation.taskId || ('nz_' + Date.now()));
    const isProcessing = (creation.isProcessing !== undefined)
      ? Boolean(creation.isProcessing)
      : (creation.status === 'IN_PROGRESS' || creation.status === 'en_cours' || creation.status === 'PENDING');
    const statusVal = creation.status ? creation.status : (isProcessing ? 'en_cours' : 'termine');

    const payload = {
      id: creationId,
      user_id: (user && user.id && String(user.id).includes('-')) ? user.id : null,
      task_id: creation.taskId || creationId,
      audio_id: creation.audioId || null,
      audio_id_2: creation.audioId2 || null,
      title: (creation.title || 'Création Nzembo').slice(0, 150),
      artist: (creation.artist || 'Nzembo').slice(0, 100),
      style: (creation.style || '').slice(0, 200),
      tool_category: creation.toolCategory || 'generation',
      recipient: creation.recipient || null,
      occasion: creation.occasion || null,
      lyrics: creation.lyrics || null,
      prompt: creation.prompt || null,
      audio_url: creation.audioUrl || null,
      audio_url_2: creation.audioUrl2 || null,
      video_url: creation.videoUrl || null,
      vocal_url: creation.vocalUrl || null,
      instrumental_url: creation.instrumentalUrl || null,
      cover_url: creation.coverUrl || creation.albumCover || null,
      album_cover: creation.albumCover || creation.coverUrl || null,
      visualizer_style: creation.visualizerStyle || null,
      visualizer_style_label: creation.visualizerStyleLabel || null,
      status: statusVal,
      is_processing: isProcessing,
      metadata: creation.metadata || {}
    };

    try {
      const { data } = await sb.from('creations').upsert([payload], { onConflict: 'id' }).select();
      return (data && data[0]) ? data[0] : payload;
    } catch (e) {
      return payload;
    }
  }

  async function updateCreation(creationId, updates) {
    if (!creationId || !updates) return null;
    syncSongToNeon({ id: creationId, taskId: updates.taskId || creationId, ...updates });
    const sb = getSupabase();
    if (!sb) return null;

    const mapped = {};
    if (updates.status !== undefined) mapped.status = updates.status;
    if (updates.isProcessing !== undefined) mapped.is_processing = Boolean(updates.isProcessing);
    if (updates.audioUrl !== undefined) mapped.audio_url = updates.audioUrl;
    if (updates.audioUrl2 !== undefined) mapped.audio_url_2 = updates.audioUrl2;
    if (updates.videoUrl !== undefined) mapped.video_url = updates.videoUrl;
    if (updates.vocalUrl !== undefined) mapped.vocal_url = updates.vocalUrl;
    if (updates.instrumentalUrl !== undefined) mapped.instrumental_url = updates.instrumentalUrl;
    if (updates.coverUrl !== undefined) { mapped.cover_url = updates.coverUrl; mapped.album_cover = updates.coverUrl; }
    if (updates.albumCover !== undefined) { mapped.album_cover = updates.albumCover; mapped.cover_url = updates.albumCover; }
    if (updates.lyrics !== undefined) mapped.lyrics = updates.lyrics;
    if (updates.title !== undefined) mapped.title = updates.title;
    if (updates.artist !== undefined) mapped.artist = updates.artist;
    if (updates.audioId !== undefined) mapped.audio_id = updates.audioId;
    if (updates.audioId2 !== undefined) mapped.audio_id_2 = updates.audioId2;
    if (updates.taskId !== undefined) mapped.task_id = updates.taskId;
    if (updates.visualizerStyle !== undefined) mapped.visualizer_style = updates.visualizerStyle;
    if (updates.visualizerStyleLabel !== undefined) mapped.visualizer_style_label = updates.visualizerStyleLabel;
    if (updates.metadata !== undefined) mapped.metadata = updates.metadata;

    try {
      const { data } = await sb.from('creations').update(mapped).or(`id.eq.${creationId},task_id.eq.${creationId}`).select();
      return data;
    } catch (e) {
      return null;
    }
  }

  async function getUserCreations(userId) {
    const sb = getSupabase();
    try {
      const activeUser = getCurrentUser();
      const effectiveUserId = (userId && typeof userId === 'string' && userId.trim())
        ? userId.trim()
        : (activeUser && activeUser.id ? String(activeUser.id).trim() : null);

      // Isolation stricte par utilisateur : sans session vérifiée, retourner une liste vide
      if (!effectiveUserId || !isUserOtpVerified(effectiveUserId)) {
        return [];
      }

      let rows = [];
      if (sb && effectiveUserId.includes('-')) {
        const { data, error } = await sb.from('creations').select('*')
          .eq('user_id', effectiveUserId)
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          rows = data.filter(r => r && String(r.user_id) === String(effectiveUserId));
        }
      }

      // Compléter avec les créations de cet utilisateur exact enregistrées sur PostgreSQL Neon
      try {
        const neonRes = await fetch(`${getBackendApiBase()}/api/songs/user/${encodeURIComponent(effectiveUserId)}`);
        const neonJson = await neonRes.json().catch(() => ({}));
        if (neonRes.ok && Array.isArray(neonJson.songs) && neonJson.songs.length > 0) {
          const seenIds = new Set(rows.map(r => String(r.id || r.task_id)));
          for (const ns of neonJson.songs) {
            if (!ns || String(ns.user_id) !== String(effectiveUserId)) continue;
            const key = String(ns.id || ns.task_id);
            if (!seenIds.has(key)) {
              seenIds.add(key);
              rows.push({
                id: ns.id,
                user_id: ns.user_id,
                task_id: ns.task_id || ns.id,
                audio_id: ns.audio_id || ns.id,
                title: ns.title || 'Chanson Nzembo',
                artist: 'Nzembo',
                style: ns.style || '',
                tool_category: ns.tool_category || 'generation',
                recipient: ns.recipient || '',
                occasion: ns.occasion || '',
                lyrics: ns.lyrics || '',
                audio_url: ns.audio_url || '',
                video_url: ns.video_url || '',
                cover_url: ns.cover_url || '',
                album_cover: ns.cover_url || '',
                status: ns.status === 'completed' ? 'termine' : (ns.status === 'processing' ? 'en_cours' : ns.status),
                is_processing: ns.status === 'processing',
                created_at: ns.created_at
              });
            }
          }
        }
      } catch {}

      return rows.map(row => {
        const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
        const resolvedVideoUrl = row.video_url || meta.videoUrl || meta.video_url || '';
        const resolvedAudioUrl = row.audio_url || meta.audioUrl || meta.audio_url || '';
        const resolvedCoverUrl = row.album_cover || row.cover_url || meta.coverUrl || meta.albumCover || '';
        const rawCat = String(row.tool_category || row.category || meta.toolCategory || (resolvedVideoUrl && !resolvedAudioUrl ? 'video' : 'generation')).toLowerCase().trim();
        return {
          id: row.id,
          userId: row.user_id || effectiveUserId,
          taskId: row.task_id || row.id,
          audioId: row.audio_id || row.id,
          audioId2: row.audio_id_2 || '',
          title: row.title || 'Chanson Nzembo',
          artist: row.artist || 'Nzembo',
          style: row.style || '',
          toolCategory: rawCat,
          category: rawCat,
          duration: (row.duration && !isNaN(row.duration)) ? Number(row.duration) : ((meta.duration && !isNaN(meta.duration)) ? Number(meta.duration) : null),
          recipient: row.recipient || '',
          occasion: row.occasion || '',
          lyrics: row.lyrics || meta.lyrics || '',
          prompt: row.prompt || meta.prompt || '',
          audioUrl: resolvedAudioUrl,
          audioUrl2: row.audio_url_2 || meta.audioUrl2 || '',
          videoUrl: resolvedVideoUrl,
          vocalUrl: row.vocal_url || meta.vocalUrl || '',
          instrumentalUrl: row.instrumental_url || meta.instrumentalUrl || '',
          albumCover: resolvedCoverUrl,
          coverUrl: resolvedCoverUrl,
          visualizerStyle: row.visualizer_style || meta.visualizerStyle || '',
          visualizerStyleLabel: row.visualizer_style_label || meta.visualizerStyleLabel || '',
          metadata: meta,
          lyricsVtt: meta.lyricsVtt || '',
          sourceTaskId: meta.sourceTaskId || '',
          sourceAudioId: meta.sourceAudioId || '',
          hasFailed: row.status === 'echoue',
          status: row.status || (row.is_processing ? 'en_cours' : 'termine'),
          isProcessing: Boolean(row.is_processing || row.status === 'en_cours' || row.status === 'IN_PROGRESS'),
          date: row.created_at ? new Date(row.created_at).toLocaleDateString('fr-FR') : 'Récemment',
          createdAt: row.created_at
        };
      });
    } catch (e) {
      return [];
    }
  }

  async function deleteCreation(creationId) {
    if (!creationId) return false;
    const sb = getSupabase();
    if (!sb) return false;
    try {
      const { error } = await sb.from('creations').delete().or(`id.eq.${creationId},task_id.eq.${creationId}`);
      return !error;
    } catch (e) {
      return false;
    }
  }

  // Suivi des déductions par taskId pour éviter tout double débit ou double remboursement
  const _taskDeductions = {};

  window.NzemboBackend = {
    supabaseUrl: getEnvConfig().SUPABASE_URL,
    storageBucket: STORAGE_BUCKET,
    getSupabase: getSupabase,
    getBackendApiBase: getBackendApiBase,
    isValidEngineId: isValidEngineId,
    isValidSunoId: isValidEngineId,
    sanitizeApiMessage: sanitizeApiErrorMessage,
    buildLyricsVtt: buildLyricsVtt,
    getPendingOtp: getPendingOtp,
    clearPendingOtp: clearPendingOtp,

    checkEngineHealth: async function() {
      try {
        const res = await fetch(`${getBackendApiBase()}/api/engine/health`, { method: 'GET' });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.connected) return json;
      } catch {}
      try {
        const r = await fetchAudioEngine('/generate/credit', { method: 'GET' });
        const d = await r.json().catch(() => ({}));
        return { connected: Boolean(r.ok && d && d.code === 200), credits: d?.data };
      } catch {
        return { connected: false };
      }
    },

    syncUserWithBackend: async function(userObj, { isNewSignup = false, existingProfileCredits = null } = {}) {
      if (!userObj || !userObj.id || !userObj.email) return null;
      try {
        const token = await getAccessToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${getBackendApiBase()}/api/users/sync`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: userObj.id,
            email: userObj.email,
            name: userObj.name || '',
            referral_code: userObj.referral_code || '',
            referred_by: userObj.referral_code_used || null,
            isNewSignup: Boolean(isNewSignup),
            existingProfileCredits: existingProfileCredits !== null ? Number(existingProfileCredits) : undefined
          })
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success && json.user) {
          return Number(json.credits ?? json.user.credits ?? 0);
        }
      } catch (e) {}
      return null;
    },

    getUserCredits: async function() {
      const user = getCurrentUser();
      const sb = getSupabase();
      const uid = (user && user.id) ? String(user.id) : null;

      if (uid) {
        try {
          const emailQ = user && user.email ? `?email=${encodeURIComponent(user.email)}` : '';
          const beRes = await fetch(`${getBackendApiBase()}/api/users/${encodeURIComponent(uid)}/credits${emailQ}`);
          const beJson = await beRes.json().catch(() => ({}));
          if (beRes.ok && beJson.success && beJson.credits !== undefined) {
            const dbCredits = Math.max(0, Number(beJson.credits) || 0);
            savePersistedCredits(dbCredits, uid);
            return dbCredits;
          }
        } catch {}
      }

      if (sb && uid && uid.includes('-')) {
        try {
          const { data: profile } = await sb.from('profiles').select('credits').eq('id', uid).maybeSingle();
          if (profile && profile.credits !== undefined && profile.credits !== null) {
            const dbCredits = Math.max(0, Number(profile.credits) || 0);
            savePersistedCredits(dbCredits, uid);
            return dbCredits;
          }
        } catch (e) {}
      }
      if (user && user.credits !== undefined && !isNaN(Number(user.credits))) {
        return Math.max(0, Number(user.credits));
      }
      return 0;
    },

    setUserCredits: async function(newCredits) {
      const val = Math.max(0, Number(newCredits) || 0);
      const user = getCurrentUser();
      const uid = (user && user.id) ? user.id : null;
      savePersistedCredits(val, uid);

      if (user) {
        user.credits = val;
        setCurrentUser(user);
      }
      if (typeof window !== 'undefined') {
        window.userCredits = val;
        if (window.NzemboStore && typeof window.NzemboStore.setUserCredits === 'function') {
          try { window.NzemboStore.setUserCredits(val); } catch (e) {}
        }
        if (typeof window.updateCreditDisplays === 'function') {
          try { window.updateCreditDisplays(val); } catch (e) {}
        }
      }

      const sb = getSupabase();
      if (sb && uid && String(uid).includes('-')) {
        try {
          const { data: updData, error: updErr } = await sb.from('profiles').update({ credits: val }).eq('id', uid).select();
          if (updErr || !updData || updData.length === 0) {
            await sb.from('profiles').upsert([{
              id: uid,
              email: (user && user.email) || '',
              name: (user && user.name) || 'Artiste',
              credits: val
            }], { onConflict: 'id' });
          }
        } catch (e) {}
      }
      return val;
    },

    addCredits: async function(amount = 1) {
      const added = Math.max(0, Number(amount) || 0);
      const current = await this.getUserCredits();
      return await this.setUserCredits(Math.max(0, current + added));
    },

    deductCredits: async function(amount = 1, reason = 'Action studio', taskId = '') {
      const cost = Math.max(0, parseInt(amount, 10) || 1);
      if (taskId && _taskDeductions[taskId]) {
        return await this.getUserCredits();
      }
      if (cost === 0) return await this.getUserCredits();

      const user = getCurrentUser();
      const uid = (user && user.id) ? String(user.id) : '';
      const email = (user && user.email) ? String(user.email) : '';
      const token = await getAccessToken();

      // Déduction autoritaire côté serveur PostgreSQL (bloque à 402 si solde insuffisant)
      let backendHandled = false;
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${getBackendApiBase()}/api/credits/deduct`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId: uid,
            email: email,
            name: user ? user.name : '',
            amount: cost,
            reason: reason,
            fallbackCredits: user ? Number(user.credits || 0) : 0
          })
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 402 || json.insufficient) {
          await this.setUserCredits(json.credits ?? 0);
          throw new Error(json.error || `Solde insuffisant (${cost} crédit${cost > 1 ? 's' : ''} requis).`);
        }
        if (res.ok && json.success) {
          backendHandled = true;
          if (taskId) _taskDeductions[taskId] = cost;
          return await this.setUserCredits(json.credits);
        }
      } catch (err) {
        if (/Solde insuffisant/i.test(err.message)) throw err;
      }

      if (!backendHandled) {
        const currentCredits = await this.getUserCredits();
        if (currentCredits < cost) {
          throw new Error(`Solde insuffisant (${currentCredits} disponible, ${cost} requis).`);
        }
        const nextCredits = Math.max(0, currentCredits - cost);
        if (taskId) _taskDeductions[taskId] = cost;
        return await this.setUserCredits(nextCredits);
      }
    },

    // ================= CRÉATIONS =================
    saveCreation: saveCreation,
    updateCreation: updateCreation,
    getUserCreations: getUserCreations,
    getUserSongs: getUserCreations,
    deleteCreation: deleteCreation,
    uploadMediaToSupabase: uploadMediaToSupabase,

    // ================= EXPLORER PUBLIC & PARTAGÉ =================
    getExplorerPosts: async function() {
      try {
        const res = await fetch(`${getBackendApiBase()}/api/explorer`);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success && Array.isArray(json.posts)) {
          return json.posts;
        }
      } catch {}
      return null;
    },

    publishExplorerPost: async function(post) {
      if (!post) return null;
      try {
        const res = await fetch(`${getBackendApiBase()}/api/explorer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(post)
        });
        return await res.json().catch(() => ({}));
      } catch {
        return null;
      }
    },

    likeExplorerPost: async function(postId, delta = 1) {
      if (!postId) return null;
      try {
        const res = await fetch(`${getBackendApiBase()}/api/explorer/${encodeURIComponent(postId)}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delta })
        });
        return await res.json().catch(() => ({}));
      } catch {
        return null;
      }
    },

    listenExplorerPost: async function(postId) {
      if (!postId) return null;
      try {
        const res = await fetch(`${getBackendApiBase()}/api/explorer/${encodeURIComponent(postId)}/listen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        return await res.json().catch(() => ({}));
      } catch {
        return null;
      }
    },

    // ================= AUTHENTIFICATION & OTP E-MAIL (6 CHIFFRES) =================
    isUserOtpVerified: isUserOtpVerified,
    setUserOtpVerified: setUserOtpVerified,

    signInWithGoogle: async function() {
      const sb = getSupabaseOrThrow();
      clearPendingOtp();
      const redirectUrl = buildAuthRedirectUrl('/');
      let data, error;
      try {
        ({ data, error } = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl
          }
        }));
      } catch (netErr) {
        throw new Error(formatAuthError(netErr, 'Erreur réseau lors de la connexion Google.'));
      }
      if (error) {
        throw new Error(formatAuthError(error, 'Impossible de démarrer la connexion Google.'));
      }
      if (data && data.url && typeof window !== 'undefined' && window.location) {
        window.location.assign(data.url);
      }
      return data;
    },

    startGoogleEmailOtpAuth: async function(googleEmail, googleName = '') {
      const cleanEmail = String(googleEmail || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Renseigne ton adresse e-mail Google valide (ex: prenom@gmail.com).');
      }
      const resolvedName = String(googleName || cleanEmail.split('@')[0]).trim();
      setUserOtpVerified(null);
      setCurrentUser(null);

      // 1. Si un expéditeur serveur Resend est configuré, tenter l'envoi serveur
      let otpMode = 'supabase_otp';
      let otpType = 'email';
      let rateLimited = false;

      try {
        const srvRes = await fetch(`${getBackendApiBase()}/api/auth/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, purpose: 'google', userName: resolvedName })
        });
        const srvJson = await srvRes.json().catch(() => ({}));
        if (srvRes.ok && srvJson.success && srvJson.sent && !srvJson.useSupabaseOtp) {
          otpMode = 'server_otp';
          otpType = 'google';
        }
      } catch {}

      if (otpMode === 'supabase_otp') {
        const sb = getSupabaseOrThrow();
        const generatedRefCode = 'NZ-' + Math.floor(10000 + Math.random() * 90000);
        const { error } = await sb.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            shouldCreateUser: true,
            data: {
              name: resolvedName,
              full_name: resolvedName,
              auth_provider: 'google',
              referral_code: generatedRefCode
            }
          }
        });
        if (error) {
          if (/security purposes|rate limit|too many requests/i.test(error.message)) {
            rateLimited = true;
          } else {
            throw new Error(formatAuthError(error, "Impossible d'envoyer le code de validation à ton compte Google."));
          }
        }
      }

      const pendingPayload = {
        email: cleanEmail,
        name: resolvedName,
        mode: 'google',
        purpose: 'google',
        otpMode,
        otpType,
        rateLimited
      };
      setPendingOtp(pendingPayload);
      return {
        needsOtpVerification: true,
        ...pendingPayload
      };
    },

    sendEmailOtp: async function(email, purpose = 'auth', userName = '', shouldCreateUser = false) {
      email = (email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) throw new Error('Renseigne une adresse e-mail valide.');

      // 1. Si un expéditeur e-mail Nzembo (ex: Resend) est configuré côté serveur, l'utiliser en priorité
      try {
        const srvRes = await fetch(`${getBackendApiBase()}/api/auth/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, purpose, userName })
        });
        const srvJson = await srvRes.json().catch(() => ({}));
        if (srvRes.ok && srvJson.success && srvJson.sent && !srvJson.useSupabaseOtp) {
          return { success: true, otpMode: 'server_otp', otpType: purpose };
        }
      } catch {}

      // 2. Envoi OTP natif à 6 chiffres par e-mail via Supabase Auth
      const sb = getSupabaseOrThrow();
      if (purpose === 'signup_unconfirmed') {
        const { error } = await sb.auth.resend({ type: 'signup', email });
        if (error) throw new Error(formatAuthError(error, "Impossible d'envoyer le code par e-mail."));
        return { success: true, otpMode: 'supabase_otp', otpType: 'signup' };
      }

      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: Boolean(shouldCreateUser || purpose === 'google' || purpose === 'register')
        }
      });
      if (error) {
        throw new Error(formatAuthError(error, "Impossible d'envoyer le code de validation par e-mail."));
      }
      return { success: true, otpMode: 'supabase_otp', otpType: 'email' };
    },

    verifyEmailOtp: async function({ email, code, purpose = 'auth', otpMode = 'supabase_otp', otpType = 'email', expectedUser = null }) {
      email = (email || '').trim().toLowerCase();
      const token = String(code || '').replace(/\s+/g, '').trim();
      if (!email || !/^\d{6}$/.test(token)) {
        throw new Error('Entre le code de validation à 6 chiffres reçu par e-mail.');
      }

      const sb = getSupabaseOrThrow();
      let authUser = null;

      if (otpMode === 'server_otp') {
        const vRes = await fetch(`${getBackendApiBase()}/api/auth/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, purpose, code: token })
        });
        const vJson = await vRes.json().catch(() => ({}));
        if (!vRes.ok || !vJson.success) {
          throw new Error(vJson.error || 'Code de validation invalide ou expiré.');
        }
        const { data: uData } = await sb.auth.getUser();
        authUser = uData && uData.user;
      } else {
        const typesToTry = otpType === 'signup'
          ? ['signup', 'email', 'magiclink']
          : ['email', 'magiclink', 'signup'];
        let verifyError = null;
        let verifyData = null;

        for (const t of typesToTry) {
          const res = await sb.auth.verifyOtp({ email, token, type: t });
          if (!res.error && res.data && (res.data.user || res.data.session)) {
            verifyData = res.data;
            verifyError = null;
            break;
          }
          if (!verifyError) verifyError = res.error;
        }
        if (!verifyData && verifyError) {
          throw new Error(formatAuthError(verifyError, 'Code de validation à 6 chiffres incorrect ou expiré.'));
        }
        authUser = (verifyData && (verifyData.user || (verifyData.session && verifyData.session.user))) || null;
      }

      clearPendingOtp();

      // Récupérer l'utilisateur complet et hydrater profil + crédits exacts (0 à l'inscription)
      if (!authUser) {
        const { data: uData } = await sb.auth.getUser();
        authUser = uData && uData.user;
      }
      if (!authUser && expectedUser && expectedUser.id) {
        authUser = expectedUser;
      }
      if (!authUser || !authUser.id) {
        throw new Error("Validation réussie, mais la session n'a pas pu être ouverte. Reconnecte-toi.");
      }

      // Marquer explicitement cette session comme validée par OTP à 6 chiffres
      setUserOtpVerified(authUser.id);

      const isRegister = (purpose === 'register' || purpose === 'signup_unconfirmed');
      let profile = null;
      try {
        const { data: pData } = await sb.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
        profile = pData;
        if (!profile || isRegister) {
          const fallbackName = (expectedUser && expectedUser.name) || authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0];
          const fallbackRef = (expectedUser && expectedUser.referral_code) || authUser.user_metadata?.referral_code || ('NZ-' + authUser.id.substring(0, 5).toUpperCase());
          const targetCredits = (!profile) ? 0 : Math.max(0, Number(profile.credits) || 0);
          const { data: ups } = await sb.from('profiles').upsert([{
            id: authUser.id,
            email: authUser.email,
            name: (profile && profile.name) || fallbackName,
            credits: isRegister && !profile ? 0 : targetCredits,
            referral_code: (profile && profile.referral_code) || fallbackRef
          }], { onConflict: 'id' }).select().maybeSingle();
          if (ups) profile = ups;
        }
      } catch {}

      const fallbackName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || (expectedUser && expectedUser.name) || email.split('@')[0];
      const fallbackRef = (profile && profile.referral_code) || authUser.user_metadata?.referral_code || ('NZ-' + authUser.id.substring(0, 5).toUpperCase());
      const userObj = {
        id: authUser.id,
        email: authUser.email || email,
        name: (profile && profile.name) || fallbackName,
        credits: (profile && profile.credits !== undefined && profile.credits !== null) ? Math.max(0, Number(profile.credits)) : 0,
        avatar_url: (profile && profile.avatar_url) || getSavedAvatarForUser(authUser.id) || authUser.user_metadata?.avatar_url || null,
        referral_code: fallbackRef,
        referral_code_used: authUser.user_metadata?.referral_code_used || null
      };

      const syncedCredits = await this.syncUserWithBackend(userObj, {
        isNewSignup: isRegister && !profile,
        existingProfileCredits: userObj.credits
      });
      if (syncedCredits !== null) {
        userObj.credits = syncedCredits;
        savePersistedCredits(syncedCredits, userObj.id);
      }

      setCurrentUser(userObj);
      return userObj;
    },

    login: async function(email, password) {
      email = (email || '').trim().toLowerCase();
      password = (password || '').trim();
      if (!email) throw new Error('Renseigne ton adresse e-mail.');
      if (!password) throw new Error('Renseigne ton mot de passe.');

      clearPendingOtp();
      setUserOtpVerified(null);
      setCurrentUser(null);

      const sb = getSupabaseOrThrow();
      let data, error;
      try {
        ({ data, error } = await sb.auth.signInWithPassword({ email, password }));
      } catch (netErr) {
        throw new Error(formatAuthError(netErr, 'Impossible de joindre le serveur de connexion.'));
      }

      if (error) {
        throw new Error(formatAuthError(error, 'E-mail ou mot de passe incorrect.'));
      }

      const authUser = data && data.user;
      if (!authUser) throw new Error("Aucune session utilisateur retournée.");

      setUserOtpVerified(authUser.id);

      let profile = null;
      try {
        const { data: profData } = await sb.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
        profile = profData;
        if (!profile) {
          const fallbackName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0];
          const fallbackRef = authUser.user_metadata?.referral_code || ('NZ-' + authUser.id.substring(0, 5).toUpperCase());
          const { data: ups } = await sb.from('profiles').upsert([{
            id: authUser.id,
            email: authUser.email || email,
            name: fallbackName,
            credits: 0,
            referral_code: fallbackRef
          }], { onConflict: 'id' }).select().maybeSingle();
          if (ups) profile = ups;
        }
      } catch {}

      const fallbackName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0];
      const fallbackRef = (profile && profile.referral_code) || authUser.user_metadata?.referral_code || ('NZ-' + authUser.id.substring(0, 5).toUpperCase());
      const userObj = {
        id: authUser.id,
        email: authUser.email || email,
        name: (profile && profile.name) || fallbackName,
        credits: (profile && profile.credits !== undefined && profile.credits !== null) ? Math.max(0, Number(profile.credits)) : 0,
        avatar_url: (profile && profile.avatar_url) || getSavedAvatarForUser(authUser.id) || authUser.user_metadata?.avatar_url || null,
        referral_code: fallbackRef,
        referral_code_used: authUser.user_metadata?.referral_code_used || null,
        needsOtpVerification: false,
        needsConfirmation: false
      };

      const syncedCredits = await this.syncUserWithBackend(userObj, {
        isNewSignup: false,
        existingProfileCredits: userObj.credits
      });
      if (syncedCredits !== null) {
        userObj.credits = syncedCredits;
        savePersistedCredits(syncedCredits, userObj.id);
      }

      setCurrentUser(userObj);
      return userObj;
    },

    register: async function(name, email, password, referralCodeUsed = '') {
      name = (name || '').trim();
      email = (email || '').trim().toLowerCase();
      password = (password || '').trim();

      if (!name) throw new Error('Renseigne ton nom complet.');
      if (!email || !email.includes('@')) throw new Error('Renseigne une adresse e-mail valide.');
      if (!password || password.length < 6) throw new Error('Le mot de passe doit comporter au moins 6 caractères.');

      clearPendingOtp();
      setUserOtpVerified(null);
      setCurrentUser(null);

      const sb = getSupabaseOrThrow();
      const generatedRefCode = 'NZ-' + Math.floor(10000 + Math.random() * 90000);
      const redirectUrl = buildAuthRedirectUrl('/');

      let data, error;
      try {
        ({ data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              name,
              full_name: name,
              referral_code: generatedRefCode,
              referral_code_used: referralCodeUsed || null
            }
          }
        }));
      } catch (netErr) {
        throw new Error(formatAuthError(netErr, 'Erreur réseau lors de la création du compte.'));
      }

      let authUser = data && data.user;
      const isAlreadyRegistered =
        (error && /User already registered|already been registered|email_exists/i.test(error.message || '')) ||
        (authUser && Array.isArray(authUser.identities) && authUser.identities.length === 0);

      if (isAlreadyRegistered) {
        const signInAttempt = await sb.auth.signInWithPassword({ email, password }).catch(() => ({ data: null, error: true }));
        if (signInAttempt && !signInAttempt.error && signInAttempt.data && signInAttempt.data.user) {
          authUser = signInAttempt.data.user;
          data = signInAttempt.data;
          error = null;
        } else {
          throw new Error('Un compte existe déjà avec cette adresse e-mail. Connecte-toi avec ton mot de passe.');
        }
      } else if (error) {
        throw new Error(formatAuthError(error, 'Impossible de créer le compte sur le serveur.'));
      }

      if (!authUser) throw new Error("Échec de la création du compte : réponse vide.");

      if (!data || !data.session) {
        const signInAttempt = await sb.auth.signInWithPassword({ email, password }).catch(() => null);
        if (signInAttempt && signInAttempt.data && signInAttempt.data.user) {
          authUser = signInAttempt.data.user;
        }
      }

      setUserOtpVerified(authUser.id);

      let profile = null;
      try {
        if (!isAlreadyRegistered) {
          const { data: ups } = await sb.from('profiles').upsert([{
            id: authUser.id,
            email: authUser.email || email,
            name: name,
            credits: 0,
            referral_code: generatedRefCode
          }], { onConflict: 'id' }).select().maybeSingle();
          profile = ups;
        } else {
          const { data: existingProf } = await sb.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
          profile = existingProf;
        }
      } catch {}

      const userObj = {
        id: authUser.id,
        email: authUser.email || email,
        name: (profile && profile.name) || name,
        credits: isAlreadyRegistered && profile && profile.credits !== undefined ? Math.max(0, Number(profile.credits)) : 0,
        avatar_url: (profile && profile.avatar_url) || null,
        referral_code: (profile && profile.referral_code) || generatedRefCode,
        referral_code_used: referralCodeUsed || null,
        needsConfirmation: false,
        needsOtpVerification: false
      };

      const syncedCredits = await this.syncUserWithBackend(userObj, {
        isNewSignup: !isAlreadyRegistered,
        existingProfileCredits: userObj.credits
      }).catch(() => null);

      if (syncedCredits !== null) {
        userObj.credits = syncedCredits;
        savePersistedCredits(syncedCredits, userObj.id);
      }

      setCurrentUser(userObj);
      return userObj;
    },

    resendConfirmationEmail: async function(email) {
      const pending = getPendingOtp();
      const purpose = (pending && pending.otpType === 'signup') ? 'signup_unconfirmed' : ((pending && pending.purpose) || 'auth');
      return await this.sendEmailOtp(email, purpose, (pending && pending.name) || '', pending && pending.mode === 'google');
    },

    requestPasswordReset: async function(email) {
      email = (email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) throw new Error('Renseigne une adresse e-mail valide.');
      const sb = getSupabaseOrThrow();
      const redirectUrl = buildAuthRedirectUrl('/#reset-password');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
      if (error) {
        if (/security purposes|rate limit/i.test(error.message)) {
          throw new Error('Trop de tentatives, réessaie dans quelques minutes.');
        }
      }
      return { success: true };
    },

    updateUserPassword: async function(newPassword) {
      newPassword = (newPassword || '').trim();
      if (!newPassword || newPassword.length < 6) {
        throw new Error('Le mot de passe doit comporter au moins 6 caractères.');
      }
      const sb = getSupabaseOrThrow();
      const { data, error } = await sb.auth.updateUser({ password: newPassword });
      if (error) {
        if (/same password/i.test(error.message)) {
          throw new Error('Choisis un mot de passe différent du précédent.');
        }
        throw new Error(formatAuthError(error, 'Impossible de mettre à jour le mot de passe, réessaie.'));
      }
      if (data && data.user) await this.refreshUserData();
      return { success: true };
    },

    handleAuthSessionExchange: async function() {
      const sb = getSupabase();
      if (!sb || typeof window === 'undefined') return null;

      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashStr = window.location.hash || '';
        const pathname = window.location.pathname || '/';
        const isCallbackRoute = pathname === '/auth/callback' || pathname === '/callback';
        const targetCleanPath = isCallbackRoute ? '/' : pathname;

        if (searchParams.get('error') || hashStr.includes('error=')) {
          window.history.replaceState({}, document.title, targetCleanPath);
          return { error: 'Connexion annulée ou non autorisée.' };
        }

        const code = searchParams.get('code');
        if (code && typeof sb.auth.exchangeCodeForSession === 'function') {
          const { data, error } = await sb.auth.exchangeCodeForSession(code);
          window.history.replaceState({}, document.title, targetCleanPath);
          if (error) return { error: formatAuthError(error, 'Erreur lors de la validation de session.') };
          if (data && data.user) {
            clearPendingOtp();
            setUserOtpVerified(data.user.id);
            return await this.refreshUserData();
          }
        }

        if (hashStr.includes('access_token=') || hashStr.includes('refresh_token=') || isCallbackRoute) {
          const { data: sessData, error: sessErr } = await sb.auth.getSession();
          if (sessErr) return { error: formatAuthError(sessErr, 'Session invalide ou expirée.') };
          if (sessData && sessData.session && sessData.session.user) {
            window.history.replaceState({}, document.title, targetCleanPath);
            clearPendingOtp();
            setUserOtpVerified(sessData.session.user.id);
            return await this.refreshUserData();
          }
        }
      } catch (e) {}
      return null;
    },

    logout: async function() {
      clearPendingOtp();
      setUserOtpVerified(null);
      if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem('nzembo_admin_otp_verified_uid'); } catch {}
      }
      const sb = getSupabase();
      if (sb) {
        try { await sb.auth.signOut(); } catch (e) {}
      }
      setCurrentUser(null);
    },

    getCurrentUser: getCurrentUser,

    refreshUserData: async function() {
      clearPendingOtp();
      const sb = getSupabase();
      if (!sb) return getCurrentUser();

      try {
        let current = getCurrentUser();
        let authUser = null;
        try {
          const { data: uData } = await sb.auth.getUser();
          if (uData && uData.user) authUser = uData.user;
        } catch {}

        const userId = authUser ? authUser.id : (current ? current.id : null);
        if (!userId) return null;

        setUserOtpVerified(userId);

        let { data: profile } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (!profile && authUser) {
          const generatedRef = authUser.user_metadata?.referral_code || ('NZ-' + authUser.id.substring(0, 5).toUpperCase());
          const userName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || (authUser.email ? authUser.email.split('@')[0] : 'Artiste');
          const { data: insData } = await sb.from('profiles').upsert([{
            id: authUser.id,
            email: authUser.email,
            name: userName,
            credits: 0,
            referral_code: generatedRef
          }], { onConflict: 'id' }).select().maybeSingle();
          profile = insData;
        }

        const resolvedName = (profile && profile.name) || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || (current ? current.name : 'Artiste');
        let firstName = '';
        if (profile && profile.first_name) firstName = profile.first_name;
        else if (authUser?.user_metadata?.given_name) firstName = authUser.user_metadata.given_name;
        else if (resolvedName) {
          const parts = resolvedName.trim().split(/\s+/);
          if (parts[0] && parts[0].length >= 2) firstName = parts[0];
        } else if (authUser?.email) firstName = authUser.email.split('@')[0];
        if (firstName) firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

        const avatarUrl = getSavedAvatarForUser(userId) || (profile && profile.avatar_url) || authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture || null;
        const dbSbCredits = (profile && profile.credits !== undefined && profile.credits !== null) ? Math.max(0, Number(profile.credits) || 0) : 0;

        const baseUser = {
          id: userId,
          email: (profile && profile.email) || (authUser ? authUser.email : (current ? current.email : '')),
          name: resolvedName,
          first_name: firstName,
          avatar_url: avatarUrl,
          credits: dbSbCredits,
          referral_code: (profile && profile.referral_code) || authUser?.user_metadata?.referral_code || ('NZ-' + String(userId).slice(0, 5).toUpperCase()),
          referral_code_used: authUser?.user_metadata?.referral_code_used || null
        };

        const syncedNeonCredits = await this.syncUserWithBackend(baseUser, {
          isNewSignup: false,
          existingProfileCredits: dbSbCredits
        });

        let finalCredits = dbSbCredits;
        if (syncedNeonCredits !== null) {
          finalCredits = syncedNeonCredits;
          // Si le backend Neon vient d'être crédité via SasPay ou Admin, aligner Supabase profiles
          if (syncedNeonCredits !== dbSbCredits && sb && String(userId).includes('-')) {
            sb.from('profiles').update({ credits: syncedNeonCredits }).eq('id', userId).then(() => {}).catch(() => {});
          }
        }
        baseUser.credits = Math.max(0, finalCredits);
        savePersistedCredits(baseUser.credits, userId);
        setCurrentUser(baseUser);
        return baseUser;
      } catch (e) {
        return getCurrentUser();
      }
    },

    // ================= PROMOS, NOTIFICATIONS & ANALYTICS =================
    validatePromoCode: async function(code, credits = 1, currency = 'USD') {
      const clean = String(code || '').trim().toUpperCase();
      if (!clean) throw new Error('Entre un code promo.');
      const res = await fetch(`${getBackendApiBase()}/api/promos/validate?code=${encodeURIComponent(clean)}&credits=${encodeURIComponent(credits)}&currency=${encodeURIComponent(currency)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.valid) {
        throw new Error(json.error || `Code promo « ${clean} » invalide ou expiré.`);
      }
      return json;
    },

    trackVisit: async function() {
      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('nzembo_visit_tracked')) return;
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('nzembo_visit_tracked', '1');
        const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
        const deviceType = /Android/i.test(ua) ? 'Android Mobile' : (/iPhone|iPad|iPod/i.test(ua) ? 'iPhone iOS' : 'Desktop PC/Mac');
        const browser = /Edg/i.test(ua) ? 'Edge' : (/Chrome/i.test(ua) ? 'Chrome' : (/Safari/i.test(ua) ? 'Safari' : (/Firefox/i.test(ua) ? 'Firefox' : 'Autre')));
        const ref = (typeof document !== 'undefined' && document.referrer) ? new URL(document.referrer).hostname : 'Direct';
        const u = getCurrentUser();
        await fetch(`${getBackendApiBase()}/api/analytics/visit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'sess_' + Date.now(),
            userId: u ? u.id : null,
            referrerSource: ref.includes('google') ? 'Google' : (ref.includes('whatsapp') || ref.includes('wa.me') ? 'WhatsApp' : (ref.includes('t.me') ? 'Telegram' : ref)),
            deviceType,
            browser,
            path: (typeof window !== 'undefined' && window.location) ? window.location.pathname : '/'
          })
        }).catch(() => {});
      } catch {}
    },

    fetchNotifications: async function(userId = '') {
      try {
        const u = userId || (getCurrentUser() && getCurrentUser().id) || '';
        const res = await fetch(`${getBackendApiBase()}/api/notifications?userId=${encodeURIComponent(u)}`);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success && Array.isArray(json.notifications)) {
          if (typeof window !== 'undefined' && window.NzemboStore && typeof window.NzemboStore.mergeRemoteNotifications === 'function') {
            window.NzemboStore.mergeRemoteNotifications(json.notifications);
          }
          return json.notifications;
        }
      } catch {}
      return [];
    },

    pushNotification: async function({ title, subject = '', content, category = 'error', categoryLabel = 'Erreur / Alerte', isError = true }) {
      try {
        const u = getCurrentUser();
        await fetch(`${getBackendApiBase()}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: u ? u.id : 'guest',
            category,
            categoryLabel,
            title,
            subject,
            content,
            isError
          })
        }).catch(() => {});
      } catch {}
    },

    // ================= MOTEUR AUDIO IA MULTI-OUTILS =================
    getEngineCredits: async function() {
      try {
        const res = await fetchAudioEngine('/generate/credit', { method: 'GET' });
        const data = await res.json();
        return data && typeof data.data === 'number' ? data.data : 0;
      } catch {
        return 0;
      }
    },

    generateMusic: async function({ prompt, style, occasion, recipient, relationship = '', language = '', secondaryLanguage = '', lyrics, isInstrumental = false, make_instrumental, instrumental, gender = 'female', title = '', styleConfig = null, tags = '', custom_mode, customMode, count = 1, personaId = '', personaModel = 'voice_persona' }) {
      const currentBal = await this.getUserCredits();
      if (currentBal < 1) {
        throw new Error('Solde insuffisant. Recharge tes crédits pour créer une chanson.');
      }

      const isInstru = Boolean(isInstrumental || make_instrumental || instrumental);
      let resolvedStyleConfig = styleConfig;
      if (!resolvedStyleConfig && typeof window !== 'undefined' && typeof window.getMusicStyleConfig === 'function') {
        resolvedStyleConfig = window.getMusicStyleConfig(style);
      }
      if (!resolvedStyleConfig && typeof MUSIC_STYLES_DICTIONARY !== 'undefined') {
        resolvedStyleConfig = MUSIC_STYLES_DICTIONARY[style] || MUSIC_STYLES_DICTIONARY["rumba_congolaise"];
      }

      const styleDisplayName = resolvedStyleConfig ? resolvedStyleConfig.name : (style || 'Rumba congolaise');
      const songTitle = (title || (recipient ? `Pour ${recipient} (${styleDisplayName})` : `${occasion || 'Chanson'} (${styleDisplayName})`)).slice(0, 80);

      let engineStyle = tags || (resolvedStyleConfig ? (resolvedStyleConfig.sunoStylePrompt || resolvedStyleConfig.mandatoryTags) : styleDisplayName);
      if (!isInstru && language) {
        const isBilingual = Boolean(secondaryLanguage && secondaryLanguage.toLowerCase() !== language.toLowerCase());
        const langHeader = isBilingual
          ? `${language} and ${secondaryLanguage} bilingual vocals, sing in ${language} and ${secondaryLanguage}`
          : `100% ${language} vocals only, strictly sing in ${language}`;
        if (!engineStyle.toLowerCase().includes(language.toLowerCase()) || !engineStyle.toLowerCase().includes('sing in')) {
          engineStyle = langHeader + ', ' + engineStyle;
        }
      }
      if (!isInstru && !personaId) {
        let genderTag = '';
        const gLower = String(gender || '').toLowerCase();
        if (gLower === 'male' || gLower.includes('masculin') || gLower.includes('homme') || gLower === 'm') {
          genderTag = 'male vocals, solo male singer, masculine tone';
        } else if (gLower === 'female' || gLower.includes('feminin') || gLower.includes('féminin') || gLower.includes('femme') || gLower === 'f') {
          genderTag = 'female vocals, solo female singer, feminine tone';
        } else if (gLower.includes('duo') || gLower.includes('duet')) {
          genderTag = 'male and female duet vocals, vocal harmony';
        } else if (gLower.includes('choeur') || gLower.includes('chœur') || gLower.includes('gospel')) {
          genderTag = 'gospel choir vocals, vocal ensemble';
        }
        if (genderTag && !engineStyle.toLowerCase().includes('male vocal') && !engineStyle.toLowerCase().includes('female vocal') && !engineStyle.toLowerCase().includes('duet') && !engineStyle.toLowerCase().includes('choir')) {
          engineStyle = genderTag + ', ' + engineStyle;
        }
      } else if (personaId && !engineStyle.toLowerCase().includes('persona')) {
        engineStyle += ', custom vocal persona';
      }

      const hasCustomLyrics = Boolean(!isInstru && lyrics && lyrics.trim().length > 0);
      const isCustomMode = (custom_mode !== undefined) ? Boolean(custom_mode) : ((customMode !== undefined) ? Boolean(customMode) : (hasCustomLyrics || isInstru));

      let lyricPrompt = '';
      if (isInstru) {
        lyricPrompt = '';
      } else if (hasCustomLyrics) {
        const rawLyr = lyrics.trim();
        const isBilingual = Boolean(secondaryLanguage && secondaryLanguage.toLowerCase() !== language.toLowerCase());
        const langTag = language
          ? (isBilingual ? `[Language: ${language} & ${secondaryLanguage} Bilingual]\n` : `[Language: ${language} ONLY (100% Monolingual)]\n`)
          : '';
        lyricPrompt = (rawLyr.startsWith('[Language:') ? rawLyr : (langTag + rawLyr)).slice(0, 5000);
      } else {
        const langNote = language ? (secondaryLanguage ? ` chantée en ${language} et ${secondaryLanguage}` : ` chantée exclusivement en ${language}`) : '';
        const recNote = recipient ? ` dédiée à ${recipient}` : '';
        lyricPrompt = (prompt || `Chanson ${styleDisplayName}${langNote} pleine d'émotion pour l'occasion ${occasion || 'fête'}${recNote}`).slice(0, 2900);
      }

      const payload = {
        customMode: isCustomMode,
        style: engineStyle.slice(0, 1000),
        instrumental: isInstru,
        model: 'V6',
        count: 1,
        callBackUrl: WEBHOOK_NOOP_URL
      };

      if (personaId) {
        payload.personaId = personaId;
        payload.personaModel = personaModel || 'voice_persona';
      }

      if (!isInstru && !personaId) {
        const gLower = String(gender || '').toLowerCase();
        if (gLower === 'male' || gLower.includes('masculin') || gLower.includes('homme') || gLower === 'm') payload.vocalGender = 'm';
        else if (gLower === 'female' || gLower.includes('feminin') || gLower.includes('féminin') || gLower.includes('femme') || gLower === 'f') payload.vocalGender = 'f';
      }

      if (isCustomMode) {
        payload.title = songTitle;
        if (hasCustomLyrics) {
          payload.lyrics = lyricPrompt;
          payload.prompt = lyricPrompt;
        } else if (lyricPrompt) {
          payload.prompt = lyricPrompt;
        }
      } else {
        payload.prompt = lyricPrompt;
        if (hasCustomLyrics) payload.lyrics = lyricPrompt;
      }

      const res = await fetchAudioEngine('/generate', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.code !== 200 || !data.data || !data.data.taskId) {
        if (data.code === 429) {
          throw new Error('Capacité de génération temporairement atteinte, réessaie dans un instant.');
        }
        throw new Error(sanitizeApiErrorMessage(data.msg || data.message, `Erreur du serveur musical (Code ${data.code || res.status}).`));
      }

      const taskId = data.data.taskId;
      const songId = 'nz_' + Date.now();

      await saveCreation({
        id: songId,
        taskId: taskId,
        title: songTitle,
        prompt: lyricPrompt,
        lyrics: lyricPrompt,
        style: styleDisplayName,
        occasion: occasion,
        recipient: recipient,
        toolCategory: 'generation',
        status: 'en_cours',
        isProcessing: true
      }).catch(() => {});

      const nextCredits = await this.deductCredits(1, `Création : ${songTitle}`, taskId);

      return {
        songId,
        taskId,
        eta: 120,
        title: songTitle,
        lyrics: lyricPrompt,
        styleConfig: resolvedStyleConfig,
        remainingCredits: nextCredits
      };
    },

    pollMusicStatus: function(taskId) {
      if (!taskId) return Promise.resolve({ completed: false, status: 'IN_PROGRESS' });
      const cache = this._musicPollCache || (this._musicPollCache = {});
      if (cache[taskId] && cache[taskId].done) return Promise.resolve(cache[taskId].done);
      if (cache[taskId] && cache[taskId].inFlight) return cache[taskId].inFlight;

      const self = this;
      const run = (async () => {
        try {
          const res = await fetchAudioEngine(`/generate/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
          const data = await res.json().catch(() => ({}));
          if (!data || !data.data) return { completed: false, status: 'IN_PROGRESS' };

          const taskData = data.data;
          const status = taskData.status || '';
          const hasReadyTrack = taskData.response && Array.isArray(taskData.response.sunoData) && taskData.response.sunoData.length > 0 && Boolean(taskData.response.sunoData[0].audio_url || taskData.response.sunoData[0].stream_audio_url);

          if ((status === 'SUCCESS' || (status === 'FIRST_SUCCESS' && hasReadyTrack)) && hasReadyTrack) {
            const track1 = taskData.response.sunoData[0] || {};
            const audio1 = await persistMediaLocally(track1.audio_url || track1.stream_audio_url, 'audio', track1.id || `${taskId}_1`);
            const albumCover = await persistMediaLocally(track1.image_url || track1.source_image_url, 'image', `${taskId}_cover`);

            await updateCreation(taskId, {
              status: 'termine',
              isProcessing: false,
              audioUrl: audio1,
              audioUrl2: null,
              albumCover: albumCover,
              title: track1.title,
              lyrics: track1.prompt,
              audioId: track1.id,
              audioId2: null
            }).catch(() => {});

            const doneResult = {
              completed: true,
              status: 'COMPLETED',
              title: track1.title,
              audioUrl: audio1,
              audioUrl2: null,
              albumCover: albumCover,
              lyrics: track1.prompt,
              duration: track1.duration,
              audioId: track1.id,
              audioId2: null
            };
            cache[taskId] = { done: doneResult };
            return doneResult;
          }

          if (status === 'GENERATE_AUDIO_FAILED' || status === 'CREATE_TASK_FAILED' || status === 'FAILED' || status === 'ERROR') {
            await updateCreation(taskId, { status: 'echoue', isProcessing: false }).catch(() => {});
            // Rembourser le crédit si déduit pour cette tâche échouée
            if (_taskDeductions[taskId]) {
              const refund = _taskDeductions[taskId];
              delete _taskDeductions[taskId];
              await self.addCredits(refund).catch(() => {});
            }
            const failResult = {
              completed: false,
              failed: true,
              status: 'FAILED',
              message: sanitizeApiErrorMessage(taskData.errorMessage, 'La composition musicale a échoué côté serveur.')
            };
            cache[taskId] = { done: failResult };
            return failResult;
          }

          return { completed: false, status: status || 'IN_PROGRESS' };
        } catch (pollErr) {
          return { completed: false, status: 'IN_PROGRESS', error: sanitizeApiErrorMessage(pollErr.message) };
        } finally {
          if (cache[taskId]) cache[taskId].inFlight = null;
        }
      })();

      cache[taskId] = Object.assign(cache[taskId] || {}, { inFlight: run });
      return run;
    },

    uploadAndCoverAudio: async function({ uploadUrl, taskId, audioId, prompt, lyrics, style, title, instrumental = false, vocalGender, audioWeight, model = 'V6' }) {
      const targetModel = model || 'V6';
      const hasValidTaskIds = Boolean(isValidEngineId(taskId) && isValidEngineId(audioId));
      const hasRemoteUrl = Boolean(uploadUrl && /^https?:\/\//i.test(uploadUrl));
      const rawStyle = String(style || '').trim();
      const preserveOriginalStyle = !rawStyle || rawStyle.toLowerCase() === 'par défaut' || rawStyle.toLowerCase() === 'default' || rawStyle.toLowerCase() === 'original';

      let endpoint = '/generate/upload-cover';
      const payload = { model: targetModel, callBackUrl: WEBHOOK_NOOP_URL };

      if (hasValidTaskIds && !hasRemoteUrl) {
        endpoint = '/generate/cover';
        payload.taskId = taskId;
        payload.audioId = audioId;
      } else if (hasRemoteUrl) {
        endpoint = '/generate/upload-cover';
        payload.uploadUrl = uploadUrl;
      } else if (hasValidTaskIds) {
        endpoint = '/generate/cover';
        payload.taskId = taskId;
        payload.audioId = audioId;
      } else {
        throw new Error('Sélectionne d\'abord une chanson créée ou importe un fichier audio valide.');
      }

      const isInstru = Boolean(instrumental);
      payload.instrumental = isInstru;
      if (!preserveOriginalStyle) {
        payload.customMode = true;
        payload.style = rawStyle.slice(0, 1000);
        payload.title = (title && title.trim() && title.toLowerCase() !== 'reprise') ? title.trim().slice(0, 80) : 'Reprise Nzembo';
        if (typeof audioWeight === 'number') payload.audioWeight = Math.min(1, Math.max(0, Number(audioWeight)));
        if (!isInstru) {
          const cleanLyrics = String(lyrics || prompt || title || rawStyle).trim();
          if (cleanLyrics) payload.prompt = cleanLyrics.slice(0, 5000);
          if (vocalGender === 'm' || vocalGender === 'f') payload.vocalGender = vocalGender;
        }
      } else {
        payload.customMode = false;
        payload.audioWeight = typeof audioWeight === 'number' ? Math.min(1, Math.max(0, Number(audioWeight))) : 0.72;
        payload.prompt = String(prompt || lyrics || title || 'Fidèle reprise musicale conservant le style d\'origine').trim().slice(0, 500);
        if (!isInstru && (vocalGender === 'm' || vocalGender === 'f')) payload.vocalGender = vocalGender;
      }

      const res = await fetchAudioEngine(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) {
        return { success: true, taskId: data.data.taskId };
      }
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Erreur lors du lancement de la reprise / remix'));
    },

    addVocalsToAudio: async function({ uploadUrl, title, style, lyrics, prompt, vocalGender, negativeTags, model = 'V6' }) {
      if (!uploadUrl || !/^https?:\/\//i.test(uploadUrl)) {
        throw new Error('Fournis un fichier instrumental accessible pour poser une voix.');
      }
      const payload = {
        uploadUrl,
        callBackUrl: WEBHOOK_NOOP_URL,
        title: (title || 'Voix sur instrumental').slice(0, 80),
        negativeTags: (negativeTags || 'Heavy Metal, Aggressive Screaming Vocals').slice(0, 1000),
        style: (style || 'Afrobeat, Rumba').slice(0, 1000),
        model: model || 'V6'
      };
      if (vocalGender === 'm' || vocalGender === 'f') payload.vocalGender = vocalGender;
      if (lyrics && String(lyrics).trim()) payload.lyrics = String(lyrics).trim().slice(0, 5000);
      if (prompt && String(prompt).trim()) payload.prompt = String(prompt).trim().slice(0, 5000);

      const res = await fetchAudioEngine('/generate/add-vocals', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) return { success: true, taskId: data.data.taskId };
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Erreur lors de l\'ajout de voix sur l\'instrumentale'));
    },

    addInstrumentalToAudio: async function({ uploadUrl, title, tags, style, negativeTags, lyrics, vocalGender, model = 'V6' }) {
      if (!uploadUrl || !/^https?:\/\//i.test(uploadUrl)) {
        throw new Error('Fournis ou importe une piste vocale valide pour composer l\'instrumental.');
      }
      const payload = {
        uploadUrl,
        title: (title || 'Arrangement instrumental').slice(0, 80),
        tags: (tags || style || 'Acoustic Guitar, Warm Bass, Rumba Congolaise, Soft Percussion').slice(0, 1000),
        negativeTags: (negativeTags || 'Distortion, Harsh Noise, Clipping, Low Quality, Out of tune').slice(0, 1000),
        callBackUrl: WEBHOOK_NOOP_URL,
        model: model || 'V6'
      };
      if (lyrics && String(lyrics).trim()) payload.lyrics = String(lyrics).trim().slice(0, 5000);
      if (vocalGender === 'm' || vocalGender === 'f') payload.vocalGender = vocalGender;

      const res = await fetchAudioEngine('/generate/add-instrumental', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) return { success: true, taskId: data.data.taskId };
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Erreur lors de la génération de l\'arrangement instrumental'));
    },

    generateLyrics: async function(input, languageOverride = '') {
      let condensedPrompt = '';
      if (input && typeof input === 'object') {
        const lang = String(input.language || languageOverride || '').trim();
        const secLang = String(input.secondaryLanguage || '').trim();
        const isBilingual = Boolean(secLang && secLang.toLowerCase() !== lang.toLowerCase());
        const style = String(input.style || '').trim();
        const occasion = String(input.occasion || '').trim();
        const recipient = String(input.recipient || '').trim();
        const tone = String(input.tone || '').trim();
        const rawStory = String(input.story || input.theme || input.prompt || '').replace(/\s+/g, ' ').trim();

        const langDir = lang ? (isBilingual ? `Écris en mélange bilingue ${lang}+${secLang}.` : `Écris toutes les paroles en ${lang}, sans mélange.`) : '';
        const occPart = occasion ? ` ${occasion}.` : '';
        const stylePart = style ? ` Style: ${style}.` : '';
        const tonePart = tone ? ` Ton: ${tone}.` : '';
        const recPart = recipient ? ` Pour: ${recipient}.` : '';
        const hasStory = Boolean(rawStory && rawStory.length >= 10);
        const storyIntro = hasStory ? ` Histoire vraie: ` : ` Thème: `;
        const storyContent = hasStory ? rawStory : (rawStory || `Célébration ${occasion || 'joyeuse'}`);

        const prefix = `${langDir}${occPart}${stylePart}${tonePart}${recPart} Structure: couplet, refrain, pont.${storyIntro}`.trim();
        const remain = Math.max(20, 198 - prefix.length);
        const clippedTheme = storyContent.length > remain ? storyContent.slice(0, remain).replace(/\s+\S*$/, '') : storyContent;
        condensedPrompt = `${prefix} ${clippedTheme}`.replace(/\s+/g, ' ').trim();
      } else {
        const lang = String(languageOverride || '').trim();
        const raw = String(input || 'Chanson joyeuse pleine d\'émotion').replace(/\s+/g, ' ').trim();
        condensedPrompt = lang ? `Écris toutes les paroles en ${lang}, sans mélange: ${raw}`.replace(/\s+/g, ' ').trim() : raw;
      }

      if (condensedPrompt.length > 200) {
        condensedPrompt = condensedPrompt.slice(0, 200).replace(/\s+\S*$/, '') || condensedPrompt.slice(0, 200);
      }

      const res = await fetchAudioEngine('/lyrics', {
        method: 'POST',
        body: JSON.stringify({ prompt: condensedPrompt, callBackUrl: WEBHOOK_NOOP_URL })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) {
        return { success: true, taskId: data.data.taskId };
      }
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Erreur lors du lancement de la génération de paroles'));
    },

    pollLyricsStatus: async function(taskId) {
      try {
        const res = await fetchAudioEngine(`/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (!data || !data.data) return { completed: false, status: 'IN_PROGRESS' };
        const st = data.data.status;
        if (st === 'SUCCESS') {
          let text = '';
          let title = 'Paroles';
          const resp = data.data.response;
          if (resp) {
            if (Array.isArray(resp.data) && resp.data.length > 0) {
              text = resp.data[0].text || '';
              title = resp.data[0].title || title;
            } else if (resp.text) {
              text = resp.text;
              title = resp.title || title;
            }
          }
          if (text) return { completed: true, status: 'SUCCESS', lyrics: text, title, textResult: text };
        }
        if (st === 'GENERATE_LYRICS_FAILED' || st === 'CREATE_TASK_FAILED' || st === 'FAILED') {
          return { completed: false, failed: true, status: 'FAILED', message: sanitizeApiErrorMessage(data.data.errorMessage, 'Échec de la génération de paroles') };
        }
        return { completed: false, status: st || 'IN_PROGRESS' };
      } catch {
        return { completed: false, status: 'RETRY' };
      }
    },

    separateStems: async function({ taskId, audioId, audioUrl, type = 'separate_vocal', stemName = '' }) {
      const payload = { type: type || 'separate_vocal', callBackUrl: WEBHOOK_NOOP_URL };
      if (audioUrl && audioUrl.startsWith('http') && (!audioId || audioId.startsWith('audio_') || !isValidEngineId(audioId))) {
        payload.audioUrl = audioUrl;
      } else {
        if (taskId) payload.taskId = taskId;
        if (audioId) payload.audioId = audioId;
      }
      if (stemName && type === 'split_stem_advanced') payload.stemName = stemName;

      const res = await fetchAudioEngine('/vocal-removal/generate', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) return { success: true, taskId: data.data.taskId };
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Échec de la séparation des pistes audio'));
    },

    pollStemStatus: async function(taskId) {
      const res = await fetchAudioEngine(`/vocal-removal/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (data && data.data && (data.data.successFlag === 'SUCCESS' || data.data.status === 'SUCCESS')) {
        const resp = data.data.response || {};
        const vocalUrl = await persistMediaLocally(resp.vocalUrl, 'audio', `${taskId}_vocals`);
        const instrumentalUrl = await persistMediaLocally(resp.instrumentalUrl, 'audio', `${taskId}_instru`);
        await updateCreation(taskId, { status: 'termine', isProcessing: false, vocalUrl, instrumentalUrl, audioUrl: instrumentalUrl || vocalUrl }).catch(() => {});
        return { completed: true, status: 'SUCCESS', vocalUrl, instrumentalUrl, audioUrl: instrumentalUrl || vocalUrl, stems: resp };
      }
      if (data && data.data && (data.data.successFlag === 'FAILED' || data.data.errorCode)) {
        return { completed: false, failed: true, message: sanitizeApiErrorMessage(data.data.errorMessage, 'Échec de la séparation des pistes') };
      }
      return { completed: false, status: 'IN_PROGRESS' };
    },

    extendMusic: async function({ taskId, audioId, uploadUrl, lyrics, style, title, continueAt = 60, model = 'V6' }) {
      const payload = { model: model || 'V6', continueAt: Math.max(1, parseInt(continueAt, 10) || 60), callBackUrl: WEBHOOK_NOOP_URL };
      let endpoint = '/generate/extend';
      if (uploadUrl && uploadUrl.startsWith('http') && (!isValidEngineId(taskId) || !isValidEngineId(audioId))) {
        payload.uploadUrl = uploadUrl;
        endpoint = '/generate/upload-extend';
      } else {
        if (taskId) payload.taskId = taskId;
        if (audioId) payload.audioId = audioId;
      }
      if (lyrics) payload.lyrics = lyrics.slice(0, 5000);
      payload.style = (style || 'Afrobeat, Rumba Modern').slice(0, 1000);
      if (title) payload.title = title.slice(0, 80);

      const res = await fetchAudioEngine(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) return { success: true, taskId: data.data.taskId };
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Échec de l\'extension du morceau'));
    },

    createMusicVideo: async function({ taskId, audioId, audioUrl = '', title = '' }) {
      let srcTaskId = String(taskId || '').trim();
      let srcAudioId = String(audioId || '').trim();

      if ((!isValidEngineId(srcTaskId) || !isValidEngineId(srcAudioId)) && typeof window !== 'undefined' && Array.isArray(window.userSongs)) {
        const matchLocal = window.userSongs.find(s =>
          s && (isValidEngineId(s.taskId) || isValidEngineId(s.audioId)) &&
          ((srcTaskId && (s.id === srcTaskId || s.taskId === srcTaskId)) ||
           (audioUrl && (s.audioUrl === audioUrl || s.audioUrl2 === audioUrl)) ||
           (title && s.title && s.title.toLowerCase() === String(title).toLowerCase()))
        );
        if (matchLocal) {
          if (!isValidEngineId(srcTaskId) && isValidEngineId(matchLocal.taskId)) srcTaskId = matchLocal.taskId;
          if (!isValidEngineId(srcAudioId) && isValidEngineId(matchLocal.audioId)) srcAudioId = matchLocal.audioId;
          if (!audioUrl && matchLocal.audioUrl) audioUrl = matchLocal.audioUrl;
        }
      }

      if (!isValidEngineId(srcAudioId) && audioUrl) {
        const uuidMatch = String(audioUrl).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch && isValidEngineId(uuidMatch[0])) srcAudioId = uuidMatch[0];
      }

      if (!isValidEngineId(srcTaskId) || !isValidEngineId(srcAudioId)) {
        try {
          const sb = getSupabase();
          if (sb) {
            const { data: rows } = await sb.from('creations').select('id,task_id,audio_id,audio_url,title').limit(50);
            if (Array.isArray(rows)) {
              const found = rows.find(r =>
                r && (isValidEngineId(r.task_id) || isValidEngineId(r.audio_id)) &&
                ((srcTaskId && (r.id === srcTaskId || r.task_id === srcTaskId)) ||
                 (srcAudioId && r.audio_id === srcAudioId) ||
                 (audioUrl && r.audio_url === audioUrl) ||
                 (title && r.title && r.title.toLowerCase() === String(title).toLowerCase()))
              );
              if (found) {
                if (!isValidEngineId(srcTaskId) && isValidEngineId(found.task_id)) srcTaskId = found.task_id;
                if (!isValidEngineId(srcAudioId) && isValidEngineId(found.audio_id)) srcAudioId = found.audio_id;
              }
            }
          }
        } catch {}
      }

      if (isValidEngineId(srcTaskId) && !isValidEngineId(srcAudioId)) {
        try {
          const recRes = await fetchAudioEngine(`/generate/record-info?taskId=${encodeURIComponent(srcTaskId)}`, { method: 'GET' });
          const recData = await recRes.json().catch(() => ({}));
          const tracks = recData?.data?.response?.sunoData;
          if (Array.isArray(tracks) && tracks[0] && isValidEngineId(tracks[0].id)) srcAudioId = tracks[0].id;
        } catch {}
      }

      if (!isValidEngineId(srcTaskId) || !isValidEngineId(srcAudioId)) {
        throw new Error('Cette chanson n\'a pas d\'identifiant compatible pour la vidéo MP4. Sélectionne une chanson créée sur Nzembo.');
      }

      const res = await fetchAudioEngine('/mp4/generate', {
        method: 'POST',
        body: JSON.stringify({ taskId: srcTaskId, audioId: srcAudioId, callBackUrl: WEBHOOK_NOOP_URL })
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.data && data.data.taskId && (res.ok || data.code === 200 || data.code === 409)) {
        return { success: true, isEngineTask: true, taskId: data.data.taskId, sourceTaskId: srcTaskId, sourceAudioId: srcAudioId, conversionType: 'mp4', eta: data.code === 409 ? 6 : 90 };
      }
      if (data.code === 429) throw new Error('Crédits vidéo épuisés.');
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, `Échec du lancement de la vidéo (code ${data.code || res.status}).`));
    },

    pollMusicVideoStatus: function(taskId) {
      if (!taskId) return Promise.resolve({ completed: false, status: 'PENDING' });
      if (!isValidEngineId(taskId)) {
        return Promise.resolve({ completed: false, failed: true, status: 'FAILED', message: 'Tâche vidéo invalide.' });
      }
      const cache = this._videoPollCache || (this._videoPollCache = {});
      if (cache[taskId] && cache[taskId].done) return Promise.resolve(cache[taskId].done);
      if (cache[taskId] && cache[taskId].inFlight) return cache[taskId].inFlight;

      const self = this;
      const run = (async () => {
        try {
          const res = await fetchAudioEngine(`/mp4/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
          const data = await res.json().catch(() => ({}));
          if (!data || data.code !== 200 || !data.data) return { completed: false, status: 'PENDING' };

          const taskData = data.data;
          const flag = String(taskData.successFlag || taskData.status || 'PENDING').toUpperCase();
          const rawVideoUrl = (taskData.response && (taskData.response.videoUrl || taskData.response.video_url)) || '';

          if (flag === 'SUCCESS' && rawVideoUrl) {
            const result = { completed: true, status: 'SUCCESS', videoUrl: rawVideoUrl, rawVideoUrl, audioUrl: '' };
            cache[taskId] = { done: result };
            updateCreation(taskId, { status: 'termine', isProcessing: false, videoUrl: rawVideoUrl, audioUrl: '' }).catch(() => {});
            self.persistVideoInBackground(taskId, rawVideoUrl);
            return result;
          }
          if (['GENERATE_MP4_FAILED', 'CREATE_TASK_FAILED', 'CALLBACK_EXCEPTION', 'FAILED'].includes(flag) || taskData.errorCode) {
            const result = { completed: false, failed: true, status: 'FAILED', message: sanitizeApiErrorMessage(taskData.errorMessage, 'La création de la vidéo MP4 a échoué.') };
            cache[taskId] = { done: result };
            updateCreation(taskId, { status: 'echoue', isProcessing: false }).catch(() => {});
            return result;
          }
          return { completed: false, status: flag || 'PENDING' };
        } catch {
          return { completed: false, status: 'PENDING' };
        } finally {
          if (cache[taskId]) cache[taskId].inFlight = null;
        }
      })();
      cache[taskId] = Object.assign(cache[taskId] || {}, { inFlight: run });
      return run;
    },

    persistVideoInBackground: function(taskId, rawVideoUrl) {
      const store = this._persistedVideos || (this._persistedVideos = {});
      if (!rawVideoUrl || store[taskId]) return;
      store[taskId] = true;
      persistMediaLocally(rawVideoUrl, 'video', `${taskId}_video`).then(storedUrl => {
        if (!storedUrl || storedUrl === rawVideoUrl || !/^https?:\/\//.test(storedUrl) || /localhost|127\.0\.0\.1/.test(storedUrl)) return;
        updateCreation(taskId, { videoUrl: storedUrl }).catch(() => {});
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nzembo-video-persisted', { detail: { taskId, rawVideoUrl, storedUrl } }));
        }
      }).catch(() => {});
    },

    getTimestampedLyrics: async function({ taskId, audioId }) {
      if (!isValidEngineId(taskId) || !isValidEngineId(audioId)) return { alignedWords: [], vtt: '' };
      try {
        const res = await fetchAudioEngine('/generate/get-timestamped-lyrics', { method: 'POST', body: JSON.stringify({ taskId, audioId }) });
        const data = await res.json().catch(() => ({}));
        const words = (data && data.code === 200 && data.data && Array.isArray(data.data.alignedWords)) ? data.data.alignedWords : [];
        return { alignedWords: words, vtt: buildLyricsVtt(words) };
      } catch {
        return { alignedWords: [], vtt: '' };
      }
    },

    convertToWav: async function({ taskId, audioId }) {
      if (!taskId && !audioId) throw new Error('Identifiant requis pour la conversion WAV Master.');
      const payload = { callBackUrl: WEBHOOK_NOOP_URL };
      if (taskId) payload.taskId = taskId;
      if (audioId) payload.audioId = audioId;
      const res = await fetchAudioEngine('/wav/generate', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) return { success: true, taskId: data.data.taskId };
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Échec de la conversion au format WAV'));
    },

    pollWavStatus: async function(taskId) {
      const res = await fetchAudioEngine(`/wav/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (data && data.data && (data.data.successFlag === 'SUCCESS' || data.data.status === 'SUCCESS')) {
        const wavUrl = await persistMediaLocally(data.data.response?.audioWavUrl, 'audio', `${taskId}_wav`);
        await updateCreation(taskId, { status: 'termine', isProcessing: false, audioUrl: wavUrl }).catch(() => {});
        return { completed: true, status: 'SUCCESS', audioUrl: wavUrl };
      }
      if (data && data.data && (data.data.successFlag === 'FAILED' || data.data.errorCode)) {
        return { completed: false, failed: true, message: sanitizeApiErrorMessage(data.data.errorMessage, 'Échec de la conversion WAV') };
      }
      return { completed: false, status: 'IN_PROGRESS' };
    },

    generateAlbumCover: async function(taskId) {
      if (!taskId) throw new Error('Sélectionne une chanson générée pour créer sa pochette.');
      const res = await fetchAudioEngine('/suno/cover/generate', { method: 'POST', body: JSON.stringify({ taskId, callBackUrl: WEBHOOK_NOOP_URL }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code === 200 && data.data && data.data.taskId) return { success: true, taskId: data.data.taskId };
      throw new Error(sanitizeApiErrorMessage(data.msg || data.message, 'Échec de la génération de pochette'));
    },

    pollAlbumCoverStatus: async function(taskId) {
      const res = await fetchAudioEngine(`/suno/cover/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (data && data.data && (data.data.successFlag === 1 || data.data.status === 'SUCCESS')) {
        const images = data.data.response?.images || [];
        const localCover = await persistMediaLocally(images[0] || '', 'image', `${taskId}_cover_art`);
        await updateCreation(taskId, { status: 'termine', isProcessing: false, albumCover: localCover, coverUrl: localCover }).catch(() => {});
        return { completed: true, status: 'SUCCESS', coverUrl: localCover, images };
      }
      return { completed: false, status: 'IN_PROGRESS' };
    },

    uploadLocalAudioFile: async function(fileOrBlob, fileName = 'track.mp3', options = {}) {
      if (!fileOrBlob || (typeof fileOrBlob.size === 'number' && fileOrBlob.size === 0)) {
        throw new Error('Fichier audio vide ou illisible. Réessaie avec un autre fichier.');
      }

      const env = getEnvConfig();
      const token = env.ENGINE_BEARER_TOKEN;
      const safeName = ensureAudioFileName(fileName || (fileOrBlob && fileOrBlob.name), fileOrBlob);
      const mimeType = resolveUploadMimeType(fileOrBlob, safeName);
      const requireRemoteUrl = options.requireRemoteUrl !== false;

      async function toBase64DataUrl(blobCandidate, candidateMime) {
        if (typeof FileReader !== 'undefined' && blobCandidate instanceof Blob) {
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Lecture impossible'));
            reader.readAsDataURL(blobCandidate);
          });
        } else if (typeof Buffer !== 'undefined' && blobCandidate && typeof blobCandidate.arrayBuffer === 'function') {
          const buf = Buffer.from(await blobCandidate.arrayBuffer());
          return `data:${candidateMime};base64,${buf.toString('base64')}`;
        }
        return '';
      }

      async function tryUploadSingleBlob(blobCandidate, candidateName, candidateMime) {
        let uploadBlob = blobCandidate;
        try {
          if (blobCandidate && typeof Blob !== 'undefined' && blobCandidate instanceof Blob && (!blobCandidate.type || blobCandidate.type !== candidateMime)) {
            uploadBlob = new Blob([blobCandidate], { type: candidateMime });
          }
        } catch {}

        const isBrowserHttp = (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol));

        // A. Stockage Nzembo Bucket
        try {
          const sbUrl = await uploadMediaToSupabase(uploadBlob, candidateName, 'audio');
          if (sbUrl && /^https?:\/\//i.test(sbUrl)) return sbUrl;
        } catch {}

        // C. Proxy Backend Same-Origin Base64 (zéro CORS en production HTTPS)
        if (isBrowserHttp && (!uploadBlob.size || uploadBlob.size <= 4 * 1024 * 1024)) {
          try {
            const b64 = await toBase64DataUrl(uploadBlob, candidateMime);
            if (b64) {
              const rSrv = await fetch(`${getBackendApiBase()}/api/engine/upload-base64`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64Data: b64, uploadPath: 'nzembo/audio', fileName: `${Date.now()}_${candidateName}` })
              });
              const jSrv = await rSrv.json().catch(() => ({}));
              const dlSrv = jSrv && (jSrv.downloadUrl || jSrv.url || (jSrv.data && (jSrv.data.downloadUrl || jSrv.data.fileUrl || jSrv.data.url)));
              if (rSrv.ok && dlSrv && /^https?:\/\//i.test(dlSrv)) return dlSrv;
            }
          } catch {}
        }

        // D. Upload direct Stream / Base64
        if (token) {
          try {
            const fd = new FormData();
            fd.append('file', uploadBlob, candidateName);
            fd.append('uploadPath', 'nzembo/audio');
            fd.append('fileName', `${Date.now()}_${candidateName}`);
            const res = await fetch(`${FILE_UPLOAD_BASE}/file-stream-upload`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              body: fd
            });
            const json = await res.json().catch(() => ({}));
            const dlUrl = json && (json.downloadUrl || json.url || (json.data && (json.data.downloadUrl || json.data.fileUrl || json.data.url)));
            if (res.ok && dlUrl && /^https?:\/\//i.test(dlUrl)) return dlUrl;
          } catch {}

          if (!uploadBlob.size || uploadBlob.size <= 10 * 1024 * 1024) {
            try {
              const b64 = await toBase64DataUrl(uploadBlob, candidateMime);
              if (b64) {
                const resB64 = await fetch(`${FILE_UPLOAD_BASE}/file-base64-upload`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ base64Data: b64, uploadPath: 'nzembo/audio', fileName: `${Date.now()}_${candidateName}` })
                });
                const jB64 = await resB64.json().catch(() => ({}));
                const dlB64 = jB64 && (jB64.downloadUrl || jB64.url || (jB64.data && (jB64.data.downloadUrl || jB64.data.fileUrl || jB64.data.url)));
                if (resB64.ok && dlB64 && /^https?:\/\//i.test(dlB64)) return dlB64;
              }
            } catch {}
          }
        }
        return null;
      }

      const exoticExts = ['.amr', '.3gp', '.3gpp', '.caf', '.wma', '.webm', '.opus', '.aiff', '.aif'];
      const lowSafe = safeName.toLowerCase();
      const shouldPreConvert = (fileOrBlob.size && fileOrBlob.size > 18 * 1024 * 1024) || exoticExts.some(ext => lowSafe.endsWith(ext));

      let convertedWavBlob = null;
      let primaryBlob = fileOrBlob;
      let primaryName = safeName;
      let primaryMime = mimeType;

      if (shouldPreConvert) {
        convertedWavBlob = await transcodeAudioBlobToWav(fileOrBlob);
        if (convertedWavBlob && convertedWavBlob.size > 0) {
          primaryBlob = convertedWavBlob;
          primaryName = safeName.replace(/\.[^/.]+$/, '') + '.wav';
          primaryMime = 'audio/wav';
        }
      }

      let remoteUrl = await tryUploadSingleBlob(primaryBlob, primaryName, primaryMime);
      if (!remoteUrl && !convertedWavBlob) {
        convertedWavBlob = await transcodeAudioBlobToWav(fileOrBlob);
        if (convertedWavBlob && convertedWavBlob.size > 0) {
          remoteUrl = await tryUploadSingleBlob(convertedWavBlob, safeName.replace(/\.[^/.]+$/, '') + '.wav', 'audio/wav');
        }
      }

      if (remoteUrl && /^https?:\/\//i.test(remoteUrl)) return remoteUrl;
      if (requireRemoteUrl) throw new Error('Envoi audio impossible pour le moment. Vérifie ta connexion et réessaie.');
      if (typeof URL !== 'undefined' && URL.createObjectURL && fileOrBlob instanceof Blob) return URL.createObjectURL(fileOrBlob);
      return '';
    },

    updateUserAvatar: async function(fileOrDataUrl) {
      const current = getCurrentUser() || {};
      const userId = current.id || null;
      let finalAvatarUrl = '';

      if (typeof fileOrDataUrl === 'string') {
        finalAvatarUrl = fileOrDataUrl;
      } else if (fileOrDataUrl && typeof Blob !== 'undefined' && fileOrDataUrl instanceof Blob) {
        let uploadCandidate = fileOrDataUrl;
        let dataUrlFallback = '';
        if (typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof URL !== 'undefined') {
          try {
            const objUrl = URL.createObjectURL(fileOrDataUrl);
            try {
              const img = await new Promise((resolve, reject) => {
                const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = objUrl;
              });
              const size = 360;
              const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
              const ctx = canvas.getContext('2d');
              const minSide = Math.min(img.naturalWidth || img.width || size, img.naturalHeight || img.height || size);
              ctx.drawImage(img, Math.max(0, ((img.naturalWidth || img.width) - minSide) / 2), Math.max(0, ((img.naturalHeight || img.height) - minSide) / 2), minSide, minSide, 0, 0, size, size);
              dataUrlFallback = canvas.toDataURL('image/jpeg', 0.86);
              uploadCandidate = await new Promise(resolve => canvas.toBlob(b => resolve(b || fileOrDataUrl), 'image/jpeg', 0.86));
            } finally { URL.revokeObjectURL(objUrl); }
          } catch {}
        }
        const safeFileName = `avatar_${userId || 'user'}_${Date.now()}.jpg`;
        const uploadedUrl = await uploadMediaToSupabase(uploadCandidate, safeFileName, 'avatars').catch(() => null);
        if (uploadedUrl && /^https?:\/\//i.test(uploadedUrl)) finalAvatarUrl = uploadedUrl;
        else if (dataUrlFallback) finalAvatarUrl = dataUrlFallback;
      }

      if (!finalAvatarUrl) throw new Error('Impossible de charger cette image de profil.');
      saveLocalAvatarForUser(userId, finalAvatarUrl);
      setCurrentUser({ ...current, avatar_url: finalAvatarUrl });
      const sb = getSupabase();
      if (sb && userId && /^[0-9a-f-]{36}$/i.test(String(userId))) {
        try { await sb.from('profiles').update({ avatar_url: finalAvatarUrl }).eq('id', userId); } catch {}
        try { await sb.auth.updateUser({ data: { avatar_url: finalAvatarUrl } }); } catch {}
      }
      return finalAvatarUrl;
    },

    validateVoiceSample: async function({ voiceUrl, vocalStartS = 0, vocalEndS = 15, language = 'fr', callBackUrl = WEBHOOK_NOOP_URL }) {
      if (!voiceUrl || !/^https?:\/\//i.test(voiceUrl)) throw new Error('Une URL audio valide est requise.');
      const res = await fetchAudioEngine('/voice/validate', {
        method: 'POST',
        body: JSON.stringify({ voiceUrl, vocalStartS: Number(vocalStartS) || 0, vocalEndS: Math.max(Number(vocalEndS) || 15, (Number(vocalStartS) || 0) + 10), language: language || 'fr', callBackUrl })
      });
      const data = await res.json().catch(() => ({}));
      if (!data || data.code !== 200 || !data.data || !data.data.taskId) {
        throw new Error(sanitizeApiErrorMessage(data?.msg || data?.message, 'Impossible d\'initier la validation vocale.'));
      }
      return data.data;
    },

    createCustomVoice: async function({ taskId, verifyUrl, voiceName = 'Ma Voix', description = 'Voix personnalisée Nzembo', style = 'pop', callBackUrl = WEBHOOK_NOOP_URL }) {
      if (!taskId) throw new Error('Identifiant de tâche requis pour créer la voix.');
      if (!verifyUrl || !/^https?:\/\//i.test(verifyUrl)) throw new Error('Une URL audio valide est requise.');
      const res = await fetchAudioEngine('/voice/generate', {
        method: 'POST',
        body: JSON.stringify({ taskId, verifyUrl, voiceName: (voiceName || 'Voix Nzembo').slice(0, 50), description: description.slice(0, 200), style, callBackUrl })
      });
      const data = await res.json().catch(() => ({}));
      if (!data || (data.code !== 200 && data.code !== 409) || !data.data) {
        throw new Error(sanitizeApiErrorMessage(data?.msg || data?.message, 'Échec de la création de voix.'));
      }
      return data.data;
    },

    getVoiceRecordInfo: async function(taskId) {
      if (!taskId) return null;
      try {
        const res = await fetchAudioEngine(`/voice/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        return (data && data.code === 200) ? data.data : null;
      } catch {
        return null;
      }
    },

    createVoicePersonaPipeline: async function({ fileOrBlob, fileName = 'voix_sample.mp3', voiceName = 'Ma Voix', onProgress = () => {} }) {
      onProgress({ step: 'upload', message: "Téléversement de l'enregistrement vocal...", pct: 20 });
      const publicUrl = await this.uploadLocalAudioFile(fileOrBlob, fileName);
      if (!publicUrl || !/^https?:\/\//i.test(publicUrl)) throw new Error("Impossible d'envoyer le fichier audio pour le moment.");

      onProgress({ step: 'validate', message: "Analyse acoustique et validation vocale...", pct: 40 });
      const valData = await this.validateVoiceSample({ voiceUrl: publicUrl, vocalStartS: 0, vocalEndS: 15, language: 'fr' });
      const valTaskId = valData.taskId;

      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const rec = await this.getVoiceRecordInfo(valTaskId);
        if (rec) {
          const st = String(rec.status || '').toLowerCase();
          if (rec.voiceId) {
            onProgress({ step: 'ready', message: "Empreinte vocale prête !", pct: 100 });
            return { success: true, voiceId: rec.voiceId, voiceUrl: publicUrl };
          }
          if (st.includes('fail') || (rec.errorCode && rec.errorCode >= 400)) {
            throw new Error(sanitizeApiErrorMessage(rec.errorMessage, "La vérification vocale a échoué."));
          }
          if (st.includes('success') || rec.validateInfo || st === 'processing_validate_success') break;
        }
      }

      onProgress({ step: 'generate', message: "Création de ton profil vocal...", pct: 70 });
      const genData = await this.createCustomVoice({ taskId: valTaskId, verifyUrl: publicUrl, voiceName });
      const genTaskId = (genData && genData.taskId) || valTaskId;

      onProgress({ step: 'finalize', message: "Finalisation et enregistrement du profil vocal...", pct: 90 });
      for (let j = 0; j < 20; j++) {
        await new Promise(r => setTimeout(r, 2500));
        const rec2 = await this.getVoiceRecordInfo(genTaskId);
        if (rec2) {
          if (rec2.voiceId) {
            onProgress({ step: 'ready', message: "Empreinte vocale validée avec succès !", pct: 100 });
            return { success: true, voiceId: rec2.voiceId, voiceUrl: publicUrl };
          }
          const st2 = String(rec2.status || '').toLowerCase();
          if (st2.includes('fail') || (rec2.errorCode && rec2.errorCode >= 400)) {
            throw new Error(sanitizeApiErrorMessage(rec2.errorMessage, "Échec lors de la création de la voix."));
          }
        }
      }
      return { success: true, voiceId: genTaskId, voiceUrl: publicUrl, isPending: true };
    },

    executeStudioTool: async function({ toolKey, inputPrompt, audioUrl, creditCost = 1, options = {} }) {
      const cost = Math.max(0, Number(creditCost) || 0);
      if (cost > 0) {
        const bal = await this.getUserCredits();
        if (bal < cost) {
          throw new Error(`Solde insuffisant (${bal} disponible, ${cost} crédit${cost > 1 ? 's' : ''} requis).`);
        }
      }

      let toolRes = null;

      if (toolKey === 'reprise' || toolKey === 'remix') {
        const defaultStyle = toolKey === 'remix' ? 'Amapiano, Afrobeat Club Remix, High Energy Drums' : 'Par défaut';
        const coverResult = await this.uploadAndCoverAudio({
          uploadUrl: audioUrl && /^https?:\/\//i.test(audioUrl) ? audioUrl : undefined,
          taskId: options.taskId,
          audioId: options.audioId,
          prompt: inputPrompt,
          lyrics: options.lyrics || inputPrompt || '',
          style: options.style !== undefined ? options.style : defaultStyle,
          title: options.title || (toolKey === 'remix' ? 'Remix' : 'Reprise'),
          instrumental: false,
          vocalGender: options.vocalGender,
          audioWeight: options.audioWeight,
          model: 'V6'
        });
        toolRes = { ...coverResult, conversionType: 'cover', eta: 75 };
      } else if (toolKey === 'sing_instru') {
        const vocalResult = await this.addVocalsToAudio({
          uploadUrl: audioUrl,
          title: options.title || 'Voix sur instrumental',
          style: options.style || 'Afrobeat, Rumba',
          lyrics: options.lyrics || inputPrompt,
          prompt: inputPrompt,
          vocalGender: options.vocalGender,
          model: 'V6'
        });
        toolRes = { ...vocalResult, conversionType: 'generate', eta: 70 };
      } else if (toolKey === 'sing_vocal') {
        const harmResult = await this.addInstrumentalToAudio({
          uploadUrl: audioUrl,
          title: options.title || 'Harmonies vocales',
          tags: options.style || 'Gospel Choir SATB, Rich Vocal Harmonies, Accompagnement Doux',
          negativeTags: 'Heavy Metal, Screaming, Harsh Noise',
          lyrics: options.lyrics || inputPrompt,
          vocalGender: options.vocalGender,
          model: 'V6'
        });
        toolRes = { ...harmResult, conversionType: 'generate', eta: 70 };
      } else if (toolKey === 'extraction' || toolKey === 'stems') {
        const stemRes = await this.separateStems({
          taskId: options.taskId,
          audioId: options.audioId,
          audioUrl: audioUrl,
          type: options.stem === 'all' ? 'split_stem' : 'separate_vocal'
        });
        toolRes = { ...stemRes, conversionType: 'vocal-removal', eta: 45 };
      } else if (toolKey === 'extend') {
        const extRes = await this.extendMusic({
          taskId: options.taskId,
          audioId: options.audioId,
          uploadUrl: audioUrl,
          lyrics: options.lyrics || inputPrompt,
          style: options.style || 'Afrobeat, Rumba',
          title: options.title || 'Prolongement',
          continueAt: options.continueAt || 60,
          model: 'V6'
        });
        toolRes = { ...extRes, conversionType: 'generate', eta: 65 };
      } else if (toolKey === 'instru_on_voice' || toolKey === 'voice_to_instru') {
        const styleName = options.style || 'Rumba Congolaise';
        if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
          throw new Error('Importe ou choisis un fichier vocal valide avant de poser l\'instrumental.');
        }
        let targetTags = options.tags;
        if (!targetTags && typeof window !== 'undefined' && typeof window.getMusicStyleConfig === 'function') {
          const cfg = window.getMusicStyleConfig(styleName);
          if (cfg) targetTags = cfg.sunoStylePrompt || cfg.mandatoryTags;
        }
        const addInstruRes = await this.addInstrumentalToAudio({
          uploadUrl: audioUrl,
          title: (options.title || `Instrumental ${styleName}`).slice(0, 80),
          tags: targetTags || `${styleName}, Full Band Arrangement, Acoustic Guitar, Bass, Drums`,
          negativeTags: options.negativeTags || 'Distortion, Harsh Noise, Clipping, Low Quality',
          lyrics: options.lyrics || '',
          vocalGender: options.vocalGender,
          model: 'V6'
        });
        toolRes = { ...addInstruRes, conversionType: 'generate', eta: 65 };
      } else if (toolKey === 'video' || toolKey === 'mp4') {
        const vidRes = await this.createMusicVideo({
          taskId: options.taskId,
          audioId: options.audioId,
          audioUrl: audioUrl || options.audioUrl || '',
          title: options.title || inputPrompt || ''
        });
        toolRes = { ...vidRes, conversionType: 'mp4' };
      } else if (toolKey === 'wav') {
        const wavRes = await this.convertToWav({ taskId: options.taskId, audioId: options.audioId });
        toolRes = { ...wavRes, conversionType: 'wav', eta: 30 };
      } else if (toolKey === 'cover_art') {
        if (typeof generateHDCoverArt === 'function') {
          const coverUrl = await generateHDCoverArt({ prompt: inputPrompt, title: options.title || '', artist: options.author || '' });
          toolRes = { completed: true, status: 'SUCCESS', coverUrl, conversionType: 'cover_art', title: options.title || '', artist: options.author || '' };
        } else if (options.taskId) {
          const artRes = await this.generateAlbumCover(options.taskId).catch(() => ({}));
          toolRes = { ...artRes, conversionType: 'cover_art', eta: 35 };
        } else {
          toolRes = { completed: true, status: 'SUCCESS', coverUrl: '', conversionType: 'cover_art' };
        }
      } else if (toolKey === 'lyrics_gen') {
        const lyrRes = await this.generateLyrics({
          prompt: inputPrompt,
          theme: options.theme || inputPrompt,
          style: options.style || '',
          language: options.language || '',
          secondaryLanguage: options.secondaryLanguage || ''
        });
        return { ...lyrRes, conversionType: 'lyrics', eta: 20 };
      } else {
        const genRes = await this.generateMusic({
          prompt: inputPrompt,
          style: options.style || 'Rumba congolaise',
          lyrics: options.lyrics || '',
          isInstrumental: Boolean(options.isInstrumental),
          title: options.title || 'Composition Nzembo'
        });
        return { ...genRes, conversionType: 'generate', eta: 70 };
      }

      // Déduire le coût réel en base de données dès acceptation par le moteur
      if (cost > 0 && toolRes && (toolRes.taskId || toolRes.completed || toolRes.coverUrl)) {
        const dedId = toolRes.taskId || `${toolKey}_${Date.now()}`;
        const nextCredits = await this.deductCredits(cost, `Outil Studio : ${toolKey}`, dedId);
        toolRes.remainingCredits = nextCredits;
      }

      return toolRes;
    },

    pollStudioTask: async function(taskId, toolType = 'generate') {
      let res = null;
      if (toolType === 'vocal-removal' || toolType === 'stem' || toolType === 'extraction') res = await this.pollStemStatus(taskId);
      else if (toolType === 'mp4' || toolType === 'video') res = await this.pollMusicVideoStatus(taskId);
      else if (toolType === 'wav') res = await this.pollWavStatus(taskId);
      else if (toolType === 'cover_art' || toolType === 'suno_cover') res = await this.pollAlbumCoverStatus(taskId);
      else if (toolType === 'lyrics') res = await this.pollLyricsStatus(taskId);
      else res = await this.pollMusicStatus(taskId);

      if (res && res.failed && _taskDeductions[taskId]) {
        const refund = _taskDeductions[taskId];
        delete _taskDeductions[taskId];
        await this.addCredits(refund).catch(() => {});
      }
      return res;
    }
  };
})(typeof window !== 'undefined' ? window : global);
