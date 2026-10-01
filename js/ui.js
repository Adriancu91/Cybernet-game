'use strict';
/* ============================================================
   UI — renders state (never mutates it directly; all changes go
   through act* functions). Panels re-render only when their HTML
   changes; countdowns tick in place.
   ============================================================ */

const UI = {
  view: 'left', centerTab: 'arena', rightTab: 'cards', marketTab: 'browse', lbKind: 'rating',
  standSel: undefined, inputs: {}, nftFilter: { type: 'all', rarity: 'all', plus: 'all', sort: 'rarity' },
  mkFilter: { type: 'all', rarity: 'all', sort: 'deal' }, chartType: 'core', aiBusy: false,
  selectMode: false, selected: [], logFilter: { TRADE: true, GUILD: true, SERVER: true, ARENA: true, SYSTEM: true },
  petState: 'idle', petTimer: null, lastHtml: {}, critDismissed: false, speed: 1, lastResult: null,
  confirmCb: null, debug: false, lastAnswerFlash: {},
};
const PET_COLORS = {
  theme_classic: ['#39ff88', '#00e5ff'], theme_matrix: ['#3dff5a', '#a6ff00'], theme_blue: ['#00b3ff', '#7df9ff'],
  theme_amber: ['#ffb000', '#ffd166'], theme_pink: ['#ff4fd8', '#7b61ff'], theme_ice: ['#bfefff', '#6fd3ff'], theme_blood: ['#ff3b5c', '#ff8a3b'],
};
const $ = sel => document.querySelector(sel);
const ic = (n, s) => Art.icon(n, s);
const GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2"/></svg>';

// ---------- small builders ----------
function btn(label, act, args, reason, cls) {
  const a = args !== undefined ? ` data-args="${esc(JSON.stringify(args))}"` : '';
  const r = reason ? ` data-reason="${esc(reason)}" title="${esc(reason)}" aria-disabled="true"` : '';
  return `<button type="button" class="btn ${cls || ''} ${reason ? 'is-disabled' : ''}" data-act="${act}"${a}${r}>${label}</button>`;
}
function cd(endGameMs, prefix) { return `<span data-cd="${Math.round(endGameMs)}" data-cdp="${esc(prefix || '')}">${esc(prefix || '')}${fmtTime(endGameMs - S.time)}</span>`; }
function leagueName(i) { return CONFIG.LEAGUES[i].name; }
function rarityName(r) { return CONFIG.CARDS.rarities[r].name; }
function rarityColor(r) { return r === CONFIG.CARDS.UNIQUE ? '#ffe14d' : CONFIG.CARDS.rarities[r].color; }
function gameClock(t) {
  const d = Math.floor(t / CONFIG.DAY) + 1, h = Math.floor((t % CONFIG.DAY) / CONFIG.HOUR), m = Math.floor((t % CONFIG.HOUR) / 60000);
  return `D${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function affixText(a) { return statText(a); }
function cardCostText(k) { return `${fmt(k.cr)} CR · ${k.shards} shards`; }

// ---------- toasts ----------
function toast(msg, kind) {
  if (!msg) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 3200 : 2400);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

// ---------- modal ----------
function openModal(html, wide) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-box ${wide ? 'wide' : ''}">${html}</div>`;
  m.classList.add('on');
  UI.modalOpen = true;
}
function closeModal() { $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; UI.modalOpen = false; UI.confirmCb = null; UI.modalKind = null; }
function modalHead(title) { return `<div class="modal-head"><h2>${title}</h2><button class="iconbtn" data-act="closeModal" aria-label="Close">✕</button></div>`; }
function confirmBox(title, body, yesLabel, cb, danger) {
  UI.confirmCb = cb;
  openModal(modalHead(title) + `<div>${body}</div><div class="row" style="margin-top:14px;justify-content:flex-end">${btn('Cancel', 'closeModal')}${btn(yesLabel || 'Confirm', 'confirmYes', undefined, '', danger ? 'danger' : 'primary')}</div>`);
}

// ---------- pet state animation ----------
function setPetState(state, ms) {
  UI.petState = state;
  const el = $('#petstage');
  if (el) el.className = 'pet-stage ' + state;
  clearTimeout(UI.petTimer);
  if (ms) UI.petTimer = setTimeout(() => setPetState(arenaBusy() ? 'thinking' : 'idle'), ms);
}

// ============================================================
// TOP BAR
// ============================================================
function htmlTop() {
  const p = S.player, sv = S.server, used = usedSpace(), ratio = used / sv.total, L = CONFIG.LEAGUES[p.league];
  const crit = sv.state === 'CRITICAL';
  return `<div class="logo" data-act="logoTap">CYBER<span>NET</span><small>AI ACADEMY</small></div>
  <div class="netbar">
    <span class="dim">GLOBAL NET</span>
    <div class="meter" title="Used ${fmt(used)} / ${fmt(sv.total)} SU"><i class="${ratio > 0.45 ? 'hot' : ''}" style="width:${(ratio * 100).toFixed(1)}%"></i><span class="mark" style="left:${CONFIG.SERVER.criticalRatio * 100}%"></span></div>
    <span>${fmt(used)}/${fmt(sv.total)} SU</span>
    <span class="dim">free <b class="${ratio > 0.45 ? 'warn' : 'good'}">${fmtPct((1 - ratio) * 100)}</b></span>
    <span class="dim">land <b class="cr">${landPrice()}</b> CR/SU</span>
    <span class="dim">exp <b>${sv.expansions}</b></span>
    <span class="state ${crit ? 'crit blink' : 'ok'}">${crit ? 'CRITICAL' : 'NORMAL'}</span>
  </div>
  <div class="wallet">
    <span class="pill cr" title="Credits">${ic('cr')}<b>${fmt(p.cr)}</b></span>
    <span class="pill dtc" title="Data Tokens">${ic('dt')}<b>${p.dt}</b><span class="dim tiny">/${CONFIG.DT.stockCap}</span></span>
    <span class="pill landc" title="Your land: free / owned">${ic('land')}<b>${fmt(landFree())}</b><span class="dim tiny">/${fmt(p.land)}</span></span>
    <span class="pill shardc" title="Shards">${ic('shard')}<b>${fmt(p.shards)}</b></span>
    <span class="pill league-pill" style="color:${L.color};border-color:${L.color}" title="League & rating">${ic('rating')}${L.name} <span class="dim">${p.rating}</span></span>
    <button class="iconbtn" data-act="openSettings" aria-label="Settings">${GEAR}</button>
  </div>`;
}
function htmlCritical() {
  const sv = S.server;
  if (sv.state !== 'CRITICAL' || UI.critDismissed) return '';
  return `<span class="dot blink"></span><span>SERVER CAPACITY CRITICAL — heavy infrastructure frozen ${cd(sv.freezeUntil)} — global space will expand +50%</span><button class="iconbtn right" style="width:30px;height:30px" data-act="dismissCrit" aria-label="Dismiss">✕</button>`;
}

// ============================================================
// LEFT — AI Training Bay
// ============================================================
function htmlLeft() {
  const p = S.player, lv = petLevelInfo(), cap = softCap(), b = bonuses();
  const colors = PET_COLORS[p.cosmetics.theme] || PET_COLORS.theme_classic;
  if (UI.standSel === undefined || (UI.standSel && !S.stands.find(s => s.id === UI.standSel))) UI.standSel = bestStandId();
  const sel = UI.standSel;
  const stat = (key, label, icon, value, show, extra) => {
    const r1 = whyTrain(1), r10 = whyTrain(10);
    const gain = trainGain(key, sel);
    return `<div class="stat"><div class="name">${ic(icon)} ${label}<span class="val">${show}</span></div>${extra}
      <div class="row between small"><span class="dim">+${gain.toFixed(gain < 10 ? 2 : 1)} per DT</span>
      <span class="row">${btn('Train ×1', 'train', { stat: key, n: 1 }, r1, 'sm')}${btn('×10', 'train', { stat: key, n: 10 }, r10, 'sm accent')}</span></div></div>`;
  };
  const capBar = v => `<div class="capbar" title="Soft cap ${fmt(cap)}: training slows as you pass it"><i class="${v > cap ? 'over' : ''}" style="width:${Math.min(100, v / cap * 100).toFixed(1)}%"></i></div>`;
  const msBase = petBaseMs(), ms = petMs();
  const speedBar = `<div class="capbar" title="Floor ${CONFIG.PET.speedFloorMs} ms"><i style="width:${(100 - (ms - CONFIG.PET.speedFloorMs) / (CONFIG.PET.speedStartMs - CONFIG.PET.speedFloorMs) * 100).toFixed(1)}%"></i></div>`;
  const chips = [`<button class="chip ${!sel ? 'on' : ''}" data-act="standSel" data-args='""'>No stand x1</button>`]
    .concat(S.stands.map((s, i) => `<button class="chip ${sel === s.id ? 'on' : ''}" data-act="standSel" data-args="${esc(JSON.stringify(s.id))}">Stand ${i + 1} x${S.econ.offline ? '1 (offline)' : CONFIG.STAND_TIERS[s.tier].mult}</button>`)).join('');
  const dtBuy = [1, 10, 50].map(n => btn(`+${n} <span class="cost">${fmt(dtPriceFor(n))} CR</span>`, 'buyDT', n, whyBuyDT(n), 'sm')).join('');
  const nextDT = p.dt >= CONFIG.DT.stockCap ? '<span class="warn">stock full</span>' : `+1 in ${cd(S.time + (CONFIG.DT.trickleEveryMs - p.dtAcc) / (1 + b.eff.dt / 100 + guildPerk() / 100))}`;
  const stands = S.stands.map((s, i) => {
    const T = CONFIG.STAND_TIERS[s.tier], nx = CONFIG.STAND_TIERS[s.tier + 1];
    const up = nx ? btn(`Upgrade x${nx.mult} <span class="cost">${fmt(nx.cost)} CR · ${nx.land} SU</span>`, 'upgradeStand', s.id, whyUpgradeStand(s.id), 'sm') : '<span class="good small">MAX TIER</span>';
    return `<div class="stand ${S.econ.offline ? 'offline' : ''}"><div class="mult">x${T.mult}</div>
      <div class="small"><b>Stand ${i + 1}</b> <span class="dim">· ${T.land} SU · ${T.upkeep} CR/h</span>${S.econ.offline ? '<div class="bad tiny">OFFLINE - unpaid upkeep</div>' : ''}</div>
      <button class="btn sm danger" data-act="demolishStand" data-args="${esc(JSON.stringify(s.id))}" title="Demolish (50% refund)">✕</button>
      <div style="grid-column:1/-1" class="row">${up}</div></div>`;
  }).join('');
  const t0 = CONFIG.STAND_TIERS[0];
  const upk = upkeepPerHour(), inc = S.econ.lastHour.minted;
  return `<h2>${ic('pet')} AI Training Bay</h2>
  <div id="petstage" class="pet-stage ${UI.petState}">${Art.pet(lv.level, colors)}</div>
  <div class="row between"><button class="btn sm" data-act="rename" title="Rename">${esc(p.name)} ${p.cosmetics.badge !== 'badge_none' ? Art.badge(p.cosmetics.badge, 16) : ''}</button><span class="dim small">Pet Level <b class="good">${lv.level}</b>${p.legacy ? ` · Legacy ${p.legacy}` : ''}</span></div>
  <div class="xp" title="Progress to next level" style="margin:6px 0 4px"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div>
  <div class="tiny dim">Soft cap in ${leagueName(p.league)}: <b>${fmt(cap)}</b> — reach higher leagues to raise it.</div>
  ${stat('math', 'Math IQ', 'math', p.math, fmt(p.math), capBar(p.math))}
  ${stat('trivia', 'Trivia DB', 'trivia', p.trivia, fmt(p.trivia), capBar(p.trivia))}
  ${stat('speed', 'Processing', 'speed', p.speedPoints, `${ms} ms`, speedBar + `<div class="tiny dim">base ${Math.round(msBase)} ms · floor ${CONFIG.PET.speedFloorMs} ms${b.eff.speed > 0 ? ` · cards −${b.eff.speed.toFixed(1)}%` : ''}</div>`)}
  <h4 style="margin-top:10px">Train on</h4><div class="row">${chips}</div>
  <div class="sep"></div>
  <div class="row between"><span>${ic('dt')} <b class="dtc">${p.dt}</b><span class="dim">/${CONFIG.DT.stockCap} DT</span></span><span class="small dim">${nextDT}</span></div>
  <div class="row" style="margin-top:6px"><span class="small dim">Buy DT:</span>${dtBuy}</div>
  <div class="tiny mute">Price rises 1% per DT bought in the last 24 h (${dtRecentBought()} bought).</div>
  <div class="sep"></div>
  <h3>${ic('land')} Training Stands (${S.stands.length}/${CONFIG.MAX_STANDS})</h3>
  ${stands || '<div class="empty">No stands yet. A stand multiplies training per DT.</div>'}
  ${S.stands.length < CONFIG.MAX_STANDS ? btn(`Build stand x2 <span class="cost">${fmt(t0.cost)} CR · ${t0.land} SU land</span>`, 'buildStand', undefined, whyBuildStand(), 'block primary') : ''}
  <div class="sep"></div>
  <h3>Economy</h3>
  <div class="kv"><span>Income (last hour)</span><b class="cr">${fmt(inc)} CR</b><span>Upkeep</span><b class="${upk ? 'bad' : ''}">−${fmt(upk)} CR/h</b>
  <span>CR minted / burned (last h)</span><b>${fmt(S.econ.lastHour.minted)} / ${fmt(S.econ.lastHour.burned)}</b></div>
  ${S.econ.offline ? `<div class="bad small" style="margin-top:6px">${ic('alert')} Structures OFFLINE — debt ${fmt(S.econ.debt)} CR is paid automatically from your next income.</div>` : ''}
  ${upk > 0 && p.cr < upk * 2 ? `<div class="warn small" style="margin-top:6px">${ic('alert')} Low CR: less than 2 hours of upkeep left.</div>` : ''}`;
}

// ============================================================
// CENTER — tabs
// ============================================================
function htmlCenter() {
  const tabs = [['arena', 'Arena', 'arena'], ['ai', 'AI Lab', 'ai'], ['market', 'Market', 'market'], ['land', 'Land', 'land'], ['season', 'Season', 'season']];
  const unclaimed = S.missions.list.filter(m => m.progress >= m.target && !m.claimed).length;
  const t = tabs.map(([id, label, icn]) => `<button class="tab ${UI.centerTab === id ? 'on' : ''}" data-act="centerTab" data-args='"${id}"'>${ic(icn)} ${label}${id === 'season' && unclaimed ? ` <span class="badge-n">${unclaimed}</span>` : ''}${id === 'arena' && arenaBusy() ? ' <span class="dot blink" style="width:7px;height:7px"></span>' : ''}${id === 'ai' && S.ai.energy > 0 ? ` <span class="badge-n">${S.ai.energy}</span>` : ''}</button>`).join('');
  let body = '';
  if (UI.centerTab === 'arena') body = htmlArena();
  else if (UI.centerTab === 'ai') body = htmlAILab();
  else if (UI.centerTab === 'market') body = htmlMarket();
  else if (UI.centerTab === 'land') body = htmlLand();
  else body = htmlSeason();
  return `<div class="tabs">${t}</div>${body}`;
}

// ---------- arena ----------
function htmlArena() {
  const m = ARENA;
  if (m && m.phase !== 'done') return htmlMatch(m);
  if (m && m.phase === 'done' && !UI.resultSeen) return htmlResult(m);
  const p = S.player, L = CONFIG.LEAGUES[p.league], nx = CONFIG.LEAGUES[p.league + 1];
  const prog = nx ? clamp((p.rating - L.min) / (nx.min - L.min), 0, 1) : 1;
  const ev = currentEvent();
  const stam = Array.from({ length: CONFIG.SOLO.staminaMax }, (_, i) => `<i class="${i < p.stamina ? 'on' : ''}"></i>`).join('');
  const regen = p.stamina < CONFIG.SOLO.staminaMax ? `+1 in ${cd(S.time + CONFIG.SOLO.staminaRegenMs - p.staminaAcc)}` : 'full';
  const pool = (n) => L.fee * n + L.house;
  return `<div class="card league-card"><div class="league-emblem" style="color:${L.color};border-color:${L.color}">${L.name[0]}</div>
    <div class="grow"><div class="row between"><b style="color:${L.color}">${L.name.toUpperCase()} LEAGUE</b><span>Rating <b>${p.rating}</b></span></div>
    ${nx ? `<div class="xp" style="margin:6px 0"><i style="width:${(prog * 100).toFixed(0)}%"></i></div><div class="tiny dim">${nx.min - p.rating > 0 ? nx.min - p.rating : 0} rating to ${nx.name} · questions difficulty ${L.diff[0]}-${L.diff[1]} · ${L.roundMs / 1000}s rounds</div>` : '<div class="tiny good">Top league reached — Neural Rebirth available in Season tab.</div>'}</div></div>
  <div class="card" style="margin-top:10px"><div class="row between"><b class="warn">EVENT: ${ev.name}</b><span class="tiny dim">ends in ${cd(S.time + ev.endsIn)}</span></div><div class="small dim">${ev.desc}${ev.id === 'double_drops' ? ' — featured: ' + ev.featured.name : ''}</div></div>
  <div class="cards" style="margin-top:10px">
    <div class="card"><h3>Solo Arena</h3><div class="small dim">Your AI alone vs the clock. ${CONFIG.SOLO.rounds} rounds, ${CONFIG.SOLO.lives} lives. Wrong or timeout = −1 life.</div>
      <div class="kv" style="margin:8px 0"><span>Win reward</span><b class="cr">${fmt(CONFIG.SOLO.winCR * L.reward * crMultiplier())} CR + ${CONFIG.SOLO.winDT} DT</b><span>Fail</span><b>${CONFIG.SOLO.failCRPerCorrect} CR / correct</b><span>Perfect 10/10</span><b>${Math.round(dropChance(CONFIG.SOLO.cardDropPerfect) * 100)}% card drop</b><span>AI Lab</span><b>+${CONFIG.AI_LAB.winEnergySolo} energy per win</b><span>Stamina</span><span class="stamina">${stam} <span class="tiny dim">${regen}</span></span></div>
      ${btn('Start Solo', 'startSolo', undefined, whySolo(), 'block primary big')}</div>
    <div class="card"><h3>Multiplayer Arena</h3><div class="small dim">${CONFIG.MULTI.minBots + 1}-${CONFIG.MULTI.maxBots + 1} players near your rating. Points split by score (accuracy + speed). ${CONFIG.MULTI.overrides} Human Overrides.</div>
      <div class="kv" style="margin:8px 0"><span>Entry fee</span><b class="cr">${fmt(L.fee)} CR</b><span>Prize pool</span><b class="cr">${fmt(pool(CONFIG.MULTI.minBots + 1))}–${fmt(pool(CONFIG.MULTI.maxBots + 1))} CR</b><span>Card drop 1st/2nd/3rd</span><b>${CONFIG.MULTI.drop.map(d => Math.round(dropChance(d) * 100) + '%').join(' / ')}</b><span>AI Lab</span><b>+${CONFIG.AI_LAB.winEnergyMulti} energy for top 3</b></div>
      ${btn('Find Match', 'startMulti', undefined, whyMulti(), 'block primary big')}</div>
  </div>
  ${UI.lastResult ? `<div class="card" style="margin-top:10px"><h4>Last match</h4><div class="small">${UI.lastResult}</div></div>` : ''}
  <div class="card" style="margin-top:10px"><h4>Random loot</h4><div class="small dim">Every correct answer has a ${Math.round(CONFIG.LOOT.perCorrect * 100)}% chance to find a <b class="warn">Data Cache</b> (DT, CR or shards). After each match: ${Math.round(CONFIG.LOOT.crateSolo * 100)}% (Solo) / ${Math.round(CONFIG.LOOT.crateMulti * 100)}% (Multiplayer) chance of a <b class="warn">Loot crate</b>, +${Math.round(CONFIG.LOOT.crateWinBonus * 100)}% if you win or finish top 3 — it can hold DT, CR, shards, stamina or a card.</div></div>
  <div class="tiny mute" style="margin-top:10px">Tip: in a match, press HUMAN OVERRIDE before your AI answers to answer yourself — fast and correct gives max points, wrong gives zero.</div>`;
}
function htmlMatch(m) {
  const me = m.parts[0], now = performance.now();
  const L = CONFIG.LEAGUES[m.league];
  const head = `<div class="row between"><b>${m.type === 'solo' ? 'SOLO ARENA' : 'MULTIPLAYER'} · ${L.name}</b><span>Round <b>${Math.max(1, m.round)}</b>/${m.rounds}</span></div>
    <div class="row between small" style="margin-top:4px">${m.type === 'solo' ? `<span class="lives">${'♥'.repeat(Math.max(0, m.lives))}<span class="mute">${'♥'.repeat(CONFIG.SOLO.lives - Math.max(0, m.lives))}</span></span><span>Correct <b>${me.correct}</b></span>` : `<span class="cr">Pool ${fmt(m.pool)} CR</span><span>${m.parts.length} players</span>`}</div>`;
  if (m.phase === 'intro') return head + `<div class="qbox center"><div class="dim">Connecting to arena...</div><div class="qtext">GET READY</div></div>`;
  const q = m.q, reveal = m.phase === 'reveal';
  const live = m.override && !me.answered && m.phase === 'question';
  const opts = q.options.map(o => {
    let cls = 'opt';
    if (live) cls += ' live';
    if (reveal && o === q.answer) cls += ' right';
    if ((reveal || me.answered) && me.last && me.last.choice === o && o !== q.answer) cls += ' wrongpick';
    return live ? `<button class="${cls}" data-act="humanAnswer" data-args="${esc(JSON.stringify(o))}">${esc(o)}</button>` : `<div class="${cls}">${esc(o)}</div>`;
  }).join('');
  const ovReason = canOverride(m, now);
  const ov = `<button class="btn override-btn ${ovReason ? 'is-disabled' : ''}" data-act="override" ${ovReason ? `data-reason="${esc(ovReason)}" title="${esc(ovReason)}"` : ''}>HUMAN OVERRIDE ${m.overridesLeft}/${CONFIG.MULTI.overrides}</button>`;
  let myStatus;
  if (m.override && !me.answered) myStatus = '<b style="color:var(--c)">HUMAN CONTROL — pick an answer before the timer ends!</b>';
  else if (!me.answered) myStatus = '<span class="dim">Your AI is thinking...</span>';
  else myStatus = me.last.correct ? `<span class="good">✓ ${me.last.human ? 'You' : 'Your AI'} answered correctly in ${(me.last.t / 1000).toFixed(2)}s${m.type === 'multi' ? ` (+${me.last.pts})` : ''}</span>` : `<span class="bad">✗ ${me.last.timeout ? 'Timeout' : 'Wrong answer'}${me.last.human ? ' (you)' : ''}</span>`;
  const parts = m.parts.slice().sort((a, b) => (m.type === 'multi' ? b.score - a.score : 0));
  const rows = parts.map((p, i) => {
    let st = '<span class="dim">thinking…</span>';
    if (p.isPlayer && m.override && !p.answered) st = '<span style="color:var(--c)">HUMAN</span>';
    if (p.answered) st = p.last.correct ? `<span class="good">✓ ${(p.last.t / 1000).toFixed(1)}s</span>` : `<span class="bad">✗ ${p.last.timeout ? 'timeout' : (p.last.t / 1000).toFixed(1) + 's'}</span>`;
    const fl = p.answered && UI.lastAnswerFlash[p.id + ':' + m.round] && now - UI.lastAnswerFlash[p.id + ':' + m.round] < 600 ? (p.last.correct ? 'flash-ok' : 'flash-bad') : '';
    return `<div class="part ${p.isPlayer ? 'me' : ''} ${fl}"><span class="dim">${m.type === 'multi' ? i + 1 : ''}</span><span>${esc(p.name)} ${p.tag ? `<span class="gtag tiny">[${esc(p.tag)}]</span>` : ''}</span><span class="st">${st}</span><b>${m.type === 'multi' ? fmt(p.score) : p.correct + '/' + m.round}</b></div>`;
  }).join('');
  return head + `<div class="qbox"><div class="row between tiny dim"><span>${q.kind === 'math' ? 'MATH' : 'TRIVIA · ' + esc(q.cat).toUpperCase()}</span><span>Difficulty ${q.diff}/10</span></div>
    <div class="qtext">${esc(q.text)}</div><div class="opts">${opts}</div>
    <div class="timer" style="margin-top:12px"><i id="tbar"></i></div></div>
    <div class="row between">${myStatus}${ov}</div>
    ${m.lastLoot && m.lastLoot.round === m.round ? `<div class="loot-pop">◆ DATA CACHE FOUND: ${esc(m.lastLoot.text)}</div>` : ''}
    <h4 style="margin-top:12px">${m.type === 'multi' ? 'Live standings' : 'Run'}</h4><div class="parts">${rows}</div>`;
}
function htmlResult(m) {
  const r = m.result || {};
  let big, lines = [];
  if (m.type === 'solo') {
    big = r.win ? '<span class="good">RUN COMPLETE</span>' : '<span class="bad">RUN FAILED</span>';
    lines.push(`${r.correct}/${r.rounds} correct`);
  } else {
    big = r.place === 1 ? '<span class="good">#1 VICTORY</span>' : `#${r.place} <span class="dim small">of ${r.of}</span>`;
    lines.push(`Rating ${r.ratingDelta >= 0 ? '<span class="good">+' + r.ratingDelta : '<span class="bad">' + r.ratingDelta}</span> → ${S.player.rating} (${leagueName(S.player.league)})`);
    if (r.refund) lines.push(`Entry fee refunded: ${fmt(r.refund)} CR`);
  }
  lines.push(`<span class="cr">+${fmt(r.cr)} CR</span>${r.bonus ? ` <span class="dim">(incl. +${fmt(r.bonus)} bonus)</span>` : ''}${r.dt ? ` · <span class="dtc">+${r.dt} DT</span>` : ''}`);
  if (r.loot && r.loot.length) lines.push(`<b class="warn">LOOT:</b> ${r.loot.map(l => `<span class="good">${esc(l.text)}</span> <span class="tiny dim">(${esc(l.source)})</span>`).join(' · ')}`);
  if (r.tax) lines.push(`<span class="gvc">Guild vault +${fmt(r.tax)} GV</span> <span class="dim">(bonus, not taken from you)</span>`);
  if (r.energy) lines.push(`<span class="dtc">+${r.energy} AI Lab energy</span> <span class="dim">— teach your AI in the AI Lab tab</span>`);
  const standings = m.type === 'multi' ? m.parts.slice().sort((a, b) => b.score - a.score).map((p, i) => `<div class="part ${p.isPlayer ? 'me' : ''}"><span class="dim">${i + 1}</span><span>${esc(p.name)}</span><span class="st">${p.correct}/${m.rounds}</span><b>${fmt(p.score)}</b></div>`).join('') : '';
  return `<div class="card center" style="padding:20px"><div class="result-big">${big}</div>${lines.map(l => `<div style="margin-top:6px">${l}</div>`).join('')}
    ${r.card ? `<div style="margin:14px auto 0;max-width:180px">${nftCard(r.card)}</div><div class="good small">CARD DROP!</div>` : ''}
    ${(r.loot || []).filter(l => l.card).map(l => `<div style="margin:14px auto 0;max-width:180px">${nftCard(l.card)}</div><div class="good small">LOOT CARD!</div>`).join('')}
    <div class="row" style="justify-content:center;margin-top:16px">${btn('Back to Arena', 'resultOk', undefined, '', 'primary big')}</div></div>
    ${standings ? `<h4 style="margin-top:12px">Final standings</h4><div class="parts">${standings}</div>` : ''}`;
}

// ---------- market ----------
function htmlMarket() {
  const sub = [['browse', 'Browse'], ['mine', 'My listings'], ['stand', 'My stand'], ['prices', 'Prices']];
  const subtabs = `<div class="row" style="margin-bottom:10px">${sub.map(([id, l]) => `<button class="chip ${UI.marketTab === id ? 'on' : ''}" data-act="marketTab" data-args='"${id}"'>${l}${id === 'mine' ? ` (${playerListings().length})` : ''}</button>`).join('')}</div>`;
  let body = '';
  if (UI.marketTab === 'browse') {
    const f = UI.mkFilter;
    let ls = S.market.listings.filter(l => l.seller !== 'player');
    if (f.type !== 'all') ls = ls.filter(l => l.card.type === f.type);
    if (f.rarity !== 'all') ls = ls.filter(l => l.card.rarity === Number(f.rarity));
    const deal = l => l.price / fairValue(l.card);
    if (f.sort === 'deal') ls.sort((a, b) => deal(a) - deal(b));
    else if (f.sort === 'asc') ls.sort((a, b) => a.price - b.price);
    else if (f.sort === 'desc') ls.sort((a, b) => b.price - a.price);
    else ls.sort((a, b) => b.card.rarity - a.card.rarity || b.card.plus - a.card.plus);
    body = `<div class="row small" style="margin-bottom:8px">
      <select data-filter="mk.type"><option value="all">All types</option>${CONFIG.CARDS.types.map(t => `<option value="${t.id}" ${f.type === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
      <select data-filter="mk.rarity"><option value="all">All rarities</option>${CONFIG.CARDS.rarities.slice(0, CONFIG.CARDS.UNIQUE).map((r, i) => `<option value="${i}" ${String(f.rarity) === String(i) ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
      <select data-filter="mk.sort">${[['deal', 'Best deal'], ['asc', 'Price ↑'], ['desc', 'Price ↓'], ['rarity', 'Rarity']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="tiny dim" style="margin-bottom:6px">${ls.length} listings · server fee ${CONFIG.MARKET.serverFee * 100}% (paid by sellers) · deal % compares price to estimated fair value</div>
      <div class="list">${ls.slice(0, 40).map(l => listingRow(l)).join('') || '<div class="empty">No listings match.</div>'}</div>`;
  } else if (UI.marketTab === 'mine') {
    const ls = playerListings();
    body = `<div class="tiny dim" style="margin-bottom:8px">Sell from the Cards tab: open a card → Sell. ${CONFIG.MARKET.listingFee * 100}% listing fee (not refunded), max ${CONFIG.MARKET.maxListings} listings, they expire after 24 h. Items sell faster when priced at or below fair value.</div>
      <div class="list">${ls.map(l => { const n = listingCard(l); return n ? `<div class="listing"><div class="thumb" data-act="nftDetail" data-args="${esc(JSON.stringify(n.id))}">${Art.card(n)}</div>
        <div class="small"><b style="color:${rarityColor(n.rarity)}">${esc(cardLabel(n))}</b><div class="dim tiny">${l.venue === 'stand' ? 'on your stand (0% fee)' : 'server market (5% fee)'} · fair ~${fmt(fairValue(n))} · expires ${cd(l.expires)}</div></div>
        <div class="col" style="align-items:flex-end"><span class="price">${fmt(l.price)}</span>${btn('Cancel', 'cancelListing', l.id, '', 'sm')}</div></div>` : ''; }).join('') || '<div class="empty">You have no active listings.</div>'}</div>`;
  } else if (UI.marketTab === 'stand') {
    const M = CONFIG.MARKET, st = S.market.stand;
    if (!st) {
      body = `<div class="card"><h3>Card Marketplace Stand</h3><div class="small dim">A public trade post on your land. Bots route part of their trades to it (it charges ${M.standFee * 100}% vs the server's ${M.serverFee * 100}%) and you collect <b class="cr">${M.standFee * 100}% commission</b> on every trade, even bot-to-bot.</div>
        <div class="kv" style="margin:10px 0"><span>Land needed</span><b class="landc">${fmt(M.standLand)} SU free</b><span>Setup fee</span><b class="cr">${fmt(M.standCost)} CR</b><span>League</span><b>${leagueName(M.standLeague)}+</b><span>Upkeep</span><b>${fmt(M.standLevels[0].upkeep)} CR/h</b><span>Traffic share</span><b>${M.standLevels[0].share * 100}% of bot trades</b></div>
        ${btn('Build Marketplace Stand', 'buildMarketStand', undefined, whyBuildMarketStand(), 'block primary')}</div>`;
    } else {
      const lvl = M.standLevels[st.level], nx = M.standLevels[st.level + 1];
      body = `<div class="card hl"><h3>Your Marketplace Stand — Level ${st.level + 1}</h3>
        <div class="kv"><span>Status</span><b class="${standActive() ? 'good' : 'bad'}">${standActive() ? 'OPEN' : 'OFFLINE (unpaid upkeep)'}</b><span>Traffic share</span><b>${lvl.share * 100}% of bot trades</b><span>Commission</span><b>${M.standFee * 100}% × (1 + ${bonuses().eff.comm.toFixed(1)}% card bonus)</b><span>Upkeep</span><b>${fmt(lvl.upkeep)} CR/h</b><span>Total earned</span><b class="cr">${fmt(S.market.standEarned)} CR</b><span>Land</span><b>${fmt(M.standLand)} SU</b></div>
        <div class="row" style="margin-top:10px">${nx ? btn(`Upgrade to L${st.level + 2} (${nx.share * 100}% traffic) <span class="cost">${fmt(nx.cost)} CR</span>`, 'upgradeMarketStand', undefined, whyUpgradeMarketStand(), 'primary') : '<span class="good">MAX LEVEL</span>'}${btn('Demolish (50% refund)', 'demolishMarketStand', undefined, '', 'danger sm')}</div></div>`;
    }
  } else {
    const T = cardType(UI.chartType);
    const h = S.market.history[T.id] || [];
    const norm = x => x.p / Math.pow(CONFIG.MARKET.fairGrowth, (x.r || 0) * 1.6 + (x.pl || 0) * 0.45);
    const pts = h.map((x, i) => [i, Math.round(norm(x))]);
    const byR = {};
    h.forEach(x => { (byR[x.r || 0] = byR[x.r || 0] || []).push(x.p); });
    body = `<div class="row" style="margin-bottom:8px">${CONFIG.CARDS.types.map(t => `<button class="chip ${UI.chartType === t.id ? 'on' : ''}" data-act="chartType" data-args='"${t.id}"'>${t.name}</button>`).join('')}</div>
      <div class="card"><h4>${T.name} — last ${h.length} sales (price normalised to Common +0)</h4>
      ${Art.lineChart([{ points: pts, color: T.c[0], fill: true, dots: true }], { h: 140, zero: true, empty: 'No sales recorded yet — the market needs a few minutes of game time.' })}
      <div class="small dim" style="margin-top:6px">Demand: <b>${((S.market.demand[T.id] || 1) * 100).toFixed(0)}%</b> · ${Object.keys(byR).sort().map(r => `${rarityName(Number(r))} avg <b class="cr">${fmt(byR[r].reduce((a, b) => a + b, 0) / byR[r].length)}</b>`).join(' · ')}</div></div>`;
  }
  return subtabs + body;
}
function listingRow(l) {
  const n = l.card, f = fairValue(n), d = Math.round((l.price / f - 1) * 100);
  const seller = botById(l.seller);
  return `<div class="listing"><div class="thumb" data-act="listingDetail" data-args="${esc(JSON.stringify(l.id))}">${Art.card(n)}</div>
    <div class="small"><b style="color:${rarityColor(n.rarity)}">${esc(cardLabel(n))}</b>${l.venue === 'stand' ? ' <span class="tag ls">YOUR STAND</span>' : ''}
    <div class="tiny dim">${cardStats(n).map(statText).join(' · ')}</div><div class="tiny mute">by ${esc(seller ? seller.name : 'trader')} · ${cd(l.expires)}</div></div>
    <div class="col" style="align-items:flex-end;gap:4px"><span class="price">${fmt(l.price)}</span><span class="deal ${d <= 0 ? 'good' : d > 15 ? 'bad' : 'warn'}">${d > 0 ? '+' : ''}${d}% vs fair</span>${btn('Buy', 'buyListing', l.id, whyBuyListing(l.id), 'sm primary')}</div></div>`;
}

// ---------- land ----------
let landCache = { sig: '', html: '' };
function htmlLand() {
  const sv = S.server, used = usedSpace(), gl = S.guilds.reduce((s, g) => s + g.land, 0);
  const sig = [sv.total, Math.round(sv.botLand / 50), S.player.land, gl].join(':');
  if (landCache.sig !== sig) {
    landCache.sig = sig;
    landCache.html = Art.landMap([
      { value: S.player.land, color: getCss('--c'), min: 1 },
      { value: gl, color: getCss('--b'), min: 1 },
      { value: sv.botLand, color: '#35506e' },
    ], sv.total);
  }
  const plots = CONFIG.LAND.plots.map(n => btn(`+${fmt(n)} SU<span class="cost">${fmt(n * landPrice())} CR</span>`, 'buyLand', n, whyBuyLand(n), 'block')).join('');
  const hist = sv.history.map((h, i) => [h.t / CONFIG.HOUR, h.total]);
  const hu = sv.history.map(h => [h.t / CONFIG.HOUR, h.used]);
  return `<div class="cards">
    <div class="card"><h3>${ic('land')} Global Server</h3><div class="kv"><span>Total space</span><b>${fmt(sv.total)} SU</b><span>Used</span><b>${fmt(used)} SU (${fmtPct(used / sv.total * 100)})</b><span>Free</span><b class="${used / sv.total > 0.45 ? 'warn' : 'good'}">${fmt(sv.total - used)} SU</b><span>Price</span><b class="cr">${landPrice()} CR / SU</b><span>Expansions</span><b>${sv.expansions}</b><span>State</span><b class="${sv.state === 'CRITICAL' ? 'bad' : 'good'}">${sv.state}${sv.state === 'CRITICAL' ? ' · ' + cd(sv.freezeUntil) : ''}</b></div>
      <div class="tiny dim" style="margin-top:6px">When free space drops below 50%, heavy purchases (stand x6+, Guild HQ, Marketplace Stands, plots over ${CONFIG.LAND.heavyPlot} SU) freeze for ${CONFIG.SERVER.freezeMs / 1000}s, then capacity grows by 50%. Price = ${CONFIG.LAND.basePrice} × (1 + 3 × used²).</div></div>
    <div class="card"><h3>Your land</h3><div class="kv"><span>Owned</span><b class="landc">${fmt(S.player.land)} SU</b><span>Training stands</span><b>${fmt(S.stands.reduce((s, x) => s + CONFIG.STAND_TIERS[x.tier].land, 0))} SU</b><span>Marketplace stand</span><b>${S.market.stand ? fmt(CONFIG.MARKET.standLand) : 0} SU</b><span>Free to build</span><b class="good">${fmt(landFree())} SU</b></div>
      <h4 style="margin-top:10px">Buy a plot</h4><div class="plot-grid">${plots}</div></div>
  </div>
  ${htmlTerritory()}
  <div class="card" style="margin-top:10px"><h4>Cyberspace map</h4>${landCache.html}
    <div class="legend"><span><i style="background:var(--c)"></i>You</span><span><i style="background:var(--b)"></i>Guilds</span><span><i style="background:#35506e"></i>Other players</span><span><i style="background:#132033"></i>Free</span></div></div>
  <div class="card" style="margin-top:10px"><h4>Total vs used space (game hours)</h4>${Art.lineChart([{ points: hist, color: getCss('--b') }, { points: hu, color: getCss('--warn'), fill: true }], { h: 120, zero: true })}
    <div class="legend"><span><i style="background:var(--b)"></i>Total</span><span><i style="background:var(--warn)"></i>Used</span></div></div>`;
}
const TILE_ICON = { d: ['dt', 'var(--dt)'], c: ['cr', 'var(--cr)'], s: ['shard', 'var(--shard)'], n: ['nft', 'var(--c)'], j: ['cr', 'var(--warn)'] };
function htmlTerritory() {
  const n = tileCount(), ex = tilesExplored(), E = CONFIG.EXPLORE;
  const pages = Math.max(1, Math.ceil(n / E.pageSize));
  UI.tilePage = clamp(UI.tilePage || 0, 0, pages - 1);
  const from = UI.tilePage * E.pageSize, to = Math.min(n, from + E.pageSize);
  let tiles = '';
  for (let i = from; i < to; i++) {
    const k = S.player.tiles[i];
    if (k) { const [icn, col] = TILE_ICON[k] || TILE_ICON.d; tiles += `<div class="tile done ${k === 'j' || k === 'n' ? 'rare' : ''}" style="color:${col}" title="Sector #${i + 1} explored">${ic(icn, 14)}</div>`; }
    else tiles += `<button class="tile fog" data-act="explore" data-args="${i}" title="Explore sector #${i + 1}">?</button>`;
  }
  const pager = pages > 1 ? `<div class="row" style="margin-top:8px">${Array.from({ length: pages }, (_, p) => `<button class="chip ${p === UI.tilePage ? 'on' : ''}" data-act="tilePage" data-args="${p}">${p * E.pageSize + 1}-${Math.min(n, (p + 1) * E.pageSize)}</button>`).join('')}</div>` : '';
  return `<div class="card" style="margin-top:10px"><div class="row between"><h3 style="margin:0">${ic('land')} Your territory</h3><span class="small">${ex}/${n} explored</span></div>
    <div class="tiny dim" style="margin:4px 0 8px">Every ${E.tileSU} SU you own is a sector. Tap a <b style="color:var(--a)">?</b> sector to explore it once: DT, CR, shards, a rare card or a CR jackpot. Buy more land to get new sectors.</div>
    ${n ? `<div class="tiles">${tiles}</div>${pager}<div class="row" style="margin-top:8px">${btn('Explore all', 'exploreAll', undefined, ex >= n ? 'Nothing left to explore - buy more land' : '', 'sm accent')}</div>` : `<div class="empty">You own less than ${E.tileSU} SU. Buy a plot to get sectors.</div>`}</div>`;
}
function getCss(v) { try { return getComputedStyle(document.body).getPropertyValue(v).trim() || '#39ff88'; } catch (e) { return '#39ff88'; } }

// ---------- season ----------
function htmlSeason() {
  const p = S.player, rank = leaderboard('rating').findIndex(e => e.isPlayer) + 1;
  const missions = S.missions.list.map((m, i) => {
    const done = m.progress >= m.target;
    return `<div class="mission ${done ? 'done' : ''}"><div><div class="small">${esc(m.text)}</div><div class="xp" style="margin:5px 0"><i style="width:${(m.progress / m.target * 100).toFixed(0)}%"></i></div><div class="tiny dim">${fmt(m.progress)}/${fmt(m.target)} · reward ${m.reward.dt} DT, ${fmt(m.reward.cr)} CR, ${m.reward.shards} shards, 25% card</div></div>
      ${m.claimed ? '<span class="good small">CLAIMED</span>' : btn('Claim', 'claimMission', i, done ? '' : 'Not complete yet', 'sm primary')}</div>`;
  }).join('');
  const nextDay = (gameDay() + 1) * CONFIG.DAY;
  const lb = leaderboard(UI.lbKind);
  const myIdx = lb.findIndex(e => e.isPlayer);
  const top = lb.slice(0, 10);
  const rows = top.map((e, i) => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)} ${e.tag ? `<span class="gtag">[${esc(e.tag)}]</span>` : ''}</td><td class="num">${fmt(e.value)}</td></tr>`).join('') + (myIdx >= 10 ? `<tr class="me"><td>${myIdx + 1}</td><td>${esc(lb[myIdx].name)}</td><td class="num">${fmt(lb[myIdx].value)}</td></tr>` : '');
  const achDone = Object.keys(S.ach).length;
  const ach = ACHIEVEMENTS.map(a => `<div class="ach ${S.ach[a[0]] !== undefined ? 'on' : ''}" title="${esc(a[2])}"><b>${esc(a[1])}</b>${esc(a[2])}</div>`).join('');
  const reb = whyRebirth();
  return `<div class="cards">
    <div class="card"><h3>${ic('season')} Season ${S.season.index}</h3><div class="kv"><span>Ends in</span><b>${cd(S.season.start + CONFIG.SEASON.lengthMs)}</b><span>Your rank</span><b>#${rank} of ${S.bots.length + 1}</b><span>Your league</span><b style="color:${CONFIG.LEAGUES[p.league].color}">${leagueName(p.league)}</b><span>End reward now</span><b class="cr">${fmt(CONFIG.SEASON.rewards[p.league].cr)} CR + ${CONFIG.SEASON.rewards[p.league].shards} shards</b></div>
      <div class="tiny dim" style="margin-top:6px">At season end ratings soft-reset halfway toward 1000 and you get a title.${p.titles.length ? ' Titles: ' + p.titles.map(esc).join(', ') : ''}</div></div>
    <div class="card"><h3>Neural Rebirth</h3><div class="small dim">Reach ${leagueName(CONFIG.PRESTIGE.league)} league, then reset pet stats, stands and rating to gain Legacy points: permanent +${CONFIG.PRESTIGE.legacyPerPoint * 100}% training & CR each (max +${CONFIG.PRESTIGE.legacyCap * 100}%). You keep cards, land, CR, guild and cosmetics.</div>
      <div class="kv" style="margin:8px 0"><span>Legacy</span><b>${p.legacy} (+${Math.round(legacyBonus() * 100)}%)</b><span>Rebirth now gives</span><b>+${legacyGain()} Legacy</b></div>
      ${btn('Neural Rebirth', 'rebirth', undefined, reb, 'block ' + (reb ? '' : 'primary'))}</div>
  </div>
  <h3 style="margin-top:12px">Daily missions <span class="tiny dim">new in ${cd(nextDay)}</span></h3><div class="list">${missions}</div>
  <h3 style="margin-top:12px">Leaderboards</h3><div class="row" style="margin-bottom:6px">${[['rating', 'Rating'], ['power', 'AI power'], ['guild', 'Guild vaults']].map(([k, l]) => `<button class="chip ${UI.lbKind === k ? 'on' : ''}" data-act="lbKind" data-args='"${k}"'>${l}</button>`).join('')}</div>
  <table class="lb"><tr><th>#</th><th>Name</th><th class="num">${UI.lbKind === 'guild' ? 'Vault GV' : UI.lbKind === 'power' ? 'Math+Trivia' : 'Rating'}</th></tr>${rows}</table>
  <h3 style="margin-top:12px">Achievements <span class="dim">${achDone}/${ACHIEVEMENTS.length}</span> <span class="tiny dim">+${ACH_REWARD_SHARDS} shards each</span></h3><div class="ach-grid">${ach}</div>`;
}

// ============================================================
// RIGHT — Guild / NFTs
// ============================================================
function htmlRight() {
  const tabs = [['cards', 'Cards', 'nft'], ['album', 'Album', 'season'], ['guild', 'Guild', 'guild']];
  const t = tabs.map(([id, l, i]) => `<button class="tab ${UI.rightTab === id ? 'on' : ''}" data-act="rightTab" data-args='"${id}"'>${ic(i)} ${l}${id === 'cards' ? ` <span class="dim tiny">${S.inv.length}</span>` : ''}</button>`).join('');
  return `<div class="tabs">${t}</div>${UI.rightTab === 'guild' ? htmlGuild() : UI.rightTab === 'album' ? htmlAlbum() : htmlCards()}`;
}

// ---------- guild ----------
function htmlGuild() {
  const g = playerGuild();
  if (!g) {
    const rows = S.guilds.slice().sort((a, b) => b.vault - a.vault).map(x => `<div class="guild-row">${Art.emblem(x.seed, 40)}<div class="small"><b>${esc(x.name)}</b> <span class="gtag">[${esc(x.tag)}]</span><div class="tiny dim">${x.members.length} members · HQ ${x.hq ? 'L' + x.hq : '—'} · vault ${fmt(x.vault)} GV</div></div>${btn('Join', 'joinGuild', x.id, whyJoinGuild(x.id), 'sm')}</div>`).join('');
    const wait = S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs - S.time;
    return `<div class="small dim" style="margin-bottom:8px">Guilds collect a 10% <b>bonus</b> from every member's tournament winnings — it's minted extra, never taken from you. Vault GV builds the Guild HQ and unlocks cosmetic styles.</div>
      ${wait > 0 ? `<div class="warn small" style="margin-bottom:8px">Join cooldown: ${cd(S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs)}</div>` : ''}
      <div class="list">${rows}</div>
      <div class="card" style="margin-top:10px"><h3>Found your own guild</h3><div class="field"><input type="text" maxlength="24" placeholder="Guild name" data-in="guildName" value="${esc(UI.inputs.guildName || '')}">${btn(`Create <span class="cost">${fmt(CONFIG.GUILD.createCost)} CR</span>`, 'createGuild', undefined, '', 'primary')}</div><div class="tiny dim" style="margin-top:4px">Bots will apply to join over time (faster with a higher HQ).</div></div>`;
  }
  const nx = hqNext(g), c = hqCost(g);
  const contrib = Object.entries(g.contrib).map(([id, v]) => ({ id, v, name: id === 'player' ? S.player.name : (botById(id) || { name: '(left)' }).name, me: id === 'player' })).sort((a, b) => b.v - a.v);
  const myRank = contrib.findIndex(x => x.me);
  const lbRows = contrib.slice(0, 8).map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.name)}</td><td class="num">${fmt(x.v)}</td></tr>`).join('') + (myRank >= 8 ? `<tr class="me"><td>${myRank + 1}</td><td>${esc(S.player.name)}</td><td class="num">${fmt(contrib[myRank].v)}</td></tr>` : '');
  const cos = ['theme', 'font', 'badge'].map(type => `<h4 style="margin-top:8px">${type === 'theme' ? 'Interface themes' : type === 'font' ? 'Fonts' : 'Cyber badges'}</h4><div class="list">` + CONFIG.COSMETICS.filter(x => x.type === type).map(x => {
    const owned = S.player.cosmetics.owned.includes(x.id), active = S.player.cosmetics[type] === x.id;
    const sw = type === 'theme' ? `<span class="swatch" style="background:${(PET_COLORS[x.id] || ['#555'])[0]}"></span>` : type === 'badge' ? Art.badge(x.id, 14) + ' ' : '';
    const act = active ? '<span class="good tiny">ACTIVE</span>' : owned ? btn('Use', 'useCosmetic', x.id, '', 'sm') : btn(`${fmt(x.cost)} GV`, 'buyCosmetic', x.id, whyBuyCosmetic(x.id), 'sm');
    return `<div class="cos"><span>${sw}${esc(x.name)} ${x.hq && !owned ? `<span class="tiny dim">HQ ${x.hq}</span>` : ''}</span>${act}</div>`;
  }).join('') + '</div>').join('');
  return `<div class="row">${Art.emblem(g.seed, 56)}<div class="grow"><b>${esc(g.name)}</b> <span class="gtag">[${esc(g.tag)}]</span><div class="small dim">${g.members.length + 1} members${g.isPlayer ? ' · founded by you' : ''}</div></div></div>
    <div class="kv" style="margin:10px 0"><span>Vault</span><b class="gvc">${fmt(g.vault)} GV</b><span>Guild HQ</span><b>${g.hq ? 'Level ' + g.hq : 'not built'}</b><span>Guild land</span><b>${fmt(g.land)} SU</b><span>Perk</span><b>${g.hq ? '+' + CONFIG.GUILD.hq[g.hq - 1].perk + '% DT trickle' : '—'}</b><span>Your contribution</span><b>${fmt(g.contrib.player || 0)} GV</b></div>
    <div class="field"><input type="number" min="1" placeholder="CR to donate" data-in="donate" value="${esc(UI.inputs.donate || '')}">${btn('Donate', 'donate', undefined, '', 'accent')}</div>
    <div class="card" style="margin-top:10px"><h3>Guild HQ ${nx ? '→ Level ' + (g.hq + 1) : '(max)'}</h3>
      ${nx ? `<div class="kv"><span>Guild land needed</span><b>${fmt(nx.land)} SU (+${fmt(c.landNeeded)})</b><span>Land cost</span><b class="gvc">${fmt(c.landCost)} GV</b><span>Implementation fee</span><b class="gvc">${fmt(c.fee)} GV</b><span>Unlocks</span><b>+${nx.perk}% DT trickle, tier ${g.hq + 1} cosmetics</b></div>
      <div style="margin-top:8px">${btn(`${g.hq ? 'Upgrade' : 'Build'} HQ <span class="cost">${fmt(c.total)} GV</span>`, 'upgradeHQ', undefined, whyUpgradeHQ(), 'block primary')}</div>` : '<div class="good small">Your HQ is fully upgraded.</div>'}</div>
    <div class="card" style="margin-top:10px"><h3>Cosmetics shop</h3><div class="tiny dim">Burn vault GV for purely visual styles. Owned styles stay yours.</div>${cos}</div>
    <h4 style="margin-top:10px">Contribution leaderboard</h4><table class="lb"><tr><th>#</th><th>Member</th><th class="num">GV</th></tr>${lbRows}</table>
    <div style="margin-top:10px">${btn('Leave guild', 'leaveGuild', undefined, '', 'danger sm')}</div>`;
}

// ---------- cards ----------
function nftCard(n, opts) {
  opts = opts || {};
  const tags = [isEquipped(n.id) ? '<span class="tag eq">EQUIPPED</span>' : '', n.listed ? '<span class="tag ls">LISTED</span>' : '', n.locked ? '<span class="tag lk">LOCKED</span>' : ''].join('');
  const sel = UI.selected.includes(n.id) ? 'sel' : '';
  return `<div class="nft ${sel} ${n.rarity === CONFIG.CARDS.UNIQUE ? 'unique-glow' : ''}" data-act="${opts.act || 'nftClick'}" data-args="${esc(JSON.stringify(n.id))}" title="${esc(cardLabel(n))}">${Art.card(n)}<div class="tags">${tags}</div><div class="nm" style="color:${rarityColor(n.rarity)}">${esc(cardType(n.type).name)}${n.plus ? ' +' + n.plus : ''}</div></div>`;
}
function htmlCards() {
  const b = bonuses(), f = UI.nftFilter, C = CONFIG.CARDS, hi = b.heat;
  const bonusRows = Object.keys(C.stats).map(k => {
    const A = C.stats[k], capd = b.raw[k] - b.eff[k] > 0.5;
    return `<div class="bonus-row"><span>${A.name}</span><span class="dim">raw ${A.sign}${b.raw[k].toFixed(1)}%</span><b class="${b.eff[k] > 0 ? 'good' : 'mute'}">${A.sign}${b.eff[k].toFixed(1)}% ${capd ? '<span class="capped">CAPPED</span>' : ''}</b></div>`;
  }).join('');
  const slots = C.types.map(t => {
    const c = equippedOfType(t.id);
    return `<div class="card-slot">${c ? nftCard(c, { act: 'nftDetail' }) : `<div class="slot-empty tiny">no ${esc(t.name)}</div>`}<div class="slot-name">${esc(t.name)}</div></div>`;
  }).join('');
  const heatPct = hi.cooling ? Math.min(100, hi.heat / hi.cooling * 100) : 0;
  const setLine = b.set ? `<div class="good small">FULL RIG: all 4 types equipped → +${b.set.pct}% to all card stats (lowest rarity: ${rarityName(b.set.rarity)})</div>`
    : `<div class="tiny dim">Equip all 4 types for a set bonus: +${C.setBonus.join('/')}% by lowest rarity.</div>`;
  let items = S.inv.slice();
  if (f.type !== 'all') items = items.filter(n => n.type === f.type);
  if (f.rarity !== 'all') items = items.filter(n => n.rarity === Number(f.rarity));
  if (f.plus !== 'all') items = items.filter(n => n.plus === Number(f.plus));
  if (f.sort === 'rarity') items.sort((a, c) => c.rarity - a.rarity || c.plus - a.plus || a.type.localeCompare(c.type));
  else if (f.sort === 'type') items.sort((a, c) => a.type.localeCompare(c.type) || c.rarity - a.rarity || c.plus - a.plus);
  else items.sort((a, c) => c.createdAt - a.createdAt);
  const selItems = UI.selected.map(id => S.inv.find(n => n.id === id)).filter(Boolean);
  const salvR = selItems.length ? (selItems.map(n => cardStatusReason(n)).find(Boolean) || '') : 'Select cards first';
  const salvVal = selItems.reduce((s2, n) => s2 + salvageValue(n), 0);
  const selBar = UI.selectMode ? `<div class="card hl" style="margin:8px 0"><div class="row between small"><b>SELECT MODE</b><span>${UI.selected.length} selected</span></div>
      <div class="row" style="margin-top:6px">${btn(`Salvage → ${salvVal} shards`, 'salvageSelected', undefined, salvR, 'sm danger')}${btn('Select all Common', 'selCommon', undefined, '', 'sm accent')}${btn('Clear', 'clearSel', undefined, '', 'sm')}${btn('Done', 'toggleSelect', undefined, '', 'sm')}</div>
      <div class="tiny dim" style="margin-top:4px">Equipped, listed and locked cards are protected.</div></div>` : '';
  const forgeOpts = C.types.map(t => `<option value="${t.id}" ${UI.inputs.forgeType === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
  return `<h3>Active bonuses</h3>${bonusRows}${setLine}
    <div class="row between small" style="margin-top:8px"><span>Heat <b class="${hi.over ? 'bad' : 'good'}">${hi.heat}</b> / cooling <b>${hi.cooling}</b></span><span class="${hi.over ? 'bad' : 'dim'}">${hi.over ? `OVERHEATING: bonuses ×${hi.mult.toFixed(2)}` : 'cool'}</span></div>
    <div class="heatbar" title="Core and Hardware make heat, Coolers remove it"><i class="${hi.over ? 'over' : ''}" style="width:${heatPct.toFixed(0)}%"></i></div>
    <div class="tiny dim">Core & Hardware heat up the rig, a Cooler keeps it cool. If heat passes cooling, all bonuses drop (down to ×${C.heat.minMult}).</div>
    <h4 style="margin-top:10px">Your rig — one card per type</h4><div class="card-slots slots">${slots}</div>
    <div class="row between" style="margin-top:10px"><span class="small">${ic('ai')} Neural Recalibrators: <b class="good">${S.player.recal}</b></span><span class="tiny dim">reroll a card's bonus stats</span></div>
    <div class="sep"></div>
    <div class="row between"><h3 style="margin:0">Inventory ${S.inv.length}/${C.inventoryMax}</h3>${btn(UI.selectMode ? 'Exit select' : 'Select / Salvage', 'toggleSelect', undefined, '', 'sm ' + (UI.selectMode ? '' : 'accent'))}</div>
    ${selBar}
    <div class="row small" style="margin:8px 0">
      <select data-filter="nft.type"><option value="all">All types</option>${C.types.map(t => `<option value="${t.id}" ${f.type === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
      <select data-filter="nft.rarity"><option value="all">All rarity</option>${C.rarities.map((r, i) => `<option value="${i}" ${String(f.rarity) === String(i) ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
      <select data-filter="nft.plus"><option value="all">All +</option>${[0, 1, 2, 3, 4].map(l => `<option value="${l}" ${String(f.plus) === String(l) ? 'selected' : ''}>+${l}</option>`).join('')}</select>
      <select data-filter="nft.sort">${[['rarity', 'Sort: rarity'], ['type', 'Sort: type'], ['new', 'Sort: newest']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="nft-grid">${items.map(n => nftCard(n)).join('') || '<div class="empty" style="grid-column:1/-1">No cards yet. Win Multiplayer top-3, perfect Solo runs, missions, the AI Lab, or buy on the market.</div>'}</div>
    <div class="sep"></div>
    <h3>${ic('shard')} Shard forge</h3><div class="tiny dim">Salvage unwanted cards into shards, then forge a Common card of the type you need (${C.forgeCost} shards). Shards also pay for upgrades. You have <b class="shardc">${S.player.shards}</b>.</div>
    <div class="row" style="margin-top:6px"><select data-in="forgeType" style="width:auto;flex:1">${forgeOpts}</select>${btn('Forge', 'forge', undefined, whyForge(UI.inputs.forgeType || C.types[0].id), 'accent')}</div>
    <div class="tiny mute" style="margin-top:6px">Drop chances: Multiplayer 1st/2nd/3rd ${CONFIG.MULTI.drop.map(d => Math.round(dropChance(d) * 100) + '%').join('/')}, perfect Solo ${Math.round(dropChance(CONFIG.SOLO.cardDropPerfect) * 100)}%, mission claim 25%, AI Lab ${Math.round(CONFIG.AI_LAB.cardChance * 100)}%. <b style="color:#ffe14d">Unique</b> cards come only from the AI Lab.</div>`;
}

// ---------- album ----------
function htmlAlbum() {
  const C = CONFIG.CARDS;
  const head = `<div></div>` + C.rarities.map((r, i) => `<div class="tiny center" style="color:${rarityColor(i)}">${r.name}</div>`).join('');
  const rows = C.types.map(t => `<div class="small">${esc(t.name)}</div>` + C.rarities.map((r, i) => {
    const on = S.album[albumKey(t.id, i)] !== undefined;
    return `<div class="cell ${on ? 'on' : ''}" style="${on ? `background:${rarityColor(i)}` : ''}">${on ? '✓' : '?'}</div>`;
  }).join('')).join('');
  const total = C.types.length * C.rarities.length, got = Object.keys(S.album).length;
  const cols = C.rarities.map((r, i) => {
    const n = C.types.filter(t => S.album[albumKey(t.id, i)] !== undefined).length;
    return `<span>${r.name}</span><b class="${n === C.types.length ? 'good' : ''}">${n}/${C.types.length} · ${C.album.columnShards[i]} shards + ${C.album.columnRecal} Recalibrator</b>`;
  }).join('');
  return `<h3>Card album <span class="dim">${got}/${total}</span></h3>
    <div class="tiny dim" style="margin-bottom:8px">Every new type × rarity you obtain (drop, market, upgrade or evolution) fills a slot: +${C.album.entryShards} shards. Complete a rarity column (all 4 types) for a bigger reward.</div>
    <div class="album">${head}${rows}</div>
    <h4 style="margin-top:12px">Column rewards</h4><div class="kv">${cols}</div>`;
}

// ---------- card detail modal ----------
function openNftDetail(id, fromListing) {
  let n, l = null;
  if (fromListing) { l = S.market.listings.find(x => x.id === id); n = l && l.card; }
  else n = S.inv.find(x => x.id === id);
  if (!n) { closeModal(); return; }
  UI.modalKind = { type: fromListing ? 'listing' : 'nft', id };
  const C = CONFIG.CARDS, R = C.rarities[n.rarity], T = cardType(n.type);
  const stats = cardStats(n).map(st => `<div class="stat-line ${st.main ? 'main' : ''}"><span>${st.main ? '◆ ' : ''}${C.stats[st.type].name}${st.main ? ' <span class="tiny dim">(fixed)</span>' : ''}</span><b class="good">${C.stats[st.type].sign}${st.value}%</b></div>`).join('');
  const heatTxt = T.heat ? `<span>Heat</span><b class="warn">+${cardHeat(n)}</b>` : `<span>Cooling</span><b class="dtc">${cardCooling(n)}</b>`;
  let actions = '';
  if (!fromListing) {
    const eqd = isEquipped(n.id);
    const up = n.plus < C.maxPlus ? upgradeCost(n) : null, ev = n.plus >= C.maxPlus ? evolveCost(n) : null;
    const growBtn = up ? btn(`Upgrade to +${n.plus + 1} <span class="cost">${cardCostText(up)}</span>`, 'upgradeCard', n.id, whyUpgradeCard(n.id), 'primary')
      : ev ? btn(`Evolve → ${rarityName(n.rarity + 1)} <span class="cost">${cardCostText(ev)}</span>`, 'evolveCard', n.id, whyEvolveCard(n.id), 'primary')
      : `<span class="good small">${n.rarity === C.UNIQUE ? 'UNIQUE — maxed' : 'MAX'}</span>`;
    actions = `<div class="row" style="margin-top:12px">${growBtn}${btn(`Reroll bonus stats <span class="cost">1 Recalibrator (${S.player.recal})</span>`, 'rerollCard', n.id, whyRerollCard(n.id), 'accent')}</div>
      <div class="row" style="margin-top:8px">${eqd ? btn('Unequip', 'unequip', n.id, '', '') : btn(equippedOfType(n.type) ? `Equip (replaces your ${T.name})` : 'Equip', 'equip', n.id, whyEquip(n.id), '')}
      ${btn(n.locked ? 'Unlock' : 'Lock', 'toggleLock', n.id, '', '')}
      ${btn(`Salvage → ${salvageValue(n)} shards`, 'salvageOne', n.id, whySalvage(n.id), 'danger')}</div>
      ${n.listed ? `<div class="warn small" style="margin-top:8px">Listed on the market (escrow). Cancel it in Market → My listings.</div>` : `<div class="card" style="margin-top:12px"><h4>Sell on the market</h4><div class="row"><input type="number" min="1" data-in="sellPrice" value="${esc(UI.inputs.sellPrice || fairValue(n))}" style="flex:1;width:auto"><select data-in="sellVenue" style="width:auto">${`<option value="server">Server (5% fee)</option>` + (standActive() ? `<option value="stand" ${UI.inputs.sellVenue === 'stand' ? 'selected' : ''}>My stand (0%)</option>` : '')}</select>${btn('List', 'listNft', n.id, '', 'accent')}</div><div class="tiny dim" style="margin-top:4px">Fair value ~${fmt(fairValue(n))} CR · listing fee ${CONFIG.MARKET.listingFee * 100}% (min 1 CR), not refunded.</div></div>`}`;
  } else {
    actions = `<div class="row" style="margin-top:12px"><span class="price">${fmt(l.price)} CR</span>${btn('Buy now', 'buyListing', l.id, whyBuyListing(l.id), 'primary')}</div>`;
  }
  const path = n.rarity < C.MAX_CRAFT_RARITY ? `+0 → +${C.maxPlus}, then evolve to ${rarityName(n.rarity + 1)}` : n.rarity === C.UNIQUE ? 'Unique: upgrade to +4, never evolves' : 'Legendary: top craftable rarity, upgrade to +4';
  openModal(modalHead(`<span style="color:${rarityColor(n.rarity)}">${esc(cardLabel(n))}</span>`) + `<div class="nft-detail"><div class="art">${Art.card(n)}</div><div>
    <div class="row"><b style="color:${rarityColor(n.rarity)}">${R.name}</b><span>${esc(T.name)}</span><span>Level <b>+${n.plus}</b>/${C.maxPlus}</span></div>
    <div class="tiny dim">Serial #0x${(n.dna >>> 0).toString(16).toUpperCase().padStart(8, '0')} · ${R.bonus} random bonus stat${R.bonus > 1 ? 's' : ''} · ${path}</div>
    <div style="margin-top:8px">${stats}</div>
    <div class="kv" style="margin-top:6px">${heatTxt}<span>Fair market value</span><b class="cr">~${fmt(fairValue(n))} CR</b></div>
    ${actions}</div></div>`, true);
}

// ---------- evolution flash ----------
function playEvolveAnim(c) {
  openModal(modalHead('Evolution!') + `<div class="fusion-fx" data-act="closeModal"><div class="flash" style="opacity:1;transform:scale(3)"></div><div class="out" style="opacity:1;transform:scale(1)">${Art.card(c)}</div></div>
    <div class="center"><b style="color:${rarityColor(c.rarity)}">${esc(cardLabel(c))}</b><div class="small dim">${cardStats(c).map(statText).join(' · ')}</div></div>
    <div class="row" style="justify-content:center;margin-top:10px">${btn('Nice!', 'closeModal', undefined, '', 'primary')}</div>`);
  const box = $('#modal');
  setTimeout(() => { const f = box.querySelector('.flash'); if (f) f.style.opacity = '0'; }, 500);
}

// ---------- AI Lab ----------
function htmlAILab() {
  const A = CONFIG.AI_LAB, ai = S.ai, C = CONFIG.CARDS;
  const en = Array.from({ length: Math.max(A.energyMax, ai.energy) }, (_, i) => `<i class="${i < ai.energy ? (i >= A.energyMax ? 'on bonus' : 'on') : ''}"></i>`).join('');
  const regen = ai.energy < A.energyMax ? `+1 in ${cd(S.time + A.regenMs - ai.acc)}` : 'full';
  const bridge = AI_BRIDGE.connected() ? `<span class="good">connected to ${esc(AI_BRIDGE.endpoint)}</span>` : '<span class="warn">offline mode</span> — the AI is not connected yet; answers are saved on this device';
  const m = AILAB;
  if (!ai.consent) {
    return `<div class="card hl"><h3>${ic('ai')} AI Lab — before you start</h3>
      <div class="small" style="line-height:1.6">In the AI Lab, <b>your AI asks you questions in Romanian</b> and learns from your answers how real people speak and explain things. Answer in your own words.</div>
      <ul class="small" style="line-height:1.6">
        <li>What you write here is used <b>to teach the AI the Romanian language</b>.</li>
        <li><b>Do not write personal data</b> (names, phone numbers, addresses, e-mails). Phone numbers, e-mails and links are removed automatically.</li>
        <li>The AI only keeps an answer once several players agree on it.</li>
        <li>You can delete your answers anytime (Settings → Delete my AI Lab answers).</li></ul>
      <div class="small dim">Ce scrii în AI Lab este folosit ca AI-ul să învețe limba română. Te rog să nu scrii date personale.</div>
      <div style="margin-top:12px">${btn('I understand — open the AI Lab', 'aiConsent', undefined, '', 'block primary big')}</div></div>`;
  }
  if (m && !m.done && m.i >= m.qs.length) return `<div class="card center" style="padding:20px">${ic('ai')} Saving your lesson…</div>`;
  if (m && !m.done) {
    const q = m.qs[m.i];
    const chat = m.answers.map(a => `<div class="bot">${esc(a.q)}</div><div class="me">${a.a ? esc(a.a) : '<i class="dim">nu știu</i>'}</div>`).join('');
    return `<div class="row between"><b>${ic('ai')} AI LESSON</b><span>Question <b>${m.i + 1}</b>/${m.qs.length}</span></div>
      <div class="ai-chat">${chat}</div>
      <div class="card hl"><div class="tiny dim">${q.kind === 'control' ? 'Quick check' : 'Your AI asks'}:</div><div class="ai-q">${esc(q.text)}</div>
      <textarea class="ai-input" data-in="aiAnswer" maxlength="600" placeholder="Răspunde cu cuvintele tale…">${esc(UI.inputs.aiAnswer || '')}</textarea>
      <div class="row" style="margin-top:8px;justify-content:flex-end">${btn('Nu știu', 'aiSkip', undefined, '', 'sm')}${btn(m.i === m.qs.length - 1 ? 'Send & finish' : 'Send', 'aiSend', undefined, '', 'primary')}</div>
      <div class="tiny mute" style="margin-top:4px">Enter = send · Shift+Enter = new line · no personal data, please</div></div>`;
  }
  let last = '';
  if (m && m.done && m.result) {
    const r = m.result;
    last = `<div class="card hl" style="margin-top:10px"><h4>Lesson complete</h4><div class="small">${r.useful} useful answer${r.useful === 1 ? '' : 's'}${r.controlOk ? '' : ' · <span class="warn">attention check missed: half rewards</span>'}</div>
      <div style="margin-top:6px"><span class="cr">+${fmt(r.cr)} CR</span> · <span class="shardc">+${r.shards} shards</span> · <span class="good">+1 Neural Recalibrator</span>${r.milestone ? ' · <b class="warn">AI MILESTONE!</b>' : ''}</div>
      ${r.unique ? `<div style="margin:12px auto 0;max-width:180px">${nftCard(r.unique)}</div><div class="center" style="color:#ffe14d"><b>UNIQUE CARD!</b></div>` : ''}
      ${r.card ? `<div style="margin:12px auto 0;max-width:160px">${nftCard(r.card)}</div><div class="good small center">Card reward</div>` : ''}</div>`;
  }
  const toMs = A.milestoneEvery - (ai.useful % A.milestoneEvery);
  return `<div class="card"><div class="row between"><h3 style="margin:0">${ic('ai')} AI Lab</h3><span class="energy">${en} <span class="tiny dim">${regen}</span></span></div>
      <div class="small dim" style="margin-top:6px">Your AI asks ${A.questions} questions; you answer in your own words. Every lesson gives <b class="good">1 Neural Recalibrator</b> (reroll a card's bonus stats), CR and shards for useful answers, a ${Math.round(A.cardChance * 100)}% card chance and a small chance at a <b style="color:#ffe14d">UNIQUE</b> card — guaranteed after ${A.uniquePity} lessons without one.</div>
      <div class="kv" style="margin:10px 0"><span>Energy</span><b>${ai.energy} <span class="dim tiny">(+1/h up to ${A.energyMax}; quiz wins add more, up to ${A.energyWonCap})</span></b><span>Lessons</span><b>${ai.rounds}</b><span>Useful answers taught</span><b class="good">${ai.useful}</b><span>Next AI milestone</span><b>${toMs} answers → +${A.milestoneShards} shards & Recalibrator</b><span>Unique pity</span><b>${ai.pity}/${A.uniquePity}</b><span>AI connection</span><b class="small">${bridge}</b></div>
      ${btn(UI.aiBusy ? 'Connecting to the AI…' : 'Start a lesson (1 energy)', 'aiStart', undefined, UI.aiBusy ? 'Please wait' : whyAIStart(), 'block primary big')}</div>
    ${last}
    <div class="card" style="margin-top:10px"><h4>Your answers</h4><div class="small dim">${ai.collected.length} answers saved on this device${AI_BRIDGE.connected() ? '' : ', waiting for the AI to be connected'}.</div>
      <div class="row" style="margin-top:6px">${btn('Export answers (JSON)', 'aiExport', undefined, ai.collected.length ? '' : 'No answers yet', 'sm accent')}</div></div>`;
}

// ============================================================
// LOG
// ============================================================
function htmlLogShell() {
  return `<div class="row between" style="margin-bottom:6px"><h3 style="margin:0">${ic('log')} Terminal log</h3><div class="logf">${Object.keys(UI.logFilter).map(k => `<button class="chip ${UI.logFilter[k] ? 'on' : ''}" data-act="logFilter" data-args='"${k}"'>${k}</button>`).join('')}</div></div><div id="log"></div>`;
}
function logLine(e) {
  return `<div class="ln"><span class="t">${gameClock(e.t)}</span><span class="lt ${e.tag}">${e.tag}</span>${esc(e.msg)}</div>`;
}
function renderLog(full) {
  const box = $('#log');
  if (!box) return;
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  if (full) box.innerHTML = S.log.filter(e => UI.logFilter[e.tag]).map(logLine).join('');
  if (atBottom || full) box.scrollTop = box.scrollHeight;
}
function appendLog(e) {
  const box = $('#log');
  if (!box || !UI.logFilter[e.tag]) return;
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.insertAdjacentHTML('beforeend', logLine(e));
  while (box.children.length > CONFIG.LOG_MAX) box.firstChild.remove();
  if (atBottom) box.scrollTop = box.scrollHeight;
}

// ============================================================
// MOBILE NAV
// ============================================================
function htmlMnav() {
  const it = [['left', 'AI', 'pet'], ['center', 'Play', 'arena'], ['right', 'Cards', 'nft'], ['log', 'Log', 'log']];
  return it.map(([v, l, i]) => `<button class="${UI.view === v ? 'on' : ''}" data-act="view" data-args='"${v}"'>${ic(i, 20)}${l}</button>`).join('');
}

// ============================================================
// RENDER
// ============================================================
function setHtml(sel, html) {
  const el = $(sel);
  if (!el) return;
  if (UI.lastHtml[sel] === html) return;
  const ae = document.activeElement;
  if (ae && el.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return; // don't disturb typing
  UI.lastHtml[sel] = html;
  el.innerHTML = html;
}
function renderAll() {
  if (!S) return;
  const body = document.body;
  body.dataset.theme = S.player.cosmetics.theme;
  body.dataset.font = S.player.cosmetics.font;
  body.dataset.view = UI.view;
  setHtml('#topbar', htmlTop());
  const crit = htmlCritical();
  setHtml('#critical', crit);
  $('#critical').classList.toggle('on', !!crit);
  document.documentElement.style.setProperty('--hdr', $('#topbar').offsetHeight + 'px');
  setHtml('#left', htmlLeft());
  setHtml('#center', htmlCenter());
  setHtml('#right', htmlRight());
  setHtml('#mnav', htmlMnav());
  updateCountdowns();
}
function updateCountdowns() {
  document.querySelectorAll('[data-cd]').forEach(el => {
    const t = Number(el.dataset.cd) - S.time;
    el.textContent = (el.dataset.cdp || '') + fmtTime(t);
  });
}
function updateTimerBar() {
  const m = ARENA, bar = document.getElementById('tbar');
  if (!m || !bar || m.phase !== 'question') { if (bar && m && m.phase === 'reveal') bar.style.transform = 'scaleX(0)'; return; }
  const left = clamp(1 - (performance.now() - m.roundStart) / m.roundMs, 0, 1);
  bar.style.transform = `scaleX(${left.toFixed(3)})`;
  bar.style.background = left < 0.25 ? 'var(--bad)' : left < 0.5 ? 'var(--warn)' : 'var(--b)';
}

// ============================================================
// EVENTS
// ============================================================
function doAct(fn, quiet) {
  let res;
  try { res = fn(); } catch (e) { console.error(e); res = { ok: false, msg: 'Error: ' + e.message }; }
  if (!res) return res;
  if (res.ok) { if (res.msg && !quiet) toast(res.msg); saveGame(); }
  else if (res.msg) toast(res.msg, 'err');
  renderAll();
  return res;
}
const HANDLERS = {
  noop() { },
  closeModal() { closeModal(); },
  confirmYes() { const cb = UI.confirmCb; UI.confirmCb = null; closeModal(); if (cb) cb(); renderAll(); },
  view(v) { UI.view = v; window.scrollTo(0, 0); if (v === 'log') setTimeout(() => renderLog(true), 0); },
  centerTab(t) { UI.centerTab = t; },
  rightTab(t) { UI.rightTab = t; },
  marketTab(t) { UI.marketTab = t; },
  chartType(t) { UI.chartType = t; },
  lbKind(k) { UI.lbKind = k; },
  logFilter(k) { UI.logFilter[k] = !UI.logFilter[k]; UI.lastHtml['#logwrap .panel'] = null; renderLogShell(); },
  dismissCrit() { UI.critDismissed = true; },
  standSel(id) { UI.standSel = id || null; },
  train(a) {
    const res = doAct(() => actTrain(a.stat, a.n, UI.standSel), true);
    if (res && res.ok) { setPetState('training', 1200); toast(res.msg); }
  },
  buyDT(n) { doAct(() => actBuyDT(n)); },
  buyLand(n) { doAct(() => actBuyLand(n)); },
  buildStand() { doAct(() => actBuildStand()); },
  upgradeStand(id) { doAct(() => actUpgradeStand(id)); },
  demolishStand(id) {
    const s = S.stands.find(x => x.id === id); if (!s) return;
    confirmBox('Demolish stand?', `The x${CONFIG.STAND_TIERS[s.tier].mult} stand will be removed. You get <b class="cr">${fmt(standRefund(s))} CR</b> back (50%) and its land is freed.`, 'Demolish', () => doAct(() => actDemolishStand(id)), true);
  },
  startSolo() { const r = doAct(() => actSolo(performance.now()), true); if (r && r.ok) { UI.resultSeen = false; setPetState('thinking'); } },
  startMulti() { const r = doAct(() => actMulti(performance.now()), true); if (r && r.ok) { UI.resultSeen = false; setPetState('thinking'); } },
  override() {
    const r = activateOverride(ARENA, performance.now());
    if (!r.ok) toast(r.msg, 'err'); else setPetState('override');
  },
  humanAnswer(o) {
    const r = humanAnswer(ARENA, o, performance.now());
    if (r.ok) { toast(r.correct ? 'Correct! Human speed bonus.' : 'Wrong answer — 0 points this round.', r.correct ? '' : 'err'); setPetState(r.correct ? 'correct' : 'wrong', 900); }
  },
  resultOk() { UI.resultSeen = true; setPetState('idle'); },
  nftClick(id) {
    if (UI.selectMode) { HANDLERS.selectOne(id, true); return; }
    openNftDetail(id);
  },
  nftDetail(id) { openNftDetail(id); },
  listingDetail(id) { openNftDetail(id, true); },
  equip(id) { doAct(() => actEquip(id)); openNftDetail(id); },
  unequip(id) { doAct(() => actUnequip(id)); openNftDetail(id); },
  toggleLock(id) { doAct(() => actToggleLock(id)); openNftDetail(id); },
  upgradeCard(id) { const r = doAct(() => actUpgradeCard(id)); if (r && r.ok) openNftDetail(id); },
  evolveCard(id) {
    const c = S.inv.find(x => x.id === id); if (!c) return;
    const k = evolveCost(c);
    confirmBox('Evolve card?', `<b>${esc(cardLabel(c))}</b> becomes <b style="color:${rarityColor(c.rarity + 1)}">${rarityName(c.rarity + 1)} +0</b>: stronger base, ${CONFIG.CARDS.rarities[c.rarity + 1].bonus} bonus stat${CONFIG.CARDS.rarities[c.rarity + 1].bonus > 1 ? 's' : ''}, and it can be upgraded again.<div class="kv" style="margin-top:8px"><span>Cost</span><b class="cr">${cardCostText(k)}</b></div>`, 'Evolve', () => {
      const r = doAct(() => actEvolveCard(id), true);
      if (r && r.ok) playEvolveAnim(r.card);
    });
  },
  rerollCard(id) {
    const c = S.inv.find(x => x.id === id); if (!c) return;
    confirmBox('Reroll bonus stats?', `All random bonus stats of <b>${esc(cardLabel(c))}</b> are replaced with new ones (the fixed main stat stays). Uses 1 Neural Recalibrator — you have ${S.player.recal}.`, 'Reroll', () => { const r = doAct(() => actRerollCard(id)); if (r && r.ok) openNftDetail(id); });
  },
  salvageOne(id) {
    const n = S.inv.find(x => x.id === id); if (!n) return;
    confirmBox('Salvage card?', `${esc(cardLabel(n))} will be destroyed for <b class="shardc">${salvageValue(n)} shards</b>.`, 'Salvage', () => { doAct(() => actSalvage([id])); UI.selected = UI.selected.filter(x => x !== id); }, true);
  },
  selectOne(id, noModal) {
    if (UI.selected.includes(id)) UI.selected = UI.selected.filter(x => x !== id);
    else UI.selected.push(id);
    UI.selectMode = true;
    if (!noModal) closeModal();
  },
  toggleSelect() { UI.selectMode = !UI.selectMode; if (!UI.selectMode) UI.selected = []; },
  clearSel() { UI.selected = []; },
  selCommon() { UI.selected = S.inv.filter(c => c.rarity === 0 && !cardStatusReason(c)).map(c => c.id); toast(UI.selected.length + ' Common cards selected'); },
  salvageSelected() {
    const items = UI.selected.map(id => S.inv.find(n => n.id === id)).filter(Boolean);
    const v = items.reduce((s2, n) => s2 + salvageValue(n), 0);
    confirmBox('Salvage selected?', `${items.length} card(s) will be destroyed for <b class="shardc">${v} shards</b>.`, 'Salvage', () => { const r = doAct(() => actSalvage(UI.selected)); if (r && r.ok) UI.selected = []; }, true);
  },
  forge() {
    const r = doAct(() => actForge(UI.inputs.forgeType || CONFIG.CARDS.types[0].id), true);
    if (r && r.ok && r.card) openNftDetail(r.card.id);
  },
  // ---------- AI Lab ----------
  aiConsent() { doAct(() => actAIConsent()); },
  async aiStart() {
    const why = whyAIStart(); if (why) { toast(why, 'err'); return; }
    let qs = null, src = 'local';
    if (AI_BRIDGE.connected()) {
      UI.aiBusy = true; renderAll();
      qs = await AI_BRIDGE.fetchQuestions(CONFIG.AI_LAB.questions, S.player.name);
      UI.aiBusy = false;
      if (qs) src = 'bridge'; else toast('The AI did not answer - using offline questions', 'warn');
    }
    UI.inputs.aiAnswer = '';
    const r = doAct(() => actAIStart(qs, src), true);
    if (r && r.ok) setPetState('thinking');
    renderAll();
    setTimeout(() => { const t = document.querySelector('textarea[data-in="aiAnswer"]'); if (t) t.focus(); }, 50);
  },
  aiSend() { aiSubmit(UI.inputs.aiAnswer || ''); },
  aiSkip() { aiSubmit(''); },
  aiExport() {
    try {
      const blob = new Blob([aiExportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'cybernet-ai-answers.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Answers exported');
    } catch (e) { toast('Export failed: ' + e.message, 'err'); }
  },
  aiDelete() {
    confirmBox('Delete your AI Lab answers?', `All ${S.ai.collected.length} answers saved on this device will be deleted. Rewards you already received stay.`, 'Delete', () => { S.ai.collected = []; saveGame(); toast('Answers deleted'); }, true);
  },
  aiEndpoint() { AI_BRIDGE.setEndpoint(UI.inputs.aiEndpoint || ''); toast(AI_BRIDGE.connected() ? 'AI endpoint saved' : 'AI disconnected (offline mode)'); openSettings(); },
  listNft(id) {
    const r = doAct(() => actListCard(id, UI.inputs.sellPrice || fairValue(S.inv.find(n => n.id === id)), UI.inputs.sellVenue));
    if (r && r.ok) { UI.inputs.sellPrice = ''; closeModal(); }
  },
  cancelListing(id) { doAct(() => actCancelListing(id)); },
  buyListing(id) { const r = doAct(() => actBuyListing(id)); if (r && r.ok && UI.modalOpen) closeModal(); },
  buildMarketStand() { confirmBox('Build Marketplace Stand?', `Costs <b class="cr">${fmt(CONFIG.MARKET.standCost)} CR</b> and uses ${fmt(CONFIG.MARKET.standLand)} SU of your land, plus ${fmt(CONFIG.MARKET.standLevels[0].upkeep)} CR/h upkeep.`, 'Build', () => doAct(() => actBuildMarketStand())); },
  upgradeMarketStand() { doAct(() => actUpgradeMarketStand()); },
  demolishMarketStand() { confirmBox('Demolish Marketplace Stand?', 'You get 50% of what you invested back and the land is freed.', 'Demolish', () => doAct(() => actDemolishMarketStand()), true); },
  joinGuild(id) { doAct(() => actJoinGuild(id)); },
  createGuild() { const r = doAct(() => actCreateGuild(UI.inputs.guildName || '')); if (r && r.ok) UI.inputs.guildName = ''; },
  leaveGuild() { confirmBox('Leave guild?', 'Your contributions stay with the guild and you must wait 24 h (game time) before joining another.', 'Leave', () => doAct(() => actLeaveGuild()), true); },
  donate() { const r = doAct(() => actDonate(Number(UI.inputs.donate))); if (r && r.ok) UI.inputs.donate = ''; },
  upgradeHQ() { doAct(() => actUpgradeHQ()); },
  buyCosmetic(id) { doAct(() => actBuyCosmetic(id)); },
  useCosmetic(id) { doAct(() => actUseCosmetic(id)); UI.lastHtml = {}; Art.clear(); },
  explore(i) {
    const r = doAct(() => actExplore(i), true);
    if (r && r.ok) toast('Sector #' + (i + 1) + ': ' + r.msg, r.kind === 'nft' || r.kind === 'jackpot' ? 'warn' : '');
  },
  exploreAll() { doAct(() => actExploreAll()); },
  tilePage(p) { UI.tilePage = p; },
  claimMission(i) { doAct(() => actClaimMission(i)); },
  rebirth() {
    confirmBox('Neural Rebirth?', `Your pet stats, stands and rating reset. You gain <b class="good">+${legacyGain()} Legacy</b> (permanent bonus). NFTs, land, CR, guild and cosmetics are kept.`, 'Rebirth', () => doAct(() => actRebirth()), true);
  },
  rename() {
    openModal(modalHead('Rename your AI') + `<div class="field"><input type="text" maxlength="16" data-in="name" value="${esc(S.player.name)}">${btn('Save', 'saveName', undefined, '', 'primary')}</div>`);
  },
  saveName() { const r = doAct(() => actSetName(UI.inputs.name || S.player.name)); if (r && r.ok) closeModal(); },
  openSettings() { openSettings(); },
  exportSave() {
    const ta = document.getElementById('savebox');
    if (ta) { ta.value = exportSave(); ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Save copied to clipboard'); } catch (e) { toast('Select and copy the text'); } }
  },
  importSave() {
    const ta = document.getElementById('savebox');
    try { const st = importSave(ta.value); S = st; ARENA = null; saveGame(); closeModal(); UI.lastHtml = {}; renderLogShell(); toast('Save imported'); }
    catch (e) { toast('Invalid save: ' + e.message, 'err'); }
  },
  resetGame() {
    confirmBox('Reset the game?', 'This deletes your progress on this device. Export your save first if you want to keep it.', 'Yes, continue', () => {
      confirmBox('Are you absolutely sure?', '<b class="bad">Everything will be lost.</b>', 'DELETE EVERYTHING', () => { wipeSave(); S = newState(); ARENA = null; saveGame(); UI.lastHtml = {}; UI.lastResult = null; renderLogShell(); log('SYSTEM', 'New game started.'); showTutorial(0); }, true);
    }, true);
  },
  tutorial(step) { showTutorial(step); },
  logoTap() { UI.logoTaps = (UI.logoTaps || 0) + 1; clearTimeout(UI.logoTimer); UI.logoTimer = setTimeout(() => UI.logoTaps = 0, 1500); if (UI.logoTaps >= 5) { UI.logoTaps = 0; openDebug(); } },
  // debug
  dbgSpeed(x) { UI.speed = x; openDebug(); },
  dbgAdd(k) {
    const p = S.player;
    if (k === 'cr') addCR(100000, 'debug'); if (k === 'dt') p.dt += 100; if (k === 'land') p.land += 1000; if (k === 'shards') addShards(500);
    if (k === 'nft') for (const t of CONFIG.CARDS.types) giveCard(mintCard({ type: t.id, rarity: 2 }), 'debug');
    if (k === 'nftrand') for (let i = 0; i < 10; i++) giveCard(mintCard({}), 'debug');
    if (k === 'unique') giveCard(mintCard({ rarity: CONFIG.CARDS.UNIQUE }), 'debug');
    if (k === 'energy') S.ai.energy = CONFIG.AI_LAB.energyWonCap;
    if (k === 'recal') p.recal += 5;
    if (k === 'live') { if (typeof LiveQuiz !== 'undefined') LiveQuiz.refresh(true).then(() => toast('Live quiz: ' + LiveQuiz.pool.length + ' questions')); }
    if (k === 'rating') { p.rating += 100; updatePlayerLeague(); }
    if (k === 'crit') { S.server.botLand = Math.max(S.server.botLand, Math.ceil(S.server.total * 0.51) - (usedSpace() - S.server.botLand)); checkServerCapacity(); }
    if (k === 'season') { S.season.start = S.time - CONFIG.SEASON.lengthMs; }
    if (k === 'hour') simulate(CONFIG.HOUR);
    if (k === 'stamina') p.stamina = CONFIG.SOLO.staminaMax;
    saveGame(); openDebug();
  },
  dbgTests() {
    const box = document.getElementById('dbgtests');
    if (box) box.innerHTML = '<div class="dim">Running…</div>';
    setTimeout(() => {
      const res = runSelfTests({ quick: false });
      if (box) box.innerHTML = res.map(r => `<div class="${r.pass ? 'good' : 'bad'} small">${r.pass ? 'PASS' : 'FAIL'} — ${esc(r.name)} <span class="dim">(${r.ms} ms) ${esc(r.msg)}</span></div>`).join('');
      UI.lastHtml = {}; renderAll();
    }, 30);
  },
};
function aiSubmit(text) {
  const r = aiAnswer(text);
  if (!r.ok) return;
  UI.inputs.aiAnswer = '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // let the panel re-render
  if (r.last) {
    const res = doAct(() => actAIFinish(), true);
    if (res && res.ok) {
      toast(res.unique ? 'UNIQUE CARD! Your AI thanks you.' : `Lesson complete: ${res.useful} useful answers`, res.unique ? 'warn' : '');
      setPetState('correct', 1500);
      if (AI_BRIDGE.connected() && AILAB && AILAB.batch) AI_BRIDGE.submitAnswers(S.player.name, AILAB.batch).then(sent => { if (!sent) toast('Could not reach the AI - answers kept on this device', 'warn'); });
    }
  }
  renderAll();
  setTimeout(() => { const t = document.querySelector('textarea[data-in="aiAnswer"]'); if (t) t.focus(); }, 30);
}
function renderLogShell() {
  const w = document.querySelector('#logwrap .panel');
  w.innerHTML = htmlLogShell();
  renderLog(true);
}

function openSettings() {
  openModal(modalHead('Settings') + `<div class="col">
    <div class="card"><h4>Save</h4><div class="small dim">Autosaves every ${CONFIG.AUTOSAVE_MS / 1000}s on this device${storageOk() ? '' : ' — <b class="bad">storage unavailable, progress will not be kept</b>'}. Export to move your game to another device.</div>
      <textarea id="savebox" rows="4" placeholder="Paste a save here to import" style="margin-top:8px"></textarea>
      <div class="row" style="margin-top:6px">${btn('Export', 'exportSave', undefined, '', 'accent')}${btn('Import', 'importSave')}${btn('Tutorial', 'tutorial', 0)}${btn('Developer tools', 'dbgOpen')}</div></div>
    <div class="card"><h4>AI Lab</h4><div class="small dim">${S.ai.collected.length} answers saved on this device. AI connection: ${AI_BRIDGE.connected() ? '<b class="good">' + esc(AI_BRIDGE.endpoint) + '</b>' : '<b class="warn">offline</b>'}</div>
      <div class="field" style="margin-top:6px"><input type="text" placeholder="AI address, e.g. http://localhost:8765 (empty = offline)" data-in="aiEndpoint" value="${esc(UI.inputs.aiEndpoint !== undefined ? UI.inputs.aiEndpoint : AI_BRIDGE.endpoint)}">${btn('Save', 'aiEndpoint', undefined, '', 'sm')}</div>
      <div class="row" style="margin-top:6px">${btn('Export my answers', 'aiExport', undefined, S.ai.collected.length ? '' : 'No answers yet', 'sm')}${btn('Delete my AI Lab answers', 'aiDelete', undefined, S.ai.collected.length ? '' : 'No answers yet', 'sm danger')}</div></div>
    <div class="card"><h4>Game</h4><div class="kv"><span>Game time</span><b>${gameClock(S.time)}</b><span>Seed</span><b>${S.seed}</b><span>Version</span><b>${CONFIG.VERSION}</b></div>
      <div class="row" style="margin-top:8px">${btn('Reset game', 'resetGame', undefined, '', 'danger')}</div></div></div>`);
}
HANDLERS.dbgOpen = () => openDebug();
function openDebug() {
  UI.debug = true;
  const e = S.econ;
  const infl = e.lastHour.burned ? (e.lastHour.minted / e.lastHour.burned).toFixed(2) : '∞';
  openModal(modalHead('Debug panel') + `<div class="col">
    <div class="row"><span class="small">Time speed:</span>${[1, 10, 100].map(x => `<button class="chip ${UI.speed === x ? 'on' : ''}" data-act="dbgSpeed" data-args="${x}">x${x}</button>`).join('')}${btn('+1 hour', 'dbgAdd', 'hour', '', 'sm')}</div>
    <div class="row">${[['cr', '+100K CR'], ['dt', '+100 DT'], ['land', '+1000 SU'], ['shards', '+500 shards'], ['nft', '+Rare rig (4 types)'], ['nftrand', '+10 cards'], ['unique', '+1 Unique'], ['recal', '+5 Recalibrators'], ['energy', 'AI energy max'], ['live', 'Refresh live quiz'], ['rating', '+100 rating'], ['stamina', 'Full stamina'], ['crit', 'Force critical'], ['season', 'End season']].map(([k, l]) => btn(l, 'dbgAdd', k, '', 'sm')).join('')}</div>
    <div class="card"><h4>Economy</h4><div class="kv"><span>CR minted total</span><b>${fmt(e.minted)}</b><span>CR burned total</span><b>${fmt(e.burned)}</b><span>Last hour minted / burned</span><b>${fmt(e.lastHour.minted)} / ${fmt(e.lastHour.burned)}</b><span>Inflation indicator (minted/burned)</span><b class="${infl > 2 ? 'warn' : 'good'}">${infl}</b><span>Art cache</span><b>${Art.cacheSize()}</b><span>Bot listings</span><b>${S.market.listings.length}</b></div></div>
    <div class="card"><div class="row between"><h4 style="margin:0">Self-tests</h4>${btn('Run tests', 'dbgTests', undefined, '', 'sm primary')}</div><div id="dbgtests" style="margin-top:6px"></div></div></div>`, true);
}

// ---------- tutorial ----------
const TUTORIAL = [
  ['Welcome to CyberNet', `You run a tiny <b>AI pet</b> in a simulated cyberpunk network full of other players. Spend <b class="dtc">Data Tokens</b> (DT) to train its <b>Math IQ</b>, <b>Trivia DB</b> and <b>Processing speed</b>. DT refill by +1 every 30 s (stock up to 50 — log in regularly!).`],
  ['Stands & land', `Build <b>Training Stands</b> (x2 → x10) on your <b class="landc">land</b> to multiply training. Stands cost CR and hourly upkeep; higher tiers need higher leagues. Land comes from the <b>Global Server</b> — its price rises as space fills up.`],
  ['The Arena', `<b>Solo</b>: your AI vs the clock, 3 lives, 10 rounds. <b>Multiplayer</b>: pay an entry fee, compete live, the prize pool is split by score. Hit <b style="color:var(--c)">HUMAN OVERRIDE</b> (2 per match) to answer a question yourself — fast and right = max points. Win rating to climb leagues.`],
  ['Cards', `Top finishes drop <b>cards</b> of 4 types: <b>Core</b>, <b>Virtual Memory</b>, <b>Hardware</b> and <b>Cooler</b>, each drawn from its own DNA. Equip one of each for a set bonus — but Core and Hardware heat up the rig, so you need a good Cooler. <b>Upgrade</b> a card from +0 to +4 with CR and shards, then <b>evolve</b> it: Common → Uncommon → Rare → Epic → Legendary.`],
  ['The AI Lab', `In the <b>AI Lab</b> your AI asks you questions in Romanian and learns from your answers. Every lesson gives a <b>Neural Recalibrator</b> (reroll a card's bonus stats), CR, shards, a card chance and a small chance at a <b style="color:#ffe14d">UNIQUE</b> card. Energy refills +1 per hour; quiz wins give extra.`],
  ['Guilds, market & the server', `Join a <b>guild</b>: it earns a 10% bonus from members' winnings to build an HQ and unlock styles. Trade NFTs on the <b>market</b> or open your own stand for commissions. When the Global Server drops below 50% free space, heavy building freezes and the net expands. Good luck, operator.`],
];
function showTutorial(step) {
  if (step >= TUTORIAL.length) { S.tutorialStep = TUTORIAL.length; saveGame(); closeModal(); return; }
  const [t, b] = TUTORIAL[step];
  openModal(modalHead(`${step + 1}/${TUTORIAL.length} · ${t}`) + `<div style="line-height:1.6">${b}</div><div class="row" style="justify-content:flex-end;margin-top:14px">${btn('Skip', 'tutorial', TUTORIAL.length)}${btn(step === TUTORIAL.length - 1 ? 'Start playing' : 'Next', 'tutorial', step + 1, '', 'primary')}</div>`);
}

function showAwaySummary(before, ms) {
  const g = playerGuild();
  const d = (a, b) => b - a;
  const rows = [
    ['Time simulated', fmtTime(ms)],
    ['Credits', `${d(before.cr, S.player.cr) >= 0 ? '+' : ''}${fmt(d(before.cr, S.player.cr))} CR`],
    ['Data Tokens', `+${Math.max(0, d(before.dt, S.player.dt))} DT`],
    ['Cards sold', d(before.sold, counter('cardSold') + counter('nftSold'))],
    ['Stand commissions', `+${fmt(d(before.comm, S.market.standEarned))} CR`],
    ['Server expansions', d(before.exp, S.server.expansions)],
  ];
  if (g && before.vault !== null) rows.push(['Guild vault', `+${fmt(d(before.vault, g.vault))} GV`]);
  openModal(modalHead('While you were away') + `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
    <div class="tiny dim" style="margin-top:8px">Offline progress is capped at ${CONFIG.OFFLINE_CAP_HOURS} hours: passive income, upkeep, DT trickle and the rest of the world keep going; tournaments don't.</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px">${btn('Continue', 'closeModal', undefined, '', 'primary')}</div>`);
}

function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) { if (e.target.id === 'modal') closeModal(); return; }
    if (el.dataset.reason) { toast(el.dataset.reason, 'warn'); return; }
    const act = el.dataset.act;
    const h = HANDLERS[act];
    if (!h) return;
    let args;
    try { args = el.dataset.args !== undefined ? JSON.parse(el.dataset.args) : undefined; } catch (err) { args = el.dataset.args; }
    e.preventDefault();
    h(args);
    if (act !== 'closeModal' && act !== 'noop') renderAll();
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.in) UI.inputs[el.dataset.in] = el.value;
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.in) { UI.inputs[el.dataset.in] = el.value; el.blur(); renderAll(); }
    if (el.dataset.filter) {
      const [grp, key] = el.dataset.filter.split('.');
      (grp === 'mk' ? UI.mkFilter : UI.nftFilter)[key] = el.value;
      el.blur();
      renderAll();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && UI.modalOpen) closeModal();
    if (e.key === '`' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) openDebug();
    if (e.key === 'Enter' && document.activeElement && document.activeElement.dataset.in === 'donate') HANDLERS.donate();
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement && document.activeElement.dataset.in === 'aiAnswer') { e.preventDefault(); HANDLERS.aiSend(); }
  });
  onLog = appendLog;
}
