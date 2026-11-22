const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const DEFAULT_DATABASE_URL = 'postgresql://neondb_owner:npg_81vBijYgdnRV@ep-divine-poetry-b4vxduyu-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const CONNECTION_STRING = (process.env.DATABASE_URL || DEFAULT_DATABASE_URL).trim();

if (!CONNECTION_STRING) {
  throw new Error('DATABASE_URL manquant dans server/.env');
}

const pool = new Pool({
  connectionString: CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
  max: 10
});

// Helper requête SQL avec reconnexion résiliente au réveil à froid de PostgreSQL
async function query(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (/timeout|terminated|connection/i.test(msg)) {
      return await pool.query(text, params);
    }
    throw err;
  }
}

async function initDb() {
  console.log('⏳ [DB] Initialisation et migration du schéma PostgreSQL...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(120) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      credits INT DEFAULT 0,
      role VARCHAR(50) DEFAULT 'user',
      country VARCHAR(80) DEFAULT 'RD Congo',
      referral_code VARCHAR(50) UNIQUE,
      referred_by VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE users ALTER COLUMN credits SET DEFAULT 0;

    CREATE TABLE IF NOT EXISTS songs (
      id VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(120),
      title VARCHAR(255) NOT NULL,
      style VARCHAR(100),
      occasion VARCHAR(100),
      recipient VARCHAR(150),
      lyrics TEXT,
      audio_url TEXT,
      video_url TEXT,
      cover_url TEXT,
      task_id VARCHAR(120),
      audio_id VARCHAR(120),
      tool_category VARCHAR(60) DEFAULT 'generation',
      status VARCHAR(50) DEFAULT 'processing',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE songs ADD COLUMN IF NOT EXISTS audio_id VARCHAR(120);
    ALTER TABLE songs ADD COLUMN IF NOT EXISTS tool_category VARCHAR(60) DEFAULT 'generation';
    ALTER TABLE songs ADD COLUMN IF NOT EXISTS video_url TEXT;

    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(120),
      pack VARCHAR(150),
      credits INT,
      amount_usd NUMERIC(10, 2),
      amount_cdf INT,
      method VARCHAR(100),
      status VARCHAR(50) DEFAULT 'Payé',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(120),
      user_name VARCHAR(150),
      country VARCHAR(80),
      credits_converted INT,
      amount_usd NUMERIC(10, 2),
      amount_local VARCHAR(100),
      method VARCHAR(150),
      status VARCHAR(50) DEFAULT 'En attente',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(120) PRIMARY KEY,
      target VARCHAR(100) DEFAULT 'all',
      category VARCHAR(50),
      category_label VARCHAR(80),
      badge_color VARCHAR(120),
      title VARCHAR(255),
      subject VARCHAR(255),
      content TEXT,
      likes INT DEFAULT 0,
      loves INT DEFAULT 0,
      fires INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id VARCHAR(120) PRIMARY KEY,
      provider VARCHAR(40) NOT NULL DEFAULT 'saspay',
      user_id VARCHAR(120) NOT NULL,
      user_email VARCHAR(150),
      user_name VARCHAR(150),
      pack_id VARCHAR(80),
      pack_name VARCHAR(150),
      credits INT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      promo_code VARCHAR(50),
      discount_amount_usd NUMERIC(12, 2) DEFAULT 0,
      checkout_session_id VARCHAR(160),
      saspay_slug VARCHAR(160),
      saspay_payment_id VARCHAR(160),
      saspay_reference VARCHAR(160),
      checkout_url TEXT,
      frontend_return_url TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
      credited BOOLEAN NOT NULL DEFAULT FALSE,
      credited_at TIMESTAMP,
      raw_payload JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS discount_amount_usd NUMERIC(12, 2) DEFAULT 0;

    CREATE TABLE IF NOT EXISTS promo_codes (
      id VARCHAR(80) PRIMARY KEY,
      code VARCHAR(60) UNIQUE NOT NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
      discount_value NUMERIC(12, 2) NOT NULL DEFAULT 10,
      min_credits INT NOT NULL DEFAULT 1,
      max_uses INT DEFAULT NULL,
      used_count INT NOT NULL DEFAULT 0,
      expires_at TIMESTAMP DEFAULT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      description TEXT DEFAULT '',
      created_by VARCHAR(150) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_collaborators (
      id VARCHAR(120) PRIMARY KEY,
      supabase_user_id VARCHAR(120),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(150) NOT NULL DEFAULT '',
      role VARCHAR(40) NOT NULL DEFAULT 'collaborator',
      permissions JSONB NOT NULL DEFAULT '{"overview":true,"users":true,"songs":true,"finances":false,"promos":false,"messages":true,"affiliation":false,"traffic":true,"team":false}'::jsonb,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      invited_by VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_notifications (
      id VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(120) DEFAULT 'all',
      target VARCHAR(100) DEFAULT 'all',
      category VARCHAR(50) DEFAULT 'info',
      category_label VARCHAR(80) DEFAULT 'Notification',
      badge_color VARCHAR(160) DEFAULT 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
      title VARCHAR(255) NOT NULL,
      subject VARCHAR(255) DEFAULT '',
      content TEXT NOT NULL,
      is_error BOOLEAN DEFAULT FALSE,
      read_by JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visit_events (
      id VARCHAR(120) PRIMARY KEY,
      session_id VARCHAR(120),
      user_id VARCHAR(120),
      referrer_source VARCHAR(80) DEFAULT 'direct',
      device_type VARCHAR(60) DEFAULT 'desktop',
      browser VARCHAR(60) DEFAULT 'Chrome',
      country VARCHAR(100) DEFAULT 'International',
      path VARCHAR(255) DEFAULT '/',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id VARCHAR(120) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      purpose VARCHAR(40) NOT NULL DEFAULT 'auth',
      code_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      attempts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS explorer_posts (
      id VARCHAR(120) PRIMARY KEY,
      original_song_id VARCHAR(120),
      user_id VARCHAR(120) NOT NULL,
      artist VARCHAR(150) NOT NULL DEFAULT 'Artiste Nzembo',
      title VARCHAR(255) NOT NULL,
      style VARCHAR(100) DEFAULT '',
      style_key VARCHAR(80) DEFAULT 'afrobeat',
      occasion VARCHAR(120) DEFAULT '',
      audio_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      likes INT DEFAULT 0,
      listens INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_payment_tx_session ON payment_transactions (checkout_session_id);
    CREATE INDEX IF NOT EXISTS idx_payment_tx_payment ON payment_transactions (saspay_payment_id);
    CREATE INDEX IF NOT EXISTS idx_payment_tx_user ON payment_transactions (user_id);
    CREATE INDEX IF NOT EXISTS idx_promo_code_upper ON promo_codes (UPPER(code));
    CREATE INDEX IF NOT EXISTS idx_collab_email_lower ON admin_collaborators (LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_visit_created ON visit_events (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_codes (LOWER(email), purpose);
    CREATE INDEX IF NOT EXISTS idx_explorer_created ON explorer_posts (created_at DESC);
  `);

  // Supprimer l'ancien compte fictif de démonstration s'il existe encore sans vrais achats/chansons
  await pool.query(`
    DELETE FROM users
    WHERE id = 'usr_84920'
      AND email = 'demo@nzembo.com'
      AND NOT EXISTS (SELECT 1 FROM payment_transactions WHERE user_id = 'usr_84920' AND credited = TRUE);
  `).catch(() => {});

  // Garantir le compte administrateur principal par défaut (admin.nzembo@gmail.com)
  await pool.query(`
    INSERT INTO admin_collaborators (id, supabase_user_id, email, name, role, permissions, status, invited_by)
    VALUES (
      'adm_main_superadmin',
      '2edec6ec-c7e4-40b0-8d46-a4f337d781a3',
      'admin.nzembo@gmail.com',
      'Administrateur Nzembo',
      'super_admin',
      '{"overview":true,"users":true,"finances":true,"promos":true,"songs":true,"messages":true,"affiliation":true,"traffic":true,"team":true}'::jsonb,
      'active',
      'system_default'
    )
    ON CONFLICT (email) DO UPDATE SET
      role = 'super_admin',
      status = 'active',
      supabase_user_id = COALESCE(NULLIF(admin_collaborators.supabase_user_id, ''), EXCLUDED.supabase_user_id),
      permissions = EXCLUDED.permissions,
      updated_at = NOW();
  `).catch(() => {});

  await pool.query(`
    INSERT INTO users (id, name, email, credits, role, country, referral_code)
    VALUES (
      '2edec6ec-c7e4-40b0-8d46-a4f337d781a3',
      'Administrateur Nzembo',
      'admin.nzembo@gmail.com',
      0,
      'super_admin',
      'RD Congo',
      'NZ-ADMIN'
    )
    ON CONFLICT (email) DO UPDATE SET
      role = 'super_admin';
  `).catch(() => {});

  console.log('✅ [DB] Tables PostgreSQL synchronisées avec succès (solde initial = 0, Admin principal actif).');
}

if (require.main === module) {
  initDb()
    .then(() => {
      console.log('🎉 [DB] Prêt.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ [DB Erreur]:', err);
      process.exit(1);
    });
}

module.exports = { pool, query, initDb };
