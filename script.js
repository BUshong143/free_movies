const TKEY='8265bd1679663a7ea12ac168da84d2e8';
const TB='https://api.themoviedb.org/3';
const IBASE='https://image.tmdb.org/t/p/';
const JB='https://api.jikan.moe/v4';
const GENRES=[
  {id:28,n:'Action'},{id:12,n:'Adventure'},{id:16,n:'Animation'},{id:35,n:'Comedy'},
  {id:80,n:'Crime'},{id:18,n:'Drama'},{id:14,n:'Fantasy'},{id:27,n:'Horror'},
  {id:10749,n:'Romance'},{id:878,n:'Sci-Fi'},{id:53,n:'Thriller'}
];

// Source definitions — single source of truth
const SOURCES=[
  {n:'VidSrc',    base:'https://vidsrc.xyz/embed'},
  {n:'VidSrc.to', base:'https://vidsrc.to/embed'},
  {n:'Embed.su',  base:'https://embed.su/embed'},
  {n:'AutoEmbed', base:'https://autoembed.co/embed'},
  {n:'Smashy',    base:'https://player.smashy.stream'},
];

let heroItems=[],heroIdx=0,heroTimer,curPage='home';
let pId,pType,pTitle;
let isFullscreen=false;
let watchlist=JSON.parse(localStorage.getItem('cinefy_watchlist')||'[]');

// ── FULLSCREEN ──
function toggleFullscreen(){
  const playerEl=document.getElementById('player');
  if(!document.fullscreenElement&&!document.webkitFullscreenElement&&!document.mozFullScreenElement&&!document.msFullscreenElement){
    const req=playerEl.requestFullscreen||playerEl.webkitRequestFullscreen||playerEl.mozRequestFullScreen||playerEl.msRequestFullscreen;
    if(req){
      req.call(playerEl).catch(()=>{
        const fr=document.getElementById('pFrame');
        const frReq=fr.requestFullscreen||fr.webkitRequestFullscreen||fr.mozRequestFullScreen||fr.msRequestFullscreen;
        if(frReq)frReq.call(fr).catch(()=>{});
      });
    }
  } else {
    const ex=document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen||document.msExitFullscreen;
    if(ex)ex.call(document).catch(()=>{});
  }
}

function updateFsIcon(isFs){
  const icon=document.getElementById('fsIcon');
  if(!icon)return;
  if(isFs){
    icon.innerHTML='<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';
  } else {
    icon.innerHTML='<path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 13h2v4h4v2H3v-6zm16 4h-4v2h6v-6h-2v4z"/>';
  }
}

['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange'].forEach(evt=>{
  document.addEventListener(evt,()=>{
    const isFs=!!(document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement);
    isFullscreen=isFs;
    updateFsIcon(isFs);
  });
});

// ── SOURCES ──
function getSrc(id,type){
  const t=type==='tv'?'tv':'movie';
  return SOURCES.map(s=>({n:s.n, u:`${s.base}/${t}/${id}`}));
}

async function getAnimeEmbedSrcs(malId,animeTitle){
  try{const s=await tmdb('/search/tv',`&query=${encodeURIComponent(animeTitle)}`);if(s.results?.[0])return getSrc(s.results[0].id,'tv');}catch(e){}
  try{const s2=await tmdb('/search/movie',`&query=${encodeURIComponent(animeTitle)}`);if(s2.results?.[0])return getSrc(s2.results[0].id,'movie');}catch(e){}
  const enc=encodeURIComponent(animeTitle);
  return[
    {n:'VidSrc',    u:`https://vidsrc.xyz/embed/tv/${malId}`},
    {n:'Gogoanime', u:`https://gogoanime3.co/search.html?keyword=${enc}`},
    {n:'Animepahe', u:`https://animepahe.ru/search?q=${enc}`},
    {n:'9anime',    u:`https://9anime.gs/search?keyword=${enc}`},
    {n:'Zoro.to',   u:`https://hianime.to/search?keyword=${enc}`},
  ];
}

async function tmdb(p,x=''){return(await fetch(`${TB}${p}?api_key=${TKEY}${x}`)).json();}
async function jikanFetch(p){return(await fetch(`${JB}${p}`)).json();}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function sk(n=10){return Array(n).fill('<div class="skel"><div class="sk-img"></div><div class="sk-info"><div class="sk-line"></div><div class="sk-line sk-s"></div></div></div>').join('');}

function renderTMDB(arr,id,isTV=false){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=arr.map(m=>{
    const t=m.title||m.name||'?';
    const y=(m.release_date||m.first_air_date||'').slice(0,4);
    const r=m.vote_average?.toFixed(1)||'?';
    const img=m.poster_path
      ?`<img src="${IBASE}w342${m.poster_path}" alt="${esc(t)}" decoding="async" loading="lazy">`
      :`<div class="card-np">🎬</div>`;
    const tp=isTV?'tv':'movie';
    return `<div class="card" data-id="${m.id}" data-type="${tp}">
      <div class="card-poster">${img}<div class="card-rating-badge">⭐ ${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info">
        <div class="card-title">${esc(t)}</div>
        <div class="card-sub"><span>${y}</span></div>
      </div>
    </div>`;
  }).join('');
  // Attach events via delegation — no inline onclick
  el.querySelectorAll('.card').forEach(card=>{
    card.addEventListener('click',()=>openDetail(card.dataset.id, card.dataset.type));
  });
}

function renderAnime(arr,id){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=arr.map(a=>{
    const t=a.title_english||a.title||'?';
    const r=a.score?a.score.toFixed(1):'?';
    const ep=a.episodes?`${a.episodes}ep`:'';
    const imgSrc=a.images?.jpg?.large_image_url||a.images?.jpg?.image_url;
    const poster=imgSrc
      ?`<img src="${imgSrc}" alt="${esc(t)}" decoding="async" loading="lazy">`
      :`<div class="card-np">⛩️</div>`;
    return `<div class="card" data-mal="${a.mal_id}" data-title="${esc(t)}">
      <div class="card-poster">${poster}<div class="card-rating-badge">⭐ ${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info">
        <div class="card-title">${esc(t)}</div>
        <div class="card-sub">${ep?`<span class="c-badge">${ep}</span>`:''}</div>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.card').forEach(card=>{
    card.addEventListener('click',()=>openAnime(card.dataset.mal, card.dataset.title));
  });
}

// ── BOOT FUNCTIONS ──
async function bootHome(){
  ['r-trending','r-toprated','r-nowplaying','r-tvpop','r-anime'].forEach(i=>document.getElementById(i).innerHTML=sk());
  document.getElementById('gpills').innerHTML=GENRES.map(g=>
    `<div class="g-pill" data-gid="${g.id}">${g.n}</div>`
  ).join('');
  document.querySelectorAll('.g-pill').forEach(p=>{
    p.addEventListener('click',()=>goGenre(+p.dataset.gid, p.textContent));
  });

  const[tr,top,np,tv]=await Promise.all([
    tmdb('/trending/movie/week'),tmdb('/movie/top_rated'),
    tmdb('/movie/now_playing'),tmdb('/tv/popular')
  ]);
  heroItems=tr.results.slice(0,6);buildHero();
  renderTMDB(tr.results,'r-trending');
  renderTMDB(top.results,'r-toprated');
  renderTMDB(np.results,'r-nowplaying');
  renderTMDB(tv.results,'r-tvpop',true);
  loadAnimePreview();
}

async function loadAnimePreview(){
  try{
    const d=await jikanFetch('/top/anime?filter=airing&limit=16');
    renderAnime(d.data||[],'r-anime');
  }catch(e){
    document.getElementById('r-anime').innerHTML='<p style="color:var(--muted);padding:20px;font-size:12px">Anime unavailable right now</p>';
  }
}

// Sequential Jikan fetches to avoid rate limiting
async function bootAnime(){
  ['a-airing','a-popular','a-top','a-upcoming'].forEach(i=>document.getElementById(i).innerHTML=sk());
  try{
    const ai=await jikanFetch('/top/anime?filter=airing&limit=20');
    renderAnime(ai.data||[],'a-airing');
    await new Promise(r=>setTimeout(r,350));
    const ap=await jikanFetch('/top/anime?filter=bypopularity&limit=20');
    renderAnime(ap.data||[],'a-popular');
    await new Promise(r=>setTimeout(r,350));
    const at=await jikanFetch('/top/anime?limit=20');
    renderAnime(at.data||[],'a-top');
    await new Promise(r=>setTimeout(r,350));
    const au=await jikanFetch('/top/anime?filter=upcoming&limit=20');
    renderAnime(au.data||[],'a-upcoming');
  }catch(e){
    ['a-airing','a-popular','a-top','a-upcoming'].forEach(i=>{
      document.getElementById(i).innerHTML='<p style="color:var(--muted);padding:20px;font-size:12px">Failed to load</p>';
    });
  }
}

async function bootTV(){
  ['t-popular','t-toprated','t-onair'].forEach(i=>document.getElementById(i).innerHTML=sk());
  const[tp,tt,to]=await Promise.all([tmdb('/tv/popular'),tmdb('/tv/top_rated'),tmdb('/tv/on_the_air')]);
  renderTMDB(tp.results,'t-popular',true);renderTMDB(tt.results,'t-toprated',true);renderTMDB(to.results,'t-onair',true);
}

async function bootMovies(){
  ['m-trending','m-toprated','m-upcoming'].forEach(i=>document.getElementById(i).innerHTML=sk());
  const[mt,mr,mu]=await Promise.all([tmdb('/trending/movie/week'),tmdb('/movie/top_rated'),tmdb('/movie/upcoming')]);
  renderTMDB(mt.results,'m-trending');renderTMDB(mr.results,'m-toprated');renderTMDB(mu.results,'m-upcoming');
}

const booted={home:false,anime:false,tv:false,movies:false};
const loading={home:false,anime:false,tv:false,movies:false};

async function switchPage(pg){
  if(loading[pg])return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t.dataset.page===pg));
  document.querySelectorAll('.sb-item[data-sid]').forEach(t=>t.classList.toggle('active',t.dataset.sid===pg));
  document.getElementById('spage').classList.remove('on');
  document.getElementById('q').value='';
  curPage=pg;
  const el=document.getElementById('pg-'+pg);
  if(el)el.classList.add('active');
  if(pg==='home'&&!booted.home){booted.home=true;loading.home=true;await bootHome();loading.home=false;}
  if(pg==='anime'&&!booted.anime){booted.anime=true;loading.anime=true;await bootAnime();loading.anime=false;}
  if(pg==='tv'&&!booted.tv){booted.tv=true;loading.tv=true;await bootTV();loading.tv=false;}
  if(pg==='movies'&&!booted.movies){booted.movies=true;loading.movies=true;await bootMovies();loading.movies=false;}
  window.scrollTo({top:0,behavior:'smooth'});
}
function goHome(){switchPage('home');}

// ── HERO — fix timer reset on manual nav ──
function buildHero(){
  document.getElementById('hdots').innerHTML=heroItems.map((_,i)=>
    `<div class="hdot ${i===0?'active':''}" data-hi="${i}"></div>`
  ).join('');
  document.querySelectorAll('.hdot').forEach(d=>{
    d.addEventListener('click',()=>setHero(+d.dataset.hi));
  });
  setHero(0);
}

function setHero(i){
  clearInterval(heroTimer); // always reset timer
  heroIdx=i;const m=heroItems[i];
  document.getElementById('htitle').textContent=m.title||m.name;
  document.getElementById('hrating').textContent=`⭐ ${m.vote_average?.toFixed(1)||'?'}`;
  document.getElementById('hyear').textContent=(m.release_date||'').slice(0,4);
  document.getElementById('hgenre').textContent=GENRES.find(g=>g.id===m.genre_ids?.[0])?.n||'Film';
  document.getElementById('hdesc').textContent=m.overview||'';
  document.getElementById('himg').src=m.backdrop_path?`${IBASE}original${m.backdrop_path}`:'';
  document.getElementById('hero-counter').textContent=`0${i+1} / 0${heroItems.length}`;

  // Use data attributes on buttons — no closure leaking
  const playBtn=document.getElementById('hplay');
  const infoBtn=document.getElementById('hinfo');
  playBtn.dataset.id=m.id;playBtn.dataset.title=m.title||m.name;
  infoBtn.dataset.id=m.id;

  document.querySelectorAll('.hdot').forEach((d,j)=>d.classList.toggle('active',j===i));
  heroTimer=setInterval(()=>setHero((heroIdx+1)%heroItems.length),8000);
}

document.getElementById('hplay').addEventListener('click',function(){
  launch(this.dataset.id,'movie',this.dataset.title);
});
document.getElementById('hinfo').addEventListener('click',function(){
  openDetail(this.dataset.id,'movie');
});

// ── DETAIL MODAL ──
async function openDetail(id,type){
  document.getElementById('moverlay').classList.add('open');
  document.body.style.overflow='hidden';
  document.getElementById('mtitle').textContent='Loading…';
  ['mdesc','mmeta','macts','mbd'].forEach(x=>document.getElementById(x).innerHTML='');
  try{
    const d=await tmdb(`/${type}/${id}`);
    const title=d.title||d.name||'?';
    const year=(d.release_date||d.first_air_date||'').slice(0,4);
    const rt=d.runtime?`${Math.floor(d.runtime/60)}h ${d.runtime%60}m`:(d.episode_run_time?.[0]?`~${d.episode_run_time[0]}m/ep`:'');
    if(d.backdrop_path)document.getElementById('mbd').innerHTML=`<img src="${IBASE}w1280${d.backdrop_path}" alt="${esc(title)}">`;
    document.getElementById('mtitle').textContent=title;
    document.getElementById('mdesc').textContent=d.overview||'No description.';
    document.getElementById('mmeta').innerHTML=`
      <div class="m-rating">⭐ ${d.vote_average?.toFixed(1)||'?'}</div>
      ${year?`<span class="tag">${year}</span>`:''}
      ${rt?`<span class="tag">⏱ ${rt}</span>`:''}
      ${(d.genres||[]).map(g=>`<span class="tag g">${esc(g.name)}</span>`).join('')}
      ${d.status?`<span class="tag">${esc(d.status)}</span>`:''}`;

    // ── BUTTONS: Watch Now + Watch Together + Watchlist ──
    const inWl=watchlist.some(w=>w.id==id&&w.type===type);
    document.getElementById('macts').innerHTML=`
      <button class="btn-play" id="modal-watch-btn">▶&nbsp; Watch Now</button>
      <button class="btn-wt" id="modal-wt-btn">👥&nbsp; Watch Together</button>
      <button class="btn-info" id="modal-wl-btn">${inWl?'✓ Watchlisted':'+ Watchlist'}</button>`;

    document.getElementById('modal-watch-btn').addEventListener('click',()=>{
      closeM();launch(id,type,title);
    });
    document.getElementById('modal-wt-btn').addEventListener('click',()=>{
      closeM();
      window.location.href=`watch-together.html?autotitle=${encodeURIComponent(title)}&autoid=${id}&autotype=${type}`;
    });
    document.getElementById('modal-wl-btn').addEventListener('click',()=>toggleWatchlist(id,type,title));
  }catch(e){document.getElementById('mtitle').textContent='Failed to load.';}
}

async function openAnime(malId,rawTitle){
  document.getElementById('moverlay').classList.add('open');
  document.body.style.overflow='hidden';
  document.getElementById('mtitle').textContent='Loading…';
  ['mdesc','mmeta','macts','mbd'].forEach(x=>document.getElementById(x).innerHTML='');
  try{
    const r=await jikanFetch(`/anime/${malId}`);
    const d=r.data;
    const title=d.title_english||d.title||rawTitle||'?';
    const img=d.images?.jpg?.large_image_url||d.images?.jpg?.image_url;
    if(img)document.getElementById('mbd').innerHTML=`<img src="${img}" alt="${esc(title)}" style="object-position:top center;">`;
    document.getElementById('mtitle').textContent=title;
    document.getElementById('mdesc').textContent=(d.synopsis||'No description.').replace(/\[Written by.*?\]/g,'');
    document.getElementById('mmeta').innerHTML=`
      <div class="m-rating">⭐ ${d.score||'?'}</div>
      ${d.year?`<span class="tag">${d.year}</span>`:''}
      ${d.episodes?`<span class="tag">📺 ${d.episodes} eps</span>`:''}
      ${d.status?`<span class="tag">${esc(d.status)}</span>`:''}
      ${(d.genres||[]).map(g=>`<span class="tag g">${esc(g.name)}</span>`).join('')}`;
    document.getElementById('macts').innerHTML=`
      <button class="btn-play" id="modal-anime-watch">▶&nbsp; Watch Now</button>
      <a class="btn-info" href="https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}" target="_blank" rel="noopener" style="text-decoration:none;font-size:12px">Crunchyroll ↗</a>`;
    document.getElementById('modal-anime-watch').addEventListener('click',()=>{
      closeM();launchAnime(malId,title);
    });
  }catch(e){document.getElementById('mtitle').textContent='Failed to load.';}
}

// ── WATCHLIST ──
function toggleWatchlist(id,type,title){
  const idx=watchlist.findIndex(w=>w.id==id&&w.type===type);
  if(idx>=0){
    watchlist.splice(idx,1);toast('Removed from Watchlist');
  } else {
    watchlist.push({id,type,title,addedAt:Date.now()});toast('Added to Watchlist ✅');
  }
  localStorage.setItem('cinefy_watchlist',JSON.stringify(watchlist));
  const btn=document.getElementById('modal-wl-btn');
  if(btn)btn.textContent=watchlist.some(w=>w.id==id&&w.type===type)?'✓ Watchlisted':'+ Watchlist';
}

// ── ANIME LAUNCH ──
async function launchAnime(malId,title){
  toast('Finding stream… 🔎');
  const srcs=await getAnimeEmbedSrcs(malId,title);
  pId=malId;pType='anime';pTitle=title;
  window._animeSrcs=srcs;
  document.getElementById('ptitle').textContent=title;
  buildSrcTabs(srcs,'stabs',loadAnimeSrc);
  document.getElementById('player').classList.add('open');document.body.style.overflow='hidden';
  loadAnimeSrc(0);
}

function loadAnimeSrc(i){
  const srcs=window._animeSrcs||[];const s=srcs[i];if(!s)return;
  const ld=document.getElementById('pload');ld.classList.remove('gone');
  highlightTab('stabs',i);
  document.getElementById('otab').href=s.u;
  const fr=document.getElementById('pFrame');fr.src='';
  setTimeout(()=>{
    fr.src=s.u;
    fr.onload=()=>ld.classList.add('gone');
    setTimeout(()=>ld.classList.add('gone'),9000);
  },80);
  toast(`Loading ${s.n}… 🎬`);
}

function closeM(){document.getElementById('moverlay').classList.remove('open');document.body.style.overflow='';}
function closeMBg(e){if(e.target===document.getElementById('moverlay'))closeM();}

// ── PLAYER ──
function buildSrcTabs(srcs,containerId,callback){
  const el=document.getElementById(containerId);
  el.innerHTML=srcs.map((s,i)=>`<button class="s-tab ${i===0?'active':''}" data-idx="${i}">${s.n}</button>`).join('');
  el.querySelectorAll('.s-tab').forEach(btn=>{
    btn.addEventListener('click',()=>callback(+btn.dataset.idx));
  });
}

function highlightTab(containerId,activeIdx){
  document.querySelectorAll(`#${containerId} .s-tab`).forEach((b,j)=>b.classList.toggle('active',j===activeIdx));
}

function launch(id,type,rawTitle){
  pId=id;pType=type;
  pTitle=typeof rawTitle==='string'?decodeURIComponent(rawTitle):String(rawTitle);
  const srcs=getSrc(id,type);window._animeSrcs=null;
  document.getElementById('ptitle').textContent=pTitle;
  buildSrcTabs(srcs,'stabs',loadSrc);
  document.getElementById('player').classList.add('open');document.body.style.overflow='hidden';
  loadSrc(0);
}

function loadSrc(i){
  const srcs=getSrc(pId,pType);const s=srcs[i];if(!s)return;
  const ld=document.getElementById('pload');ld.classList.remove('gone');
  highlightTab('stabs',i);
  document.getElementById('otab').href=s.u;
  const fr=document.getElementById('pFrame');fr.src='';
  setTimeout(()=>{
    fr.src=s.u;
    fr.onload=()=>ld.classList.add('gone');
    setTimeout(()=>ld.classList.add('gone'),9000);
  },80);
  toast(`Loading ${s.n}… 🎬`);
}

function closePlayer(){
  if(document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement||document.msFullscreenElement){
    const ex=document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen||document.msExitFullscreen;
    if(ex)ex.call(document).catch(()=>{});
  }
  document.getElementById('player').classList.remove('open');
  document.getElementById('pFrame').src='';
  document.body.style.overflow='';
  updateFsIcon(false);
}

// ── GENRE ──
async function goGenre(gid,name){
  document.querySelectorAll('.g-pill').forEach(p=>p.classList.toggle('active',+p.dataset.gid===gid));
  document.getElementById('xsec').style.display='block';
  document.getElementById('xtitle').innerHTML=`<span class="sec-num">+</span>${esc(name)} Films`;
  document.getElementById('r-extra').innerHTML=sk();
  switchPage('home');
  const d=await tmdb('/discover/movie',`&with_genres=${gid}&sort_by=popularity.desc`);
  renderTMDB(d.results,'r-extra');
  document.getElementById('xsec').scrollIntoView({behavior:'smooth',block:'start'});
}

async function goAnimeGenre(gid,name){
  switchPage('anime');
  document.getElementById('ag-sec').style.display='block';
  document.getElementById('ag-title').innerHTML=`<span class="sec-num">+</span>${esc(name)} Anime`;
  document.getElementById('a-genre').innerHTML=sk();
  try{
    const d=await jikanFetch(`/anime?genres=${gid}&order_by=score&sort=desc&limit=20`);
    renderAnime(d.data||[],'a-genre');
  }catch(e){
    document.getElementById('a-genre').innerHTML='<p style="color:var(--muted);padding:20px;font-size:12px">Failed to load</p>';
  }
  document.getElementById('ag-sec').scrollIntoView({behavior:'smooth',block:'start'});
}

// ── SEARCH ──
let qTimer;
document.getElementById('q').addEventListener('input',e=>{
  clearTimeout(qTimer);const v=e.target.value.trim();
  if(!v){hideSPage();return;}
  qTimer=setTimeout(()=>doSearch(v),480);
});

async function doSearch(q){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const sp=document.getElementById('spage');sp.classList.add('on');
  document.getElementById('sq').textContent='"'+q+'"';
  document.getElementById('sgrid').innerHTML=sk(12);
  const[mr,ar]=await Promise.all([
    tmdb('/search/multi',`&query=${encodeURIComponent(q)}`),
    jikanFetch(`/anime?q=${encodeURIComponent(q)}&limit=10`).catch(()=>({data:[]}))
  ]);
  const tmdbRes=(mr.results||[]).filter(m=>m.media_type==='movie'||m.media_type==='tv');
  const animeRes=(ar.data||[]);
  if(!tmdbRes.length&&!animeRes.length){
    document.getElementById('sgrid').innerHTML='<p style="color:var(--muted);font-size:13px;grid-column:1/-1;padding-top:20px">No results found.</p>';
    return;
  }
  const tmdbCards=tmdbRes.map(m=>{
    const t=m.title||m.name||'?';const y=(m.release_date||m.first_air_date||'').slice(0,4);
    const r=m.vote_average?.toFixed(1)||'?';
    const img=m.poster_path
      ?`<img src="${IBASE}w342${m.poster_path}" alt="${esc(t)}" decoding="async" loading="lazy">`
      :`<div class="card-np">🎬</div>`;
    const tp=m.media_type||'movie';
    return `<div class="card" data-id="${m.id}" data-type="${tp}">
      <div class="card-poster">${img}<div class="card-rating-badge">⭐ ${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info"><div class="card-title">${esc(t)}</div><div class="card-sub"><span>${y}</span></div></div>
    </div>`;
  });
  const animeCards=animeRes.map(a=>{
    const t=a.title_english||a.title||'?';const r=a.score?.toFixed(1)||'?';
    const img=a.images?.jpg?.large_image_url||a.images?.jpg?.image_url;
    const poster=img?`<img src="${img}" alt="${esc(t)}" decoding="async" loading="lazy">`:`<div class="card-np">⛩️</div>`;
    return `<div class="card" data-mal="${a.mal_id}" data-title="${esc(t)}">
      <div class="card-poster">${poster}<div class="card-rating-badge">⭐ ${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info"><div class="card-title">${esc(t)}</div><div class="card-sub"><span class="c-badge">ANIME</span></div></div>
    </div>`;
  });
  document.getElementById('sgrid').innerHTML=[...tmdbCards,...animeCards].join('');
  // attach events
  document.querySelectorAll('#sgrid .card[data-id]').forEach(card=>{
    card.addEventListener('click',()=>openDetail(card.dataset.id,card.dataset.type));
  });
  document.querySelectorAll('#sgrid .card[data-mal]').forEach(card=>{
    card.addEventListener('click',()=>openAnime(card.dataset.mal,card.dataset.title));
  });
}

function hideSPage(){
  document.getElementById('spage').classList.remove('on');
  document.getElementById('q').value='';
  switchPage(curPage);
}

// ── SIDEBAR ──
function toggleMenu(){
  const sb=document.getElementById('sidebar'),b=document.getElementById('bd'),h=document.getElementById('hbtn');
  const o=sb.classList.toggle('open');b.classList.toggle('open',o);h.classList.toggle('open',o);
}
function closeMenu(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('bd').classList.remove('open');
  document.getElementById('hbtn').classList.remove('open');
}

// Sidebar genre items — attach events instead of inline
document.querySelectorAll('.sb-genre-item').forEach(el=>{
  el.addEventListener('click',()=>{
    goGenre(+el.dataset.gid, el.dataset.name);closeMenu();
  });
});
document.querySelectorAll('.sb-anime-genre-item').forEach(el=>{
  el.addEventListener('click',()=>{
    goAnimeGenre(+el.dataset.gid, el.dataset.name);closeMenu();
  });
});

function sc(btn,d){btn.closest('.car-wrap').querySelector('.car').scrollBy({left:d*600,behavior:'smooth'});}

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3200);
}

window.addEventListener('scroll',()=>document.getElementById('totop').classList.toggle('show',scrollY>400));

// ── ESCAPE KEY — priority ordered ──
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(document.getElementById('player').classList.contains('open')){closePlayer();return;}
    if(document.getElementById('moverlay').classList.contains('open')){closeM();return;}
    if(document.getElementById('sidebar').classList.contains('open')){closeMenu();return;}
    hideSPage();
    return;
  }
  if(e.key==='f'&&document.getElementById('player').classList.contains('open'))toggleFullscreen();
});

switchPage('home');
