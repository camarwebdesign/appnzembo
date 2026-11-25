const fs = require('fs');
const path = require('path');
let dbMod = null;
try {
  dbMod = require('./db');
} catch {}

const APP_ORIGIN = 'https://app.nzembo.net';
const LANDING_ORIGIN = 'https://nzembo.net';
const DEFAULT_OG_IMAGE = `${APP_ORIGIN}/og-image.png`;

let cachedAppTemplate = null;
let cachedAppMtimeMs = 0;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function formatIsoDuration(rawSec) {
  const sec = Math.round(Number(rawSec) || 0);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return mins > 0 ? `PT${mins}M${rem}S` : `PT${rem}S`;
}

function resolvePublicImageUrl(candidate) {
  const val = String(candidate || '').trim();
  if (/^https?:\/\/[^/]+/i.test(val) && val.length <= 1000) {
    return val;
  }
  return DEFAULT_OG_IMAGE;
}

function getAppHtmlTemplate(publicDir) {
  const filePath = path.join(publicDir, 'app.html');
  const stat = fs.statSync(filePath);
  if (!cachedAppTemplate || stat.mtimeMs !== cachedAppMtimeMs) {
    cachedAppTemplate = fs.readFileSync(filePath, 'utf8');
    cachedAppMtimeMs = stat.mtimeMs;
  }
  return cachedAppTemplate;
}

function buildDefaultGraph(searchTarget = `${APP_ORIGIN}/explorer?q={search_term_string}`) {
  return [
    {
      '@type': 'Organization',
      '@id': `${LANDING_ORIGIN}/#organization`,
      name: 'Nzembo',
      url: `${LANDING_ORIGIN}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${APP_ORIGIN}/icon-512.png`,
      },
      email: 'contact@nzembo.net',
      areaServed: ['CD', 'AF', 'FR', 'WORLD'],
    },
    {
      '@type': 'WebSite',
      '@id': `${APP_ORIGIN}/#website`,
      name: 'Nzembo',
      url: `${APP_ORIGIN}/`,
      inLanguage: ['fr', 'ln', 'en'],
      publisher: { '@id': `${LANDING_ORIGIN}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: searchTarget,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebApplication',
      '@id': `${APP_ORIGIN}/#webapp`,
      name: 'Nzembo',
      url: `${APP_ORIGIN}/`,
      applicationCategory: 'MusicApplication',
      operatingSystem: 'Web, Android, iOS',
      inLanguage: ['fr', 'ln', 'sw', 'en', 'pt', 'es'],
      description: "Studio musical et générateur de chansons par intelligence artificielle en français, lingala et langues internationales : Rumba congolaise, Afrobeat, Ndombolo, Amapiano, Afro Trap, Coupé-décalé, Makossa, Bikutsi, Zouk, Kizomba, Hip-Hop, Rap, Trap, Drill, R&B, Pop, Gospel, Reggae, Jazz, Lo-fi.",
      featureList: 'Création de musique IA, Chansons personnalisées avec paroles et voix, Beats et instrumentaux, Remix et Covers IA, Vidéo MP4, Audio WAV HD',
      offers: {
        '@type': 'Offer',
        price: '0.80',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: `${APP_ORIGIN}/tarifs`,
      },
    },
  ];
}

async function fetchSharedTrackMeta(backendServer, rawId) {
  if (!dbMod || typeof dbMod.query !== 'function' || !rawId) return null;
  try {
    if (backendServer && typeof backendServer.ensureDbReady === 'function') {
      await backendServer.ensureDbReady().catch(() => {});
    }
    const sRes = await dbMod.query(
      `SELECT id, title, style, occasion, recipient, lyrics, audio_url, audio_url_2, video_url, cover_url, album_cover, metadata
       FROM songs WHERE id = $1 OR task_id = $1 LIMIT 1`,
      [rawId]
    ).catch(() => ({ rows: [] }));
    const songRow = (sRes && sRes.rows && sRes.rows[0]) || null;

    const eRes = await dbMod.query(
      `SELECT id, original_song_id, artist, title, style, occasion, audio_url, video_url, cover_url, likes, listens
       FROM explorer_posts WHERE id = $1 OR original_song_id = $1 LIMIT 1`,
      [rawId]
    ).catch(() => ({ rows: [] }));
    const expRow = (eRes && eRes.rows && eRes.rows[0]) || null;

    if (!songRow && !expRow) return null;
    if (songRow) {
      const meta = songRow.metadata && typeof songRow.metadata === 'object' ? songRow.metadata : {};
      return {
        id: songRow.id,
        title: songRow.title || 'Chanson Nzembo',
        style: songRow.style || 'Musique IA',
        artist: songRow.recipient ? `Pour ${songRow.recipient}` : ((expRow && expRow.artist) || 'Nzembo'),
        coverUrl: resolvePublicImageUrl(songRow.album_cover || songRow.cover_url || (expRow && expRow.cover_url)),
        audioUrl: songRow.audio_url || songRow.audio_url_2 || '',
        videoUrl: songRow.video_url || '',
        duration: meta.duration ? Number(meta.duration) : null,
        lyricsSnippet: String(songRow.lyrics || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      };
    }
    return {
      id: expRow.id,
      title: expRow.title || 'Création Nzembo',
      style: expRow.style || 'Musique IA',
      artist: expRow.artist || 'Artiste Nzembo',
      coverUrl: resolvePublicImageUrl(expRow.cover_url),
      audioUrl: expRow.audio_url || '',
      videoUrl: expRow.video_url || '',
      duration: null,
      lyricsSnippet: '',
    };
  } catch {
    return null;
  }
}

async function fetchExplorerPublicList(backendServer) {
  if (!dbMod || typeof dbMod.query !== 'function') return [];
  try {
    if (backendServer && typeof backendServer.ensureDbReady === 'function') {
      await backendServer.ensureDbReady().catch(() => {});
    }
    const r = await dbMod.query(
      `SELECT id, title, style, artist, cover_url, created_at
       FROM explorer_posts
       ORDER BY created_at DESC LIMIT 12`
    );
    return (r && r.rows) || [];
  } catch {
    return [];
  }
}

async function buildAppSeoHeadAndSsr(req, backendServer) {
  const cleanPath = String(req.path || '/').replace(/\/+$/, '') || '/';
  const sharePathMatch = cleanPath.match(/^\/share\/([^/]+)$/i);
  const queryShare = (req.query && (req.query.share || req.query.song)) ? String(req.query.share || req.query.song).trim() : '';
  const sharedId = sharePathMatch ? decodeURIComponent(sharePathMatch[1]) : queryShare;

  const isCallbackOrPrivate = (
    cleanPath === '/auth/callback' ||
    cleanPath === '/callback' ||
    cleanPath === '/profile' ||
    cleanPath === '/settings' ||
    cleanPath.startsWith('/invite') ||
    Boolean(req.query && (req.query.payment || req.query.token || req.query.code || req.query.access_token))
  );

  let title = 'Nzembo Studio IA — Créer une chanson, paroles & musique par IA';
  let description = "Générateur de musique et chansons par intelligence artificielle Nzembo : crée ta chanson personnalisée avec paroles, voix, instrumentaux, beats, remix et covers IA (Rumba congolaise, Afrobeat, Ndombolo, Amapiano, Afro Trap, Coupé-décalé, Makossa, Bikutsi, Zouk, Kizomba, Hip-Hop, Rap, Trap, Drill, R&B, Pop, Gospel, Reggae, Jazz, Lo-fi) en français, lingala et langues internationales.";
  let keywords = 'Nzembo, générateur de musique IA, créer une chanson IA, studio musical IA, paroles IA, instrumentaux, beats, remix, covers IA, Rumba congolaise, Afrobeat, Ndombolo, Amapiano, Afro Trap, Coupé-décalé, Makossa, Bikutsi, Zouk, Kizomba, Hip-Hop, Rap, Trap, Drill, R&B, Pop, Gospel, Reggae, Jazz, Lo-fi, lingala, RDC, Afrique francophone';
  let canonical = `${APP_ORIGIN}/`;
  let robots = isCallbackOrPrivate
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  let ogType = 'website';
  let ogImage = DEFAULT_OG_IMAGE;
  let ogImageAlt = 'Nzembo — Studio de création musicale et chansons par intelligence artificielle';
  let jsonLdGraph = buildDefaultGraph();
  let ssrSlotHtml = '';

  if (sharedId) {
    const meta = await fetchSharedTrackMeta(backendServer, sharedId);
    const trackName = (meta && meta.title) || (req.query && req.query.track ? String(req.query.track).trim() : '') || 'Chanson partagée';
    const styleName = (meta && meta.style) || 'Musique IA';
    const artistName = (meta && meta.artist) || 'Nzembo';
    title = `${trackName} (${styleName}) — Écouter sur Nzembo`;
    description = `Écoute « ${trackName} » (${styleName}), créée avec le studio musical IA Nzembo${artistName && artistName !== 'Nzembo' ? ' — ' + artistName : ''}. Crée ta propre chanson personnalisée en français, lingala et langues internationales.`;
    canonical = `${APP_ORIGIN}/share/${encodeURIComponent(sharedId)}`;
    ogType = 'music.song';
    ogImage = (meta && meta.coverUrl) || DEFAULT_OG_IMAGE;
    ogImageAlt = `Pochette du morceau « ${trackName} » (${styleName}) sur Nzembo`;
    robots = 'index, follow, max-image-preview:large, max-snippet:-1';

    const musicRecording = {
      '@type': 'MusicRecording',
      '@id': `${canonical}#recording`,
      name: trackName,
      genre: styleName,
      url: canonical,
      byArtist: { '@type': 'MusicGroup', name: artistName },
      image: ogImage,
      publisher: { '@type': 'Organization', name: 'Nzembo', url: `${LANDING_ORIGIN}/` },
    };
    const isoDur = meta && meta.duration ? formatIsoDuration(meta.duration) : null;
    if (isoDur) musicRecording.duration = isoDur;
    if (meta && (meta.audioUrl || meta.videoUrl)) {
      musicRecording.audio = {
        '@type': 'AudioObject',
        contentUrl: meta.audioUrl || meta.videoUrl,
      };
    }
    jsonLdGraph = [...buildDefaultGraph(), musicRecording];

    ssrSlotHtml = `
      <article id="nz-ssr-shared-summary" class="mt-4 p-4 rounded-xl border border-[var(--nz-border)] bg-[var(--nz-surface)] text-xs text-[var(--nz-muted)] space-y-1.5">
        <h2 class="text-sm font-bold text-[var(--nz-text)]">${escapeHtml(trackName)} — ${escapeHtml(styleName)} (${escapeHtml(artistName)})</h2>
        <p>${escapeHtml(description)}</p>
        ${meta && meta.lyricsSnippet ? `<p class="italic">${escapeHtml(meta.lyricsSnippet)}...</p>` : ''}
        <p class="pt-1"><a href="${APP_ORIGIN}/explorer" class="font-semibold text-[var(--nz-accent)] hover:underline">Découvrir plus de chansons sur Explorer Nzembo</a> • <a href="${LANDING_ORIGIN}/" class="font-semibold text-[var(--nz-accent)] hover:underline">Présentation Nzembo</a></p>
      </article>
    `;
  } else if (cleanPath === '/explorer' || cleanPath === '/decouvrir') {
    const expRows = await fetchExplorerPublicList(backendServer);
    title = cleanPath === '/decouvrir'
      ? 'Découvrir Nzembo — Chansons IA Africaines & Internationales (Rumba, Afrobeat, Amapiano)'
      : 'Explorer Nzembo — Écouter les chansons IA (Rumba congolaise, Afrobeat, Amapiano, Rap)';
    description = 'Écoute les meilleures créations musicales générées par intelligence artificielle sur Nzembo Explorer : Rumba congolaise, Afrobeat, Ndombolo, Amapiano, Afro Trap, Coupé-décalé, Rap, R&B et Gospel en français et lingala.';
    canonical = `${APP_ORIGIN}${cleanPath}`;

    const listItems = expRows.map((row, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'MusicRecording',
        name: row.title || 'Chanson Nzembo',
        genre: row.style || 'Musique IA',
        byArtist: { '@type': 'MusicGroup', name: row.artist || 'Nzembo' },
        url: `${APP_ORIGIN}/share/${encodeURIComponent(row.id)}`,
      },
    }));

    jsonLdGraph = [
      ...buildDefaultGraph(),
      {
        '@type': 'CollectionPage',
        name: title,
        url: canonical,
        description,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: listItems.length,
          itemListElement: listItems,
        },
      },
    ];

    if (expRows.length > 0) {
      ssrSlotHtml = `
        <section id="nz-ssr-explorer-index" class="mt-4 p-4 rounded-xl border border-[var(--nz-border)] bg-[var(--nz-surface)] space-y-2 text-xs">
          <h2 class="text-sm font-bold text-[var(--nz-text)]">Sélection publique Explorer Nzembo</h2>
          <ul class="grid sm:grid-cols-2 gap-1.5 text-[var(--nz-muted)]">
            ${expRows.map(r => `<li><a href="/share/${escapeHtml(r.id)}" class="font-semibold text-[var(--nz-text)] hover:text-[var(--nz-accent)]">${escapeHtml(r.title || 'Création Nzembo')}</a> — ${escapeHtml(r.style || 'Musique IA')} (${escapeHtml(r.artist || 'Nzembo')})</li>`).join('')}
          </ul>
        </section>
      `;
    }
  } else if (cleanPath === '/tarifs') {
    title = 'Tarifs & Crédits Nzembo — 0,80 $ par crédit, sans abonnement';
    description = 'Consulte les tarifs Nzembo : 0,80 $ USD par crédit sans abonnement pour générer des chansons IA complètes, paroles, instrumentaux, covers, remix et clips vidéo MP4 via Mobile Money ou carte bancaire.';
    canonical = `${APP_ORIGIN}/tarifs`;
  } else if (cleanPath === '/studio') {
    title = 'Studio Musical IA Nzembo — Générateur de chansons, paroles, beats & covers IA';
    description = 'Utilise les 12 outils du studio musical IA Nzembo pour créer une chanson personnalisée avec voix et paroles en français ou lingala, composer des instrumentaux, beats, remix et covers IA.';
    canonical = `${APP_ORIGIN}/studio`;
  }

  const headHtml = `
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(keywords)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="fr" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="fr-CD" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="en" href="${escapeHtml(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}">

  <meta property="og:site_name" content="Nzembo">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:locale:alternate" content="fr_CD">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:alt" content="${escapeHtml(ogImageAlt)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:image:alt" content="${escapeHtml(ogImageAlt)}">

  <script type="application/ld+json">${safeJsonLd({ '@context': 'https://schema.org', '@graph': jsonLdGraph })}</script>
  `;

  return { headHtml, ssrSlotHtml };
}

async function renderAppHtmlWithSeo(req, publicDir, backendServer) {
  let html = getAppHtmlTemplate(publicDir);
  const { headHtml, ssrSlotHtml } = await buildAppSeoHeadAndSsr(req, backendServer);
  html = html.replace(
    /<!-- NZEMBO_SEO_HEAD_START -->[\s\S]*?<!-- NZEMBO_SEO_HEAD_END -->/,
    `<!-- NZEMBO_SEO_HEAD_START -->${headHtml}<!-- NZEMBO_SEO_HEAD_END -->`
  );
  html = html.replace('<!-- NZEMBO_SEO_SSR_SLOT -->', ssrSlotHtml || '');
  return html;
}

async function buildAppSitemapXml(backendServer) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${APP_ORIGIN}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
    { loc: `${APP_ORIGIN}/explorer`, lastmod: today, changefreq: 'hourly', priority: '0.9' },
    { loc: `${APP_ORIGIN}/studio`, lastmod: today, changefreq: 'weekly', priority: '0.9' },
    { loc: `${APP_ORIGIN}/tarifs`, lastmod: today, changefreq: 'weekly', priority: '0.8' },
    { loc: `${APP_ORIGIN}/decouvrir`, lastmod: today, changefreq: 'daily', priority: '0.8' },
  ];

  const seen = new Set(urls.map(u => u.loc));
  if (dbMod && typeof dbMod.query === 'function') {
    try {
      if (backendServer && typeof backendServer.ensureDbReady === 'function') {
        await backendServer.ensureDbReady().catch(() => {});
      }
      const expRes = await dbMod.query(
        `SELECT id, created_at FROM explorer_posts ORDER BY created_at DESC LIMIT 200`
      ).catch(() => ({ rows: [] }));
      for (const row of (expRes.rows || [])) {
        if (!row || !row.id) continue;
        const loc = `${APP_ORIGIN}/share/${encodeURIComponent(row.id)}`;
        if (seen.has(loc)) continue;
        seen.add(loc);
        const dt = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : today;
        urls.push({ loc, lastmod: dt, changefreq: 'weekly', priority: '0.7' });
      }
    } catch {}
  }

  const body = urls.map(u => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${escapeXml(u.lastmod)}</lastmod>
    <changefreq>${escapeXml(u.changefreq)}</changefreq>
    <priority>${escapeXml(u.priority)}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

module.exports = {
  renderAppHtmlWithSeo,
  buildAppSitemapXml,
};
