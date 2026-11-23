const crypto = require('crypto');
const tls = require('tls');
const { pool, query } = require('./db');
const { renderPaymentReceiptEmailHtml, sendNzemboEmail } = require('./emails');

if (typeof tls.getCACertificates === 'function' && typeof tls.setDefaultCACertificates === 'function') {
  try {
    tls.setDefaultCACertificates([
      ...tls.getCACertificates('default'),
      ...tls.getCACertificates('system'),
    ]);
  } catch {}
}

const CREDIT_PRICE_USD = 0.80;

const SUPPORTED_CURRENCIES = {
  USD: { name: 'Dollar américain', country: 'US', symbol: '$', decimals: 2 },
  CDF: { name: 'Franc Congolais (RDC)', country: 'CD', symbol: 'CDF', decimals: 0 },
  EUR: { name: 'Euro (Zone Euro)', country: 'FR', symbol: '€', decimals: 2 },
  GBP: { name: 'Livre Sterling (UK)', country: 'GB', symbol: '£', decimals: 2 },
  AED: { name: 'Dirham des Émirats (SasPay)', country: 'AE', symbol: 'AED', decimals: 2 },
  SAR: { name: 'Riyal saoudien (SasPay)', country: 'SA', symbol: 'SAR', decimals: 2 },
  BHD: { name: 'Dinar bahreïni (SasPay)', country: 'BH', symbol: 'BHD', decimals: 3 },
  OMR: { name: 'Rial omanais (SasPay)', country: 'OM', symbol: 'OMR', decimals: 3 },
  KWD: { name: 'Dinar koweïtien (SasPay)', country: 'KW', symbol: 'KWD', decimals: 3 },
  JOD: { name: 'Dinar jordanien (SasPay)', country: 'JO', symbol: 'JOD', decimals: 3 },
  IQD: { name: 'Dinar irakien (SasPay)', country: 'IQ', symbol: 'IQD', decimals: 0 },
  EGP: { name: 'Livre égyptienne (SasPay)', country: 'EG', symbol: 'EGP', decimals: 2 },
  ILS: { name: 'Shekel israélien (SasPay)', country: 'IL', symbol: '₪', decimals: 2 },
  QAR: { name: 'Riyal qatari (SasPay)', country: 'QA', symbol: 'QAR', decimals: 2 },
  XAF: { name: 'Franc CFA (CEMAC)', country: 'CM', symbol: 'FCFA', decimals: 0 },
  XOF: { name: 'Franc CFA (UEMOA)', country: 'CI', symbol: 'FCFA', decimals: 0 },
  KES: { name: 'Shilling kényan (Kenya)', country: 'KE', symbol: 'KES', decimals: 0 },
  NGN: { name: 'Naira nigérian (Nigeria)', country: 'NG', symbol: '₦', decimals: 0 },
  ZAR: { name: 'Rand sud-africain (Afrique du Sud)', country: 'ZA', symbol: 'R', decimals: 2 },
  GHS: { name: 'Cedi ghanéen (Ghana)', country: 'GH', symbol: 'GH₵', decimals: 2 },
  RWF: { name: 'Franc rwandais (Rwanda)', country: 'RW', symbol: 'RWF', decimals: 0 },
  UGX: { name: 'Shilling ougandais (Ouganda)', country: 'UG', symbol: 'UGX', decimals: 0 },
  TZS: { name: 'Shilling tanzanien (Tanzanie)', country: 'TZ', symbol: 'TZS', decimals: 0 },
  ZMW: { name: 'Kwacha zambien (Zambie)', country: 'ZM', symbol: 'ZMW', decimals: 2 },
  MAD: { name: 'Dirham marocain (Maroc)', country: 'MA', symbol: 'MAD', decimals: 2 },
  TND: { name: 'Dinar tunisien (Tunisie)', country: 'TN', symbol: 'TND', decimals: 3 },
  DZD: { name: 'Dinar algérien (Algérie)', country: 'DZ', symbol: 'DZD', decimals: 2 },
  CAD: { name: 'Dollar canadien (Canada)', country: 'CA', symbol: 'CAD $', decimals: 2 },
  CHF: { name: 'Franc suisse (Suisse)', country: 'CH', symbol: 'CHF', decimals: 2 },
  AUD: { name: 'Dollar australien (Australie)', country: 'AU', symbol: 'A$', decimals: 2 },
  TRY: { name: 'Livre turque (Turquie)', country: 'TR', symbol: '₺', decimals: 2 },
  INR: { name: 'Roupie indienne (Inde)', country: 'IN', symbol: '₹', decimals: 2 },
  PKR: { name: 'Roupie pakistanaise (Pakistan)', country: 'PK', symbol: 'PKR', decimals: 0 },
};

// Secours hors-ligne utilisé UNIQUEMENT si les APIs de taux de change en direct sont injoignables
const EMERGENCY_FALLBACK_RATES = {
  USD: 1, CDF: 2315, EUR: 0.91, GBP: 0.76, AED: 3.6725, SAR: 3.75,
  BHD: 0.376, OMR: 0.3845, KWD: 0.31, JOD: 0.709, IQD: 1515, EGP: 54.17,
  ILS: 3.35, QAR: 3.64, XAF: 598, XOF: 598, KES: 129, NGN: 1550,
  ZAR: 18.1, GHS: 15.5, RWF: 1380, UGX: 3700, TZS: 2650, ZMW: 27,
  MAD: 9.9, TND: 3.1, DZD: 134, CAD: 1.43, CHF: 0.84, AUD: 1.54,
  TRY: 36, INR: 86, PKR: 279,
};

let _fxCache = {
  rates: { ...EMERGENCY_FALLBACK_RATES },
  source: 'fallback',
  updatedAt: null,
  fetchedAtMs: 0,
};

async function getLiveCurrencyRates(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _fxCache.source !== 'fallback' && (now - _fxCache.fetchedAtMs) < 10 * 60 * 1000) {
    return { ..._fxCache, source: 'cache' };
  }

  const providers = [
    { url: 'https://open.er-api.com/v6/latest/USD', extract: (d) => d && d.rates },
    { url: 'https://api.exchangerate-api.com/v4/latest/USD', extract: (d) => d && d.rates },
  ];

  for (const prov of providers) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(prov.url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const liveRates = prov.extract(json);
      if (liveRates && typeof liveRates === 'object' && Number(liveRates.EUR) > 0) {
        const merged = { USD: 1 };
        for (const code of Object.keys(SUPPORTED_CURRENCIES)) {
          const val = Number(liveRates[code]);
          if (Number.isFinite(val) && val > 0) {
            merged[code] = val;
          } else {
            merged[code] = EMERGENCY_FALLBACK_RATES[code] || 1;
          }
        }
        _fxCache = {
          rates: merged,
          source: 'live',
          updatedAt: json.time_last_update_utc || new Date().toISOString(),
          fetchedAtMs: now,
        };
        return _fxCache;
      }
    } catch {}
  }

  return _fxCache;
}

function formatConvertedAmount(usdAmount, currCode, ratesMap) {
  const curr = SUPPORTED_CURRENCIES[currCode] ? currCode : 'USD';
  const rate = Number((ratesMap && ratesMap[curr]) || EMERGENCY_FALLBACK_RATES[curr] || 1);
  const spec = SUPPORTED_CURRENCIES[curr] || { decimals: 2 };
  const raw = usdAmount * rate;
  if (spec.decimals === 0 || rate >= 100) {
    return Math.round(raw).toFixed(2);
  }
  const rounded = Number(raw.toFixed(spec.decimals));
  return rounded.toFixed(2);
}

const CURRENCY_COUNTRY_MAP = Object.fromEntries(
  Object.entries(SUPPORTED_CURRENCIES).map(([code, meta]) => [code, meta.country])
);

const NAMED_PACKS = {
  pack_createur: {
    id: 'pack_createur',
    name: 'Pack Créateur',
    credits: 5,
    amount: 9.99,
    currency: 'EUR',
  },
  pack_illimite: {
    id: 'pack_illimite',
    name: 'Abonnement Illimité',
    credits: 50,
    amount: 24.99,
    currency: 'EUR',
  },
};

const DEFAULT_SASPAY_SECRET_KEY = 'sk_live_MJvBNXyzab2eUUGyExcHKmRqKt9SZy_FtvBILJjdyXo';

function getSaspayConfig() {
  const secretKey = (process.env.SASPAY_SECRET_KEY || DEFAULT_SASPAY_SECRET_KEY).trim();
  const defaultBase = secretKey.startsWith('sk_test_')
    ? 'https://sandbox-api.saspay.me/api/v1'
    : 'https://api.saspay.me/api/v1';
  const baseUrl = (process.env.SASPAY_API_BASE_URL || defaultBase).replace(/\/+$/, '');
  const webhookSecret = (process.env.SASPAY_WEBHOOK_SECRET || '').trim();
  return { secretKey, baseUrl, webhookSecret };
}

function unwrapSaspayData(json) {
  if (json && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
    return json.data;
  }
  return json || {};
}

function extractSaspayError(json, statusCode) {
  if (!json || typeof json !== 'object') {
    return `Erreur API SasPay (HTTP ${statusCode})`;
  }
  if (json.error && typeof json.error === 'object' && json.error.message) {
    return json.error.message;
  }
  if (typeof json.message === 'string' && json.message.trim()) {
    return json.message;
  }
  if (json.error && typeof json.error === 'object') {
    const firstKey = Object.keys(json.error)[0];
    if (firstKey) {
      const val = json.error[firstKey];
      return `${firstKey}: ${Array.isArray(val) ? val.join(', ') : val}`;
    }
  }
  const topKey = Object.keys(json).find((k) => k !== 'success' && k !== 'code');
  if (topKey && Array.isArray(json[topKey])) {
    return `${topKey}: ${json[topKey].join(', ')}`;
  }
  return `Erreur API SasPay (HTTP ${statusCode})`;
}

async function saspayRequest(endpointPath, { method = 'GET', body, idempotencyKey } = {}) {
  const { secretKey, baseUrl } = getSaspayConfig();
  if (!secretKey) {
    const err = new Error('SASPAY_SECRET_KEY non configurée dans server/.env');
    err.statusCode = 500;
    throw err;
  }

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }

  if (!response.ok || json.success === false) {
    const err = new Error(extractSaspayError(json, response.status));
    err.statusCode = response.status >= 400 ? response.status : 502;
    err.details = json.error || json;
    throw err;
  }

  return unwrapSaspayData(json);
}

async function resolvePromoFromDb(rawCode, creditsQty = 1) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;

  const res = await query(
    `SELECT * FROM promo_codes WHERE UPPER(code) = $1 LIMIT 1`,
    [code]
  );
  if (!res.rows || res.rows.length === 0) {
    const err = new Error(`Code promo « ${code} » invalide ou introuvable.`);
    err.statusCode = 400;
    throw err;
  }

  const promo = res.rows[0];
  if (!promo.is_active) {
    const err = new Error(`Le code promo « ${code} » est désactivé.`);
    err.statusCode = 400;
    throw err;
  }
  if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) {
    const err = new Error(`Le code promo « ${code} » a expiré.`);
    err.statusCode = 400;
    throw err;
  }
  if (promo.max_uses !== null && promo.max_uses !== undefined && Number(promo.used_count) >= Number(promo.max_uses)) {
    const err = new Error(`Le code promo « ${code} » a atteint sa limite d'utilisations.`);
    err.statusCode = 400;
    throw err;
  }
  const minCred = Math.max(1, Number(promo.min_credits) || 1);
  if (Number(creditsQty) < minCred) {
    const err = new Error(`Ce code promo requiert au moins ${minCred} crédit(s).`);
    err.statusCode = 400;
    throw err;
  }

  return promo;
}

function applyPromoDiscountUSD(baseUsd, promo) {
  if (!promo) return { finalUsd: +baseUsd.toFixed(2), discountUsd: 0 };
  const val = Math.max(0, Number(promo.discount_value) || 0);
  let discountUsd = 0;
  if (promo.discount_type === 'fixed_usd') {
    discountUsd = Math.min(Math.max(0, baseUsd - 0.50), val);
  } else {
    const pct = Math.min(99, val);
    discountUsd = +(baseUsd * (pct / 100)).toFixed(2);
  }
  const finalUsd = Math.max(0.50, +(baseUsd - discountUsd).toFixed(2));
  const actualDiscountUsd = +Math.max(0, baseUsd - finalUsd).toFixed(2);
  return { finalUsd, discountUsd: actualDiscountUsd };
}

async function computeAuthoritativeOrder({ pack_id, pack_name, credits, currency, promo_code }) {
  const normalizedPromo = String(promo_code || '').trim().toUpperCase();
  const fx = await getLiveCurrencyRates();
  const ratesMap = fx.rates || EMERGENCY_FALLBACK_RATES;

  if (pack_id && NAMED_PACKS[pack_id]) {
    const pack = NAMED_PACKS[pack_id];
    const requestedCurr = String(currency || pack.currency).trim().toUpperCase();
    const effectiveCurr = SUPPORTED_CURRENCIES[requestedCurr] ? requestedCurr : pack.currency;
    const packCurrRate = Number(ratesMap[pack.currency]) || 1;
    const baseUsd = +(pack.amount / packCurrRate).toFixed(2);
    const promoRow = normalizedPromo ? await resolvePromoFromDb(normalizedPromo, pack.credits) : null;
    const { finalUsd, discountUsd } = applyPromoDiscountUSD(baseUsd, promoRow);
    const formattedAmount = (effectiveCurr === pack.currency && !promoRow)
      ? pack.amount.toFixed(2)
      : formatConvertedAmount(finalUsd, effectiveCurr, ratesMap);
    const baseAmountDecimal = (effectiveCurr === pack.currency)
      ? pack.amount.toFixed(2)
      : formatConvertedAmount(baseUsd, effectiveCurr, ratesMap);

    return {
      packId: pack.id,
      packName: pack_name || pack.name,
      credits: pack.credits,
      amountDecimal: formattedAmount,
      baseAmountDecimal,
      currency: effectiveCurr,
      amountUSD: finalUsd,
      baseUSD: baseUsd,
      discountUSD: discountUsd,
      amountCDF: Math.round(finalUsd * (ratesMap.CDF || EMERGENCY_FALLBACK_RATES.CDF)),
      fxRate: Number(ratesMap[effectiveCurr] || 1),
      fxSource: fx.source,
      promoCode: promoRow ? promoRow.code : null,
      promo: promoRow,
      country: CURRENCY_COUNTRY_MAP[effectiveCurr] || null,
    };
  }

  const qty = parseInt(credits, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
    const err = new Error('Quantité de crédits invalide (entre 1 et 1000).');
    err.statusCode = 400;
    throw err;
  }

  const promoRow = normalizedPromo ? await resolvePromoFromDb(normalizedPromo, qty) : null;
  const reqCurr = String(currency || 'USD').trim().toUpperCase();
  const effectiveCurr = SUPPORTED_CURRENCIES[reqCurr] ? reqCurr : 'USD';

  const baseUsd = +(qty * CREDIT_PRICE_USD).toFixed(2);
  const { finalUsd, discountUsd } = applyPromoDiscountUSD(baseUsd, promoRow);
  const baseAmountDecimal = formatConvertedAmount(baseUsd, effectiveCurr, ratesMap);
  const amountDecimal = formatConvertedAmount(finalUsd, effectiveCurr, ratesMap);

  return {
    packId: pack_id || 'custom_credits',
    packName: pack_name || `Recharge ${qty} Crédits`,
    credits: qty,
    amountDecimal,
    baseAmountDecimal,
    currency: effectiveCurr,
    amountUSD: finalUsd,
    baseUSD: baseUsd,
    discountUSD: discountUsd,
    amountCDF: Math.round(finalUsd * (ratesMap.CDF || EMERGENCY_FALLBACK_RATES.CDF)),
    fxRate: Number(ratesMap[effectiveCurr] || 1),
    fxSource: fx.source,
    promoCode: promoRow ? promoRow.code : null,
    promo: promoRow,
    country: CURRENCY_COUNTRY_MAP[effectiveCurr] || null,
  };
}

function sanitizeFrontendReturnUrl(rawUrl) {
  const defaultAppUrl = (process.env.APP_URL || 'https://app.nzembo.net').replace(/\/+$/, '');
  if (!rawUrl || typeof rawUrl !== 'string') return defaultAppUrl;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return defaultAppUrl;
    }
    const allowedHosts = new Set([
      'localhost',
      '127.0.0.1',
      'app.nzembo.net',
      'nzembo.net',
      'www.nzembo.net',
      'admin.nzembo.net',
    ]);
    if (process.env.VERCEL_URL) {
      allowedHosts.add(String(process.env.VERCEL_URL).replace(/^https?:\/\//i, '').split('/')[0]);
    }
    try {
      allowedHosts.add(new URL(defaultAppUrl).hostname);
    } catch {}
    if (!allowedHosts.has(parsed.hostname)) {
      return defaultAppUrl;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return defaultAppUrl;
  }
}

function getBackendPublicUrl(req) {
  if (process.env.BACKEND_PUBLIC_URL) {
    return process.env.BACKEND_PUBLIC_URL.replace(/\/+$/, '');
  }
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

function verifyWebhookSignature(rawBodyBuffer, signatureHeader, timestampHeader, secret) {
  if (!secret || !rawBodyBuffer || !signatureHeader || !timestampHeader) {
    return false;
  }
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampHeader}.`)
    .update(rawBodyBuffer)
    .digest('hex');

  const sigBuf = Buffer.from(String(signatureHeader).trim().toLowerCase(), 'utf8');
  const expBuf = Buffer.from(expected.toLowerCase(), 'utf8');
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

async function getUserBalance(userId, userEmail) {
  let res = await query('SELECT id, credits FROM users WHERE id = $1', [userId]);
  if (res.rows.length === 0 && userEmail) {
    res = await query('SELECT id, credits FROM users WHERE LOWER(email) = LOWER($1)', [userEmail]);
  }
  if (res.rows.length === 0) return 0;
  return Math.max(0, Number(res.rows[0].credits) || 0);
}

async function creditOrderOnce(order, { paymentId = null, reference = null, rawPayload = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockRes = await client.query(
      `UPDATE payment_transactions
       SET status = 'SUCCESS',
           credited = TRUE,
           credited_at = NOW(),
           saspay_payment_id = COALESCE($2, saspay_payment_id),
           saspay_reference = COALESCE($3, saspay_reference),
           raw_payload = COALESCE($4::jsonb, raw_payload),
           updated_at = NOW()
       WHERE id = $1 AND credited = FALSE
       RETURNING *`,
      [order.id, paymentId, reference, rawPayload ? JSON.stringify(rawPayload) : null]
    );

    if (lockRes.rowCount === 0) {
      await client.query('ROLLBACK');
      const existing = await query('SELECT * FROM payment_transactions WHERE id = $1', [order.id]);
      const balance = await getUserBalance(order.user_id, order.user_email);
      return {
        newlyCredited: false,
        alreadyCredited: true,
        balance,
        order: existing.rows[0] || order,
      };
    }

    const updatedOrder = lockRes.rows[0];
    const creditsToAdd = Math.max(0, parseInt(updatedOrder.credits, 10) || 0);

    let userRes = await client.query('SELECT id, credits FROM users WHERE id = $1 FOR UPDATE', [updatedOrder.user_id]);
    if (userRes.rows.length === 0 && updatedOrder.user_email) {
      userRes = await client.query('SELECT id, credits FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE', [updatedOrder.user_email]);
    }

    let dbUserId = updatedOrder.user_id;
    let newBalance = creditsToAdd;

    if (userRes.rows.length > 0) {
      dbUserId = userRes.rows[0].id;
      const upd = await client.query(
        'UPDATE users SET credits = COALESCE(credits, 0) + $1 WHERE id = $2 RETURNING credits',
        [creditsToAdd, dbUserId]
      );
      newBalance = Number(upd.rows[0].credits) || 0;
    } else {
      const safeEmail = updatedOrder.user_email || `${updatedOrder.user_id}@users.nzembo.local`;
      const refCode = `NZ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const ins = await client.query(
        `INSERT INTO users (id, name, email, credits, referral_code)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, credits`,
        [dbUserId, updatedOrder.user_name || 'Créateur Nzembo', safeEmail, creditsToAdd, refCode]
      );
      newBalance = Number(ins.rows[0].credits) || creditsToAdd;
    }

    if (updatedOrder.promo_code) {
      await client.query(
        `UPDATE promo_codes SET used_count = used_count + 1, updated_at = NOW() WHERE UPPER(code) = UPPER($1)`,
        [updatedOrder.promo_code]
      );
    }

    const txId = `TX-SP-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const fx = await getLiveCurrencyRates();
    const ratesMap = fx.rates || EMERGENCY_FALLBACK_RATES;
    const paidRate = Number(ratesMap[updatedOrder.currency] || 1);
    const amountUSD = Number(((Number(updatedOrder.amount) || 0) / paidRate).toFixed(2));
    const amountCDF = Math.round(amountUSD * (ratesMap.CDF || EMERGENCY_FALLBACK_RATES.CDF));

    await client.query(
      `INSERT INTO transactions (id, user_id, pack, credits, amount_usd, amount_cdf, method, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        txId,
        dbUserId,
        `${updatedOrder.pack_name} (${creditsToAdd} crédit${creditsToAdd > 1 ? 's' : ''})${updatedOrder.promo_code ? ' · Code ' + updatedOrder.promo_code : ''}`,
        creditsToAdd,
        amountUSD,
        amountCDF,
        'SasPay',
        'Payé',
      ]
    );

    await client.query(
      `INSERT INTO user_notifications (id, user_id, target, category, category_label, badge_color, title, subject, content, is_error)
       VALUES ($1, $2, $2, 'info', 'Paiement validé', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', $3, $4, $5, FALSE)`,
      [
        `notif_pay_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        dbUserId,
        'Crédits ajoutés à ton compte',
        `+${creditsToAdd} crédits disponibles (${updatedOrder.amount} ${updatedOrder.currency})`,
        `Ton paiement SasPay (${updatedOrder.id}) a été confirmé. Nouveau solde : ${newBalance} crédits.`,
      ]
    );

    await client.query('COMMIT');

    if (updatedOrder.user_email && !updatedOrder.user_email.endsWith('@users.nzembo.local')) {
      const receiptMail = renderPaymentReceiptEmailHtml({
        userName: updatedOrder.user_name,
        credits: creditsToAdd,
        amount: updatedOrder.amount,
        currency: updatedOrder.currency,
        promoCode: updatedOrder.promo_code,
        orderId: updatedOrder.id,
      });
      sendNzemboEmail({ to: updatedOrder.user_email, ...receiptMail }).catch(() => {});
    }

    return {
      newlyCredited: true,
      alreadyCredited: false,
      balance: newBalance,
      order: updatedOrder,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function findOrder({ orderId, sessionId, paymentId }) {
  if (orderId) {
    const r = await query('SELECT * FROM payment_transactions WHERE id = $1', [orderId]);
    if (r.rows[0]) return r.rows[0];
  }
  if (sessionId) {
    const r = await query('SELECT * FROM payment_transactions WHERE checkout_session_id = $1', [sessionId]);
    if (r.rows[0]) return r.rows[0];
  }
  if (paymentId) {
    const r = await query('SELECT * FROM payment_transactions WHERE saspay_payment_id = $1', [paymentId]);
    if (r.rows[0]) return r.rows[0];

    const pendingRes = await query(
      `SELECT * FROM payment_transactions
       WHERE status = 'PENDING' AND credited = FALSE AND checkout_session_id IS NOT NULL
         AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 20`
    );
    for (const row of pendingRes.rows) {
      try {
        const st = await saspayRequest(`/checkout-sessions/${encodeURIComponent(row.checkout_session_id)}/status/`);
        if (st && st.transaction_id) {
          await query(
            'UPDATE payment_transactions SET saspay_payment_id = $2, updated_at = NOW() WHERE id = $1',
            [row.id, st.transaction_id]
          );
          if (String(st.transaction_id) === String(paymentId)) {
            return { ...row, saspay_payment_id: st.transaction_id };
          }
        }
      } catch {}
    }
  }
  return null;
}

async function verifyAndFulfillOrder({ orderId = null, sessionId = null, paymentId = null } = {}) {
  const order = await findOrder({ orderId, sessionId, paymentId });
  if (!order) {
    return { found: false, verified: false, status: 'NOT_FOUND', balance: 0 };
  }

  if (order.credited) {
    const balance = await getUserBalance(order.user_id, order.user_email);
    return {
      found: true,
      verified: true,
      status: 'SUCCESS',
      credited: true,
      alreadyCredited: true,
      balance,
      order,
    };
  }

  let sessionStatusData = null;
  let resolvedPaymentId = paymentId || order.saspay_payment_id || null;

  if (order.checkout_session_id) {
    sessionStatusData = await saspayRequest(`/checkout-sessions/${encodeURIComponent(order.checkout_session_id)}/status/`);
    if (sessionStatusData.transaction_id) {
      resolvedPaymentId = sessionStatusData.transaction_id;
    }
  }

  let verifyData = null;
  if (resolvedPaymentId) {
    verifyData = await saspayRequest(`/payments/${encodeURIComponent(resolvedPaymentId)}/verify/`);
  }

  const txStatus = String(
    (verifyData && verifyData.status) ||
      (sessionStatusData && sessionStatusData.transaction_status) ||
      ''
  ).toUpperCase();
  const sessStatus = String((sessionStatusData && sessionStatusData.status) || '').toUpperCase();

  if (txStatus === 'SUCCESS') {
    const paidAmount = Number(
      (verifyData && verifyData.amount) || (sessionStatusData && sessionStatusData.amount) || order.amount
    );
    const expectedAmount = Number(order.amount);
    const paidCurr = String((verifyData && verifyData.currency) || order.currency).toUpperCase();
    const expectedCurr = String(order.currency).toUpperCase();

    if (paidCurr !== expectedCurr || Math.abs(paidAmount - expectedAmount) > 1) {
      await query(
        `UPDATE payment_transactions SET status = 'AMOUNT_MISMATCH', raw_payload = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [order.id, JSON.stringify({ verifyData, sessionStatusData })]
      );
      return {
        found: true,
        verified: false,
        status: 'AMOUNT_MISMATCH',
        balance: await getUserBalance(order.user_id, order.user_email),
        order,
      };
    }

    const creditedResult = await creditOrderOnce(order, {
      paymentId: (verifyData && verifyData.id) || resolvedPaymentId,
      reference: (verifyData && verifyData.reference) || null,
      rawPayload: verifyData || sessionStatusData,
    });

    return {
      found: true,
      verified: true,
      status: 'SUCCESS',
      credited: true,
      newlyCredited: creditedResult.newlyCredited,
      alreadyCredited: creditedResult.alreadyCredited,
      balance: creditedResult.balance,
      order: creditedResult.order,
    };
  }

  const nextStatus =
    txStatus === 'FAILED' || txStatus === 'CANCELLED'
      ? txStatus
      : sessStatus === 'EXPIRED'
        ? 'EXPIRED'
        : 'PENDING';

  await query(
    `UPDATE payment_transactions
     SET status = $2,
         saspay_payment_id = COALESCE($3, saspay_payment_id),
         raw_payload = COALESCE($4::jsonb, raw_payload),
         updated_at = NOW()
     WHERE id = $1 AND credited = FALSE`,
    [
      order.id,
      nextStatus,
      resolvedPaymentId,
      JSON.stringify(verifyData || sessionStatusData || {}),
    ]
  );

  return {
    found: true,
    verified: false,
    status: nextStatus,
    credited: false,
    balance: await getUserBalance(order.user_id, order.user_email),
    order,
  };
}

function registerSaspayRoutes(app) {
  // 0. Taux de change en temps réel (GET /api/fx/rates)
  app.get('/api/fx/rates', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      const fx = await getLiveCurrencyRates(force);
      return res.json({
        success: true,
        base: 'USD',
        creditPriceUSD: CREDIT_PRICE_USD,
        source: fx.source,
        updatedAt: fx.updatedAt || new Date().toISOString(),
        rates: fx.rates,
        currencies: SUPPORTED_CURRENCIES,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 1. Initialisation d'une session de paiement hébergée SasPay (POST /api/payments/saspay/checkout)
  app.post('/api/payments/saspay/checkout', async (req, res) => {
    try {
      const { user_id, user_email, user_name, pack_id, pack_name, credits, currency, promo_code, frontend_return_url } = req.body || {};

      const userId = String(user_id || '').trim();
      if (!userId) {
        return res.status(400).json({ success: false, error: 'Identifiant utilisateur (user_id) requis.' });
      }

      const orderSpec = await computeAuthoritativeOrder({
        pack_id,
        pack_name,
        credits,
        currency,
        promo_code,
      });

      const orderId = `ord_${crypto.randomUUID()}`;
      const customerEmail =
        user_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user_email).trim())
          ? String(user_email).trim()
          : 'client@nzembo.net';
      const customerName = String(user_name || 'Créateur Nzembo').trim().slice(0, 100) || 'Créateur Nzembo';

      const safeFrontendUrl = sanitizeFrontendReturnUrl(frontend_return_url);
      const backendPublicUrl = getBackendPublicUrl(req);
      const returnUrl = `${backendPublicUrl}/api/payments/saspay/callback?order_id=${encodeURIComponent(orderId)}`;

      await query(
        `INSERT INTO payment_transactions
         (id, provider, user_id, user_email, user_name, pack_id, pack_name, credits, amount, currency, promo_code, discount_amount_usd, frontend_return_url, status)
         VALUES ($1, 'saspay', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING')`,
        [
          orderId,
          userId,
          customerEmail,
          customerName,
          orderSpec.packId,
          orderSpec.packName,
          orderSpec.credits,
          orderSpec.amountDecimal,
          orderSpec.currency,
          orderSpec.promoCode,
          orderSpec.discountUSD || 0,
          safeFrontendUrl,
        ]
      );

      const saspayPayload = {
        amount: orderSpec.amountDecimal,
        currency: orderSpec.currency,
        description: `Nzembo — ${orderSpec.packName} (${orderSpec.credits} crédits)${orderSpec.promoCode ? ' [Promo ' + orderSpec.promoCode + ']' : ''}`,
        customer_email: customerEmail,
        customer_name: customerName,
        return_url: returnUrl,
        metadata: {
          order_id: orderId,
          user_id: userId,
          credits: orderSpec.credits,
          pack_id: orderSpec.packId,
          pack_name: orderSpec.packName,
          promo_code: orderSpec.promoCode || '',
          display_currency: orderSpec.currency,
          display_amount: orderSpec.amountDecimal,
        },
      };
      if (orderSpec.country) {
        saspayPayload.country = orderSpec.country;
      }

      let billedCurrency = orderSpec.currency;
      let billedAmount = orderSpec.amountDecimal;
      let sessionData = null;

      try {
        sessionData = await saspayRequest('/checkout-sessions/', {
          method: 'POST',
          body: saspayPayload,
        });
      } catch (primaryErr) {
        const msg = String(primaryErr.message || '');
        const isCurrencyMismatch = /currenc|devise|paytabs|unsupported|not supported|not allowed|invalid.*currency|profile|invalid amount/i.test(msg);
        if (isCurrencyMismatch && orderSpec.currency !== 'USD') {
          billedCurrency = 'USD';
          billedAmount = orderSpec.amountUSD.toFixed(2);
          const fallbackPayload = {
            ...saspayPayload,
            amount: billedAmount,
            currency: 'USD',
            description: `${saspayPayload.description} [Converti depuis ${orderSpec.amountDecimal} ${orderSpec.currency}]`,
            metadata: {
              ...saspayPayload.metadata,
              billed_currency: 'USD',
              billed_amount: billedAmount,
            },
          };
          delete fallbackPayload.country;
          await query(
            'UPDATE payment_transactions SET amount = $2, currency = $3, updated_at = NOW() WHERE id = $1',
            [orderId, billedAmount, billedCurrency]
          );
          sessionData = await saspayRequest('/checkout-sessions/', {
            method: 'POST',
            body: fallbackPayload,
          });
        } else {
          throw primaryErr;
        }
      }

      if (!sessionData.checkout_url || !sessionData.id) {
        throw new Error('Réponse SasPay invalide : checkout_url manquant.');
      }

      await query(
        `UPDATE payment_transactions
         SET checkout_session_id = $2,
             saspay_slug = $3,
             checkout_url = $4,
             raw_payload = $5::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [orderId, sessionData.id, sessionData.slug || null, sessionData.checkout_url, JSON.stringify(sessionData)]
      );

      return res.json({
        success: true,
        orderId,
        sessionId: sessionData.id,
        checkoutUrl: sessionData.checkout_url,
        amount: billedAmount,
        currency: billedCurrency,
        displayAmount: orderSpec.amountDecimal,
        displayCurrency: orderSpec.currency,
        fxRate: orderSpec.fxRate,
        fxSource: orderSpec.fxSource,
        baseAmount: orderSpec.baseAmountDecimal,
        discountUSD: orderSpec.discountUSD,
        promoCode: orderSpec.promoCode,
        credits: orderSpec.credits,
      });
    } catch (err) {
      const code = err.statusCode || 500;
      console.error('❌ [SasPay Checkout Error]:', err.message);
      return res.status(code).json({
        success: false,
        error: err.message || 'Impossible d\'initialiser le paiement SasPay.',
      });
    }
  });

  // 2. Callback navigateur après paiement SasPay
  app.get('/api/payments/saspay/callback', async (req, res) => {
    const orderId = req.query.order_id ? String(req.query.order_id) : null;
    const sessionId = req.query.session_id ? String(req.query.session_id) : null;
    const paymentId = req.query.payment_id || req.query.transaction_id ? String(req.query.payment_id || req.query.transaction_id) : null;

    let targetBase = sanitizeFrontendReturnUrl(null);
    try {
      const result = await verifyAndFulfillOrder({ orderId, sessionId, paymentId });
      if (result.order && result.order.frontend_return_url) {
        targetBase = sanitizeFrontendReturnUrl(result.order.frontend_return_url);
      }
      const redirectUrl = new URL(targetBase);
      redirectUrl.searchParams.set('payment', 'saspay');
      if (orderId || (result.order && result.order.id)) {
        redirectUrl.searchParams.set('order_id', orderId || result.order.id);
      }
      redirectUrl.searchParams.set('status', String(result.status || 'PENDING').toLowerCase());
      if (result.order) {
        redirectUrl.searchParams.set('credits', String(result.order.credits));
      }
      if (result.balance !== undefined) {
        redirectUrl.searchParams.set('balance', String(result.balance));
      }
      redirectUrl.hash = 'credits';
      return res.redirect(302, redirectUrl.toString());
    } catch (err) {
      console.error('❌ [SasPay Callback Error]:', err.message);
      const fallbackUrl = new URL(targetBase);
      fallbackUrl.searchParams.set('payment', 'saspay');
      if (orderId) fallbackUrl.searchParams.set('order_id', orderId);
      fallbackUrl.searchParams.set('status', 'pending');
      fallbackUrl.hash = 'credits';
      return res.redirect(302, fallbackUrl.toString());
    }
  });

  // 3. Vérification API côté frontend (GET /api/payments/saspay/verify/:orderId)
  app.get('/api/payments/saspay/verify/:orderId', async (req, res) => {
    try {
      const result = await verifyAndFulfillOrder({ orderId: req.params.orderId });
      if (!result.found) {
        return res.status(404).json({ success: false, error: 'Commande introuvable.' });
      }
      return res.json({
        success: true,
        verified: result.verified,
        status: result.status,
        credited: Boolean(result.credited),
        newlyCredited: Boolean(result.newlyCredited),
        credits: result.order ? result.order.credits : 0,
        packName: result.order ? result.order.pack_name : '',
        amount: result.order ? result.order.amount : '0.00',
        currency: result.order ? result.order.currency : 'USD',
        promoCode: result.order ? result.order.promo_code : null,
        balance: result.balance,
      });
    } catch (err) {
      console.error('❌ [SasPay Verify Error]:', err.message);
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Erreur lors de la vérification du paiement.',
      });
    }
  });

  // 4. Webhook officiel SasPay (POST /api/payments/saspay/webhook)
  app.post('/api/payments/saspay/webhook', async (req, res) => {
    try {
      const { webhookSecret } = getSaspayConfig();
      const sig = req.get('X-Webhook-Signature');
      const ts = req.get('X-Webhook-Timestamp');
      const evt = req.get('X-Webhook-Event') || (req.body && req.body.event) || '';

      if (webhookSecret) {
        const valid = verifyWebhookSignature(req.rawBody, sig, ts, webhookSecret);
        if (!valid) {
          console.warn('⚠️ [SasPay Webhook] Signature ou horodatage invalide.');
          return res.status(403).json({ success: false, error: 'Invalid webhook signature or timestamp' });
        }
      }

      if (evt === 'webhook.test') {
        return res.status(200).json({ received: true, test: true });
      }

      const data = (req.body && req.body.data) || {};
      const paymentId = data.id || null;
      const orderId = (data.metadata && data.metadata.order_id) || null;
      const sessionId = data.checkout_session_id || data.session_id || null;

      if (
        evt === 'transaction.success' ||
        evt === 'transaction.failed' ||
        evt === 'transaction.cancelled' ||
        String(data.status || '').toUpperCase() === 'SUCCESS'
      ) {
        if (orderId || sessionId || paymentId) {
          await verifyAndFulfillOrder({ orderId, sessionId, paymentId });
        }
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('❌ [SasPay Webhook Error]:', err.message);
      return res.status(500).json({ received: false, error: err.message });
    }
  });

  // 5. Solde utilisateur autoritaire en base (GET /api/users/:id/credits)
  app.get('/api/users/:id/credits', async (req, res) => {
    try {
      const balance = await getUserBalance(req.params.id, req.query.email ? String(req.query.email) : null);
      return res.json({ success: true, userId: req.params.id, credits: balance });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Vérification publique de code promo (GET /api/promos/validate)
  app.get('/api/promos/validate', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      const qty = Math.max(1, parseInt(req.query.credits, 10) || 1);
      const curr = String(req.query.currency || 'USD').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ success: false, valid: false, error: 'Entre un code promo.' });
      }
      const orderSpec = await computeAuthoritativeOrder({
        credits: qty,
        currency: curr,
        promo_code: code,
      });
      return res.json({
        success: true,
        valid: true,
        code: orderSpec.promo.code,
        discountType: orderSpec.promo.discount_type,
        discountValue: Number(orderSpec.promo.discount_value),
        minCredits: Number(orderSpec.promo.min_credits) || 1,
        description: orderSpec.promo.description || '',
        baseAmount: orderSpec.baseAmountDecimal,
        finalAmount: orderSpec.amountDecimal,
        discountUSD: orderSpec.discountUSD,
        currency: orderSpec.currency,
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        valid: false,
        error: err.message || 'Code promo invalide.',
      });
    }
  });
}

module.exports = {
  registerSaspayRoutes,
  verifyWebhookSignature,
  computeAuthoritativeOrder,
  resolvePromoFromDb,
  creditOrderOnce,
};
