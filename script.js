const TKEY='8265bd1679663a7ea12ac168da84d2e8';
const TB='https://api.themoviedb.org/3';
const IBASE='https://image.tmdb.org/t/p/';
const JB='https://api.jikan.moe/v4';
const GENRES=[
  {id:28,n:'Action'},{id:12,n:'Adventure'},{id:16,n:'Animation'},{id:35,n:'Comedy'},
  {id:80,n:'Crime'},{id:18,n:'Drama'},{id:14,n:'Fantasy'},{id:27,n:'Horror'},
  {id:10749,n:'Romance'},{id:878,n:'Sci-Fi'},{id:53,n:'Thriller'}
];
 
let heroItems=[],heroIdx=0,heroTimer,curPage='home';
let pId,pType,pTitle;
 
// ── ANIME PLAYER SOURCES: search anime title on TMDB then embed
// We look up the anime title on TMDB and use its TV/Movie ID for embed sources
// This is the fix — anime gets played via TMDB-based embed using the title lookup
 
async function getAnimeEmbedSrcs(malId, animeTitle) {
  // Try to find the anime on TMDB via search
  try {
    const searchRes = await tmdb('/search/tv', `&query=${encodeURIComponent(animeTitle)}`);
    const found = searchRes.results?.[0];
    if (found) {
      return buildSrcs(found.id, 'tv', animeTitle);
    }
  } catch(e){}
  // Fallback: try movie search
  try {
    const searchRes2 = await tmdb('/search/movie', `&query=${encodeURIComponent(animeTitle)}`);
    const found2 = searchRes2.results?.[0];
    if (found2) {
      return buildSrcs(found2.id, 'movie', animeTitle);
    }
  } catch(e){}
  // Last resort: use MAL ID directly as TV on embed sources
  return buildSrcsFallback(malId, animeTitle);
}
 
function buildSrcs(id, type, title) {
  const t = type === 'tv' ? 'tv' : 'movie';
  return [
    {n:'VidSrc', u:`https://vidsrc.xyz/embed/${t}/${id}`},
    {n:'VidSrc.to', u:`https://vidsrc.to/embed/${t}/${id}`},
    {n:'Embed.su', u:`https://embed.su/embed/${t}/${id}`},
    {n:'AutoEmbed', u:`https://autoembed.co/embed/${t}/${id}`},
    {n:'Smashy', u:`https://player.smashy.stream/${t}/${id}`},
  ];
}
 
function buildSrcsFallback(malId, title) {
  const enc = encodeURIComponent(title);
  return [
    {n:'VidSrc', u:`https://vidsrc.xyz/embed/tv/${malId}`},
    {n:'Gogoanime', u:`https://gogoanime3.co/search.html?keyword=${enc}`},
    {n:'Animepahe', u:`https://animepahe.ru/search?q=${enc}`},
    {n:'9anime', u:`https://9anime.gs/search?keyword=${enc}`},
    {n:'Zoro.to', u:`https://hianime.to/search?keyword=${enc}`},
  ];
}
 
function getSrc(id,type){
  const t=type==='tv'?'tv':'movie';
  return[
    {n:'VidSrc',  u:`https://vidsrc.xyz/embed/${t}/${id}`},
    {n:'VidSrc.to',u:`https://vidsrc.to/embed/${t}/${id}`},
    {n:'Embed.su', u:`https://embed.su/embed/${t}/${id}`},
    {n:'AutoEmbed',u:`https://autoembed.co/embed/${t}/${id}`},
    {n:'Smashy',   u:`https://player.smashy.stream/${t}/${id}`},
  ];
}
 
async function tmdb(p,x=''){return(await fetch(`${TB}${p}?api_key=${TKEY}${x}`)).json();}
async function jikan(p){return(await fetch(`${JB}${p}`)).json();}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function sk(n=10){return Array(n).fill('<div class="skel"><div class="sk-img"></div><div class="sk-info"><div class="sk-line"></div><div class="sk-line sk-s"></div></div></div>').join('');}
 
function renderTMDB(arr,id,isTV=false){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=arr.map(m=>{
    const t=m.title||m.name||'?';
    const y=(m.release_date||m.first_air_date||'').slice(0,4);
    const r=m.vote_average?.toFixed(1)||'?';
    const img=m.poster_path?`<img src="${IBASE}w342${m.poster_path}" alt="${esc(t)}" decoding="async">`:`<div class="card-np">🎬</div>`;
    const tp=isTV?'tv':'movie';
    return `<div class="card" onclick="openDetail(${m.id},'${tp}')">
      <div class="card-poster">${img}<div class="card-rating-badge">⭐${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info">
        <div class="card-title">${esc(t)}</div>
        <div class="card-sub"><span>${y}</span></div>
      </div>
    </div>`;
  }).join('');
}
 
function renderAnime(arr,id){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=arr.map(a=>{
    const t=a.title_english||a.title||'?';
    const r=a.score?a.score.toFixed(1):'?';
    const ep=a.episodes?`${a.episodes}ep`:'';
    const imgSrc=a.images?.jpg?.large_image_url||a.images?.jpg?.image_url;
    const poster=imgSrc?`<img src="${imgSrc}" alt="${esc(t)}" decoding="async">`:`<div class="card-np">⛩️</div>`;
    const malId=a.mal_id;
    const safeTitle=esc(t).replace(/'/g,'\\&#x27;');
    return `<div class="card" onclick="openAnime(${malId},'${safeTitle}')">
      <div class="card-poster">${poster}<div class="card-rating-badge">⭐${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info">
        <div class="card-title">${esc(t)}</div>
        <div class="card-sub">${ep?`<span class="c-badge">${ep}</span>`:''}</div>
      </div>
    </div>`;
  }).join('');
}
 
async function bootHome(){
  ['r-trending','r-toprated','r-nowplaying','r-tvpop','r-anime'].forEach(i=>document.getElementById(i).innerHTML=sk());
  document.getElementById('gpills').innerHTML=GENRES.map(g=>`<div class="g-pill" data-gid="${g.id}" onclick="goGenre(${g.id},'${g.n}')">${g.n}</div>`).join('');
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
    const d=await jikan('/top/anime?filter=airing&limit=16');
    renderAnime(d.data||[],'r-anime');
  }catch(e){document.getElementById('r-anime').innerHTML='<p style="color:var(--muted);padding:20px;font-size:12px">Anime unavailable right now</p>';}
}
 
async function bootAnime(){
  ['a-airing','a-popular','a-top','a-upcoming'].forEach(i=>document.getElementById(i).innerHTML=sk());
  try{
    const[ai,ap,at,au]=await Promise.all([
      jikan('/top/anime?filter=airing&limit=20'),
      jikan('/top/anime?filter=bypopularity&limit=20'),
      jikan('/top/anime?limit=20'),
      jikan('/top/anime?filter=upcoming&limit=20')
    ]);
    renderAnime(ai.data||[],'a-airing');
    renderAnime(ap.data||[],'a-popular');
    renderAnime(at.data||[],'a-top');
    renderAnime(au.data||[],'a-upcoming');
  }catch(e){['a-airing','a-popular','a-top','a-upcoming'].forEach(i=>{document.getElementById(i).innerHTML='<p style="color:var(--muted);padding:20px;font-size:12px">Failed to load</p>';});}
}
 
async function bootTV(){
  ['t-popular','t-toprated','t-onair'].forEach(i=>document.getElementById(i).innerHTML=sk());
  const[tp,tt,to]=await Promise.all([tmdb('/tv/popular'),tmdb('/tv/top_rated'),tmdb('/tv/on_the_air')]);
  renderTMDB(tp.results,'t-popular',true);
  renderTMDB(tt.results,'t-toprated',true);
  renderTMDB(to.results,'t-onair',true);
}
 
async function bootMovies(){
  ['m-trending','m-toprated','m-upcoming'].forEach(i=>document.getElementById(i).innerHTML=sk());
  const[mt,mr,mu]=await Promise.all([tmdb('/trending/movie/week'),tmdb('/movie/top_rated'),tmdb('/movie/upcoming')]);
  renderTMDB(mt.results,'m-trending');
  renderTMDB(mr.results,'m-toprated');
  renderTMDB(mu.results,'m-upcoming');
}
 
const booted={home:false,anime:false,tv:false,movies:false};
async function switchPage(pg){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t.dataset.page===pg));
  document.querySelectorAll('.sb-item[data-sid]').forEach(t=>t.classList.toggle('active',t.dataset.sid===pg));
  document.getElementById('spage').classList.remove('on');
  document.getElementById('q').value='';
  curPage=pg;
  const el=document.getElementById('pg-'+pg);
  if(el)el.classList.add('active');
  if(pg==='home'&&!booted.home){booted.home=true;await bootHome();}
  if(pg==='anime'&&!booted.anime){booted.anime=true;await bootAnime();}
  if(pg==='tv'&&!booted.tv){booted.tv=true;await bootTV();}
  if(pg==='movies'&&!booted.movies){booted.movies=true;await bootMovies();}
  window.scrollTo({top:0,behavior:'smooth'});
}
function goHome(){switchPage('home');}
 
// HERO
function buildHero(){
  document.getElementById('hdots').innerHTML=heroItems.map((_,i)=>`<div class="hdot ${i===0?'active':''}" onclick="setHero(${i})"></div>`).join('');
  setHero(0);
  clearInterval(heroTimer);
  heroTimer=setInterval(()=>setHero((heroIdx+1)%heroItems.length),8000);
}
function setHero(i){
  heroIdx=i;const m=heroItems[i];
  document.getElementById('htitle').textContent=m.title||m.name;
  document.getElementById('hrating').textContent=`⭐ ${m.vote_average?.toFixed(1)||'?'}`;
  document.getElementById('hyear').textContent=(m.release_date||'').slice(0,4);
  document.getElementById('hgenre').textContent=GENRES.find(g=>g.id===m.genre_ids?.[0])?.n||'Film';
  document.getElementById('hdesc').textContent=m.overview||'';
  document.getElementById('himg').src=m.backdrop_path?`${IBASE}original${m.backdrop_path}`:'';
  document.getElementById('hero-counter').textContent=`0${i+1} / 0${heroItems.length}`;
  document.getElementById('hplay').onclick=()=>launch(m.id,'movie',m.title||m.name);
  document.getElementById('hinfo').onclick=()=>openDetail(m.id,'movie');
  document.querySelectorAll('.hdot').forEach((d,j)=>d.classList.toggle('active',j===i));
}
 
// DETAIL MODAL
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
    if(d.backdrop_path)document.getElementById('mbd').innerHTML=`<img src="${IBASE}w1280${d.backdrop_path}" alt="">`;
    document.getElementById('mtitle').textContent=title;
    document.getElementById('mdesc').textContent=d.overview||'No description.';
    document.getElementById('mmeta').innerHTML=`
      <div class="m-rating">⭐ ${d.vote_average?.toFixed(1)||'?'}</div>
      ${year?`<span class="tag">${year}</span>`:''}
      ${rt?`<span class="tag">⏱ ${rt}</span>`:''}
      ${(d.genres||[]).map(g=>`<span class="tag g">${g.name}</span>`).join('')}
      ${d.status?`<span class="tag">${d.status}</span>`:''}`;
    const enc=encodeURIComponent(title);
    document.getElementById('macts').innerHTML=`
      <button class="btn-play" style="font-size:11px;padding:10px 22px" onclick="closeM();launch(${id},'${type}','${enc}')">▶ WATCH NOW</button>
      <button class="btn-info" style="font-size:11px;padding:10px 18px" onclick="toast('Added to Watchlist ✅')">+ WATCHLIST</button>`;
  }catch(e){document.getElementById('mtitle').textContent='Failed to load.';}
}
 
// ANIME MODAL — with TMDB lookup for playback
async function openAnime(malId, rawTitle){
  document.getElementById('moverlay').classList.add('open');
  document.body.style.overflow='hidden';
  document.getElementById('mtitle').textContent='Loading…';
  ['mdesc','mmeta','macts','mbd'].forEach(x=>document.getElementById(x).innerHTML='');
  try{
    const r=await jikan(`/anime/${malId}`);
    const d=r.data;
    const title=d.title_english||d.title||rawTitle||'?';
    const img=d.images?.jpg?.large_image_url||d.images?.jpg?.image_url;
    if(img)document.getElementById('mbd').innerHTML=`<img src="${img}" alt="" style="object-position:top center;">`;
    document.getElementById('mtitle').textContent=title;
    document.getElementById('mdesc').textContent=(d.synopsis||'No description.').replace(/\[Written by.*?\]/g,'');
    document.getElementById('mmeta').innerHTML=`
      <div class="m-rating">⭐ ${d.score||'?'}</div>
      ${d.year?`<span class="tag">${d.year}</span>`:''}
      ${d.episodes?`<span class="tag">📺 ${d.episodes} eps</span>`:''}
      ${d.status?`<span class="tag">${d.status}</span>`:''}
      ${(d.genres||[]).map(g=>`<span class="tag g">${g.name}</span>`).join('')}`;
    // Store title for anime launch
    const safeTitle=title;
    document.getElementById('macts').innerHTML=`
      <button class="btn-play" style="font-size:11px;padding:10px 22px" onclick="closeM();launchAnime(${malId},'${encodeURIComponent(safeTitle)}')">▶ WATCH NOW</button>
      <a class="btn-info" href="https://www.crunchyroll.com/search?q=${encodeURIComponent(safeTitle)}" target="_blank" rel="noopener" style="text-decoration:none;font-size:11px">CRUNCHYROLL ↗</a>`;
  }catch(e){document.getElementById('mtitle').textContent='Failed to load.';}
}
 
// ANIME LAUNCHER — searches TMDB first for embed ID
async function launchAnime(malId, rawEncTitle){
  const title=decodeURIComponent(rawEncTitle);
  toast('Finding stream for "'+title+'"… 🔎');
  const srcs=await getAnimeEmbedSrcs(malId, title);
  pId=srcs[0]?.tmdbId||malId;
  pType='anime';
  pTitle=title;
  window._animeSrcs=srcs;
  document.getElementById('ptitle').textContent='▶  '+title;
  document.getElementById('stabs').innerHTML=srcs.map((s,i)=>`<button class="s-tab ${i===0?'active':''}" onclick="loadAnimeSrc(${i})">${s.n}</button>`).join('');
  document.getElementById('player').classList.add('open');
  document.body.style.overflow='hidden';
  loadAnimeSrc(0);
}
 
function loadAnimeSrc(i){
  const srcs=window._animeSrcs||[];
  const s=srcs[i];if(!s)return;
  const ld=document.getElementById('pload');
  ld.classList.remove('gone');
  document.querySelectorAll('.s-tab').forEach((b,j)=>b.classList.toggle('active',j===i));
  document.getElementById('otab').href=s.u;
  const fr=document.getElementById('pFrame');
  fr.src='';
  setTimeout(()=>{
    fr.src=s.u;
    fr.onload=()=>ld.classList.add('gone');
    setTimeout(()=>ld.classList.add('gone'),9000);
  },80);
  toast(`Loading ${s.n}… 🎬`);
}
 
function closeM(){document.getElementById('moverlay').classList.remove('open');document.body.style.overflow='';}
function closeMBg(e){if(e.target===document.getElementById('moverlay'))closeM();}
 
function launch(id,type,rawTitle){
  pId=id;pType=type;
  pTitle=typeof rawTitle==='string'?decodeURIComponent(rawTitle):String(rawTitle);
  const srcs=getSrc(id,type);
  window._animeSrcs=null;
  document.getElementById('ptitle').textContent='▶  '+pTitle;
  document.getElementById('stabs').innerHTML=srcs.map((s,i)=>`<button class="s-tab ${i===0?'active':''}" onclick="loadSrc(${i})">${s.n}</button>`).join('');
  document.getElementById('player').classList.add('open');
  document.body.style.overflow='hidden';
  loadSrc(0);
}
function loadSrc(i){
  const srcs=getSrc(pId,pType);
  const s=srcs[i];
  const ld=document.getElementById('pload');
  ld.classList.remove('gone');
  document.querySelectorAll('.s-tab').forEach((b,j)=>b.classList.toggle('active',j===i));
  document.getElementById('otab').href=s.u;
  const fr=document.getElementById('pFrame');
  fr.src='';
  setTimeout(()=>{fr.src=s.u;fr.onload=()=>ld.classList.add('gone');setTimeout(()=>ld.classList.add('gone'),9000);},80);
  toast(`Loading ${s.n}… 🎬`);
}
function closePlayer(){
  document.getElementById('player').classList.remove('open');
  document.getElementById('pFrame').src='';
  document.body.style.overflow='';
}
 
async function goGenre(gid,name){
  document.querySelectorAll('.g-pill').forEach(p=>p.classList.toggle('active',+p.dataset.gid===gid));
  document.getElementById('xsec').style.display='block';
  document.getElementById('xtitle').innerHTML=`<span class="sec-num">+</span>${name} Films`;
  document.getElementById('r-extra').innerHTML=sk();
  switchPage('home');
  const d=await tmdb('/discover/movie',`&with_genres=${gid}&sort_by=popularity.desc`);
  renderTMDB(d.results,'r-extra');
  document.getElementById('xsec').scrollIntoView({behavior:'smooth',block:'start'});
}
 
async function goAnimeGenre(gid,name){
  switchPage('anime');
  document.getElementById('ag-sec').style.display='block';
  document.getElementById('ag-title').innerHTML=`<span class="sec-num">+</span>${name} Anime`;
  document.getElementById('a-genre').innerHTML=sk();
  try{
    const d=await jikan(`/anime?genres=${gid}&order_by=score&sort=desc&limit=20`);
    renderAnime(d.data||[],'a-genre');
  }catch(e){document.getElementById('a-genre').innerHTML='<p style="color:var(--muted);padding:20px;font-size:12px">Failed to load</p>';}
  document.getElementById('ag-sec').scrollIntoView({behavior:'smooth',block:'start'});
}
 
let qTimer;
document.getElementById('q').addEventListener('input',e=>{
  clearTimeout(qTimer);
  const v=e.target.value.trim();
  if(!v){hideSPage();return;}
  qTimer=setTimeout(()=>doSearch(v),480);
});
 
async function doSearch(q){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const sp=document.getElementById('spage');
  sp.classList.add('on');
  document.getElementById('sq').textContent='"'+q+'"';
  document.getElementById('sgrid').innerHTML=sk(12);
  const[mr,ar]=await Promise.all([
    tmdb('/search/multi',`&query=${encodeURIComponent(q)}`),
    jikan(`/anime?q=${encodeURIComponent(q)}&limit=10`).catch(()=>({data:[]}))
  ]);
  const tmdbRes=(mr.results||[]).filter(m=>m.media_type==='movie'||m.media_type==='tv');
  const animeRes=(ar.data||[]);
  if(!tmdbRes.length&&!animeRes.length){
    document.getElementById('sgrid').innerHTML='<p style="color:var(--muted);font-size:13px;grid-column:1/-1;padding-top:20px">No results found.</p>';
    return;
  }
  const tmdbCards=tmdbRes.map(m=>{
    const t=m.title||m.name||'?';
    const y=(m.release_date||m.first_air_date||'').slice(0,4);
    const r=m.vote_average?.toFixed(1)||'?';
    const img=m.poster_path?`<img src="${IBASE}w342${m.poster_path}" alt="${esc(t)}" decoding="async">`:`<div class="card-np">🎬</div>`;
    const tp=m.media_type||'movie';
    return `<div class="card" onclick="openDetail(${m.id},'${tp}')">
      <div class="card-poster">${img}<div class="card-rating-badge">⭐${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info"><div class="card-title">${esc(t)}</div><div class="card-sub"><span>${y}</span></div></div>
    </div>`;
  });
  const animeCards=animeRes.map(a=>{
    const t=a.title_english||a.title||'?';
    const r=a.score?.toFixed(1)||'?';
    const img=a.images?.jpg?.large_image_url||a.images?.jpg?.image_url;
    const poster=img?`<img src="${img}" alt="${esc(t)}" decoding="async">`:`<div class="card-np">⛩️</div>`;
    const safeTitle=esc(t).replace(/'/g,'\\&#x27;');
    return `<div class="card" onclick="openAnime(${a.mal_id},'${safeTitle}')">
      <div class="card-poster">${poster}<div class="card-rating-badge">⭐${r}</div>
        <div class="card-overlay"><div class="card-play">▶</div><div class="card-ov-title">${esc(t)}</div></div>
      </div>
      <div class="card-info"><div class="card-title">${esc(t)}</div><div class="card-sub"><span class="c-badge">ANIME</span></div></div>
    </div>`;
  });
  document.getElementById('sgrid').innerHTML=[...tmdbCards,...animeCards].join('');
}
 
function hideSPage(){
  document.getElementById('spage').classList.remove('on');
  document.getElementById('q').value='';
  switchPage(curPage);
}
 
function toggleMenu(){
  const sb=document.getElementById('sidebar'),b=document.getElementById('bd'),h=document.getElementById('hbtn');
  const o=sb.classList.toggle('open');
  b.classList.toggle('open',o);h.classList.toggle('open',o);
}
function closeMenu(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('bd').classList.remove('open');
  document.getElementById('hbtn').classList.remove('open');
}
 
function sc(btn,d){btn.closest('.car-wrap').querySelector('.car').scrollBy({left:d*600,behavior:'smooth'});}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3200);}
window.addEventListener('scroll',()=>document.getElementById('totop').classList.toggle('show',scrollY>400));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePlayer();closeM();closeMenu();}});
 
switchPage('home');
