// ══════════════════════════════════════════════════
//  CineFy — Watch Together  (watch-together.js)
//  Uses Supabase Realtime for live room sync + chat
// ══════════════════════════════════════════════════

// ─────────────────────────────────────────
//  🔧 REPLACE THESE WITH YOUR SUPABASE KEYS
// ─────────────────────────────────────────
const SUPABASE_URL  = 'eqlfwukjidnrwcgfnzjo';       // e.g. https://xyzabc.supabase.co
const SUPABASE_ANON = 'sb_publishable_oDSsGiLkQdszdkY-CcJarw_p7qg_rWa';  // your public anon key
// ─────────────────────────────────────────

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// TMDB + Jikan (reuse from main app)
const TKEY   = '8265bd1679663a7ea12ac168da84d2e8';
const TB     = 'https://api.themoviedb.org/3';
const IBASE  = 'https://image.tmdb.org/t/p/';
const JB     = 'https://api.jikan.moe/v4';

// App state
let myNick    = '';
let myUserId  = crypto.randomUUID();
let roomCode  = '';
let isHost    = false;
let channel   = null;   // Supabase realtime channel
let members   = {};     // { userId: { nick, isHost } }
let currentSrcs = [];   // current source list
let hcTimer   = null;

// ── Embed sources (same logic as main app) ──
function getSrc(id, type) {
  const t = type === 'tv' ? 'tv' : 'movie';
  return [
    { n: 'VidSrc',    u: `https://vidsrc.xyz/embed/${t}/${id}` },
    { n: 'VidSrc.to', u: `https://vidsrc.to/embed/${t}/${id}` },
    { n: 'Embed.su',  u: `https://embed.su/embed/${t}/${id}` },
    { n: 'AutoEmbed', u: `https://autoembed.co/embed/${t}/${id}` },
    { n: 'Smashy',    u: `https://player.smashy.stream/${t}/${id}` },
  ];
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
    { n: 'VidSrc',     u: `https://vidsrc.xyz/embed/tv/${malId}` },
    { n: 'Gogoanime',  u: `https://gogoanime3.co/search.html?keyword=${enc}` },
    { n: 'Animepahe',  u: `https://animepahe.ru/search?q=${enc}` },
    { n: '9anime',     u: `https://9anime.gs/search?keyword=${enc}` },
    { n: 'Zoro.to',    u: `https://hianime.to/search?keyword=${enc}` },
  ];
}
async function tmdbFetch(p, x = '') {
  return (await fetch(`${TB}${p}?api_key=${TKEY}${x}`)).json();
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── TOAST ──
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 3200);
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

async function createRoom() {
  const nick = getNick();
  if (!nick) return;
  myNick = nick;
  isHost = true;
  roomCode = genCode();
  await enterRoom();
}

async function joinRoom() {
  const nick = getNick();
  if (!nick) return;
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  if (code.length !== 6) { setLobbyErr('Room code must be 6 characters.'); return; }
  myNick = nick;
  isHost = false;
  roomCode = code;
  await enterRoom();
}

// ── ENTER ROOM ──
async function enterRoom() {
  document.getElementById('lobby').style.display    = 'none';
  document.getElementById('roomView').style.display = 'flex';
  document.getElementById('roomCodeDisplay').textContent = roomCode;

  // Set up member record
  members[myUserId] = { nick: myNick, isHost };

  // Subscribe to Supabase Realtime channel for this room
  channel = sb.channel(`cinefy-room-${roomCode}`, {
    config: { presence: { key: myUserId } }
  });

  // Presence: someone joins/leaves
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    members = {};
    Object.values(state).forEach(presences => {
      presences.forEach(p => {
        members[p.userId] = { nick: p.nick, isHost: p.isHost };
      });
    });
    renderMembers();
  });

  channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
    newPresences.forEach(p => {
      if (p.userId !== myUserId) {
        addSystemMsg(`${p.nick} joined the room 👋`);
      }
    });
  });

  channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    leftPresences.forEach(p => {
      addSystemMsg(`${p.nick} left the room`);
    });
  });

  // Broadcast: receive events from others
  channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
    appendChat(payload.nick, payload.text, payload.ts, payload.userId === myUserId);
  });

  channel.on('broadcast', { event: 'play_title' }, ({ payload }) => {
    if (!isHost) {
      // Non-host receives the title to play
      receivePlayTitle(payload);
    }
  });

  channel.on('broadcast', { event: 'change_source' }, ({ payload }) => {
    if (!isHost) {
      loadRoomSrc(payload.idx, payload.srcs);
    }
  });

  // Subscribe and track presence
  await channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        userId: myUserId,
        nick:   myNick,
        isHost: isHost,
      });

      if (isHost) {
        showHostControls();
        addSystemMsg('You created this room. Share code: ' + roomCode);
      } else {
        showViewerNotice();
        addSystemMsg('You joined room ' + roomCode);
      }
    }
  });

  // Chat enter key
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendChat();
  });
}

function leaveRoom() {
  if (channel) channel.unsubscribe();
  channel = null;
  members = {};
  currentSrcs = [];
  roomCode = '';
  isHost = false;

  // Reset UI
  document.getElementById('roomFrame').src = '';
  document.getElementById('roomFrame').style.display = 'none';
  document.getElementById('roomPlaceholder').style.display = 'flex';
  document.getElementById('rpSubText').textContent = '';
  document.getElementById('roomSrcBar').style.display = 'none';
  document.getElementById('roomSrcTabs').innerHTML = '';
  document.getElementById('roomMovieTitle').textContent = 'No title selected';
  document.getElementById('chatMessages').innerHTML = '<div class="chat-system">Welcome to the room! 👋</div>';
  document.getElementById('membersList').innerHTML = '';
  document.getElementById('hcResults').innerHTML = '';
  document.getElementById('hcSearch').value = '';
  document.getElementById('hostControls').style.display  = 'none';
  document.getElementById('viewerNotice').style.display  = 'none';

  document.getElementById('roomView').style.display = 'none';
  document.getElementById('lobby').style.display = 'flex';
}

function copyRoomCode() {
  if (!roomCode) return;
  navigator.clipboard.writeText(roomCode).then(() => toast('Room code copied! 📋'));
}

// ── MEMBER LIST ──
function renderMembers() {
  const list = document.getElementById('membersList');
  const count = document.getElementById('memberCount');
  const arr = Object.entries(members);
  count.textContent = arr.length;
  list.innerHTML = arr.map(([uid, m]) => {
    const initial = (m.nick||'?')[0].toUpperCase();
    const isMe = uid === myUserId;
    return `<div class="member-item">
      <div class="member-avatar">${initial}</div>
      <span class="member-name">${esc(m.nick)}${isMe ? ' (you)' : ''}</span>
      ${m.isHost ? '<span class="member-host-badge">HOST</span>' : ''}
    </div>`;
  }).join('');
}

// ── CHAT ──
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !channel) return;
  const ts = Date.now();
  // Broadcast to others
  channel.send({ type: 'broadcast', event: 'chat', payload: { nick: myNick, text, ts, userId: myUserId } });
  // Show locally
  appendChat(myNick, text, ts, true);
  input.value = '';
}

function appendChat(nick, text, ts, isMe) {
  const box = document.getElementById('chatMessages');
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-nick${isMe ? ' is-me' : ''}">${esc(nick)}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-text">${esc(text)}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function addSystemMsg(msg) {
  const box = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-system';
  div.textContent = msg;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ── HOST: SEARCH & PICK TITLE ──
function showHostControls() {
  document.getElementById('hostControls').style.display = 'block';
  document.getElementById('viewerNotice').style.display = 'none';

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
}

async function hostSearch(q) {
  const res = document.getElementById('hcResults');
  res.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">Searching…</div>';

  const [mr, ar] = await Promise.all([
    tmdbFetch('/search/multi', `&query=${encodeURIComponent(q)}`),
    fetch(`${JB}/anime?q=${encodeURIComponent(q)}&limit=5`).then(r=>r.json()).catch(()=>({data:[]}))
  ]);

  const tmdbItems = (mr.results || []).filter(m => m.media_type === 'movie' || m.media_type === 'tv').slice(0, 8);
  const animeItems = (ar.data || []).slice(0, 4);

  if (!tmdbItems.length && !animeItems.length) {
    res.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">No results.</div>';
    return;
  }

  const tmdbCards = tmdbItems.map(m => {
    const t = m.title || m.name || '?';
    const img = m.poster_path
      ? `<img src="${IBASE}w92${m.poster_path}" alt="${esc(t)}" decoding="async">`
      : `<div class="hc-card-np">🎬</div>`;
    const tp = m.media_type || 'movie';
    return `<div class="hc-card" onclick="hostPickTMDB(${m.id},'${tp}','${esc(t).replace(/'/g,"\\'")}')">
      ${img}
      <div class="hc-card-badge">${tp==='tv'?'TV':'🎬'}</div>
      <div class="hc-card-title">${esc(t)}</div>
    </div>`;
  });

  const animeCards = animeItems.map(a => {
    const t = a.title_english || a.title || '?';
    const img = a.images?.jpg?.image_url
      ? `<img src="${a.images.jpg.image_url}" alt="${esc(t)}" decoding="async">`
      : `<div class="hc-card-np">⛩️</div>`;
    const safeT = esc(t).replace(/'/g,"\\'");
    return `<div class="hc-card" onclick="hostPickAnime(${a.mal_id},'${safeT}')">
      ${img}
      <div class="hc-card-badge">ANI</div>
      <div class="hc-card-title">${esc(t)}</div>
    </div>`;
  });

  res.innerHTML = [...tmdbCards, ...animeCards].join('');
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
  // Tell all viewers
  channel.send({ type: 'broadcast', event: 'play_title', payload });
  // Play locally for host too
  loadPlayTitle(payload);
  toast(`Now playing: ${payload.title} 🎬`);
}

// ── PLAY TITLE (host + viewers) ──
function loadPlayTitle(payload) {
  const { title, srcs } = payload;
  currentSrcs = srcs;

  document.getElementById('roomMovieTitle').textContent = title;
  document.getElementById('roomPlaceholder').style.display = 'none';

  // Show source bar
  const srcBar  = document.getElementById('roomSrcBar');
  const srcTabs = document.getElementById('roomSrcTabs');
  srcBar.style.display = 'flex';
  srcTabs.innerHTML = srcs.map((s, i) =>
    `<button class="s-tab ${i===0?'active':''}" onclick="switchRoomSrc(${i})">${s.n}</button>`
  ).join('');

  loadRoomSrcByIdx(0);
}

function receivePlayTitle(payload) {
  loadPlayTitle(payload);
  addSystemMsg(`Host is now playing: ${payload.title}`);
  toast(`Now playing: ${payload.title} 🎬`);
}

function switchRoomSrc(idx) {
  loadRoomSrcByIdx(idx);
  // If host, broadcast source change
  if (isHost && channel) {
    channel.send({ type: 'broadcast', event: 'change_source', payload: { idx, srcs: currentSrcs } });
  }
}

function loadRoomSrc(idx, srcs) {
  currentSrcs = srcs;
  const srcTabs = document.getElementById('roomSrcTabs');
  srcTabs.innerHTML = srcs.map((s, i) =>
    `<button class="s-tab ${i===idx?'active':''}" onclick="switchRoomSrc(${i})">${s.n}</button>`
  ).join('');
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

// ── INIT ──
// Check for ?room=XXXXXX in URL (for share links)
(function checkURLRoom() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  if (code && code.length === 6) {
    document.getElementById('codeInput').value = code.toUpperCase();
  }
})();
