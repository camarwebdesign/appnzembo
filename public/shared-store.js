// shared-store.js - Moteur de données partagé réactif entre app.nzembo.net et admin.nzembo.net
// Synchronisation immédiate via localStorage et BroadcastChannel / StorageEvent (zéro donnée fictive)

(function () {
  const STORAGE_KEY = 'nzembo_live_data_v5';
  const LEGACY_KEYS = ['nzembo_live_data_v4', 'nzembo_live_data_v3'];
  const EVENT_CHANNEL = 'nzembo_channel_v5';

  // Purger les anciens caches contenant des données fictives
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}

  function playNotificationChime(type = 'default') {
    try {
      window.__nzemboChimeCount = (window.__nzemboChimeCount || 0) + 1;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = window.__nzChimeCtx || (window.__nzChimeCtx = new AudioCtx());
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'money' || type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880.00, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'admin' || type === 'broadcast') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(987.77, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch (e) {}
  }

  const defaultData = {
    stats: {
      totalUsers: 0,
      totalSongs: 0,
      creditsSold: 0,
      grossRevenueUSD: 0,
      grossRevenueCDF: 0,
      todayNewUsers: 0,
      todaySongs: 0
    },
    userAccount: {
      id: '',
      name: 'Mon compte',
      email: '',
      credits: 0,
      referralCode: '',
      referralLink: 'https://app.nzembo.net',
      referralStats: {
        friendsInvited: 0,
        creditsEarned: 0,
        cashEarnedUSD: 0,
        cashEarnedCDF: 0,
        creditExchangeRateUSD: 0.05,
        creditExchangeRateCDF: 142.50
      }
    },
    messages: [],
    traffic: {
      totalVisits: 0,
      sources: [],
      devices: [],
      browsers: [],
      geography: []
    },
    packBreakdown: {
      createur: { count: 0, pct: 0 },
      premium: { count: 0, pct: 0 },
      decouverte: { count: 0, pct: 0 }
    },
    users: [],
    transactions: [],
    withdrawals: []
  };

  function getAuthoritativeCredits(fallbackVal = 0) {
    try {
      const explicit = localStorage.getItem('nzembo_user_credits');
      if (explicit !== null && explicit !== '' && !isNaN(Number(explicit))) {
        return Math.max(0, Number(explicit));
      }
      const authRaw = localStorage.getItem('nzembo_auth_user');
      if (authRaw) {
        const parsedUser = JSON.parse(authRaw);
        if (parsedUser && parsedUser.credits !== undefined && parsedUser.credits !== null && !isNaN(Number(parsedUser.credits))) {
          return Math.max(0, Number(parsedUser.credits));
        }
      }
    } catch (e) { }
    return Math.max(0, Number(fallbackVal) || 0);
  }

  function syncAuthoritativeCredits(newVal) {
    const val = Math.max(0, Number(newVal) || 0);
    try {
      localStorage.setItem('nzembo_user_credits', String(val));
      localStorage.setItem('nzembo_credits_updated_at', String(Date.now()));
      const authRaw = localStorage.getItem('nzembo_auth_user');
      if (authRaw) {
        const parsedUser = JSON.parse(authRaw);
        if (parsedUser && typeof parsedUser === 'object') {
          parsedUser.credits = val;
          localStorage.setItem('nzembo_auth_user', JSON.stringify(parsedUser));
        }
      }
    } catch (e) { }
    return val;
  }

  function loadStore() {
    let storeData = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) storeData = JSON.parse(saved);
    } catch (e) {}
    if (!storeData || typeof storeData !== 'object') {
      storeData = JSON.parse(JSON.stringify(defaultData));
    }
    if (!storeData.userAccount) {
      storeData.userAccount = JSON.parse(JSON.stringify(defaultData.userAccount));
    }
    if (!Array.isArray(storeData.messages)) storeData.messages = [];
    // Toujours purger toute erreur/incident technique de la boîte utilisateur (réservé à l'administration)
    storeData.messages = storeData.messages.filter((m) => m && !m.isError && String(m.category || '').toLowerCase() !== 'error');
    if (!Array.isArray(storeData.users)) storeData.users = [];
    if (!Array.isArray(storeData.transactions)) storeData.transactions = [];
    if (!Array.isArray(storeData.withdrawals)) storeData.withdrawals = [];

    // Synchroniser identité utilisateur authentifié si présente
    try {
      const authRaw = localStorage.getItem('nzembo_auth_user');
      if (authRaw) {
        const au = JSON.parse(authRaw);
        if (au && au.id) {
          storeData.userAccount.id = au.id;
          storeData.userAccount.name = au.name || storeData.userAccount.name;
          storeData.userAccount.email = au.email || storeData.userAccount.email;
          if (au.referral_code) {
            storeData.userAccount.referralCode = au.referral_code;
            storeData.userAccount.referralLink = `https://nzembo.net/invite/${au.referral_code}`;
          }
        }
      }
    } catch (e) {}

    storeData.userAccount.credits = getAuthoritativeCredits(0);
    return storeData;
  }

  function saveStore(data) {
    try {
      if (data && data.userAccount && data.userAccount.credits !== undefined) {
        syncAuthoritativeCredits(data.userAccount.credits);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      notifyChange();
    } catch (e) {
      console.error('Error saving store:', e);
    }
  }

  function notifyChange() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(EVENT_CHANNEL);
        bc.postMessage({ type: 'SYNC_UPDATE', timestamp: Date.now() });
        bc.close();
      }
    } catch (e) {}
  }

  window.NzemboStore = {
    get: loadStore,
    save: saveStore,
    playChime: playNotificationChime,

    getUserCredits: function () {
      return getAuthoritativeCredits(0);
    },

    setUserCredits: function (newCredits) {
      const val = syncAuthoritativeCredits(newCredits);
      try {
        const data = loadStore();
        data.userAccount.credits = val;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) { }
      return val;
    },

    deductCredits: function(amount = 1) {
      const data = loadStore();
      const cost = Math.max(0, parseInt(amount, 10) || 1);
      const currentBal = getAuthoritativeCredits(data.userAccount.credits);
      const newBal = Math.max(0, currentBal - cost);
      data.userAccount.credits = newBal;
      syncAuthoritativeCredits(newBal);
      saveStore(data);
      return newBal;
    },

    addErrorNotification: function(_title, _content, _subject = '') {
      // Les erreurs et incidents applicatifs ne doivent jamais être ajoutés dans les notifications utilisateur
      return null;
    },

    addUserInboxNotification: function({ title, subject = '', content = '', category = 'info', categoryLabel = 'Notification', badgeColor = '', target = '', dedupeKey = '', playSound = true, chimeType = 'default' } = {}) {
      const data = loadStore();
      const targetId = target || (data.userAccount && data.userAccount.id) || 'all';
      const cleanTitle = String(title || 'Notification Nzembo').trim();
      const cleanContent = String(content || cleanTitle).trim();
      if (!cleanContent) return null;

      const now = Date.now();
      const dup = (data.messages || []).find((m) => {
        if (!m) return false;
        if (dedupeKey && m.dedupeKey === dedupeKey) return true;
        return m.title === cleanTitle && m.content === cleanContent && (now - (Number(m.createdAtMs) || 0)) < 300000;
      });
      if (dup) return dup;

      const badgeMap = {
        payment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        creation: 'bg-[var(--nz-accent-soft)] text-[var(--nz-accent)]',
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        promo: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        info: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
      };

      const msg = {
        id: 'usr_n_' + now + '_' + Math.random().toString(36).slice(2, 6),
        dedupeKey: dedupeKey || '',
        target: targetId,
        category: category === 'error' ? 'info' : category,
        categoryLabel: categoryLabel || 'Notification',
        badgeColor: badgeColor || badgeMap[category] || badgeMap.info,
        title: cleanTitle,
        subject: String(subject || '').trim(),
        content: cleanContent,
        date: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        createdAtMs: now,
        isError: false,
        readBy: [],
        likes: 0,
        loves: 0,
        fires: 0
      };
      data.messages.unshift(msg);
      if (data.messages.length > 80) data.messages = data.messages.slice(0, 80);
      saveStore(data);
      if (playSound) {
        const triggerChime = (window.NzemboStore && typeof window.NzemboStore.playChime === 'function')
          ? window.NzemboStore.playChime
          : playNotificationChime;
        triggerChime(chimeType || (category === 'payment' ? 'money' : 'success'));
      }
      return msg;
    },

    mergeRemoteNotifications: function(remoteList) {
      if (!Array.isArray(remoteList) || remoteList.length === 0) return loadStore().messages;
      const data = loadStore();
      const uid = (data.userAccount && data.userAccount.id) ? String(data.userAccount.id) : 'guest';
      const hadExisting = (data.messages || []).length > 0;
      const existingIds = new Set((data.messages || []).map((m) => m.id));
      let addedUnread = 0;
      let added = 0;
      for (const r of remoteList) {
        if (!r || !r.id || existingIds.has(r.id)) continue;
        if (r.is_error || r.isError || String(r.category || '').toLowerCase() === 'error') continue;
        const readBy = Array.isArray(r.read_by) ? r.read_by : [];
        const isUnread = !readBy.includes(uid) && !readBy.includes('current_user');
        data.messages.push({
          id: r.id,
          target: r.target || r.user_id || 'all',
          category: r.category || 'info',
          categoryLabel: r.category_label || 'Notification',
          badgeColor: r.badge_color || 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
          title: r.title || 'Message Nzembo',
          subject: r.subject || '',
          content: r.content || '',
          date: r.created_at ? new Date(r.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Récemment',
          createdAtMs: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          isError: false,
          readBy,
          likes: 0,
          loves: 0,
          fires: 0
        });
        existingIds.add(r.id);
        added++;
        if (isUnread) addedUnread++;
      }
      if (added > 0) {
        data.messages.sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0));
        saveStore(data);
        if (hadExisting && addedUnread > 0) {
          const triggerChime = (window.NzemboStore && typeof window.NzemboStore.playChime === 'function')
            ? window.NzemboStore.playChime
            : playNotificationChime;
          triggerChime('default');
        }
      }
      return data.messages;
    },

    requestCreditCashoutMultiCountry: function (creditsToConvert, countryName, provider, accountDetail, estimatedLocalText, cashUSD) {
      const data = loadStore();
      const earnedCredits = data.userAccount.referralStats.creditsEarned;
      if (creditsToConvert > earnedCredits) {
        return { success: false, message: 'Solde de crédits de parrainage insuffisant.' };
      }
      data.userAccount.referralStats.creditsEarned -= creditsToConvert;
      data.userAccount.referralStats.cashEarnedUSD = Math.max(0, +(data.userAccount.referralStats.cashEarnedUSD - cashUSD).toFixed(2));
      data.userAccount.referralStats.cashEarnedCDF = Math.max(0, data.userAccount.referralStats.cashEarnedCDF - Math.round(creditsToConvert * 142.5));

      const wId = 'W-' + Date.now().toString().slice(-5);
      const newWithdrawal = {
        id: wId,
        userId: data.userAccount.id || 'user',
        user: data.userAccount.name,
        country: countryName,
        referralsCount: data.userAccount.referralStats.friendsInvited,
        creditsConverted: creditsToConvert,
        amountUSD: cashUSD,
        amountLocal: estimatedLocalText,
        method: `${provider} (${accountDetail})`,
        status: 'En attente',
        date: 'À l\'instant'
      };
      data.withdrawals.unshift(newWithdrawal);
      saveStore(data);
      playNotificationChime('money');
      return { success: true, wId, estimatedLocalText, cashUSD };
    },

    adminBroadcastMessage: function (category, categoryLabel, title, subject, content, targetGroup) {
      const data = loadStore();
      const badgeColors = {
        annonce: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        promo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        info: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        update: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
      };
      data.messages.unshift({
        id: 'msg_' + Date.now(),
        target: targetGroup || 'all',
        category: category || 'annonce',
        categoryLabel: categoryLabel || 'Information Nzembo',
        badgeColor: badgeColors[category] || badgeColors.annonce,
        title: title,
        subject: subject,
        content: content,
        date: 'À l\'instant',
        createdAtMs: Date.now(),
        isError: false,
        readBy: [],
        likes: 0,
        loves: 0,
        fires: 0
      });
      saveStore(data);
      playNotificationChime('broadcast');
      return true;
    },

    reactToMessage: function (messageId, reactionType) {
      const data = loadStore();
      const msg = data.messages.find((m) => m.id === messageId);
      if (msg) {
        if (reactionType === 'like') msg.likes = (msg.likes || 0) + 1;
        if (reactionType === 'love') msg.loves = (msg.loves || 0) + 1;
        if (reactionType === 'fire') msg.fires = (msg.fires || 0) + 1;
        saveStore(data);
        return msg;
      }
      return null;
    },

    markMessageRead: function (messageId) {
      const data = loadStore();
      const targetReader = (data.userAccount && data.userAccount.id) ? data.userAccount.id : 'current_user';
      const msg = data.messages.find((m) => m.id === messageId);
      if (msg) {
        if (!msg.readBy) msg.readBy = [];
        if (!msg.readBy.includes(targetReader)) {
          msg.readBy.push(targetReader);
          saveStore(data);
        }
      }
    },

    deleteMessage: function (messageId) {
      const data = loadStore();
      const idx = data.messages.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        data.messages.splice(idx, 1);
        saveStore(data);
        return true;
      }
      return false;
    },

    onSync: function (callback) {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) callback(loadStore());
      });
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(EVENT_CHANNEL);
        bc.onmessage = () => callback(loadStore());
      }
    }
  };
})();
