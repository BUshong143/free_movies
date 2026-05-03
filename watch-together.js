// ══════════════════════════════════════════════════
//  CineFy — Watch Together  (watch-together.js)
//  Real-time sync via Supabase Realtime
//  Features:
//   ✓ play/pause sync
//   ✓ host transfer
//   ✓ mobile chat drawer
//   ✓ session persistence (rejoin on refresh/exit)
//   ✓ reconnect banner
//   ✓ no auto-zoom on inputs
// ══════════════════════════════════════════════════

const SUPABASE_URL  = 'https://eqlfwukjidnrwcgfnzjo.supabase.co';
const SUPABASE_ANON = 'sb_publishable_oDSsGiLkQdszdkY-CcJarw_p7qg_rWa';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// TMDB + Jikan
const TKEY  = '8265bd1679663a7ea12ac168da84d2e8';
const TB    = 'https://api.themoviedb.org/3';
const IBASE = 'https://image.tmdb.org/t/p/';
const JB    = 'https://api.jikan.moe/v4';

// Source list
const SOURCES = [
  { n: 'VidSrc',    base: 'https://vidsrc.xyz/embed' },
  { n: 'VidSrc.to', base: 'https://vidsrc.to/embed' },
  { n: 'Embed.su',  base: 'https://embed.su/embed' },
  { n: 'AutoEmbed', base: 'https://autoembed.co/embed' },
  { n: 'Smashy',    base: 'https://player.smashy.stream' },
];

// ── SESSION PERSISTENCE KEYS ──
const SESSION_KEY = 'cinefy_wt_session';

function saveSession() {
  if (!roomCode) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    roomCode,
    myNick,
    myUserId,
    isHost,
    currentTitle: document.getElementById('roomMovieTitle')?.textContent || '',
    currentSrcs,
    currentSrcIdx
  }));
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// App state
let myNick        = '';
let myUserId      = crypto.randomUUID();
let roomCode      = '';
let isHost        = false;
let channel       = null;
let members       = {};
let currentSrcs   = [];
let currentSrcIdx = 0;
let isPaused      = false;
let hcTimer       = null;
let unreadCount   = 0;
let chatDrawerOpen = false;
let reconnectBanner = null;

const isMobile = () => window.innerWidth <= 768;

// ── UTILITIES ──
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3200);
}

async function tmdbFetch(p, x = '') {
  return (await fetch(`${TB}${p}?api_key=${TKEY}${x}`)).json();
}

function getSrc(id, type) {
  const t = type === 'tv' ? 'tv' : 'movie';
  return SOURCES.map(s => ({ n: s.n, u: `${s.base}/${t}/${id}` }));
}

async function getAnimeEmbedSrcs(malId, animeTitle) {
  try {
    const s = await tmdbFetch('/search/tv', `&query=${encodeURIComponent(animeTitle)}`);
    if (s.results?.[0]) return getSrc(s.results[0].id, 'tv');
  } catch(e) {}
  try {
    const s2 = await tmdbFetch('/search/movie', `&query=${encodeURIComponent(animeTitle)}`);
    if (s2.results?.[0]) return getSrc(s2.results[0].id, 'movie');
  } catch(e) {}
  const enc = encodeURIComponent(animeTitle);
  return [
    { n: 'VidSrc',    u: `https://vidsrc.xyz/embed/tv/${malId}` },
    { n: 'Gogoanime', u: `https://gogoanime3.co/search.html?keyword=${enc}` },
    { n: 'Animepahe', u: `https://animepahe.ru/search?q=${enc}` },
    { n: '9anime',    u: `https://9anime.gs/search?keyword=${enc}` },
    { n: 'Zoro.to',   u: `https://hianime.to/search?keyword=${enc}` },
  ];
}

// ── RECONNECT BANNER ──
function showReconnectBanner() {
  if (reconnectBanner) return;
  reconnectBanner = document.createElement('div');
  reconnectBanner.className = 'reconnect-banner';
  reconnectBanner.innerHTML = `
    <div class="reconnect-spinner"></div>
    <span>Reconnecting to room…</span>
  `;
  document.body.appendChild(reconnectBanner);
}

function hideReconnectBanner() {
  if (reconnectBanner) {
    reconnectBanner.remove();
    reconnectBanner = null;
  }
}

// ── LOBBY ──
function setLobbyErr(msg) {
  document.getElementById('lbErr').textContent = msg;
}
function getNick() {
  const v = document.getElementById('nickInput').value.trim();
  if (!v) { setLobbyErr('Please enter a display name first.'); return null; }
  if (v.length < 2) { setLobbyErr('Name must be at least 2 characters.'); return null; }
  setLobbyErr('');
  return v;
}
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

document.getElementById('createRoomBtn').addEventListener('click', async () => {
  const nick = getNick();
  if (!nick) return;
  myNick = nick; isHost = true; roomCode = genCode();
  await enterRoom();
});

document.getElementById('joinRoomBtn').addEventListener('click', async () => {
  const nick = getNick();
  if (!nick) return;
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  if (code.length !== 6) { setLobbyErr('Room code must be 6 characters.'); return; }
  myNick = nick; isHost = false; roomCode = code;
  await enterRoom();
});

document.getElementById('codeInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('joinRoomBtn').click();
});
document.getElementById('nickInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('createRoomBtn').click();
});

// ── ENTER ROOM (shared by fresh join + session restore) ──
async function enterRoom(isReconnect = false) {
  document.getElementById('lobby').style.display    = 'none';
  document.getElementById('roomView').style.display = 'flex';
  document.getElementById('roomCodeDisplay').textContent = roomCode;

  members[myUserId] = { nick: myNick, isHost };

  // Save session so refresh can restore it
  saveSession();

  channel = sb.channel(`cinefy-room-${roomCode}`, {
    config: { presence: { key: myUserId } }
  });

  // ── PRESENCE SYNC ──
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const prevMembers = { ...members };
    members = {};
    Object.values(state).forEach(presences => {
      presences.forEach(p => {
        members[p.userId] = { nick: p.nick, isHost: p.isHost };
      });
    });

    // Host transfer: if host left, first alphabetical member becomes host
    const hostEntry = Object.entries(prevMembers).find(([,m]) => m.isHost);
    const wasHostId = hostEntry?.[0];
    const hostStillHere = wasHostId && Object.keys(members).includes(wasHostId);
    if (!hostStillHere && !isHost) {
      const sorted = Object.keys(members).sort();
      if (sorted[0] === myUserId) {
        isHost = true;
        members[myUserId].isHost = true;
        channel.track({ userId: myUserId, nick: myNick, isHost: true });
        saveSession();
        showHostControls();
        addSystemMsg('You became the new host 👑');
        toast('You are now the host 👑');
      }
    }

    renderMembers();
    saveSession();
  });

  channel.on('presence', { event: 'join' }, ({ newPresences }) => {
    newPresences.forEach(p => {
      if (p.userId !== myUserId) addSystemMsg(`${p.nick} joined the room 👋`);
    });
  });

  channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
    leftPresences.forEach(p => {
      addSystemMsg(`${p.nick} left the room`);
    });
  });

  // ── CHAT ──
  channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
    appendChat(payload.nick, payload.text, payload.ts, payload.userId === myUserId);
    if (isMobile() && !chatDrawerOpen) {
      unreadCount++;
      updateBadge();
    }
  });

  // ── TITLE SYNC ──
  channel.on('broadcast', { event: 'play_title' }, ({ payload }) => {
    if (!isHost) receivePlayTitle(payload);
    // Save the current playing title/srcs to session
    currentSrcs   = payload.srcs;
    currentSrcIdx = 0;
    saveSession();
  });

  // ── SOURCE CHANGE SYNC ──
  channel.on('broadcast', { event: 'change_source' }, ({ payload }) => {
    if (!isHost) loadRoomSrc(payload.idx, payload.srcs);
    currentSrcIdx = payload.idx;
    saveSession();
  });

  // ── PLAY/PAUSE SYNC ──
  channel.on('broadcast', { event: 'playback_cmd' }, ({ payload }) => {
    const { cmd, senderNick, senderId } = payload;
    if (senderId === myUserId) return;
    applyPlaybackCmd(cmd, senderNick);
  });

  // ── SUBSCRIBE ──
  await channel.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED') {
      hideReconnectBanner();
      await channel.track({ userId: myUserId, nick: myNick, isHost });

      if (isHost) {
        showHostControls();
        if (!isReconnect) {
          addSystemMsg(`You created this room. Share code: ${roomCode}`);
          // Auto-load title if coming from main app
          if (window._autoPlay) {
            const { title, id, type } = window._autoPlay;
            window._autoPlay = null;
            setTimeout(() => hostPickTMDB(id, type, title), 600);
          }
        } else {
          addSystemMsg(`Rejoined your room: ${roomCode} 👑`);
          toast('Reconnected to your room! 👑');
        }
      } else {
        showViewerNotice();
        if (!isReconnect) {
          addSystemMsg(`You joined room ${roomCode}`);
        } else {
          addSystemMsg(`Rejoined room ${roomCode} 👋`);
          toast('Reconnected to room! 👋');
        }
      }

      setupSyncBar();

      // If reconnecting and there was a title playing, restore it
      if (isReconnect && currentSrcs.length > 0) {
        const savedTitle = document.getElementById('roomMovieTitle').textContent;
        if (savedTitle && savedTitle !== 'No title selected') {
          loadPlayTitle({ title: savedTitle, srcs: currentSrcs }, true);
        }
      }

    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('Supabase channel error:', err);
      showReconnectBanner();
      // Auto-retry after 3s
      setTimeout(() => retryConnection(), 3000);
    } else if (status === 'CLOSED') {
      hideReconnectBanner();
    }
  });
}

// ── RETRY CONNECTION ──
async function retryConnection() {
  if (channel) {
    try { await channel.unsubscribe(); } catch(e) {}
    channel = null;
  }
  if (!roomCode) return;
  showReconnectBanner();
  try {
    await enterRoom(true);
  } catch(e) {
    setTimeout(() => retryConnection(), 4000);
  }
}

// ── SYNC BAR ──
function setupSyncBar() {
  // Remove old listeners by cloning
  const playBtn  = document.getElementById('syncPlayBtn');
  const pauseBtn = document.getElementById('syncPauseBtn');
  const newPlay  = playBtn.cloneNode(true);
  const newPause = pauseBtn.cloneNode(true);
  playBtn.parentNode.replaceChild(newPlay, playBtn);
  pauseBtn.parentNode.replaceChild(newPause, pauseBtn);

  newPlay.addEventListener('click', () => {
    broadcastPlaybackCmd('play');
    applyPlaybackCmd('play', myNick + ' (you)');
  });
  newPause.addEventListener('click', () => {
    broadcastPlaybackCmd('pause');
    applyPlaybackCmd('pause', myNick + ' (you)');
  });
}

function broadcastPlaybackCmd(cmd) {
  if (!channel) return;
  channel.send({
    type: 'broadcast',
    event: 'playback_cmd',
    payload: { cmd, senderNick: myNick, senderId: myUserId }
  });
}

function applyPlaybackCmd(cmd, senderNick) {
  const frame = document.getElementById('roomFrame');
  const load  = document.getElementById('rpLoad');
  if (!frame) return;

  if (cmd === 'pause') {
    isPaused = true;
    if (frame.src && frame.src !== window.location.href) {
      frame.dataset.pausedSrc = frame.src;
    }
    frame.src = '';
    if (load) load.style.display = 'none';
    showPausedOverlay(senderNick);
  } else if (cmd === 'play') {
    isPaused = false;
    hidePausedOverlay();
    const restoreSrc = frame.dataset.pausedSrc || (currentSrcs[currentSrcIdx]?.u);
    if (restoreSrc) {
      if (load) load.style.display = 'flex';
      frame.src = restoreSrc;
      frame.onload = () => { if (load) load.style.display = 'none'; };
      setTimeout(() => { if (load) load.style.display = 'none'; }, 9000);
    }
  }

  const statusText = document.getElementById('syncStatusText');
  if (statusText) {
    statusText.textContent = cmd === 'play' ? `▶ Playing` : `⏸ Paused`;
  }

  addSyncEventMsg(cmd === 'play'
    ? `▶ ${senderNick} resumed playback`
    : `⏸ ${senderNick} paused playback`
  );
  toast(cmd === 'play'
    ? `▶ ${senderNick} resumed playback`
    : `⏸ ${senderNick} paused playback`
  );
}

// ── PAUSED OVERLAY ──
function showPausedOverlay(nick) {
  let ov = document.getElementById('pausedOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'pausedOverlay';
    ov.style.cssText = `
      position:absolute;inset:0;z-index:50;
      background:rgba(10,10,15,0.82);
      backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:12px;pointer-events:none;
    `;
    ov.innerHTML = `
      <div style="font-size:52px;line-height:1">⏸</div>
      <div style="font-size:15px;font-weight:700;color:#f5f5f7">Paused</div>
      <div id="pausedBy" style="font-size:12px;color:rgba(245,245,247,0.5)"></div>
    `;
    document.getElementById('roomFrameWrap').appendChild(ov);
  }
  ov.style.display = 'flex';
  const pb = document.getElementById('pausedBy');
  if (pb) pb.textContent = `by ${nick}`;
}

function hidePausedOverlay() {
  const ov = document.getElementById('pausedOverlay');
  if (ov) ov.style.display = 'none';
}

function addSyncEventMsg(text) {
  [document.getElementById('chatMessages'), document.getElementById('chatMessagesMobile')].forEach(box => {
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'chat-sync-event';
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  });
}

// ── LEAVE ROOM ──
document.getElementById('leaveBtn').addEventListener('click', leaveRoom);

function leaveRoom() {
  clearSession(); // remove persisted session on intentional leave
  if (channel) channel.unsubscribe();
  channel = null; members = {}; currentSrcs = [];
  roomCode = ''; isHost = false; unreadCount = 0; currentSrcIdx = 0;

  const frame = document.getElementById('roomFrame');
  frame.src = '';
  frame.style.display = 'none';
  document.getElementById('roomPlaceholder').style.display = 'flex';
  document.getElementById('rpSubText').textContent = '';
  document.getElementById('roomSrcBar').style.display = 'none';
  document.getElementById('syncBar').style.display = 'none';
  document.getElementById('roomSrcTabs').innerHTML = '';
  document.getElementById('roomMovieTitle').textContent = 'No title selected';
  document.getElementById('chatMessages').innerHTML = '<div class="chat-system">Welcome to the room! 👋</div>';
  document.getElementById('chatMessagesMobile').innerHTML = '<div class="chat-system">Welcome to the room! 👋</div>';
  document.getElementById('membersList').innerHTML = '';
  document.getElementById('membersListMobile').innerHTML = '';
  document.getElementById('hcResults').innerHTML = '';
  document.getElementById('hcSearch').value = '';
  document.getElementById('hostControls').style.display = 'none';
  document.getElementById('viewerNotice').style.display = 'none';
  hideReconnectBanner();
  updateBadge();
  closeChatDrawer();

  document.getElementById('roomView').style.display = 'none';
  document.getElementById('lobby').style.display    = 'flex';
}

document.getElementById('copyCodeBtn').addEventListener('click', () => {
  if (!roomCode) return;
  navigator.clipboard.writeText(roomCode)
    .then(() => toast('Room code copied! 📋'))
    .catch(() => toast('Code: ' + roomCode));
});

// ── MEMBERS ──
function renderMembers() {
  const arr = Object.entries(members);
  document.getElementById('memberCount').textContent = arr.length;

  const html = arr.map(([uid, m]) => {
    const initial = (m.nick || '?')[0].toUpperCase();
    const isMe = uid === myUserId;
    return `<div class="member-item">
      <div class="member-avatar">${initial}</div>
      <span class="member-name">${esc(m.nick)}${isMe ? ' (you)' : ''}</span>
      ${m.isHost ? '<span class="member-host-badge">HOST</span>' : ''}
    </div>`;
  }).join('');

  document.getElementById('membersList').innerHTML = html;
  document.getElementById('membersListMobile').innerHTML = html;
}

// ── CHAT ──
function sendChat(inputId) {
  const input = document.getElementById(inputId);
  const text = input.value.trim();
  if (!text || !channel) return;
  const ts = Date.now();
  channel.send({ type: 'broadcast', event: 'chat', payload: { nick: myNick, text, ts, userId: myUserId } });
  appendChat(myNick, text, ts, true);
  input.value = '';
}

document.getElementById('chatSendBtn').addEventListener('click', () => sendChat('chatInput'));
document.getElementById('chatSendMobile').addEventListener('click', () => sendChat('chatInputMobile'));

document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat('chatInput');
});
document.getElementById('chatInputMobile').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat('chatInputMobile');
});

function appendChat(nick, text, ts, isMe) {
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const html = `<div class="chat-msg">
    <div class="chat-msg-header">
      <span class="chat-msg-nick${isMe ? ' is-me' : ''}">${esc(nick)}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-text">${esc(text)}</div>
  </div>`;

  [document.getElementById('chatMessages'), document.getElementById('chatMessagesMobile')].forEach(box => {
    if (!box) return;
    box.insertAdjacentHTML('beforeend', html);
    box.scrollTop = box.scrollHeight;
  });
}

function addSystemMsg(msg) {
  const html = `<div class="chat-system">${esc(msg)}</div>`;
  [document.getElementById('chatMessages'), document.getElementById('chatMessagesMobile')].forEach(box => {
    if (!box) return;
    box.insertAdjacentHTML('beforeend', html);
    box.scrollTop = box.scrollHeight;
  });
}

// ── MOBILE CHAT DRAWER ──
function openChatDrawer() {
  chatDrawerOpen = true;
  unreadCount = 0;
  updateBadge();
  document.getElementById('chatDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const m = document.getElementById('chatMessagesMobile');
    if (m) m.scrollTop = m.scrollHeight;
  }, 100);
}

function closeChatDrawer() {
  chatDrawerOpen = false;
  document.getElementById('chatDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function updateBadge() {
  const badge = document.getElementById('fabBadge');
  if (!badge) return;
  if (unreadCount > 0) {
    badge.style.display = 'flex';
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
  } else {
    badge.style.display = 'none';
  }
}

document.getElementById('fabChat').addEventListener('click', openChatDrawer);
document.getElementById('drawerClose').addEventListener('click', closeChatDrawer);
document.getElementById('drawerOverlay').addEventListener('click', closeChatDrawer);

let touchStartY = 0;
document.getElementById('drawerHandle').addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });
document.getElementById('drawerHandle').addEventListener('touchend', e => {
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (dy > 60) closeChatDrawer();
}, { passive: true });

// ── HOST: SEARCH & PICK TITLE ──
function showHostControls() {
  document.getElementById('hostControls').style.display = 'block';
  document.getElementById('viewerNotice').style.display = 'none';
  document.getElementById('syncBar').style.display = 'flex';

  const searchInput = document.getElementById('hcSearch');
  // Remove existing listener by cloning
  const newSearch = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearch, searchInput);

  newSearch.addEventListener('input', e => {
    clearTimeout(hcTimer);
    const v = e.target.value.trim();
    if (!v) { document.getElementById('hcResults').innerHTML = ''; return; }
    hcTimer = setTimeout(() => hostSearch(v), 450);
  });
}

function showViewerNotice() {
  document.getElementById('viewerNotice').style.display = 'block';
  document.getElementById('hostControls').style.display = 'none';
  document.getElementById('syncBar').style.display = 'flex';
}

async function hostSearch(q) {
  const res = document.getElementById('hcResults');
  res.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">Searching…</div>';
  try {
    const [mr, ar] = await Promise.all([
      tmdbFetch('/search/multi', `&query=${encodeURIComponent(q)}`),
      fetch(`${JB}/anime?q=${encodeURIComponent(q)}&limit=5`).then(r => r.json()).catch(() => ({ data: [] }))
    ]);
    const tmdbItems = (mr.results || []).filter(m => m.media_type === 'movie' || m.media_type === 'tv').slice(0, 8);
    const animeItems = (ar.data || []).slice(0, 4);

    if (!tmdbItems.length && !animeItems.length) {
      res.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">No results.</div>';
      return;
    }

    res.innerHTML = [
      ...tmdbItems.map(m => {
        const t = m.title || m.name || '?';
        const img = m.poster_path
          ? `<img src="${IBASE}w92${m.poster_path}" alt="${esc(t)}" loading="lazy">`
          : `<div class="hc-card-np">🎬</div>`;
        const tp = m.media_type || 'movie';
        return `<div class="hc-card" data-id="${m.id}" data-type="${tp}" data-title="${esc(t)}">
          ${img}
          <div class="hc-card-badge">${tp === 'tv' ? 'TV' : '🎬'}</div>
          <div class="hc-card-title">${esc(t)}</div>
        </div>`;
      }),
      ...animeItems.map(a => {
        const t = a.title_english || a.title || '?';
        const img = a.images?.jpg?.image_url
          ? `<img src="${a.images.jpg.image_url}" alt="${esc(t)}" loading="lazy">`
          : `<div class="hc-card-np">⛩️</div>`;
        return `<div class="hc-card" data-mal="${a.mal_id}" data-title="${esc(t)}">
          ${img}
          <div class="hc-card-badge">ANI</div>
          <div class="hc-card-title">${esc(t)}</div>
        </div>`;
      })
    ].join('');

    res.querySelectorAll('.hc-card[data-id]').forEach(card => {
      card.addEventListener('click', () => hostPickTMDB(card.dataset.id, card.dataset.type, card.dataset.title));
    });
    res.querySelectorAll('.hc-card[data-mal]').forEach(card => {
      card.addEventListener('click', () => hostPickAnime(card.dataset.mal, card.dataset.title));
    });
  } catch(e) {
    res.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">Search failed.</div>';
  }
}

async function hostPickTMDB(id, type, title) {
  const srcs = getSrc(id, type);
  broadcastAndPlay({ id, type, title, srcs, mediaKind: 'tmdb' });
}

async function hostPickAnime(malId, title) {
  toast('Finding anime stream… 🔎');
  const srcs = await getAnimeEmbedSrcs(malId, title);
  broadcastAndPlay({ id: malId, type: 'anime', title, srcs, mediaKind: 'anime' });
}

function broadcastAndPlay(payload) {
  channel.send({ type: 'broadcast', event: 'play_title', payload });
  loadPlayTitle(payload);
  currentSrcs   = payload.srcs;
  currentSrcIdx = 0;
  saveSession();
  toast(`Now playing: ${payload.title} 🎬`);
}

// ── PLAYBACK ──
function loadPlayTitle(payload, silent = false) {
  const { title, srcs } = payload;
  currentSrcs = srcs;
  document.getElementById('roomMovieTitle').textContent = title;
  document.getElementById('roomPlaceholder').style.display = 'none';

  const srcBar  = document.getElementById('roomSrcBar');
  const srcTabs = document.getElementById('roomSrcTabs');
  srcBar.style.display = 'flex';
  srcTabs.innerHTML = '';
  srcs.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = `s-tab${i === 0 ? ' active' : ''}`;
    btn.textContent = s.n;
    btn.addEventListener('click', () => switchRoomSrc(i));
    srcTabs.appendChild(btn);
  });

  loadRoomSrcByIdx(currentSrcIdx || 0);
}

function receivePlayTitle(payload) {
  loadPlayTitle(payload);
  addSystemMsg(`Host is now playing: ${payload.title}`);
  toast(`Now playing: ${payload.title} 🎬`);
}

function switchRoomSrc(idx) {
  currentSrcIdx = idx;
  saveSession();
  loadRoomSrcByIdx(idx);
  if (isHost && channel) {
    channel.send({ type: 'broadcast', event: 'change_source', payload: { idx, srcs: currentSrcs } });
  }
}

function loadRoomSrc(idx, srcs) {
  currentSrcs   = srcs;
  currentSrcIdx = idx;
  saveSession();
  const srcTabs = document.getElementById('roomSrcTabs');
  srcTabs.innerHTML = '';
  srcs.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = `s-tab${i === idx ? ' active' : ''}`;
    btn.textContent = s.n;
    btn.addEventListener('click', () => switchRoomSrc(i));
    srcTabs.appendChild(btn);
  });
  loadRoomSrcByIdx(idx);
}

function loadRoomSrcByIdx(idx) {
  const s = currentSrcs[idx];
  if (!s) return;

  document.querySelectorAll('#roomSrcTabs .s-tab').forEach((b, j) => b.classList.toggle('active', j === idx));

  const load  = document.getElementById('rpLoad');
  const frame = document.getElementById('roomFrame');
  const ph    = document.getElementById('roomPlaceholder');

  ph.style.display    = 'none';
  load.style.display  = 'flex';
  frame.style.display = 'none';
  frame.src = '';

  setTimeout(() => {
    frame.src = s.u;
    frame.style.display = 'block';
    frame.onload = () => { load.style.display = 'none'; };
    setTimeout(() => { load.style.display = 'none'; }, 9000);
  }, 80);

  toast(`Loading ${s.n}… 🎬`);
}

// ── INIT — URL params + session restore ──
(function init() {
  const params = new URLSearchParams(window.location.search);

  // ── 1. Try to restore existing session (refresh/back navigation) ──
  const session = loadSession();
  if (session && session.roomCode) {
    // Restore state from session
    myNick        = session.myNick;
    myUserId      = session.myUserId; // keep same userId so presence tracks correctly
    roomCode      = session.roomCode;
    isHost        = session.isHost;
    currentSrcs   = session.currentSrcs   || [];
    currentSrcIdx = session.currentSrcIdx || 0;

    // Pre-fill the lobby inputs in case reconnect fails and user lands on lobby
    document.getElementById('nickInput').value = myNick;

    // Restore title display
    const savedTitle = session.currentTitle;
    if (savedTitle && savedTitle !== 'No title selected') {
      document.getElementById('roomMovieTitle').textContent = savedTitle;
    }

    // Show reconnect banner immediately
    showReconnectBanner();

    // Reconnect to room
    enterRoom(true);
    return;
  }

  // ── 2. Join by room code from URL ──
  const code = params.get('room');
  if (code && code.length === 6) {
    document.getElementById('codeInput').value = code.toUpperCase();
  }

  // ── 3. Auto-title from main app "Watch Together" button ──
  const autoTitle = params.get('autotitle');
  const autoId    = params.get('autoid');
  const autoType  = params.get('autotype');
  if (autoTitle && autoId && autoType) {
    window._autoPlay = { title: decodeURIComponent(autoTitle), id: autoId, type: autoType };
    const sub = document.getElementById('lobbySub');
    if (sub) {
      sub.innerHTML = `Ready to watch <strong style="color:var(--accent)">${decodeURIComponent(autoTitle)}</strong> together! Create a room and share the code with friends.`;
    }
  }
})();

// ── HAMBURGER NAV ──
const hbtn = document.getElementById('hbtn');
if (hbtn) hbtn.addEventListener('click', () => hbtn.classList.toggle('open'));
