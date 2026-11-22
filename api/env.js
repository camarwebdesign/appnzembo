// Endpoint dynamique Vercel pour exposer la configuration publique côté client (/env.local.js)
module.exports = function handler(_req, res) {
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).send(`window.__NZEMBO_ENV__ = ${JSON.stringify(clientEnv)};`);
};
