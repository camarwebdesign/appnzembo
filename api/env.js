// Endpoint serverless dédié pour exposer la configuration client publique sur /env.local.js et /api/env
const DEFAULT_SUPABASE_URL = 'https://xmkdtbwurwtigkdjehhz.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhta2R0Ynd1cnd0aWdrZGplaGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzU2NTEsImV4cCI6MjEwOTkxMTY1MX0.Yt9RqMgyHgQIbqK7SHZRgaAgltjQELZtylqGc1kM--Y';

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const clientEnv = {
    BACKEND_URL: process.env.BACKEND_URL || '',
    SUPABASE_URL: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim(),
    SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim(),
    ENGINE_BEARER_TOKEN: (process.env.ENGINE_BEARER_TOKEN || process.env.NEXT_PUBLIC_ENGINE_BEARER_TOKEN || '').trim()
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`window.__NZEMBO_ENV__ = ${JSON.stringify(clientEnv)};`);
};
