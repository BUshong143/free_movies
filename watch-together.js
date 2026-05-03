// ══════════════════════════════════════════════════
//  CineFy — Watch Together  (watch-together.js)
//  Real-time sync via Supabase Realtime
//  Features: play/pause sync, host transfer,
//  mobile chat drawer, error handling
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

// Source list — single source of truth
const SOURCES = [
  { n: 'VidSrc',    base: 'https://vidsrc.xyz/embed' },
  { n: 'VidSrc.to', base: 'https://vidsrc.to/embed' },
  { n: 'Embed.su',  base: 'https://embed.su/embed' },
  { n: 'AutoEmbed', base: 'https://autoembed.co/embed' },
  { n: 'Smashy',    base: 'https://player.smashy.stream' },
];

// App state
let myNick      = '';
let myUserId    = crypto.randomUUID();
let roomCode    = '';
let isHost      = false;
let channel     = null;
let members     = {};        // { userId: { nick, isHost } }
let currentSrcs = [];
let currentSrcIdx = 0;       // track which source is active
let isPaused    = false;     // track paused state
let hcTimer     = null;
let unreadCount = 0;
let chatDrawerOpen = false;
let isMobile    = () => window.innerWidth <= 768;

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

// ── ENTER ROOM ──
async function enterRoom() {
  document.getElementById('lobby').style.display    = 'none';
  document.getElementById('roomView').style.display = 'flex';
  document.getElementById('roomCodeDisplay').textContent = roomCode;

  members[myUserId] = { nick: myNick, isHost };

  channel = sb.channel(`cinefy-room-${roomCode}`, {
    config: { presence: { key: myUserId } }
  });

  // Presence sync
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    const prevMembers = { ...members };
    members = {};
    Object.values(state).forEach(presences => {
      presences.forEach(p => {
        members[p.userId] = { nick: p.nick, isHost: p.isHost };
      });
    });

    // Host transfer: if old host left and I'm first non-host, become host
    const wasHost = Object.entries(prevMembers).find(([,m]) => m.isHost)?.[0];
    const stillHere = Object.keys(members).includes(wasHost);
    if (!stillHere && !isHost) {
      const sorted = Object.keys(members).sort();
      if (sorted[0] === myUserId) {
        isHost = true;
        members[myUserId].isHost = true;
        channel.track({ userId: myUserId, nick: myNick, isHost: true });
        showHostControls();
        addSystemMsg('You became the new host 👑');
        toast('You are now the host 👑');
      }
    }

    renderMembers();
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

  // Chat
  channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
    appendChat(payload.nick, payload.text, payload.ts, payload.userId === myUserId);
    // Mobile badge
    if (isMobile() && !chatDrawerOpen) {
      unreadCount++;
      updateBadge();
    }
  });

  // Title sync
  channel.on('broadcast', { event: 'play_title' }, ({ payload }) => {
    if (!isHost) receivePlayTitle(payload);
  });

  // Source change sync
  channel.on('broadcast', { event: 'change_source' }, ({ payload }) => {
    if (!isHost) loadRoomSrc(payload.idx, payload.srcs);
  });

  // ── PLAY/PAUSE SYNC — any member can broadcast ──
  channel.on('broadcast', { event: 'playback_cmd' }, ({ payload }) => {
    const { cmd, senderNick, senderId } = payload;
    if (senderId === myUserId) return; // ignore own events
    applyPlaybackCmd(cmd, senderNick);
  });

  // Subscribe with error handling
  await channel.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ userId: myUserId, nick: myNick, isHost });
      if (isHost) {
        showHostControls();
        addSystemMsg(`You created this room. Share code: ${roomCode}`);
        // Auto-load title if coming from main app
        if (window._autoPlay) {
          const { title, id, type } = window._autoPlay;
          window._autoPlay = null;
          setTimeout(() => hostPickTMDB(id, type, title), 600);
        }
      } else {
        showViewerNotice();
        addSystemMsg(`You joined room ${roomCode}`);
      }
      setupSyncBar();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      toast('Connection failed. Check your room code or network. ❌');
      console.error('Supabase channel error:', err);
      leaveRoom();
    } else if (status === 'CLOSED') {
      toast('Disconnected from room.');
    }
  });
}

// ── SYNC BAR SETUP (play/pause buttons) ──
function setupSyncBar() {
  document.getElementById('syncPlayBtn').addEventListener('click', () => {
    broadcastPlaybackCmd('play');
    applyPlaybackCmd('play', myNick + ' (you)');
  });
  document.getElementById('syncPauseBtn').addEventListener('click', () => {
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
  if (channel) channel.unsubscribe();
  channel = null; members = {}; currentSrcs = [];
  roomCode = ''; isHost = false; unreadCount = 0;

  document.getElementById('roomFrame').src = '';
  document.getElementById('roomFrame').style.display = 'none';
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

  document.getElementById('hcSearch').addEventListener('input', e => {
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
  toast(`Now playing: ${payload.title} 🎬`);
}

// ── PLAYBACK ──
function loadPlayTitle(payload) {
  const { title, srcs } = payload;
  currentSrcs = srcs;
  document.getElementById('roomMovieTitle').textContent = title;
  document.getElementById('roomPlaceholder').style.display = 'none';

  const srcBar = document.getElementById('roomSrcBar');
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

  loadRoomSrcByIdx(0);
}

function receivePlayTitle(payload) {
  loadPlayTitle(payload);
  addSystemMsg(`Host is now playing: ${payload.title}`);
  toast(`Now playing: ${payload.title} 🎬`);
}

function switchRoomSrc(idx) {
  loadRoomSrcByIdx(idx);
  if (isHost && channel) {
    channel.send({ type: 'broadcast', event: 'change_source', payload: { idx, srcs: currentSrcs } });
  }
}

function loadRoomSrc(idx, srcs) {
  currentSrcs = srcs;
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

// ── INIT: URL room code + auto-title from main app ──
(function checkURLRoom() {
  const params = new URLSearchParams(window.location.search);

  // Join by room code
  const code = params.get('room');
  if (code && code.length === 6) {
    document.getElementById('codeInput').value = code.toUpperCase();
  }

  // Auto-title: came from "Watch Together" button on a movie card
  const autoTitle = params.get('autotitle');
  const autoId    = params.get('autoid');
  const autoType  = params.get('autotype');
  if (autoTitle && autoId && autoType) {
    window._autoPlay = { title: decodeURIComponent(autoTitle), id: autoId, type: autoType };
    // Show hint in lobby
    const sub = document.querySelector('.lb-sub');
    if (sub) {
      sub.innerHTML = `Ready to watch <strong style="color:var(--accent)">${decodeURIComponent(autoTitle)}</strong> together! Create a room and share the code with friends.`;
    }
  }
})();

// Hamburger nav
const hbtn = document.getElementById('hbtn');
if (hbtn) hbtn.addEventListener('click', () => hbtn.classList.toggle('open'));
