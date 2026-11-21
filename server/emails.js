// server/emails.js — Templates e-mails 100% aux couleurs et à l'identité nZembo (zéro mention tierce)

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapNzemboEmailLayout({ preheader = '', heading = '', bodyHtml = '', footerNote = '' }) {
  const safePreheader = escapeHtml(preheader);
  const safeHeading = escapeHtml(heading);
  const safeFooter = escapeHtml(footerNote || "Tu reçois cet e-mail car tu utilises l'espace musical nZembo.");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeHeading} — nZembo</title>
</head>
<body style="margin:0;padding:0;background-color:#FAFAF7;font-family:'Figtree',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#13261F;">
  <span style="display:none !important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${safePreheader}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FAFAF7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:540px;background-color:#FFFFFF;border:1px solid #E4E7E1;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,38,31,0.06);">
          <tr>
            <td style="background-color:#0E1B17;padding:24px 28px;border-bottom:3px solid #E8A317;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="width:40px;height:40px;background-color:#F5B83D;border-radius:999px;text-align:center;vertical-align:middle;font-weight:800;font-size:18px;color:#1B1405;">
                    N
                  </td>
                  <td style="padding-left:12px;">
                    <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#F3EFE4;">nZembo</span><br>
                    <span style="font-size:11px;color:#9DB0A6;letter-spacing:0.06em;text-transform:uppercase;">Studio Musical Sur Mesure</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 14px 0;font-size:20px;font-weight:800;color:#13261F;line-height:1.3;">${safeHeading}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#F3F5F0;padding:18px 28px;border-top:1px solid #E4E7E1;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#13261F;">nZembo — Des chansons sur mesure</p>
              <p style="margin:0;font-size:11px;color:#5B6B63;line-height:1.5;">${safeFooter}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderOtpEmailHtml({ code, email, purpose = 'auth', userName = '' }) {
  const safeCode = escapeHtml(code);
  const safeName = escapeHtml(userName || (email ? email.split('@')[0] : 'Artiste'));
  const isRegister = purpose === 'register';
  const heading = isRegister ? 'Confirme ton adresse e-mail' : 'Ton code de validation nZembo';
  const intro = isRegister
    ? `Bienvenue ${safeName} sur <strong>nZembo</strong> ! Pour finaliser la création de ton compte et sécuriser ton accès, entre le code de vérification ci-dessous :`
    : `Bonjour ${safeName}, voici ton code unique pour valider ta connexion sécurisée à <strong>nZembo</strong> :`;

  const bodyHtml = `
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#2E3F38;">${intro}</p>
    <div style="margin:22px 0;padding:20px;background-color:#FAFAF7;border:2px dashed #E8A317;border-radius:14px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#5B6B63;">Code de validation</p>
      <p style="margin:0;font-size:34px;font-weight:800;letter-spacing:0.24em;color:#13261F;font-family:monospace;">${safeCode}</p>
    </div>
    <p style="margin:0 0 12px 0;font-size:13px;line-height:1.55;color:#5B6B63;">Ce code est valable pendant <strong>10 minutes</strong>. Ne le partage avec personne.</p>
    <p style="margin:0;font-size:12px;color:#7A8A82;">Si tu n'es pas à l'origine de cette demande, ignore simplement ce message.</p>
  `;

  return {
    subject: `${safeCode} est ton code de validation nZembo`,
    html: wrapNzemboEmailLayout({
      preheader: `Ton code de validation nZembo : ${safeCode}`,
      heading,
      bodyHtml,
    }),
    text: `nZembo — Code de validation : ${code}. Ce code expire dans 10 minutes.`,
  };
}

function renderPaymentReceiptEmailHtml({ userName, credits, amount, currency, promoCode, orderId }) {
  const safeName = escapeHtml(userName || 'Artiste');
  const bodyHtml = `
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#2E3F38;">Merci ${safeName} ! Ton paiement a été validé et tes crédits sont immédiatement disponibles sur ton studio <strong>nZembo</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FAFAF7;border:1px solid #E4E7E1;border-radius:12px;padding:14px;margin:16px 0;font-size:13px;">
      <tr><td style="padding:6px 10px;color:#5B6B63;">Crédits ajoutés</td><td style="padding:6px 10px;text-align:right;font-weight:800;color:#13261F;">+${Number(credits || 0)} crédits</td></tr>
      <tr><td style="padding:6px 10px;color:#5B6B63;">Montant payé</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#13261F;">${escapeHtml(amount)} ${escapeHtml(currency || 'USD')}</td></tr>
      ${promoCode ? `<tr><td style="padding:6px 10px;color:#5B6B63;">Code promo</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#15803D;">${escapeHtml(promoCode)}</td></tr>` : ''}
      <tr><td style="padding:6px 10px;color:#5B6B63;">Référence</td><td style="padding:6px 10px;text-align:right;font-family:monospace;font-size:12px;color:#5B6B63;">${escapeHtml(orderId)}</td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#5B6B63;">Bonne création musicale sur nZembo !</p>
  `;

  return {
    subject: `Reçu nZembo — +${Number(credits || 0)} crédits ajoutés`,
    html: wrapNzemboEmailLayout({
      preheader: `+${Number(credits || 0)} crédits ajoutés à ton studio nZembo`,
      heading: 'Recharge de crédits confirmée',
      bodyHtml,
    }),
    text: `nZembo — Recharge confirmée : +${credits} crédits (${amount} ${currency}). Réf: ${orderId}`,
  };
}

function renderCollabInviteEmailHtml({ name, role, adminUrl, invitedBy }) {
  const safeName = escapeHtml(name || 'Collaborateur');
  const safeRole = escapeHtml(role || 'collaborator');
  const safeUrl = escapeHtml(adminUrl || 'https://admin.nzembo.net');
  const safeInviter = escapeHtml(invitedBy || 'Administration nZembo');

  const bodyHtml = `
    <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#2E3F38;">Bonjour ${safeName},</p>
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#2E3F38;"><strong>${safeInviter}</strong> t'a ajouté à l'équipe d'administration <strong>nZembo</strong> avec le rôle <strong>${safeRole}</strong>.</p>
    <div style="margin:24px 0;text-align:center;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background-color:#E8A317;color:#1B1405;font-weight:800;font-size:14px;text-decoration:none;border-radius:10px;">Accéder à l'administration nZembo</a>
    </div>
    <p style="margin:0;font-size:12px;color:#5B6B63;">Connecte-toi ou crée ton accès avec cette adresse e-mail sur <strong>${safeUrl}</strong>.</p>
  `;

  return {
    subject: `Invitation équipe nZembo Administration (${safeRole})`,
    html: wrapNzemboEmailLayout({
      preheader: `Tu as été invité à rejoindre l'administration nZembo`,
      heading: 'Accès équipe nZembo activé',
      bodyHtml,
    }),
    text: `Bonjour ${name}, tu as été ajouté à l'administration nZembo (${role}) par ${invitedBy}. Connecte-toi sur ${adminUrl}`,
  };
}

async function sendNzemboEmail({ to, subject, html, text }) {
  const recipient = String(to || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return { sent: false, configured: false, reason: 'invalid_email' };
  }

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.EMAIL_FROM || 'nZembo <noreply@nzembo.net>').trim();

  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: fromEmail, to: [recipient], subject, html, text }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.id) {
        return { sent: true, configured: true, provider: 'resend', id: json.id };
      }
      return { sent: false, configured: true, provider: 'resend', error: json.message || `HTTP ${resp.status}` };
    } catch (err) {
      return { sent: false, configured: true, provider: 'resend', error: err.message };
    }
  }

  return { sent: false, configured: false, reason: 'no_smtp_provider' };
}

module.exports = {
  wrapNzemboEmailLayout,
  renderOtpEmailHtml,
  renderPaymentReceiptEmailHtml,
  renderCollabInviteEmailHtml,
  sendNzemboEmail,
};
