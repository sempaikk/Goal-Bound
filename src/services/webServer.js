/**
 * Public squad leaderboard (same process as Discord bot).
 *
 * GET /  /leaderboard  → HTML (top 100) — PT/EN via ?lang= or Accept-Language
 * GET /api/rank        → JSON
 * GET /health
 */

const http = require('http');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { getLeaderboard } = require('./leaderboardService.js');

let server = null;

const UI = {
  en: {
    htmlLang: 'en',
    num: 'en-US',
    title: 'Leaderboard · Goal Bound',
    ogTitle: 'Leaderboard · Goal Bound',
    ogDesc: 'Top 100 elevens · live squad power',
    metaDesc: 'Goal Bound — live top 100 squad leaderboard. Build your eleven. Climb.',
    brand: 'Leaderboard',
    searchPh: 'Find player…  /',
    jumpTitle: 'Jump to rank',
    share: 'Share',
    live: 'LIVE',
    ranked: 'Ranked',
    fullXi: 'Full XI',
    topScore: '#1 score',
    week: 'Week',
    climbers: 'Climbers of the week',
    empty: 'NO ELEVENS ON THE PITCH YET · /TEAM IN DISCORD',
    top100: 'Top 100',
    navHint: 'j / k navigate',
    colPlayer: 'Player',
    colScore: 'Score',
    colXi: 'XI',
    colAvg: 'Avg',
    colMaster: 'Master',
    colShape: 'Shape',
    noMatch: 'NO MATCH',
    you: 'YOU',
    footMain: 'GOAL BOUND · ranks live · auto-refresh 45s',
    footScore: 'Score = (level×8) + rarity + 250 full XI + 120 master + avg×2 · seat with /team',
    footKeys: 'Shortcuts: / search · Esc clear · j/k move · # jump · Share copies your link',
    justNow: 'JUST NOW',
    sAgo: 's AGO',
    mAgo: 'm AGO',
    hAgo: 'h AGO',
    rankNotFound: 'RANK NOT FOUND',
    linkCopied: 'LINK COPIED',
    copyBar: 'COPY FROM ADDRESS BAR',
    langEn: 'EN',
    langPt: 'PT'
  },
  pt: {
    htmlLang: 'pt-BR',
    num: 'pt-BR',
    title: 'Placar · Goal Bound',
    ogTitle: 'Placar · Goal Bound',
    ogDesc: 'Top 100 onzes · poder de time ao vivo',
    metaDesc: 'Goal Bound — placar ao vivo top 100. Monta o onze. Sobe.',
    brand: 'Placar',
    searchPh: 'Buscar jogador…  /',
    jumpTitle: 'Ir para posição',
    share: 'Compartilhar',
    live: 'AO VIVO',
    ranked: 'No ranking',
    fullXi: 'XI completo',
    topScore: 'Score #1',
    week: 'Semana',
    climbers: 'Subidas da semana',
    empty: 'NINGUÉM NO CAMPO AINDA · /TEAM NO DISCORD',
    top100: 'Top 100',
    navHint: 'j / k navegar',
    colPlayer: 'Jogador',
    colScore: 'Score',
    colXi: 'XI',
    colAvg: 'Média',
    colMaster: 'Master',
    colShape: 'Formação',
    noMatch: 'SEM RESULTADO',
    you: 'VOCÊ',
    footMain: 'GOAL BOUND · ranking ao vivo · atualiza a cada 45s',
    footScore: 'Score = (nível×8) + raridade + 250 XI completo + 120 master + média×2 · monta no /team',
    footKeys: 'Atalhos: / busca · Esc limpa · j/k move · # pula · Compartilhar copia o link',
    justNow: 'AGORA',
    sAgo: 's ATRÁS',
    mAgo: 'min ATRÁS',
    hAgo: 'h ATRÁS',
    rankNotFound: 'POSIÇÃO NÃO ACHADA',
    linkCopied: 'LINK COPIADO',
    copyBar: 'COPIE DA BARRA DE ENDEREÇO',
    langEn: 'EN',
    langPt: 'PT'
  }
};

function brandSub(lang, showing, total) {
  if (lang === 'pt') return `Goal Bound · top ${showing} de ${total}`;
  return `Goal Bound · top ${showing} of ${total}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveLang(url, req) {
  const q = (url.searchParams.get('lang') || '').toLowerCase();
  if (q === 'pt' || q === 'pt-br') return 'pt';
  if (q === 'en') return 'en';
  const accept = String(req.headers['accept-language'] || '').toLowerCase();
  if (accept.includes('pt')) return 'pt';
  return 'en';
}

function publicBaseUrl() {
  const fromEnv = process.env.PUBLIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (fromEnv) {
    const raw = String(fromEnv).trim();
    if (raw.startsWith('http')) return raw.replace(/\/$/, '');
    return `https://${raw.replace(/\/$/, '')}`;
  }
  return null;
}

function buildHtml(board, lang) {
  const L = UI[lang] || UI.en;
  const num = L.num;
  const updatedIso = board.updatedAt;
  const total = board.total;
  const showing = board.entries.length;
  const weekly = board.weekly || { weekKey: '', climbers: [] };
  const completeCount = board.entries.filter(e => e.isComplete).length;
  const topScore = board.entries[0] ? board.entries[0].score : 0;
  const byId = new Map(board.entries.map(e => [e.userId, e]));

  const climberCardsFixed = (weekly.climbers || [])
    .map(c => {
      const full = byId.get(c.userId);
      const av = (full && full.avatar) || 'https://cdn.discordapp.com/embed/avatars/0.png';
      return `<div class="climb-card" data-id="${escapeHtml(c.userId)}">
  <img class="av" src="${escapeHtml(av)}" alt="" width="28" height="28" loading="lazy">
  <div class="climb-body">
    <div class="climb-name">${escapeHtml(c.username)}</div>
    <div class="climb-meta">#${c.rank} · ${Number(c.score).toLocaleString(num)} SP</div>
  </div>
  <div class="climb-delta">+${Number(c.delta).toLocaleString(num)}</div>
</div>`;
    })
    .join('');

  const rows = board.entries
    .map(e => {
      const topCls = e.rank <= 3 ? ` top top-${e.rank}` : '';
      const ready = e.isComplete ? ' ready' : '';
      const master = e.coachShort ? escapeHtml(e.coachShort) : '—';
      const form = escapeHtml(e.formationLabel || '—');
      const av = escapeHtml(e.avatar || '');
      return `<tr class="row${topCls}${ready}" data-id="${escapeHtml(
        e.userId
      )}" data-name="${escapeHtml((e.username || '').toLowerCase())}" data-rank="${e.rank}" tabindex="-1">
  <td class="r">${e.rank}</td>
  <td class="n">
    <div class="player">
      <img class="av" src="${av}" alt="" width="28" height="28" loading="lazy">
      <span class="nm">${escapeHtml(e.username)}</span>
      ${e.isComplete ? '<span class="badge" title="Full eleven">XI</span>' : ''}
      <span class="you-tag" hidden>${L.you}</span>
    </div>
  </td>
  <td class="s">${Number(e.score).toLocaleString(num)}</td>
  <td class="m">${e.filled}/11</td>
  <td class="m">${e.avgLevel}</td>
  <td class="m">${master}</td>
  <td class="m form">${form}</td>
</tr>`;
    })
    .join('');

  const arenaCards = board.entries
    .map(e => {
      const av = escapeHtml(e.avatar || '');
      const master = e.coachShort ? escapeHtml(e.coachShort) : '—';
      return `<article class="arena-card${e.rank <= 3 ? ` top-${e.rank}` : ''}" data-id="${escapeHtml(
        e.userId
      )}" data-name="${escapeHtml((e.username || '').toLowerCase())}" data-rank="${e.rank}" tabindex="-1">
  <div class="arena-rank">${e.rank}</div>
  <img class="av" src="${av}" alt="" width="40" height="40" loading="lazy">
  <div class="arena-main">
    <div class="arena-name">${escapeHtml(e.username)} <span class="you-tag" hidden>${L.you}</span></div>
    <div class="arena-sub">${e.filled}/11 · Lv.${e.avgLevel} · ${master}${e.isComplete ? ' · XI' : ''}</div>
  </div>
  <div class="arena-score">${Number(e.score).toLocaleString(num)}<span>SP</span></div>
</article>`;
    })
    .join('');

  const sub = brandSub(lang, Math.min(100, showing), total);

  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="description" content="${escapeHtml(L.metaDesc)}">
<meta property="og:title" content="${escapeHtml(L.ogTitle)}">
<meta property="og:description" content="${escapeHtml(L.ogDesc)}">
<meta property="og:type" content="website">
<title>${escapeHtml(L.title)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
html,body{background:#000;color:#f2f2f2;font-family:ui-monospace,"SF Mono","Cascadia Code",Consolas,monospace;min-height:100%;-webkit-font-smoothing:antialiased}
body{padding:0 0 72px}
.wrap{max-width:920px;margin:0 auto;padding:24px 16px 0}
.topbar{position:sticky;top:0;z-index:40;background:rgba(0,0,0,.95);backdrop-filter:blur(14px);border-bottom:1px solid #1a1a1a;margin:0 -16px 20px;padding:12px 16px}
.topbar-inner{max-width:920px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;justify-content:space-between}
.brand h1{font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase}
.brand .sub{font-size:11px;color:#666;letter-spacing:.04em;margin-top:2px}
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.search,.jump{background:#0a0a0a;border:1px solid #2a2a2a;color:#fff;border-radius:6px;padding:8px 12px;font:inherit;font-size:12px;outline:none}
.search{min-width:min(180px,55vw)}
.jump{width:72px;text-align:center}
.search:focus,.jump:focus{border-color:#666}
.search::placeholder,.jump::placeholder{color:#555}
.btn{background:#111;border:1px solid #2a2a2a;color:#ccc;border-radius:6px;padding:8px 12px;font:inherit;font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:border-color .15s,color .15s;text-decoration:none;display:inline-block}
.btn:hover{border-color:#666;color:#fff}
.btn.active{border-color:#fff;color:#fff}
.stat{font-size:11px;color:#666;letter-spacing:.04em;white-space:nowrap}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
.pill{border:1px solid #1c1c1c;background:#080808;border-radius:999px;padding:6px 12px;font-size:11px;color:#888;letter-spacing:.04em}
.pill b{color:#eaeaea;font-weight:600}
.section-title{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#555;margin:4px 0 12px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.climbers{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-bottom:28px}
.climb-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #1c1c1c;border-radius:8px;background:#080808}
.climb-body{flex:1;min-width:0}
.climb-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.climb-meta{font-size:10px;color:#666;margin-top:2px}
.climb-delta{font-size:13px;font-weight:700;color:#fff}
.av{border-radius:50%;background:#111;flex-shrink:0;object-fit:cover}
table.desk{width:100%;border-collapse:collapse}
table.desk thead th{position:sticky;top:53px;z-index:10;background:#000;font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#555;text-align:left;padding:10px 10px;border-bottom:1px solid #222}
tbody tr{border-bottom:1px solid #141414;transition:background .12s}
tbody tr:hover,tbody tr:focus{background:#0c0c0c;outline:none}
tbody tr.top-1{background:linear-gradient(90deg,rgba(255,255,255,.07),transparent 55%)}
tbody tr.top-2{background:linear-gradient(90deg,rgba(255,255,255,.04),transparent 50%)}
tbody tr.top-3{background:linear-gradient(90deg,rgba(255,255,255,.02),transparent 45%)}
tbody tr.you,article.you{outline:1px solid #fff;outline-offset:-1px;background:rgba(255,255,255,.06)}
tbody tr.hidden,article.hidden{display:none!important}
td{padding:11px 10px;font-size:13px;vertical-align:middle}
.r{width:40px;color:#555;font-variant-numeric:tabular-nums}
tr.top-1 .r,tr.top-2 .r,tr.top-3 .r{color:#fff;font-weight:700}
.player{display:flex;align-items:center;gap:10px}
.nm{font-weight:500}
.badge{display:inline-block;margin-left:6px;font-size:9px;letter-spacing:.1em;border:1px solid #444;color:#aaa;padding:1px 5px;border-radius:3px}
.you-tag{display:inline-block;margin-left:6px;font-size:9px;letter-spacing:.12em;font-weight:700;border:1px solid #fff;color:#fff;padding:1px 6px;border-radius:3px}
.s{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.m{text-align:right;color:#666;font-size:12px;font-variant-numeric:tabular-nums}
th.s,th.m{text-align:right}
.arena{display:none;flex-direction:column;gap:8px}
.arena-card{display:flex;align-items:center;gap:12px;padding:14px 12px;border:1px solid #1a1a1a;border-radius:10px;background:#080808}
.arena-card.top-1{border-color:#333;background:linear-gradient(90deg,rgba(255,255,255,.08),#080808 50%)}
.arena-card.you{outline:1px solid #fff}
.arena-rank{width:36px;font-size:18px;font-weight:700;color:#555;font-variant-numeric:tabular-nums;text-align:center}
.arena-card.top-1 .arena-rank,.arena-card.top-2 .arena-rank,.arena-card.top-3 .arena-rank{color:#fff}
.arena-main{flex:1;min-width:0}
.arena-name{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.arena-sub{font-size:11px;color:#666;margin-top:3px}
.arena-score{font-size:16px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
.arena-score span{display:block;font-size:9px;color:#666;font-weight:500;letter-spacing:.08em}
.empty,.no-match{padding:64px 12px;text-align:center;color:#444;font-size:12px;letter-spacing:.08em}
.foot{margin-top:36px;padding-top:18px;border-top:1px solid #1a1a1a;color:#444;font-size:11px;line-height:1.75;letter-spacing:.04em}
.foot a{color:#888;text-decoration:none}
.foot a:hover{color:#fff}
.hint{color:#555}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(80px);background:#111;border:1px solid #333;color:#fff;padding:10px 16px;border-radius:8px;font-size:12px;letter-spacing:.06em;opacity:0;transition:opacity .2s,transform .2s;z-index:50;pointer-events:none}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media (max-width:720px){table.desk{display:none}.arena{display:flex}.form{display:none}.climbers{grid-template-columns:1fr}.search{min-width:100%}.tools{width:100%}}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <h1>${escapeHtml(L.brand)}</h1>
        <div class="sub">${escapeHtml(sub)}</div>
      </div>
      <div class="tools">
        <input class="search" id="q" type="search" placeholder="${escapeHtml(L.searchPh)}" autocomplete="off" spellcheck="false">
        <input class="jump" id="jump" type="number" min="1" max="100" placeholder="#" title="${escapeHtml(L.jumpTitle)}" inputmode="numeric">
        <button type="button" class="btn" id="share">${escapeHtml(L.share)}</button>
        <a class="btn" id="lang-en" href="#">${L.langEn}</a>
        <a class="btn" id="lang-pt" href="#">${L.langPt}</a>
        <span class="stat" id="clock">${escapeHtml(L.live)}</span>
      </div>
    </div>
  </div>
  <div class="pills">
    <span class="pill">${escapeHtml(L.ranked)} <b>${total}</b></span>
    <span class="pill">${escapeHtml(L.fullXi)} <b>${completeCount}</b></span>
    <span class="pill">${escapeHtml(L.topScore)} <b>${Number(topScore).toLocaleString(num)}</b></span>
    ${weekly.weekKey ? `<span class="pill">${escapeHtml(L.week)} <b>${escapeHtml(weekly.weekKey)}</b></span>` : ''}
  </div>
  ${climberCardsFixed ? `<div class="section-title"><span>${escapeHtml(L.climbers)}</span></div><div class="climbers">${climberCardsFixed}</div>` : ''}
  ${showing === 0 ? `<div class="empty">${escapeHtml(L.empty)}</div>` : `
  <div class="section-title"><span>${escapeHtml(L.top100)}</span><span class="hint">${escapeHtml(L.navHint)}</span></div>
  <table class="desk" id="board">
    <thead><tr>
      <th class="r">#</th><th>${escapeHtml(L.colPlayer)}</th><th class="s">${escapeHtml(L.colScore)}</th>
      <th class="m">${escapeHtml(L.colXi)}</th><th class="m">${escapeHtml(L.colAvg)}</th>
      <th class="m">${escapeHtml(L.colMaster)}</th><th class="m form">${escapeHtml(L.colShape)}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="arena" id="arena">${arenaCards}</div>
  <div class="no-match" id="nomatch" hidden>${escapeHtml(L.noMatch)}</div>`}
  <div class="foot">
    <div>${escapeHtml(L.footMain)} · <a href="/api/rank?limit=100">API</a></div>
    <div>${escapeHtml(L.footScore)}</div>
    <div class="hint">${escapeHtml(L.footKeys)}</div>
  </div>
</div>
<div class="toast" id="toast" role="status"></div>
<script>
(function(){
  var params = new URLSearchParams(location.search);
  var me = params.get('user') || '';
  var lang = ${JSON.stringify(lang)};
  var MSG = ${JSON.stringify({ justNow: L.justNow, sAgo: L.sAgo, mAgo: L.mAgo, hAgo: L.hAgo, live: L.live, rankNotFound: L.rankNotFound, linkCopied: L.linkCopied, copyBar: L.copyBar })};
  var q = document.getElementById('q');
  var jump = document.getElementById('jump');
  var share = document.getElementById('share');
  var nomatch = document.getElementById('nomatch');
  var clock = document.getElementById('clock');
  var toast = document.getElementById('toast');
  var updated = ${JSON.stringify(updatedIso)};
  var focusIdx = -1;
  function markLangBtns(){
    var en = document.getElementById('lang-en');
    var pt = document.getElementById('lang-pt');
    if(en) en.classList.toggle('active', lang === 'en');
    if(pt) pt.classList.toggle('active', lang === 'pt');
  }
  markLangBtns();
  function setLang(next){
    var u = new URL(location.href);
    u.searchParams.set('lang', next);
    location.href = u.pathname + u.search;
  }
  var le = document.getElementById('lang-en');
  var lp = document.getElementById('lang-pt');
  if(le) le.addEventListener('click', function(e){ e.preventDefault(); setLang('en'); });
  if(lp) lp.addEventListener('click', function(e){ e.preventDefault(); setLang('pt'); });
  function toastMsg(t){ if(!toast) return; toast.textContent = t; toast.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function(){ toast.classList.remove('show'); }, 1800); }
  function rel(iso){ try{ var s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime())/1000)); if(s < 5) return MSG.justNow; if(s < 60) return s + MSG.sAgo; if(s < 3600) return Math.floor(s/60) + MSG.mAgo; return Math.floor(s/3600) + MSG.hAgo; }catch(e){ return MSG.live; } }
  function tickClock(){ if(clock) clock.textContent = rel(updated); }
  tickClock(); setInterval(tickClock, 5000);
  function visibleRows(){ var desk = window.matchMedia('(max-width:720px)').matches; var sel = desk ? '#arena article:not(.hidden)' : '#board tbody tr:not(.hidden)'; return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function markYou(){ if(!me) return; document.querySelectorAll('[data-id]').forEach(function(el){ if(el.getAttribute('data-id') === me){ el.classList.add('you'); el.querySelectorAll('.you-tag').forEach(function(t){ t.hidden = false; }); } }); var target = document.querySelector('tr.you, article.you'); if(target) setTimeout(function(){ target.scrollIntoView({ behavior:'smooth', block:'center' }); }, 180); }
  markYou();
  function filter(){ if(!q) return; var v = (q.value || '').trim().toLowerCase(); var nodes = document.querySelectorAll('#board tbody tr, #arena article'); var visible = 0; nodes.forEach(function(el){ var name = el.getAttribute('data-name') || ''; var ok = !v || name.indexOf(v) !== -1; el.classList.toggle('hidden', !ok); if(ok) visible++; }); if(nomatch) nomatch.hidden = visible > 0 || nodes.length === 0; try{ var u = new URL(location.href); if(v) u.searchParams.set('q', v); else u.searchParams.delete('q'); history.replaceState(null, '', u.pathname + u.search); }catch(e){} }
  if(params.get('q') && q){ q.value = params.get('q'); filter(); }
  if(q) q.addEventListener('input', filter);
  function jumpTo(rank){ var n = parseInt(rank, 10); if(!n || n < 1) return; var el = document.querySelector('[data-rank="'+n+'"]'); if(!el || el.classList.contains('hidden')){ toastMsg(MSG.rankNotFound); return; } el.scrollIntoView({ behavior:'smooth', block:'center' }); el.focus && el.focus(); toastMsg('#'+n); }
  if(jump) jump.addEventListener('keydown', function(e){ if(e.key === 'Enter') jumpTo(jump.value); });
  if(share) share.addEventListener('click', function(){ var u = location.href; if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(u).then(function(){ toastMsg(MSG.linkCopied); }).catch(function(){ toastMsg(u); }); } else toastMsg(MSG.copyBar); });
  document.addEventListener('keydown', function(e){ var tag = (e.target && e.target.tagName) || ''; var typing = tag === 'INPUT' || tag === 'TEXTAREA'; if(e.key === '/' && !typing){ e.preventDefault(); if(q) q.focus(); return; } if(e.key === 'Escape'){ if(q && document.activeElement === q){ q.value=''; filter(); q.blur(); } return; } if(typing) return; if(e.key === 'j' || e.key === 'k'){ e.preventDefault(); var list = visibleRows(); if(!list.length) return; if(focusIdx < 0){ var you = list.findIndex(function(el){ return el.classList.contains('you'); }); focusIdx = you >= 0 ? you : 0; } else { focusIdx = e.key === 'j' ? Math.min(list.length - 1, focusIdx + 1) : Math.max(0, focusIdx - 1); } var el = list[focusIdx]; if(el){ el.scrollIntoView({ behavior:'smooth', block:'nearest' }); el.focus && el.focus(); } } });
  setTimeout(function(){ location.reload(); }, 45000);
})();
</script>
</body>
</html>`;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=10',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=10'
  });
  res.end(html);
}

function handle(req, res) {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathName = url.pathname.replace(/\/$/, '') || '/';

    if (req.method === 'GET' && (pathName === '/' || pathName === '/leaderboard')) {
      const limit = Math.min(
        100,
        Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100)
      );
      const board = getLeaderboard({ limit, minFilled: 1 });
      const lang = resolveLang(url, req);
      return sendHtml(res, 200, buildHtml(board, lang));
    }

    if (req.method === 'GET' && pathName === '/api/rank') {
      const limit = Math.min(
        100,
        Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100)
      );
      const board = getLeaderboard({ limit, minFilled: 1 });
      return sendJson(res, 200, board);
    }

    if (req.method === 'GET' && pathName === '/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'goal-bound',
        version: config.VERSION
      });
    }

    sendJson(res, 404, {
      error: 'not_found',
      paths: ['/leaderboard', '/api/rank', '/health']
    });
  } catch (err) {
    logger.error('webServer request failed', err?.message || String(err));
    sendJson(res, 500, { error: 'internal' });
  }
}

function getInfo() {
  const port = Number(process.env.PORT) || Number(process.env.WEB_PORT) || 3080;
  const pub = publicBaseUrl();
  return {
    port,
    url: pub ? `${pub}/leaderboard` : null,
    apiUrl: pub ? `${pub}/api/rank` : null
  };
}

function startWebServer() {
  if (server) return getInfo();

  const port = Number(process.env.PORT) || Number(process.env.WEB_PORT) || 3080;
  server = http.createServer(handle);

  server.listen(port, '0.0.0.0', () => {
    const pub = publicBaseUrl();
    logger.success(
      `Leaderboard web up on :${port}` +
        (pub ? ` · public ${pub}/leaderboard` : ' · set PUBLIC_URL for shareable link')
    );
  });

  server.on('error', err => {
    logger.error('webServer listen error', err.message);
  });

  return getInfo();
}

function stopWebServer() {
  if (!server) return;
  try {
    server.close();
  } catch {
    /* ignore */
  }
  server = null;
}

module.exports = { startWebServer, stopWebServer, getInfo, publicBaseUrl };
