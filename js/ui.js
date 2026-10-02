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
  return `Z${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function affixText(a) { return statText(a); }
function cardCostText(k) { return `${fmt(k.cr)} CR · ${nRo(k.shards, 'fragment', 'fragmente')}`; }
// Romanian count + noun: "1 carte", "5 cărți", "20 de cărți"
function nRo(n, one, many) {
  const a = Math.abs(Math.round(Number(n) || 0));
  if (a === 1) return n + ' ' + one;
  const t = a % 100;
  return n + (a >= 20 && (t === 0 || t >= 20) ? ' de ' : ' ') + many;
}
const LOG_TAG_RO = { TRADE: 'COMERȚ', GUILD: 'BRESLE', SERVER: 'SERVER', ARENA: 'ARENĂ', SYSTEM: 'SISTEM' };
function serverStateRo(st) { return st === 'CRITICAL' ? 'CRITIC' : st === 'NORMAL' ? 'NORMAL' : st; }

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
function modalHead(title) { return `<div class="modal-head"><h2>${title}</h2><button class="iconbtn" data-act="closeModal" aria-label="Închide">✕</button></div>`; }
function confirmBox(title, body, yesLabel, cb, danger) {
  UI.confirmCb = cb;
  openModal(modalHead(title) + `<div>${body}</div><div class="row" style="margin-top:14px;justify-content:flex-end">${btn('Anulează', 'closeModal')}${btn(yesLabel || 'Confirmă', 'confirmYes', undefined, '', danger ? 'danger' : 'primary')}</div>`);
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
  const showNet = isUnlocked('land'), showLand = isUnlocked('stands') || showNet, showLeague = isUnlocked('multi');
  return `<div class="logo" data-act="logoTap">CYBER<span>NET</span><small>AI ACADEMY</small></div>
  ${showNet ? `<div class="netbar">
    <span class="dim">REȚEA GLOBALĂ</span>
    <div class="meter" title="Folosit ${fmt(used)} / ${fmt(sv.total)} SU"><i class="${ratio > 0.45 ? 'hot' : ''}" style="width:${(ratio * 100).toFixed(1)}%"></i><span class="mark" style="left:${CONFIG.SERVER.criticalRatio * 100}%"></span></div>
    <span>${fmt(used)}/${fmt(sv.total)} SU</span>
    <span class="dim">liber <b class="${ratio > 0.45 ? 'warn' : 'good'}">${fmtPct((1 - ratio) * 100)}</b></span>
    <span class="dim">teren <b class="cr">${landPrice()}</b> CR/SU</span>
    <span class="dim">extinderi <b>${sv.expansions}</b></span>
    <span class="state ${crit ? 'crit blink' : 'ok'}">${crit ? 'CRITIC' : 'NORMAL'}</span>
  </div>` : '<div class="netbar"></div>'}
  <div class="wallet">
    <span class="pill cr" title="Credite">${ic('cr')}<b>${fmt(p.cr)}</b></span>
    <span class="pill dtc" title="Tokeni de date">${ic('dt')}<b>${p.dt}</b><span class="dim tiny">/${CONFIG.DT.stockCap}</span></span>
    ${showLand ? `<span class="pill landc" title="Terenul tău: liber / deținut">${ic('land')}<b>${fmt(landFree())}</b><span class="dim tiny">/${fmt(p.land)}</span></span>` : ''}
    <span class="pill shardc" title="Fragmente">${ic('shard')}<b>${fmt(p.shards)}</b></span>
    ${showLeague ? `<span class="pill league-pill" style="color:${L.color};border-color:${L.color}" title="Ligă și rating">${ic('rating')}${L.name} <span class="dim">${p.rating}</span></span>` : ''}
    ${CLOUD.enabled() ? `<button class="pill acct-pill ${CLOUD.loggedIn() ? (CLOUD.status === 'conflict' || CLOUD.status === 'error' ? 'warn' : 'good') : ''}" data-act="openAccount" title="Cont cloud">☁ ${CLOUD.loggedIn() ? esc(CLOUD.acct.user) + (CLOUD.status === 'conflict' ? ' !' : '') : 'Conectare'}</button>` : ''}
    <button class="iconbtn" data-act="openSettings" aria-label="Setări">${GEAR}</button>
  </div>`;
}
function htmlCritical() {
  const sv = S.server;
  if (sv.state !== 'CRITICAL' || UI.critDismissed || !isUnlocked('land')) return '';
  return `<span class="dot blink"></span><span>CAPACITATE SERVER CRITICĂ — infrastructura grea este înghețată ${cd(sv.freezeUntil)} — spațiul global se va extinde cu +50%</span><button class="iconbtn right" style="width:30px;height:30px" data-act="dismissCrit" aria-label="Închide">✕</button>`;
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
      <span class="row">${btn('Antrenează ×1', 'train', { stat: key, n: 1 }, r1, 'sm')}${btn('×10', 'train', { stat: key, n: 10 }, r10, 'sm accent')}</span></div></div>`;
  };
  const capBar = v => `<div class="capbar" title="Plafon ${fmt(cap)}: antrenamentul încetinește după ce îl depășești"><i class="${v > cap ? 'over' : ''}" style="width:${Math.min(100, v / cap * 100).toFixed(1)}%"></i></div>`;
  const msBase = petBaseMs(), ms = petMs();
  const speedBar = `<div class="capbar" title="Minim ${CONFIG.PET.speedFloorMs} ms"><i style="width:${(100 - (ms - CONFIG.PET.speedFloorMs) / (CONFIG.PET.speedStartMs - CONFIG.PET.speedFloorMs) * 100).toFixed(1)}%"></i></div>`;
  const chips = [`<button class="chip ${!sel ? 'on' : ''}" data-act="standSel" data-args='""'>Fără stand x1</button>`]
    .concat(S.stands.map((s, i) => `<button class="chip ${sel === s.id ? 'on' : ''}" data-act="standSel" data-args="${esc(JSON.stringify(s.id))}">Stand ${i + 1} x${S.econ.offline ? '1 (offline)' : CONFIG.STAND_TIERS[s.tier].mult}</button>`)).join('');
  const dtBuy = [1, 10, 50].map(n => btn(`+${n} <span class="cost">${fmt(dtPriceFor(n))} CR</span>`, 'buyDT', n, whyBuyDT(n), 'sm')).join('');
  const nextDT = p.dt >= CONFIG.DT.stockCap ? '<span class="warn">stoc plin</span>' : `+1 în ${cd(S.time + (CONFIG.DT.trickleEveryMs - p.dtAcc) / (1 + b.eff.dt / 100 + guildPerk() / 100))}`;
  const stands = S.stands.map((s, i) => {
    const T = CONFIG.STAND_TIERS[s.tier], nx = CONFIG.STAND_TIERS[s.tier + 1];
    const up = nx ? btn(`Îmbunătățește x${nx.mult} <span class="cost">${fmt(nx.cost)} CR · ${nx.land} SU</span>`, 'upgradeStand', s.id, whyUpgradeStand(s.id), 'sm') : '<span class="good small">NIVEL MAXIM</span>';
    return `<div class="stand ${S.econ.offline ? 'offline' : ''}"><div class="mult">x${T.mult}</div>
      <div class="small"><b>Stand ${i + 1}</b> <span class="dim">· ${T.land} SU · ${T.upkeep} CR/h</span>${S.econ.offline ? '<div class="bad tiny">OFFLINE – întreținere neplătită</div>' : ''}</div>
      <button class="btn sm danger" data-act="demolishStand" data-args="${esc(JSON.stringify(s.id))}" title="Demolează (rambursare 50%)">✕</button>
      <div style="grid-column:1/-1" class="row">${up}</div></div>`;
  }).join('');
  const t0 = CONFIG.STAND_TIERS[0];
  const upk = upkeepPerHour(), inc = S.econ.lastHour.minted;
  return `<h2>${ic('pet')} Baza de antrenament AI</h2>
  <div id="petstage" class="pet-stage ${UI.petState}">${Art.pet(lv.level, colors)}</div>
  <div class="row between"><button class="btn sm" data-act="rename" title="Redenumește">${esc(p.name)} ${p.cosmetics.badge !== 'badge_none' ? Art.badge(p.cosmetics.badge, 16) : ''}</button><span class="dim small">Nivel AI <b class="good">${lv.level}</b>${p.legacy ? ` · Moștenire ${p.legacy}` : ''}</span></div>
  <div class="xp" title="Progres spre nivelul următor" style="margin:6px 0 4px"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div>
  <div class="tiny ns-hint">Un AI antrenat îți dă sugestii mai bune la <b>🤖 Întreabă AI-ul</b> și joacă singur în Arena Solo.</div>
  <div class="tiny dim">Plafon în liga ${leagueName(p.league)}: <b>${fmt(cap)}</b> — urcă în ligi superioare ca să-l crești.</div>
  ${stat('math', 'IQ matematic', 'math', p.math, fmt(p.math), capBar(p.math))}
  ${stat('trivia', 'Bază de cunoștințe', 'trivia', p.trivia, fmt(p.trivia), capBar(p.trivia))}
  ${stat('speed', 'Procesare', 'speed', p.speedPoints, `${ms} ms`, speedBar + `<div class="tiny dim">bază ${Math.round(msBase)} ms · minim ${CONFIG.PET.speedFloorMs} ms${b.eff.speed > 0 ? ` · cărți −${b.eff.speed.toFixed(1)}%` : ''}</div>`)}
  ${S.stands.length ? `<h4 style="margin-top:10px">Antrenează pe</h4><div class="row">${chips}</div>` : ''}
  <div class="sep"></div>
  <div class="row between"><span>${ic('dt')} <b class="dtc">${p.dt}</b><span class="dim">/${CONFIG.DT.stockCap} DT</span></span><span class="small dim">${nextDT}</span></div>
  <div class="row" style="margin-top:6px"><span class="small dim">Cumpără DT:</span>${dtBuy}</div>
  <div class="tiny mute">Prețul crește cu 1% pentru fiecare DT cumpărat în ultimele 24 h (cumpărați: ${dtRecentBought()}).</div>
  <div class="sep"></div>
  ${isUnlocked('stands') ? `<div id="stands"></div><h3>${ic('land')} Standuri de antrenament (${S.stands.length}/${CONFIG.MAX_STANDS})</h3>
  ${stands || '<div class="empty">Încă nu ai standuri. Un stand multiplică antrenamentul per DT.</div>'}
  ${S.stands.length < CONFIG.MAX_STANDS ? btn(`Construiește stand x2 <span class="cost">${fmt(t0.cost)} CR · ${t0.land} SU teren</span>`, 'buildStand', undefined, whyBuildStand(), 'block primary') : ''}
  <div class="sep"></div>
  <h3>Economie</h3>
  <div class="kv"><span>Venit (ultima oră)</span><b class="cr">${fmt(inc)} CR</b><span>Întreținere</span><b class="${upk ? 'bad' : ''}">−${fmt(upk)} CR/h</b>
  <span>CR emise / arse (ultima oră)</span><b>${fmt(S.econ.lastHour.minted)} / ${fmt(S.econ.lastHour.burned)}</b></div>
  ${S.econ.offline ? `<div class="bad small" style="margin-top:6px">${ic('alert')} Structuri OFFLINE — datoria de ${fmt(S.econ.debt)} CR se plătește automat din următorul venit.</div>` : ''}
  ${upk > 0 && p.cr < upk * 2 ? `<div class="warn small" style="margin-top:6px">${ic('alert')} CR puține: ți-au rămas mai puțin de 2 ore de întreținere.</div>` : ''}` : lockLine('stands')}`;
}
// a locked section: dimmed, one line, explains when it opens
function lockLine(id) {
  const f = featureById(id);
  return `<div class="lockline" data-act="noop" data-reason="${esc(lockReason(id))}" title="${esc(lockReason(id))}">🔒 <b>${esc(f.name)}</b> <span class="dim">— după ${unlockAt(id)} jocuri</span></div>`;
}
// tab button that respects progressive unlocking
function tabBtn(group, id, label, icn, feature, extra) {
  if (feature && !isUnlocked(feature)) {
    return `<button class="tab locked" data-act="noop" data-reason="${esc(lockReason(feature))}" title="${esc(lockReason(feature))}" aria-disabled="true"><span>${ic(icn)} ${label}</span><span class="lockhint">🔒 după ${unlockAt(feature)} jocuri</span></button>`;
  }
  const on = (group === 'center' ? UI.centerTab : UI.rightTab) === id;
  return `<button class="tab ${on ? 'on' : ''}" data-act="${group}Tab" data-args='"${id}"'>${ic(icn)} ${label}${extra || ''}</button>`;
}
const CENTER_FEATURE = { arena: null, ai: 'ai', market: 'market', land: 'land', season: 'season' };
const RIGHT_FEATURE = { cards: null, album: 'album', guild: 'guild' };

// ============================================================
// CENTER — tabs
// ============================================================
function htmlCenter() {
  const tabs = [['arena', 'Arenă', 'arena'], ['ai', 'Laborator AI', 'ai'], ['market', 'Piață', 'market'], ['land', 'Teren', 'land'], ['season', 'Sezon', 'season']];
  if (CENTER_FEATURE[UI.centerTab] && !isUnlocked(CENTER_FEATURE[UI.centerTab])) UI.centerTab = 'arena';
  const unclaimed = S.missions.list.filter(m => m.progress >= m.target && !m.claimed).length;
  const t = tabs.map(([id, label, icn]) => tabBtn('center', id, label, icn, CENTER_FEATURE[id], `${id === 'season' && unclaimed ? ` <span class="badge-n">${unclaimed}</span>` : ''}${id === 'arena' && arenaBusy() ? ' <span class="dot blink" style="width:7px;height:7px"></span>' : ''}${id === 'ai' && S.ai.energy > 0 ? ` <span class="badge-n">${S.ai.energy}</span>` : ''}${id === 'arena' && !dailyInfo(todayStr()).claimed ? ' <span class="badge-n">!</span>' : ''}`)).join('');
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
  const regen = p.stamina < CONFIG.SOLO.staminaMax ? `+1 în ${cd(S.time + CONFIG.SOLO.staminaRegenMs - p.staminaAcc)}` : 'plină';
  const pool = (n) => L.fee * n + L.house;
  const dly = dailyInfo(todayStr()), I = CONFIG.INCOME;
  const multiOn = isUnlocked('multi');
  const daily = dly.claimed
    ? `<div class="small"><b class="good">Bonus zilnic revendicat</b> · ${nRo(dly.streak, 'zi', 'zile')} la rând · revino mâine pentru ziua ${dly.streak + 1}</div>`
    : `<div class="row between"><div class="small"><b class="warn">BONUS ZILNIC</b> · ziua ${dly.streak}${dly.streak > 1 ? ' la rând' : ''}<div class="tiny dim">Revino în fiecare zi: recompensele cresc timp de 7 zile, apoi ciclul se reia.</div></div>${btn(`Revendică +${fmt(dly.cr)} CR · +${dly.dt} DT${dly.shards ? ' · +' + nRo(dly.shards, 'fragment', 'fragmente') : ''}`, 'claimDaily', undefined, '', 'primary')}</div>`;
  const rescue = multiOn && S.player.cr < multiFee() ? `<div class="card hl" style="margin-top:10px"><div class="row between"><div class="small"><b class="warn">Rămâi fără credite?</b><div class="tiny dim">Credite de urgență când nu poți plăti taxa de Multiplayer (o dată la ${I.rescueCooldownMs / 3600000} h).</div></div>${btn(`Primește +${fmt(rescueAmount())} CR`, 'rescue', undefined, whyRescue(), 'accent')}</div></div>` : '';
  const practice = multiOn ? `<div class="card" style="margin-top:10px"><div class="row between"><div class="small"><b>Antrenament liber</b> — răspunzi tu la ${I.practiceQuestions} întrebări<div class="tiny dim">Fără stamina, fără taxă: +${fmt(I.practiceCRPerCorrect * L.reward)} CR per răspuns corect · o dată la ${I.practiceCooldownMs / 60000} min</div></div>${btn('Antrenament', 'startPractice', undefined, whyPractice(), 'accent')}</div></div>` : '';
  const solo = `<div class="card"><h3>Arenă Solo</h3><div class="small dim">AI-ul tău răspunde singur, contra cronometrului. ${CONFIG.SOLO.rounds} runde, ${CONFIG.SOLO.lives} vieți. Greșit sau timp expirat = −1 viață.</div>
      <div class="kv" style="margin:8px 0"><span>Recompensă victorie</span><b class="cr">${fmt(CONFIG.SOLO.winCR * L.reward * crMultiplier())} CR + ${CONFIG.SOLO.winDT} DT</b><span>Eșec</span><b>${CONFIG.SOLO.failCRPerCorrect} CR / răspuns corect</b><span>Perfect 10/10</span><b>${Math.round(dropChance(CONFIG.SOLO.cardDropPerfect) * 100)}% șansă de carte</b>${isUnlocked('ai') ? `<span>Laborator AI</span><b>+${CONFIG.AI_LAB.winEnergySolo} energie per victorie</b>` : ''}<span>Stamina</span><span class="stamina">${stam} <span class="tiny dim">${regen}</span></span></div>
      ${btn('Pornește Solo', 'startSolo', undefined, whySolo(), 'block primary big')}</div>`;
  const multi = multiOn ? `<div class="card"><h3>Arenă Multiplayer</h3><div class="small dim">${CONFIG.MULTI.minBots + 1}-${CONFIG.MULTI.maxBots + 1} jucători cu rating apropiat. Premiile se împart după scor (precizie + viteză). ${CONFIG.MULTI.overrides} Intervenții umane.</div>
      <div class="kv" style="margin:8px 0"><span>Taxă de intrare</span><b class="cr">${fmt(L.fee)} CR</b><span>Fond de premii</span><b class="cr">${fmt(pool(CONFIG.MULTI.minBots + 1))}–${fmt(pool(CONFIG.MULTI.maxBots + 1))} CR</b><span>Șansă carte loc 1/2/3</span><b>${CONFIG.MULTI.drop.map(d => Math.round(dropChance(d) * 100) + '%').join(' / ')}</b>${isUnlocked('ai') ? `<span>Laborator AI</span><b>+${CONFIG.AI_LAB.winEnergyMulti} energie pentru top 3</b>` : ''}</div>
      ${btn('Caută meci', 'startMulti', undefined, whyMulti(), 'block primary big')}</div>`
    : `<div class="card locked-card" data-act="noop" data-reason="${esc(lockReason('multi'))}" title="${esc(lockReason('multi'))}"><h3>🔒 Arenă Multiplayer</h3><div class="small dim">Concurezi live cu alți jucători pentru un fond de premii.</div><div class="small" style="margin-top:8px">Se deblochează <b>după ${unlockAt('multi')} jocuri</b> <span class="dim">(ai jucat ${gamesPlayed()})</span></div></div>`;
  return `${htmlNextStep()}${htmlPlayHero()}
  <div class="card ${dly.claimed ? '' : 'hl'}" style="margin-top:10px">${daily}</div>
  ${rescue}
  <div class="cards" style="margin-top:10px">${solo}${multi}</div>
  ${practice}
  ${multiOn ? `<div class="card league-card" style="margin-top:10px"><div class="league-emblem" style="color:${L.color};border-color:${L.color}">${L.name[0]}</div>
    <div class="grow"><div class="row between"><b style="color:${L.color}">LIGA ${L.name.toUpperCase()}</b><span>Rating <b>${p.rating}</b></span></div>
    ${nx ? `<div class="xp" style="margin:6px 0"><i style="width:${(prog * 100).toFixed(0)}%"></i></div><div class="tiny dim">încă ${nx.min - p.rating > 0 ? nx.min - p.rating : 0} rating până la ${nx.name} · dificultate întrebări ${L.diff[0]}-${L.diff[1]} · runde de ${L.roundMs / 1000} s</div>` : '<div class="tiny good">Ai atins liga supremă — Renașterea neurală e disponibilă în fila Sezon.</div>'}</div></div>` : ''}
  ${isUnlocked('season') ? `<div class="card" style="margin-top:10px"><div class="row between"><b class="warn">EVENIMENT: ${ev.name}</b><span class="tiny dim">se termină în ${cd(S.time + ev.endsIn)}</span></div><div class="small dim">${ev.desc}${ev.id === 'double_drops' ? ' — în prim-plan: ' + ev.featured.name : ''}</div></div>` : ''}
  ${UI.lastResult ? `<div class="card" style="margin-top:10px"><h4>Ultimul joc</h4><div class="small">${UI.lastResult}</div></div>` : ''}
  ${multiOn ? `<div class="card" style="margin-top:10px"><h4>Pradă aleatorie</h4><div class="small dim">Fiecare răspuns corect al AI-ului în Arenă are ${Math.round(CONFIG.LOOT.perCorrect * 100)}% șanse să găsească un <b class="warn">Cache de date</b> (DT, CR sau fragmente). După fiecare meci: ${Math.round(CONFIG.LOOT.crateSolo * 100)}% (Solo) / ${Math.round(CONFIG.LOOT.crateMulti * 100)}% (Multiplayer) șanse pentru o <b class="warn">Ladă de pradă</b>, +${Math.round(CONFIG.LOOT.crateWinBonus * 100)}% dacă câștigi sau termini în top 3 — poate conține DT, CR, fragmente, stamina sau o carte.</div></div>
  <div class="tiny mute" style="margin-top:10px">Sfat: în Multiplayer, apasă INTERVENȚIE UMANĂ înainte să răspundă AI-ul ca să răspunzi tu — rapid și corect înseamnă punctaj maxim, greșit înseamnă zero.</div>` : ''}`;
}
// ---------- „Următorul pas” + butoanele mari de joc ----------
function htmlNextStep() {
  const n = nextStep();
  return `<div class="nextstep"><span class="ns-label">URMĂTORUL PAS</span><span class="ns-text">${esc(n.text)}</span>${btn(n.label, n.act === 'equip' ? 'nsEquip' : n.act, n.args, n.why || '', 'primary sm ns-btn')}</div>`;
}
function htmlPlayHero() {
  const why = whyQuick(), d = quickDay(), sq = S.quick;
  const a = why ? ` data-reason="${esc(why)}" title="${esc(why)}" aria-disabled="true"` : '';
  return `<div class="hero">
    <button type="button" class="btn hero-play ${why ? 'is-disabled' : ''}" data-act="startQuick"${a}><span>▶ Joacă acum — Quiz Rapid</span><small>${CONFIG.QUICK.questions} întrebări · tu răspunzi · combo până la ×${CONFIG.QUICK.combo[CONFIG.QUICK.combo.length - 1]}</small></button>
    <button type="button" class="btn hero-surv ${why ? 'is-disabled' : ''}" data-act="startSurvival"${a}><span>♥ Supraviețuire</span><small>${sq.survBest ? 'Record: ' + sq.survBest : '3 vieți · tot mai greu'}</small></button>
  </div>
  <div class="hero-sub tiny"><span class="${d.full ? 'dim' : 'warn'}">Jocuri cu recompensă întreagă azi: <b>${d.used}/${d.limit}</b>${d.full ? '' : ' — acum primești 25%'}</span>${sq.best ? `<span class="dim">Record Quiz Rapid: <b class="good">${fmt(sq.best)}</b></span>` : ''}</div>`;
}
function htmlUnlocked(list) {
  return list.map(f => `<div class="unlock-line"><span>🔓</span><div class="grow small"><b class="good">Nou deblocat: ${esc(f.name)}</b><div class="tiny dim">${esc(f.desc)}</div></div>${btn('Deschide', 'gotoFeature', f.id, '', 'sm accent')}</div>`).join('');
}
function seenFeatureTab(tab) {
  const f = S.unlock.fresh && featureById(S.unlock.fresh);
  if (f && f.tab === tab) S.unlock.fresh = null;
}
function htmlMatch(m) {
  const me = m.parts[0], now = performance.now();
  const L = CONFIG.LEAGUES[m.league];
  const head = `<div class="row between"><b>${m.type === 'solo' ? 'ARENĂ SOLO' : 'MULTIPLAYER'} · ${L.name}</b><span>Runda <b>${Math.max(1, m.round)}</b>/${m.rounds}</span></div>
    <div class="row between small" style="margin-top:4px">${m.type === 'solo' ? `<span class="lives">${'♥'.repeat(Math.max(0, m.lives))}<span class="mute">${'♥'.repeat(CONFIG.SOLO.lives - Math.max(0, m.lives))}</span></span><span>Corecte <b>${me.correct}</b></span>` : `<span class="cr">Fond ${fmt(m.pool)} CR</span><span>${nRo(m.parts.length, 'jucător', 'jucători')}</span>`}</div>`;
  if (m.phase === 'intro') return head + `<div class="qbox center"><div class="dim">Conectare la arenă...</div><div class="qtext">PREGĂTEȘTE-TE</div></div>`;
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
  const ov = `<button class="btn override-btn ${ovReason ? 'is-disabled' : ''}" data-act="override" ${ovReason ? `data-reason="${esc(ovReason)}" title="${esc(ovReason)}"` : ''}>INTERVENȚIE UMANĂ ${m.overridesLeft}/${CONFIG.MULTI.overrides}</button>`;
  let myStatus;
  if (m.override && !me.answered) myStatus = '<b style="color:var(--c)">CONTROL UMAN — alege un răspuns până expiră timpul!</b>';
  else if (!me.answered) myStatus = '<span class="dim">AI-ul tău gândește...</span>';
  else myStatus = me.last.correct ? `<span class="good">✓ ${me.last.human ? 'Ai răspuns' : 'AI-ul tău a răspuns'} corect în ${(me.last.t / 1000).toFixed(2)}s${m.type === 'multi' ? ` (+${me.last.pts})` : ''}</span>` : `<span class="bad">✗ ${me.last.timeout ? 'Timp expirat' : 'Răspuns greșit'}${me.last.human ? ' (tu)' : ''}</span>`;
  const parts = m.parts.slice().sort((a, b) => (m.type === 'multi' ? b.score - a.score : 0));
  const rows = parts.map((p, i) => {
    let st = '<span class="dim">gândește…</span>';
    if (p.isPlayer && m.override && !p.answered) st = '<span style="color:var(--c)">UMAN</span>';
    if (p.answered) st = p.last.correct ? `<span class="good">✓ ${(p.last.t / 1000).toFixed(1)}s</span>` : `<span class="bad">✗ ${p.last.timeout ? 'expirat' : (p.last.t / 1000).toFixed(1) + 's'}</span>`;
    const fl = p.answered && UI.lastAnswerFlash[p.id + ':' + m.round] && now - UI.lastAnswerFlash[p.id + ':' + m.round] < 600 ? (p.last.correct ? 'flash-ok' : 'flash-bad') : '';
    return `<div class="part ${p.isPlayer ? 'me' : ''} ${fl}"><span class="dim">${m.type === 'multi' ? i + 1 : ''}</span><span>${esc(p.name)} ${p.tag ? `<span class="gtag tiny">[${esc(p.tag)}]</span>` : ''}</span><span class="st">${st}</span><b>${m.type === 'multi' ? fmt(p.score) : p.correct + '/' + m.round}</b></div>`;
  }).join('');
  return head + `<div class="qbox"><div class="row between tiny dim"><span>${q.kind === 'math' ? 'MATEMATICĂ' : 'CULTURĂ GENERALĂ · ' + esc(q.cat).toUpperCase()}</span><span>Dificultate ${q.diff}/10</span></div>
    <div class="qtext">${esc(q.text)}</div><div class="opts">${opts}</div>
    <div class="timer" style="margin-top:12px"><i id="tbar"></i></div></div>
    <div class="row between">${myStatus}${ov}</div>
    ${m.lastLoot && m.lastLoot.round === m.round ? `<div class="loot-pop">◆ CACHE DE DATE GĂSIT: ${esc(m.lastLoot.text)}</div>` : ''}
    <h4 style="margin-top:12px">${m.type === 'multi' ? 'Clasament live' : 'Parcurs'}</h4><div class="parts">${rows}</div>`;
}
function htmlResult(m) {
  const r = m.result || {};
  let big, lines = [];
  if (m.type === 'solo') {
    big = r.win ? '<span class="good">PARCURS COMPLET</span>' : '<span class="bad">PARCURS EȘUAT</span>';
    lines.push(`${r.correct}/${r.rounds} corecte`);
  } else {
    big = r.place === 1 ? '<span class="good">#1 VICTORIE</span>' : `#${r.place} <span class="dim small">din ${r.of}</span>`;
    lines.push(`Rating ${r.ratingDelta >= 0 ? '<span class="good">+' + r.ratingDelta : '<span class="bad">' + r.ratingDelta}</span> → ${S.player.rating} (${leagueName(S.player.league)})`);
    if (r.refund) lines.push(`Taxa de intrare rambursată: ${fmt(r.refund)} CR`);
  }
  lines.push(`<span class="cr">+${fmt(r.cr)} CR</span>${r.bonus ? ` <span class="dim">(inclusiv bonus +${fmt(r.bonus)})</span>` : ''}${r.dt ? ` · <span class="dtc">+${r.dt} DT</span>` : ''}`);
  if (r.loot && r.loot.length) lines.push(`<b class="warn">PRADĂ:</b> ${r.loot.map(l => `<span class="good">${esc(l.text)}</span> <span class="tiny dim">(${esc(l.source)})</span>`).join(' · ')}`);
  if (r.tax) lines.push(`<span class="gvc">Seiful breslei +${fmt(r.tax)} GV</span> <span class="dim">(bonus, nu se scade din câștigul tău)</span>`);
  if (r.energy) lines.push(`<span class="dtc">+${r.energy} energie Laborator AI</span> <span class="dim">— învață-ți AI-ul în fila Laborator AI</span>`);
  if (r.unlocked && r.unlocked.length) lines.push(htmlUnlocked(r.unlocked));
  const standings = m.type === 'multi' ? m.parts.slice().sort((a, b) => b.score - a.score).map((p, i) => `<div class="part ${p.isPlayer ? 'me' : ''}"><span class="dim">${i + 1}</span><span>${esc(p.name)}</span><span class="st">${p.correct}/${m.rounds}</span><b>${fmt(p.score)}</b></div>`).join('') : '';
  return `<div class="card center" style="padding:20px"><div class="result-big">${big}</div>${lines.map(l => `<div style="margin-top:6px">${l}</div>`).join('')}
    ${r.card ? `<div style="margin:14px auto 0;max-width:180px">${nftCard(r.card)}</div><div class="good small">CARTE OBȚINUTĂ!</div>` : ''}
    ${(r.loot || []).filter(l => l.card).map(l => `<div style="margin:14px auto 0;max-width:180px">${nftCard(l.card)}</div><div class="good small">CARTE DIN PRADĂ!</div>`).join('')}
    <div class="row" style="justify-content:center;margin-top:16px">${btn('Înapoi la Arenă', 'resultOk', undefined, '', 'primary big')}</div></div>
    ${standings ? `<h4 style="margin-top:12px">Clasament final</h4><div class="parts">${standings}</div>` : ''}`;
}

// ---------- market ----------
function htmlMarket() {
  const sub = [['browse', 'Răsfoiește'], ['mine', 'Anunțurile mele'], ['stand', 'Standul meu'], ['prices', 'Prețuri']];
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
      <select data-filter="mk.type"><option value="all">Toate tipurile</option>${CONFIG.CARDS.types.map(t => `<option value="${t.id}" ${f.type === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
      <select data-filter="mk.rarity"><option value="all">Toate raritățile</option>${CONFIG.CARDS.rarities.slice(0, CONFIG.CARDS.UNIQUE).map((r, i) => `<option value="${i}" ${String(f.rarity) === String(i) ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
      <select data-filter="mk.sort">${[['deal', 'Cea mai bună ofertă'], ['asc', 'Preț ↑'], ['desc', 'Preț ↓'], ['rarity', 'Raritate']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="tiny dim" style="margin-bottom:6px">Anunțuri: ${ls.length} · taxă server ${CONFIG.MARKET.serverFee * 100}% (plătită de vânzători) · % ofertă compară prețul cu valoarea corectă estimată</div>
      <div class="list">${ls.slice(0, 40).map(l => listingRow(l)).join('') || '<div class="empty">Niciun anunț nu corespunde.</div>'}</div>`;
  } else if (UI.marketTab === 'mine') {
    const ls = playerListings();
    body = `<div class="tiny dim" style="margin-bottom:8px">Vinde din fila Cărți: deschide o carte → Vinde. Taxă de listare ${CONFIG.MARKET.listingFee * 100}% (nerambursabilă), maximum ${CONFIG.MARKET.maxListings} anunțuri, expiră după 24 h. Se vând mai repede dacă prețul e la nivelul valorii corecte sau sub ea.</div>
      <div class="list">${ls.map(l => { const n = listingCard(l); return n ? `<div class="listing"><div class="thumb" data-act="nftDetail" data-args="${esc(JSON.stringify(n.id))}">${Art.card(n)}</div>
        <div class="small"><b style="color:${rarityColor(n.rarity)}">${esc(cardLabel(n))}</b><div class="dim tiny">${l.venue === 'stand' ? 'pe standul tău (taxă 0%)' : 'piața serverului (taxă 5%)'} · valoare corectă ~${fmt(fairValue(n))} · expiră în ${cd(l.expires)}</div></div>
        <div class="col" style="align-items:flex-end"><span class="price">${fmt(l.price)}</span>${btn('Anulează', 'cancelListing', l.id, '', 'sm')}</div></div>` : ''; }).join('') || '<div class="empty">Nu ai anunțuri active.</div>'}</div>`;
  } else if (UI.marketTab === 'stand') {
    const M = CONFIG.MARKET, st = S.market.stand;
    if (!st) {
      body = `<div class="card"><h3>Stand de piață pentru cărți</h3><div class="small dim">Un punct public de comerț pe terenul tău. Boții direcționează o parte din tranzacții către el (taxează ${M.standFee * 100}% față de ${M.serverFee * 100}% la server) și încasezi <b class="cr">comision de ${M.standFee * 100}%</b> la fiecare tranzacție, chiar și între boți.</div>
        <div class="kv" style="margin:10px 0"><span>Teren necesar</span><b class="landc">${fmt(M.standLand)} SU liber</b><span>Taxă de instalare</span><b class="cr">${fmt(M.standCost)} CR</b><span>Ligă</span><b>${leagueName(M.standLeague)}+</b><span>Întreținere</span><b>${fmt(M.standLevels[0].upkeep)} CR/h</b><span>Cotă de trafic</span><b>${M.standLevels[0].share * 100}% din tranzacțiile boților</b></div>
        ${btn('Construiește standul de piață', 'buildMarketStand', undefined, whyBuildMarketStand(), 'block primary')}</div>`;
    } else {
      const lvl = M.standLevels[st.level], nx = M.standLevels[st.level + 1];
      body = `<div class="card hl"><h3>Standul tău de piață — Nivel ${st.level + 1}</h3>
        <div class="kv"><span>Stare</span><b class="${standActive() ? 'good' : 'bad'}">${standActive() ? 'DESCHIS' : 'OFFLINE (întreținere neplătită)'}</b><span>Cotă de trafic</span><b>${lvl.share * 100}% din tranzacțiile boților</b><span>Comision</span><b>${M.standFee * 100}% × (1 + ${bonuses().eff.comm.toFixed(1)}% bonus cărți)</b><span>Întreținere</span><b>${fmt(lvl.upkeep)} CR/h</b><span>Total câștigat</span><b class="cr">${fmt(S.market.standEarned)} CR</b><span>Teren</span><b>${fmt(M.standLand)} SU</b></div>
        <div class="row" style="margin-top:10px">${nx ? btn(`Îmbunătățește la nivelul ${st.level + 2} (trafic ${nx.share * 100}%) <span class="cost">${fmt(nx.cost)} CR</span>`, 'upgradeMarketStand', undefined, whyUpgradeMarketStand(), 'primary') : '<span class="good">NIVEL MAXIM</span>'}${btn('Demolează (rambursare 50%)', 'demolishMarketStand', undefined, '', 'danger sm')}</div></div>`;
    }
  } else {
    const T = cardType(UI.chartType);
    const h = S.market.history[T.id] || [];
    const norm = x => x.p / Math.pow(CONFIG.MARKET.fairGrowth, (x.r || 0) * 1.6 + (x.pl || 0) * 0.45);
    const pts = h.map((x, i) => [i, Math.round(norm(x))]);
    const byR = {};
    h.forEach(x => { (byR[x.r || 0] = byR[x.r || 0] || []).push(x.p); });
    body = `<div class="row" style="margin-bottom:8px">${CONFIG.CARDS.types.map(t => `<button class="chip ${UI.chartType === t.id ? 'on' : ''}" data-act="chartType" data-args='"${t.id}"'>${t.name}</button>`).join('')}</div>
      <div class="card"><h4>${T.name} — ultimele ${h.length} vânzări (preț normalizat la Comună +0)</h4>
      ${Art.lineChart([{ points: pts, color: T.c[0], fill: true, dots: true }], { h: 140, zero: true, empty: 'Nicio vânzare înregistrată încă — piața are nevoie de câteva minute de joc.' })}
      <div class="small dim" style="margin-top:6px">Cerere: <b>${((S.market.demand[T.id] || 1) * 100).toFixed(0)}%</b> · ${Object.keys(byR).sort().map(r => `${rarityName(Number(r))} medie <b class="cr">${fmt(byR[r].reduce((a, b) => a + b, 0) / byR[r].length)}</b>`).join(' · ')}</div></div>`;
  }
  return subtabs + body;
}
function listingRow(l) {
  const n = l.card, f = fairValue(n), d = Math.round((l.price / f - 1) * 100);
  const seller = botById(l.seller);
  return `<div class="listing"><div class="thumb" data-act="listingDetail" data-args="${esc(JSON.stringify(l.id))}">${Art.card(n)}</div>
    <div class="small"><b style="color:${rarityColor(n.rarity)}">${esc(cardLabel(n))}</b>${l.venue === 'stand' ? ' <span class="tag ls">STANDUL TĂU</span>' : ''}
    <div class="tiny dim">${cardStats(n).map(statText).join(' · ')}</div><div class="tiny mute">de la ${esc(seller ? seller.name : 'comerciant')} · ${cd(l.expires)}</div></div>
    <div class="col" style="align-items:flex-end;gap:4px"><span class="price">${fmt(l.price)}</span><span class="deal ${d <= 0 ? 'good' : d > 15 ? 'bad' : 'warn'}">${d > 0 ? '+' : ''}${d}% față de corect</span>${btn('Cumpără', 'buyListing', l.id, whyBuyListing(l.id), 'sm primary')}</div></div>`;
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
    <div class="card"><h3>${ic('land')} Server global</h3><div class="kv"><span>Spațiu total</span><b>${fmt(sv.total)} SU</b><span>Folosit</span><b>${fmt(used)} SU (${fmtPct(used / sv.total * 100)})</b><span>Liber</span><b class="${used / sv.total > 0.45 ? 'warn' : 'good'}">${fmt(sv.total - used)} SU</b><span>Preț</span><b class="cr">${landPrice()} CR / SU</b><span>Extinderi</span><b>${sv.expansions}</b><span>Stare</span><b class="${sv.state === 'CRITICAL' ? 'bad' : 'good'}">${serverStateRo(sv.state)}${sv.state === 'CRITICAL' ? ' · ' + cd(sv.freezeUntil) : ''}</b></div>
      <div class="tiny dim" style="margin-top:6px">Când spațiul liber scade sub 50%, achizițiile grele (stand x6+, Sediul breslei, standuri de piață, parcele peste ${CONFIG.LAND.heavyPlot} SU) se blochează ${CONFIG.SERVER.freezeMs / 1000} s, apoi capacitatea crește cu 50%. Preț = ${CONFIG.LAND.basePrice} × (1 + 3 × folosit²).</div></div>
    <div class="card"><h3>Terenul tău</h3><div class="kv"><span>Deținut</span><b class="landc">${fmt(S.player.land)} SU</b><span>Standuri de antrenament</span><b>${fmt(S.stands.reduce((s, x) => s + CONFIG.STAND_TIERS[x.tier].land, 0))} SU</b><span>Stand de piață</span><b>${S.market.stand ? fmt(CONFIG.MARKET.standLand) : 0} SU</b><span>Liber pentru construcții</span><b class="good">${fmt(landFree())} SU</b></div>
      <h4 style="margin-top:10px">Cumpără o parcelă</h4><div class="plot-grid">${plots}</div></div>
  </div>
  ${htmlTerritory()}
  <div class="card" style="margin-top:10px"><h4>Harta ciberspațiului</h4>${landCache.html}
    <div class="legend"><span><i style="background:var(--c)"></i>Tu</span><span><i style="background:var(--b)"></i>Bresle</span><span><i style="background:#35506e"></i>Alți jucători</span><span><i style="background:#132033"></i>Liber</span></div></div>
  <div class="card" style="margin-top:10px"><h4>Spațiu total vs folosit (ore de joc)</h4>${Art.lineChart([{ points: hist, color: getCss('--b') }, { points: hu, color: getCss('--warn'), fill: true }], { h: 120, zero: true })}
    <div class="legend"><span><i style="background:var(--b)"></i>Total</span><span><i style="background:var(--warn)"></i>Folosit</span></div></div>`;
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
    if (k) { const [icn, col] = TILE_ICON[k] || TILE_ICON.d; tiles += `<div class="tile done ${k === 'j' || k === 'n' ? 'rare' : ''}" style="color:${col}" title="Sectorul #${i + 1} explorat">${ic(icn, 14)}</div>`; }
    else tiles += `<button class="tile fog" data-act="explore" data-args="${i}" title="Explorează sectorul #${i + 1}">?</button>`;
  }
  const pager = pages > 1 ? `<div class="row" style="margin-top:8px">${Array.from({ length: pages }, (_, p) => `<button class="chip ${p === UI.tilePage ? 'on' : ''}" data-act="tilePage" data-args="${p}">${p * E.pageSize + 1}-${Math.min(n, (p + 1) * E.pageSize)}</button>`).join('')}</div>` : '';
  return `<div class="card" style="margin-top:10px"><div class="row between"><h3 style="margin:0">${ic('land')} Teritoriul tău</h3><span class="small">${ex}/${n} explorate</span></div>
    <div class="tiny dim" style="margin:4px 0 8px">Fiecare ${E.tileSU} SU deținute formează un sector. Atinge un sector <b style="color:var(--a)">?</b> ca să-l explorezi o singură dată: DT, CR, fragmente, o carte rară sau un jackpot de CR. Cumpără mai mult teren pentru sectoare noi.</div>
    ${n ? `<div class="tiles">${tiles}</div>${pager}<div class="row" style="margin-top:8px">${btn('Explorează tot', 'exploreAll', undefined, ex >= n ? 'Nimic de explorat – cumpără mai mult teren' : '', 'sm accent')}</div>` : `<div class="empty">Deții mai puțin de ${E.tileSU} SU. Cumpără o parcelă ca să primești sectoare.</div>`}</div>`;
}
function getCss(v) { try { return getComputedStyle(document.body).getPropertyValue(v).trim() || '#39ff88'; } catch (e) { return '#39ff88'; } }

// ---------- season ----------
function htmlSeason() {
  const p = S.player, rank = leaderboard('rating').findIndex(e => e.isPlayer) + 1;
  const missions = S.missions.list.map((m, i) => {
    const done = m.progress >= m.target;
    return `<div class="mission ${done ? 'done' : ''}"><div><div class="small">${esc(m.text)}</div><div class="xp" style="margin:5px 0"><i style="width:${(m.progress / m.target * 100).toFixed(0)}%"></i></div><div class="tiny dim">${fmt(m.progress)}/${fmt(m.target)} · recompensă ${m.reward.dt} DT, ${fmt(m.reward.cr)} CR, ${nRo(m.reward.shards, 'fragment', 'fragmente')}, 25% șansă de carte</div></div>
      ${m.claimed ? '<span class="good small">REVENDICAT</span>' : btn('Revendică', 'claimMission', i, done ? '' : 'Încă neterminată', 'sm primary')}</div>`;
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
    <div class="card"><h3>${ic('season')} Sezonul ${S.season.index}</h3><div class="kv"><span>Se termină în</span><b>${cd(S.season.start + CONFIG.SEASON.lengthMs)}</b><span>Locul tău</span><b>#${rank} din ${S.bots.length + 1}</b><span>Liga ta</span><b style="color:${CONFIG.LEAGUES[p.league].color}">${leagueName(p.league)}</b><span>Recompensă finală acum</span><b class="cr">${fmt(CONFIG.SEASON.rewards[p.league].cr)} CR + ${nRo(CONFIG.SEASON.rewards[p.league].shards, 'fragment', 'fragmente')}</b></div>
      <div class="tiny dim" style="margin-top:6px">La finalul sezonului, ratingul se resetează parțial (la jumătatea drumului spre 1000) și primești un titlu.${p.titles.length ? ' Titluri: ' + p.titles.map(esc).join(', ') : ''}</div></div>
    <div class="card"><h3>Renaștere neurală</h3><div class="small dim">Ajungi în liga ${leagueName(CONFIG.PRESTIGE.league)}, apoi resetezi statisticile AI-ului, standurile și ratingul pentru puncte de Moștenire: fiecare dă permanent +${CONFIG.PRESTIGE.legacyPerPoint * 100}% la antrenament și CR (max. +${CONFIG.PRESTIGE.legacyCap * 100}%). Păstrezi cărțile, terenul, CR, breasla și cosmeticele.</div>
      <div class="kv" style="margin:8px 0"><span>Moștenire</span><b>${p.legacy} (+${Math.round(legacyBonus() * 100)}%)</b><span>Renașterea acum îți dă</span><b>+${legacyGain()} Moștenire</b></div>
      ${btn('Renaștere neurală', 'rebirth', undefined, reb, 'block ' + (reb ? '' : 'primary'))}</div>
  </div>
  <h3 style="margin-top:12px">Misiuni zilnice <span class="tiny dim">noi în ${cd(nextDay)}</span></h3><div class="list">${missions}</div>
  <h3 style="margin-top:12px">Clasamente</h3><div class="row" style="margin-bottom:6px">${[['rating', 'Rating'], ['power', 'Putere AI'], ['guild', 'Seifuri bresle']].map(([k, l]) => `<button class="chip ${UI.lbKind === k ? 'on' : ''}" data-act="lbKind" data-args='"${k}"'>${l}</button>`).join('')}</div>
  <table class="lb"><tr><th>#</th><th>Nume</th><th class="num">${UI.lbKind === 'guild' ? 'Seif GV' : UI.lbKind === 'power' ? 'Mate+Cunoștințe' : 'Rating'}</th></tr>${rows}</table>
  <h3 style="margin-top:12px">Realizări <span class="dim">${achDone}/${ACHIEVEMENTS.length}</span> <span class="tiny dim">+${nRo(ACH_REWARD_SHARDS, 'fragment', 'fragmente')} fiecare</span></h3><div class="ach-grid">${ach}</div>`;
}

// ============================================================
// RIGHT — Guild / NFTs
// ============================================================
function htmlRight() {
  const tabs = [['cards', 'Cărți', 'nft'], ['album', 'Album', 'season'], ['guild', 'Breaslă', 'guild']];
  if (RIGHT_FEATURE[UI.rightTab] && !isUnlocked(RIGHT_FEATURE[UI.rightTab])) UI.rightTab = 'cards';
  const t = tabs.map(([id, l, i]) => tabBtn('right', id, l, i, RIGHT_FEATURE[id], id === 'cards' ? ` <span class="dim tiny">${S.inv.length}</span>` : '')).join('');
  return `<div class="tabs">${t}</div>${UI.rightTab === 'guild' ? htmlGuild() : UI.rightTab === 'album' ? htmlAlbum() : htmlCards()}`;
}

// ---------- guild ----------
function htmlGuild() {
  const g = playerGuild();
  if (!g) {
    const rows = S.guilds.slice().sort((a, b) => b.vault - a.vault).map(x => `<div class="guild-row">${Art.emblem(x.seed, 40)}<div class="small"><b>${esc(x.name)}</b> <span class="gtag">[${esc(x.tag)}]</span><div class="tiny dim">${nRo(x.members.length, 'membru', 'membri')} · sediu ${x.hq ? 'nv. ' + x.hq : '—'} · seif ${fmt(x.vault)} GV</div></div>${btn('Intră', 'joinGuild', x.id, whyJoinGuild(x.id), 'sm')}</div>`).join('');
    const wait = S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs - S.time;
    return `<div class="small dim" style="margin-bottom:8px">Breslele primesc un <b>bonus</b> de 10% din câștigurile de turneu ale fiecărui membru — e emis în plus, nu se ia niciodată de la tine. GV din seif construiește Sediul breslei și deblochează stiluri cosmetice.</div>
      ${wait > 0 ? `<div class="warn small" style="margin-bottom:8px">Poți intra din nou în: ${cd(S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs)}</div>` : ''}
      <div class="list">${rows}</div>
      <div class="card" style="margin-top:10px"><h3>Fondează-ți propria breaslă</h3><div class="field"><input type="text" maxlength="24" placeholder="Numele breslei" data-in="guildName" value="${esc(UI.inputs.guildName || '')}">${btn(`Creează <span class="cost">${fmt(CONFIG.GUILD.createCost)} CR</span>`, 'createGuild', undefined, '', 'primary')}</div><div class="tiny dim" style="margin-top:4px">Boții vor cere să intre în timp (mai repede cu un sediu de nivel mai mare).</div></div>`;
  }
  const nx = hqNext(g), c = hqCost(g);
  const contrib = Object.entries(g.contrib).map(([id, v]) => ({ id, v, name: id === 'player' ? S.player.name : (botById(id) || { name: '(a plecat)' }).name, me: id === 'player' })).sort((a, b) => b.v - a.v);
  const myRank = contrib.findIndex(x => x.me);
  const lbRows = contrib.slice(0, 8).map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.name)}</td><td class="num">${fmt(x.v)}</td></tr>`).join('') + (myRank >= 8 ? `<tr class="me"><td>${myRank + 1}</td><td>${esc(S.player.name)}</td><td class="num">${fmt(contrib[myRank].v)}</td></tr>` : '');
  const cos = ['theme', 'font', 'badge'].map(type => `<h4 style="margin-top:8px">${type === 'theme' ? 'Teme de interfață' : type === 'font' ? 'Fonturi' : 'Insigne cyber'}</h4><div class="list">` + CONFIG.COSMETICS.filter(x => x.type === type).map(x => {
    const owned = S.player.cosmetics.owned.includes(x.id), active = S.player.cosmetics[type] === x.id;
    const sw = type === 'theme' ? `<span class="swatch" style="background:${(PET_COLORS[x.id] || ['#555'])[0]}"></span>` : type === 'badge' ? Art.badge(x.id, 14) + ' ' : '';
    const act = active ? '<span class="good tiny">ACTIV</span>' : owned ? btn('Folosește', 'useCosmetic', x.id, '', 'sm') : btn(`${fmt(x.cost)} GV`, 'buyCosmetic', x.id, whyBuyCosmetic(x.id), 'sm');
    return `<div class="cos"><span>${sw}${esc(x.name)} ${x.hq && !owned ? `<span class="tiny dim">Sediu ${x.hq}</span>` : ''}</span>${act}</div>`;
  }).join('') + '</div>').join('');
  return `<div class="row">${Art.emblem(g.seed, 56)}<div class="grow"><b>${esc(g.name)}</b> <span class="gtag">[${esc(g.tag)}]</span><div class="small dim">${nRo(g.members.length + 1, 'membru', 'membri')}${g.isPlayer ? ' · fondată de tine' : ''}</div></div></div>
    <div class="kv" style="margin:10px 0"><span>Seif</span><b class="gvc">${fmt(g.vault)} GV</b><span>Sediul breslei</span><b>${g.hq ? 'Nivel ' + g.hq : 'neconstruit'}</b><span>Terenul breslei</span><b>${fmt(g.land)} SU</b><span>Avantaj</span><b>${g.hq ? '+' + CONFIG.GUILD.hq[g.hq - 1].perk + '% flux DT' : '—'}</b><span>Contribuția ta</span><b>${fmt(g.contrib.player || 0)} GV</b></div>
    <div class="field"><input type="number" min="1" placeholder="CR de donat" data-in="donate" value="${esc(UI.inputs.donate || '')}">${btn('Donează', 'donate', undefined, '', 'accent')}</div>
    <div class="card" style="margin-top:10px"><h3>Sediul breslei ${nx ? '→ Nivel ' + (g.hq + 1) : '(max)'}</h3>
      ${nx ? `<div class="kv"><span>Teren de breaslă necesar</span><b>${fmt(nx.land)} SU (+${fmt(c.landNeeded)})</b><span>Cost teren</span><b class="gvc">${fmt(c.landCost)} GV</b><span>Taxă de implementare</span><b class="gvc">${fmt(c.fee)} GV</b><span>Deblochează</span><b>+${nx.perk}% flux DT, cosmetice de nivel ${g.hq + 1}</b></div>
      <div style="margin-top:8px">${btn(`${g.hq ? 'Îmbunătățește' : 'Construiește'} sediul <span class="cost">${fmt(c.total)} GV</span>`, 'upgradeHQ', undefined, whyUpgradeHQ(), 'block primary')}</div>` : '<div class="good small">Sediul tău e îmbunătățit la maximum.</div>'}</div>
    <div class="card" style="margin-top:10px"><h3>Magazin de cosmetice</h3><div class="tiny dim">Arde GV din seif pentru stiluri pur vizuale. Stilurile cumpărate rămân ale tale.</div>${cos}</div>
    <h4 style="margin-top:10px">Clasamentul contribuțiilor</h4><table class="lb"><tr><th>#</th><th>Membru</th><th class="num">GV</th></tr>${lbRows}</table>
    <div style="margin-top:10px">${btn('Părăsește breasla', 'leaveGuild', undefined, '', 'danger sm')}</div>`;
}

// ---------- cards ----------
function nftCard(n, opts) {
  opts = opts || {};
  const tags = [isEquipped(n.id) ? '<span class="tag eq">ECHIPATĂ</span>' : '', n.listed ? '<span class="tag ls">LISTATĂ</span>' : '', n.locked ? '<span class="tag lk">BLOCATĂ</span>' : ''].join('');
  const sel = UI.selected.includes(n.id) ? 'sel' : '';
  return `<div class="nft ${sel} ${n.rarity === CONFIG.CARDS.UNIQUE ? 'unique-glow' : ''}" data-act="${opts.act || 'nftClick'}" data-args="${esc(JSON.stringify(n.id))}" title="${esc(cardLabel(n))}">${Art.card(n)}<div class="tags">${tags}</div><div class="nm" style="color:${rarityColor(n.rarity)}">${esc(cardType(n.type).name)}${n.plus ? ' +' + n.plus : ''}</div></div>`;
}
function htmlCards() {
  const b = bonuses(), f = UI.nftFilter, C = CONFIG.CARDS, hi = b.heat;
  const bonusRows = Object.keys(C.stats).map(k => {
    const A = C.stats[k], capd = b.raw[k] - b.eff[k] > 0.5;
    return `<div class="bonus-row"><span>${A.name}</span><span class="dim">brut ${A.sign}${b.raw[k].toFixed(1)}%</span><b class="${b.eff[k] > 0 ? 'good' : 'mute'}">${A.sign}${b.eff[k].toFixed(1)}% ${capd ? '<span class="capped">PLAFONAT</span>' : ''}</b></div>`;
  }).join('');
  const slots = C.types.map(t => {
    const c = equippedOfType(t.id);
    return `<div class="card-slot">${c ? nftCard(c, { act: 'nftDetail' }) : `<div class="slot-empty tiny">fără ${esc(t.name)}</div>`}<div class="slot-name">${esc(t.name)}</div></div>`;
  }).join('');
  const heatPct = hi.cooling ? Math.min(100, hi.heat / hi.cooling * 100) : 0;
  const setLine = b.set ? `<div class="good small">ECHIPAMENT COMPLET: toate cele 4 tipuri echipate → +${b.set.pct}% la toate statisticile cărților (raritatea minimă: ${rarityName(b.set.rarity)})</div>`
    : `<div class="tiny dim">Echipează toate cele 4 tipuri pentru un bonus de set: +${C.setBonus.join('/')}% în funcție de raritatea minimă.</div>`;
  let items = S.inv.slice();
  if (f.type !== 'all') items = items.filter(n => n.type === f.type);
  if (f.rarity !== 'all') items = items.filter(n => n.rarity === Number(f.rarity));
  if (f.plus !== 'all') items = items.filter(n => n.plus === Number(f.plus));
  if (f.sort === 'rarity') items.sort((a, c) => c.rarity - a.rarity || c.plus - a.plus || a.type.localeCompare(c.type));
  else if (f.sort === 'type') items.sort((a, c) => a.type.localeCompare(c.type) || c.rarity - a.rarity || c.plus - a.plus);
  else items.sort((a, c) => c.createdAt - a.createdAt);
  const selItems = UI.selected.map(id => S.inv.find(n => n.id === id)).filter(Boolean);
  const salvR = selItems.length ? (selItems.map(n => cardStatusReason(n)).find(Boolean) || '') : 'Selectează mai întâi cărți';
  const salvVal = selItems.reduce((s2, n) => s2 + salvageValue(n), 0);
  const selBar = UI.selectMode ? `<div class="card hl" style="margin:8px 0"><div class="row between small"><b>MOD SELECȚIE</b><span>selectate: ${UI.selected.length}</span></div>
      <div class="row" style="margin-top:6px">${btn(`Dezmembrează → ${nRo(salvVal, 'fragment', 'fragmente')}`, 'salvageSelected', undefined, salvR, 'sm danger')}${btn('Selectează toate Comunele', 'selCommon', undefined, '', 'sm accent')}${btn('Golește', 'clearSel', undefined, '', 'sm')}${btn('Gata', 'toggleSelect', undefined, '', 'sm')}</div>
      <div class="tiny dim" style="margin-top:4px">Cărțile echipate, listate și blocate sunt protejate.</div></div>` : '';
  const forgeOpts = C.types.map(t => `<option value="${t.id}" ${UI.inputs.forgeType === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
  return `<h3>Bonusuri active</h3>${bonusRows}${setLine}
    <div class="row between small" style="margin-top:8px"><span>Căldură <b class="${hi.over ? 'bad' : 'good'}">${hi.heat}</b> / răcire <b>${hi.cooling}</b></span><span class="${hi.over ? 'bad' : 'dim'}">${hi.over ? `SUPRAÎNCĂLZIRE: bonusuri ×${hi.mult.toFixed(2)}` : 'răcit'}</span></div>
    <div class="heatbar" title="Nucleul și Hardware-ul produc căldură, Răcitoarele o elimină"><i class="${hi.over ? 'over' : ''}" style="width:${heatPct.toFixed(0)}%"></i></div>
    <div class="tiny dim">Nucleul și Hardware-ul încălzesc echipamentul, un Răcitor îl ține rece. Dacă încălzirea depășește răcirea, toate bonusurile scad (până la ×${C.heat.minMult}).</div>
    <h4 style="margin-top:10px">Echipamentul tău — o carte de fiecare tip</h4><div class="card-slots slots">${slots}</div>
    <div class="row between" style="margin-top:10px"><span class="small">${ic('ai')} Recalibratoare neurale: <b class="good">${S.player.recal}</b></span><span class="tiny dim">regenerează statisticile bonus ale unei cărți</span></div>
    <div class="sep"></div>
    <div class="row between"><h3 style="margin:0">Inventar ${S.inv.length}/${C.inventoryMax}</h3>${btn(UI.selectMode ? 'Ieși din selecție' : 'Selectează / Dezmembrează', 'toggleSelect', undefined, '', 'sm ' + (UI.selectMode ? '' : 'accent'))}</div>
    ${selBar}
    <div class="row small" style="margin:8px 0">
      <select data-filter="nft.type"><option value="all">Toate tipurile</option>${C.types.map(t => `<option value="${t.id}" ${f.type === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
      <select data-filter="nft.rarity"><option value="all">Toate raritățile</option>${C.rarities.map((r, i) => `<option value="${i}" ${String(f.rarity) === String(i) ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
      <select data-filter="nft.plus"><option value="all">Toate +</option>${[0, 1, 2, 3, 4].map(l => `<option value="${l}" ${String(f.plus) === String(l) ? 'selected' : ''}>+${l}</option>`).join('')}</select>
      <select data-filter="nft.sort">${[['rarity', 'Sortare: raritate'], ['type', 'Sortare: tip'], ['new', 'Sortare: cele mai noi']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="nft-grid">${items.map(n => nftCard(n)).join('') || '<div class="empty" style="grid-column:1/-1">Încă nu ai cărți. Termină în top 3 la Multiplayer, fă parcursuri Solo perfecte, misiuni, Laboratorul AI sau cumpără din piață.</div>'}</div>
    <div class="sep"></div>
    <h3>${ic('shard')} Forja de fragmente</h3><div class="tiny dim">Dezmembrează cărțile nedorite în fragmente, apoi forjează o carte Comună de tipul de care ai nevoie (${nRo(C.forgeCost, 'fragment', 'fragmente')}). Fragmentele plătesc și îmbunătățirile. Ai <b class="shardc">${S.player.shards}</b>.</div>
    <div class="row" style="margin-top:6px"><select data-in="forgeType" style="width:auto;flex:1">${forgeOpts}</select>${btn('Forjează', 'forge', undefined, whyForge(UI.inputs.forgeType || C.types[0].id), 'accent')}</div>
    <div class="tiny mute" style="margin-top:6px">Șanse de carte: Multiplayer locul 1/2/3 ${CONFIG.MULTI.drop.map(d => Math.round(dropChance(d) * 100) + '%').join('/')}, Solo perfect ${Math.round(dropChance(CONFIG.SOLO.cardDropPerfect) * 100)}%, revendicare misiune 25%, Laborator AI ${Math.round(CONFIG.AI_LAB.cardChance * 100)}%. Cărțile <b style="color:#ffe14d">Unice</b> vin doar din Laboratorul AI.</div>`;
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
    return `<span>${r.name}</span><b class="${n === C.types.length ? 'good' : ''}">${n}/${C.types.length} · ${nRo(C.album.columnShards[i], 'fragment', 'fragmente')} + ${nRo(C.album.columnRecal, 'Recalibrator', 'Recalibratoare')}</b>`;
  }).join('');
  return `<h3>Albumul de cărți <span class="dim">${got}/${total}</span></h3>
    <div class="tiny dim" style="margin-bottom:8px">Fiecare combinație nouă tip × raritate obținută (drop, piață, îmbunătățire sau evoluție) completează un loc: +${nRo(C.album.entryShards, 'fragment', 'fragmente')}. Completează o coloană de raritate (toate cele 4 tipuri) pentru o recompensă mai mare.</div>
    <div class="album">${head}${rows}</div>
    <h4 style="margin-top:12px">Recompense pe coloană</h4><div class="kv">${cols}</div>`;
}

// ---------- card detail modal ----------
function openNftDetail(id, fromListing) {
  let n, l = null;
  if (fromListing) { l = S.market.listings.find(x => x.id === id); n = l && l.card; }
  else n = S.inv.find(x => x.id === id);
  if (!n) { closeModal(); return; }
  UI.modalKind = { type: fromListing ? 'listing' : 'nft', id };
  const C = CONFIG.CARDS, R = C.rarities[n.rarity], T = cardType(n.type);
  const stats = cardStats(n).map(st => `<div class="stat-line ${st.main ? 'main' : ''}"><span>${st.main ? '◆ ' : ''}${C.stats[st.type].name}${st.main ? ' <span class="tiny dim">(fixă)</span>' : ''}</span><b class="good">${C.stats[st.type].sign}${st.value}%</b></div>`).join('');
  const heatTxt = T.heat ? `<span>Căldură</span><b class="warn">+${cardHeat(n)}</b>` : `<span>Răcire</span><b class="dtc">${cardCooling(n)}</b>`;
  let actions = '';
  if (!fromListing) {
    const eqd = isEquipped(n.id);
    const up = n.plus < C.maxPlus ? upgradeCost(n) : null, ev = n.plus >= C.maxPlus ? evolveCost(n) : null;
    const growBtn = up ? btn(`Îmbunătățește la +${n.plus + 1} <span class="cost">${cardCostText(up)}</span>`, 'upgradeCard', n.id, whyUpgradeCard(n.id), 'primary')
      : ev ? btn(`Evoluează → ${rarityName(n.rarity + 1)} <span class="cost">${cardCostText(ev)}</span>`, 'evolveCard', n.id, whyEvolveCard(n.id), 'primary')
      : `<span class="good small">${n.rarity === C.UNIQUE ? 'UNICĂ — la maximum' : 'MAX'}</span>`;
    actions = `<div class="row" style="margin-top:12px">${growBtn}${btn(`Regenerează statisticile bonus <span class="cost">1 Recalibrator (${S.player.recal})</span>`, 'rerollCard', n.id, whyRerollCard(n.id), 'accent')}</div>
      <div class="row" style="margin-top:8px">${eqd ? btn('Dezechipează', 'unequip', n.id, '', '') : btn(equippedOfType(n.type) ? `Echipează (înlocuiește ${T.name})` : 'Echipează', 'equip', n.id, whyEquip(n.id), '')}
      ${btn(n.locked ? 'Deblochează' : 'Blochează', 'toggleLock', n.id, '', '')}
      ${btn(`Dezmembrează → ${nRo(salvageValue(n), 'fragment', 'fragmente')}`, 'salvageOne', n.id, whySalvage(n.id), 'danger')}</div>
      ${n.listed ? `<div class="warn small" style="margin-top:8px">Listată pe piață (în garanție). Anulează din Piață → Anunțurile mele.</div>` : `<div class="card" style="margin-top:12px"><h4>Vinde pe piață</h4><div class="row"><input type="number" min="1" data-in="sellPrice" value="${esc(UI.inputs.sellPrice || fairValue(n))}" style="flex:1;width:auto"><select data-in="sellVenue" style="width:auto">${`<option value="server">Server (taxă 5%)</option>` + (standActive() ? `<option value="stand" ${UI.inputs.sellVenue === 'stand' ? 'selected' : ''}>Standul meu (0%)</option>` : '')}</select>${btn('Listează', 'listNft', n.id, '', 'accent')}</div><div class="tiny dim" style="margin-top:4px">Valoare corectă ~${fmt(fairValue(n))} CR · taxă de listare ${CONFIG.MARKET.listingFee * 100}% (min. 1 CR), nerambursabilă.</div></div>`}`;
  } else {
    actions = `<div class="row" style="margin-top:12px"><span class="price">${fmt(l.price)} CR</span>${btn('Cumpără acum', 'buyListing', l.id, whyBuyListing(l.id), 'primary')}</div>`;
  }
  const path = n.rarity < C.MAX_CRAFT_RARITY ? `+0 → +${C.maxPlus}, apoi evoluează în ${rarityName(n.rarity + 1)}` : n.rarity === C.UNIQUE ? 'Unică: se îmbunătățește până la +4, nu evoluează niciodată' : 'Legendară: cea mai înaltă raritate realizabilă, se îmbunătățește până la +4';
  openModal(modalHead(`<span style="color:${rarityColor(n.rarity)}">${esc(cardLabel(n))}</span>`) + `<div class="nft-detail"><div class="art">${Art.card(n)}</div><div>
    <div class="row"><b style="color:${rarityColor(n.rarity)}">${R.name}</b><span>${esc(T.name)}</span><span>Nivel <b>+${n.plus}</b>/${C.maxPlus}</span></div>
    <div class="tiny dim">Serie #0x${(n.dna >>> 0).toString(16).toUpperCase().padStart(8, '0')} · ${nRo(R.bonus, 'statistică bonus aleatorie', 'statistici bonus aleatorii')} · ${path}</div>
    <div style="margin-top:8px">${stats}</div>
    <div class="kv" style="margin-top:6px">${heatTxt}<span>Valoare corectă de piață</span><b class="cr">~${fmt(fairValue(n))} CR</b></div>
    ${actions}</div></div>`, true);
}

// ---------- evolution flash ----------
function playEvolveAnim(c) {
  openModal(modalHead('Evoluție!') + `<div class="fusion-fx" data-act="closeModal"><div class="flash" style="opacity:1;transform:scale(3)"></div><div class="out" style="opacity:1;transform:scale(1)">${Art.card(c)}</div></div>
    <div class="center"><b style="color:${rarityColor(c.rarity)}">${esc(cardLabel(c))}</b><div class="small dim">${cardStats(c).map(statText).join(' · ')}</div></div>
    <div class="row" style="justify-content:center;margin-top:10px">${btn('Super!', 'closeModal', undefined, '', 'primary')}</div>`);
  const box = $('#modal');
  setTimeout(() => { const f = box.querySelector('.flash'); if (f) f.style.opacity = '0'; }, 500);
}

// ---------- AI Lab ----------
function htmlAILab() {
  const A = CONFIG.AI_LAB, ai = S.ai, C = CONFIG.CARDS;
  const en = Array.from({ length: Math.max(A.energyMax, ai.energy) }, (_, i) => `<i class="${i < ai.energy ? (i >= A.energyMax ? 'on bonus' : 'on') : ''}"></i>`).join('');
  const regen = ai.energy < A.energyMax ? `+1 în ${cd(S.time + A.regenMs - ai.acc)}` : 'plină';
  const bridge = AI_BRIDGE.connected() ? `<span class="good">conectat la ${esc(AI_BRIDGE.endpoint)}</span>` : '<span class="warn">mod offline</span> — AI-ul nu este încă conectat; răspunsurile se salvează pe acest dispozitiv';
  const m = AILAB;
  if (!ai.consent) {
    return `<div class="card hl"><h3>${ic('ai')} Laborator AI — înainte să începi</h3>
      <div class="small" style="line-height:1.6">În Laboratorul AI, <b>AI-ul tău îți pune întrebări în limba română</b> și învață din răspunsurile tale cum vorbesc și explică oamenii reali. Răspunde cu propriile cuvinte.</div>
      <ul class="small" style="line-height:1.6">
        <li>Ce scrii aici este folosit <b>ca AI-ul să învețe limba română</b>.</li>
        <li><b>Nu scrie date personale</b> (nume, numere de telefon, adrese, e-mailuri). Numerele de telefon, e-mailurile și linkurile sunt eliminate automat.</li>
        <li>AI-ul păstrează un răspuns doar după ce mai mulți jucători sunt de acord cu el.</li>
        <li>Îți poți șterge oricând răspunsurile (Setări → Șterge răspunsurile mele din Laboratorul AI).</li></ul>
      <div class="small dim">Mulțumim că ajuți AI-ul să învețe limba română!</div>
      <div style="margin-top:12px">${btn('Am înțeles — deschide Laboratorul AI', 'aiConsent', undefined, '', 'block primary big')}</div></div>`;
  }
  if (m && !m.done && m.i >= m.qs.length) return `<div class="card center" style="padding:20px">${ic('ai')} Se salvează lecția…</div>`;
  if (m && !m.done) {
    const q = m.qs[m.i];
    const chat = m.answers.map(a => `<div class="bot">${esc(a.q)}</div><div class="me">${a.a ? esc(a.a) : '<i class="dim">nu știu</i>'}</div>`).join('');
    return `<div class="row between"><b>${ic('ai')} LECȚIE AI</b><span>Întrebarea <b>${m.i + 1}</b>/${m.qs.length}</span></div>
      <div class="ai-chat">${chat}</div>
      <div class="card hl"><div class="tiny dim">${q.kind === 'control' ? 'Verificare rapidă' : 'AI-ul tău întreabă'}:</div><div class="ai-q">${esc(q.text)}</div>
      <textarea class="ai-input" data-in="aiAnswer" maxlength="600" placeholder="Răspunde cu cuvintele tale…">${esc(UI.inputs.aiAnswer || '')}</textarea>
      <div class="row" style="margin-top:8px;justify-content:flex-end">${btn('Nu știu', 'aiSkip', undefined, '', 'sm')}${btn(m.i === m.qs.length - 1 ? 'Trimite și termină' : 'Trimite', 'aiSend', undefined, '', 'primary')}</div>
      <div class="tiny mute" style="margin-top:4px">Enter = trimite · Shift+Enter = rând nou · fără date personale, te rog</div></div>`;
  }
  let last = '';
  if (m && m.done && m.result) {
    const r = m.result;
    last = `<div class="card hl" style="margin-top:10px"><h4>Lecție completă</h4><div class="small">${nRo(r.useful, 'răspuns util', 'răspunsuri utile')}${r.controlOk ? '' : ' · <span class="warn">verificare de atenție ratată: recompense înjumătățite</span>'}</div>
      <div style="margin-top:6px"><span class="cr">+${fmt(r.cr)} CR</span> · <span class="shardc">+${nRo(r.shards, 'fragment', 'fragmente')}</span> · <span class="good">+1 Recalibrator neural</span>${r.milestone ? ' · <b class="warn">PRAG AI ATINS!</b>' : ''}</div>
      ${r.unique ? `<div style="margin:12px auto 0;max-width:180px">${nftCard(r.unique)}</div><div class="center" style="color:#ffe14d"><b>CARTE UNICĂ!</b></div>` : ''}
      ${r.card ? `<div style="margin:12px auto 0;max-width:160px">${nftCard(r.card)}</div><div class="good small center">Carte recompensă</div>` : ''}</div>`;
  }
  const toMs = A.milestoneEvery - (ai.useful % A.milestoneEvery);
  return `<div class="card"><div class="row between"><h3 style="margin:0">${ic('ai')} Laborator AI</h3><span class="energy">${en} <span class="tiny dim">${regen}</span></span></div>
      <div class="small dim" style="margin-top:6px">AI-ul tău pune ${A.questions} întrebări; răspunzi cu propriile cuvinte. Fiecare lecție dă <b class="good">1 Recalibrator neural</b> (regenerează statisticile bonus ale unei cărți), CR și fragmente pentru răspunsurile utile, ${Math.round(A.cardChance * 100)}% șansă de carte și o mică șansă la o carte <b style="color:#ffe14d">UNICĂ</b> — garantată după ${A.uniquePity} lecții fără una.</div>
      <div class="kv" style="margin:10px 0"><span>Energie</span><b>${ai.energy} <span class="dim tiny">(+1/h până la ${A.energyMax}; victoriile din quiz adaugă în plus, până la ${A.energyWonCap})</span></b><span>Lecții</span><b>${ai.rounds}</b><span>Răspunsuri utile predate</span><b class="good">${ai.useful}</b><span>Următorul prag AI</span><b>încă ${nRo(toMs, 'răspuns', 'răspunsuri')} → +${nRo(A.milestoneShards, 'fragment', 'fragmente')} și Recalibrator</b><span>Garanție Unică</span><b>${ai.pity}/${A.uniquePity}</b><span>Conexiune AI</span><b class="small">${bridge}</b></div>
      ${btn(UI.aiBusy ? 'Conectare la AI…' : 'Începe o lecție (1 energie)', 'aiStart', undefined, UI.aiBusy ? 'Te rog așteaptă' : whyAIStart(), 'block primary big')}</div>
    ${last}
    <div class="card" style="margin-top:10px"><h4>Răspunsurile tale</h4><div class="small dim">${nRo(ai.collected.length, 'răspuns salvat', 'răspunsuri salvate')} pe acest dispozitiv${AI_BRIDGE.connected() ? '' : ', în așteptarea conectării AI-ului'}.</div>
      <div class="row" style="margin-top:6px">${btn('Exportă răspunsurile (JSON)', 'aiExport', undefined, ai.collected.length ? '' : 'Încă nu ai răspunsuri', 'sm accent')}</div></div>`;
}

// ============================================================
// LOG
// ============================================================
function htmlLogShell() {
  return `<div class="row between" style="margin-bottom:6px"><h3 style="margin:0">${ic('log')} Jurnal terminal</h3><div class="logf">${Object.keys(UI.logFilter).map(k => `<button class="chip ${UI.logFilter[k] ? 'on' : ''}" data-act="logFilter" data-args='"${k}"'>${LOG_TAG_RO[k] || k}</button>`).join('')}</div></div><div id="log"></div>`;
}
function logLine(e) {
  return `<div class="ln"><span class="t">${gameClock(e.t)}</span><span class="lt ${e.tag}">${LOG_TAG_RO[e.tag] || e.tag}</span>${esc(e.msg)}</div>`;
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
  const it = [['left', 'AI', 'pet'], ['center', 'Joacă', 'arena'], ['right', 'Cărți', 'nft'], ['log', 'Jurnal', 'log']];
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
  try { res = fn(); } catch (e) { console.error(e); res = { ok: false, msg: 'Eroare: ' + e.message }; }
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
  centerTab(t) { if (CENTER_FEATURE[t] && !isUnlocked(CENTER_FEATURE[t])) return; UI.centerTab = t; seenFeatureTab(t); },
  rightTab(t) { if (RIGHT_FEATURE[t] && !isUnlocked(RIGHT_FEATURE[t])) return; UI.rightTab = t; seenFeatureTab(t); },
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
    confirmBox('Demolezi standul?', `Standul x${CONFIG.STAND_TIERS[s.tier].mult} va fi eliminat. Primești înapoi <b class="cr">${fmt(standRefund(s))} CR</b> (50%), iar terenul se eliberează.`, 'Demolează', () => doAct(() => actDemolishStand(id)), true);
  },
  startSolo() { const r = doAct(() => actSolo(performance.now()), true); if (r && r.ok) { UI.resultSeen = false; setPetState('thinking'); } },
  startMulti() { const r = doAct(() => actMulti(performance.now()), true); if (r && r.ok) { UI.resultSeen = false; setPetState('thinking'); } },
  override() {
    const r = activateOverride(ARENA, performance.now());
    if (!r.ok) toast(r.msg, 'err'); else setPetState('override');
  },
  humanAnswer(o) {
    const r = humanAnswer(ARENA, o, performance.now());
    if (r.ok) { toast(r.correct ? 'Corect! Bonus de viteză umană.' : 'Răspuns greșit — 0 puncte în runda asta.', r.correct ? '' : 'err'); setPetState(r.correct ? 'correct' : 'wrong', 900); }
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
    confirmBox('Evoluezi cartea?', `<b>${esc(cardLabel(c))}</b> devine <b style="color:${rarityColor(c.rarity + 1)}">${rarityName(c.rarity + 1)} +0</b>: bază mai puternică, ${nRo(CONFIG.CARDS.rarities[c.rarity + 1].bonus, 'statistică bonus', 'statistici bonus')} și poate fi îmbunătățită din nou.<div class="kv" style="margin-top:8px"><span>Cost</span><b class="cr">${cardCostText(k)}</b></div>`, 'Evoluează', () => {
      const r = doAct(() => actEvolveCard(id), true);
      if (r && r.ok) playEvolveAnim(r.card);
    });
  },
  rerollCard(id) {
    const c = S.inv.find(x => x.id === id); if (!c) return;
    confirmBox('Regenerezi statisticile bonus?', `Toate statisticile bonus aleatorii ale cărții <b>${esc(cardLabel(c))}</b> sunt înlocuite cu altele noi (statistica principală fixă rămâne). Consumă 1 Recalibrator neural — ai ${S.player.recal}.`, 'Regenerează', () => { const r = doAct(() => actRerollCard(id)); if (r && r.ok) openNftDetail(id); });
  },
  salvageOne(id) {
    const n = S.inv.find(x => x.id === id); if (!n) return;
    confirmBox('Dezmembrezi cartea?', `${esc(cardLabel(n))} va fi distrusă pentru <b class="shardc">${nRo(salvageValue(n), 'fragment', 'fragmente')}</b>.`, 'Dezmembrează', () => { doAct(() => actSalvage([id])); UI.selected = UI.selected.filter(x => x !== id); }, true);
  },
  selectOne(id, noModal) {
    if (UI.selected.includes(id)) UI.selected = UI.selected.filter(x => x !== id);
    else UI.selected.push(id);
    UI.selectMode = true;
    if (!noModal) closeModal();
  },
  toggleSelect() { UI.selectMode = !UI.selectMode; if (!UI.selectMode) UI.selected = []; },
  clearSel() { UI.selected = []; },
  selCommon() { UI.selected = S.inv.filter(c => c.rarity === 0 && !cardStatusReason(c)).map(c => c.id); toast('Cărți Comune selectate: ' + UI.selected.length); },
  salvageSelected() {
    const items = UI.selected.map(id => S.inv.find(n => n.id === id)).filter(Boolean);
    const v = items.reduce((s2, n) => s2 + salvageValue(n), 0);
    confirmBox('Dezmembrezi selecția?', `${nRo(items.length, 'carte va fi distrusă', 'cărți vor fi distruse')} pentru <b class="shardc">${nRo(v, 'fragment', 'fragmente')}</b>.`, 'Dezmembrează', () => { const r = doAct(() => actSalvage(UI.selected)); if (r && r.ok) UI.selected = []; }, true);
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
      if (qs) src = 'bridge'; else toast('AI-ul nu a răspuns – folosim întrebări offline', 'warn');
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
      toast('Răspunsuri exportate');
    } catch (e) { toast('Exportul a eșuat: ' + e.message, 'err'); }
  },
  aiDelete() {
    confirmBox('Ștergi răspunsurile din Laboratorul AI?', `Toate răspunsurile salvate pe acest dispozitiv (${S.ai.collected.length}) vor fi șterse. Recompensele deja primite rămân.`, 'Șterge', () => { S.ai.collected = []; saveGame(); toast('Răspunsuri șterse'); }, true);
  },
  aiEndpoint() { AI_BRIDGE.setEndpoint(UI.inputs.aiEndpoint || ''); toast(AI_BRIDGE.connected() ? 'Adresa AI a fost salvată' : 'AI deconectat (mod offline)'); openSettings(); },
  listNft(id) {
    const r = doAct(() => actListCard(id, UI.inputs.sellPrice || fairValue(S.inv.find(n => n.id === id)), UI.inputs.sellVenue));
    if (r && r.ok) { UI.inputs.sellPrice = ''; closeModal(); }
  },
  cancelListing(id) { doAct(() => actCancelListing(id)); },
  buyListing(id) { const r = doAct(() => actBuyListing(id)); if (r && r.ok && UI.modalOpen) closeModal(); },
  buildMarketStand() { confirmBox('Construiești standul de piață?', `Costă <b class="cr">${fmt(CONFIG.MARKET.standCost)} CR</b> și folosește ${fmt(CONFIG.MARKET.standLand)} SU din terenul tău, plus ${fmt(CONFIG.MARKET.standLevels[0].upkeep)} CR/h întreținere.`, 'Construiește', () => doAct(() => actBuildMarketStand())); },
  upgradeMarketStand() { doAct(() => actUpgradeMarketStand()); },
  demolishMarketStand() { confirmBox('Demolezi standul de piață?', 'Primești înapoi 50% din investiție, iar terenul se eliberează.', 'Demolează', () => doAct(() => actDemolishMarketStand()), true); },
  joinGuild(id) { doAct(() => actJoinGuild(id)); },
  createGuild() { const r = doAct(() => actCreateGuild(UI.inputs.guildName || '')); if (r && r.ok) UI.inputs.guildName = ''; },
  leaveGuild() { confirmBox('Părăsești breasla?', 'Contribuțiile tale rămân la breaslă și trebuie să aștepți 24 h (timp de joc) înainte să intri în alta.', 'Pleacă', () => doAct(() => actLeaveGuild()), true); },
  donate() { const r = doAct(() => actDonate(Number(UI.inputs.donate))); if (r && r.ok) UI.inputs.donate = ''; },
  upgradeHQ() { doAct(() => actUpgradeHQ()); },
  buyCosmetic(id) { doAct(() => actBuyCosmetic(id)); },
  useCosmetic(id) { doAct(() => actUseCosmetic(id)); UI.lastHtml = {}; Art.clear(); },
  explore(i) {
    const r = doAct(() => actExplore(i), true);
    if (r && r.ok) toast('Sectorul #' + (i + 1) + ': ' + r.msg, r.kind === 'nft' || r.kind === 'jackpot' ? 'warn' : '');
  },
  exploreAll() { doAct(() => actExploreAll()); },
  tilePage(p) { UI.tilePage = p; },
  claimMission(i) { doAct(() => actClaimMission(i)); },
  rebirth() {
    confirmBox('Renaștere neurală?', `Statisticile AI-ului, standurile și ratingul se resetează. Primești <b class="good">+${legacyGain()} Moștenire</b> (bonus permanent). Cărțile, terenul, CR, breasla și cosmeticele se păstrează.`, 'Renaște', () => doAct(() => actRebirth()), true);
  },
  rename() {
    openModal(modalHead('Redenumește-ți AI-ul') + `<div class="field"><input type="text" maxlength="16" data-in="name" value="${esc(S.player.name)}">${btn('Salvează', 'saveName', undefined, '', 'primary')}</div>`);
  },
  saveName() { const r = doAct(() => actSetName(UI.inputs.name || S.player.name)); if (r && r.ok) closeModal(); },
  openSettings() { openSettings(); },
  exportSave() {
    const ta = document.getElementById('savebox');
    if (ta) { ta.value = exportSave(); ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Salvarea a fost copiată în clipboard'); } catch (e) { toast('Selectează și copiază textul'); } }
  },
  importSave() {
    const ta = document.getElementById('savebox');
    try { const st = importSave(ta.value); S = st; ARENA = null; saveGame(); closeModal(); UI.lastHtml = {}; renderLogShell(); toast('Salvare importată'); }
    catch (e) { toast('Salvare invalidă: ' + e.message, 'err'); }
  },
  resetGame() {
    confirmBox('Resetezi jocul?', 'Asta îți șterge progresul de pe acest dispozitiv. Exportă mai întâi salvarea dacă vrei s-o păstrezi.', 'Da, continuă', () => {
      confirmBox('Ești absolut sigur?', '<b class="bad">Totul se va pierde.</b>', 'ȘTERGE TOT', () => { wipeSave(); if (CLOUD.loggedIn()) CLOUD.logout(); S = newState(); ARENA = null; saveGame(); UI.lastHtml = {}; UI.lastResult = null; renderLogShell(); log('SYSTEM', 'Joc nou început.'); showTutorial(0); }, true);
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
    if (k === 'live') { if (typeof LiveQuiz !== 'undefined') LiveQuiz.refresh(true).then(() => toast('Quiz live: ' + nRo(LiveQuiz.pool.length, 'întrebare', 'întrebări'))); }
    if (k === 'rating') { p.rating += 100; updatePlayerLeague(); }
    if (k === 'crit') { S.server.botLand = Math.max(S.server.botLand, Math.ceil(S.server.total * 0.51) - (usedSpace() - S.server.botLand)); checkServerCapacity(); }
    if (k === 'season') { S.season.start = S.time - CONFIG.SEASON.lengthMs; }
    if (k === 'hour') simulate(CONFIG.HOUR);
    if (k === 'stamina') p.stamina = CONFIG.SOLO.staminaMax;
    if (k === 'unlock') { unlockAll(); toast('Toate secțiunile au fost deblocate'); }
    saveGame(); openDebug();
  },
  dbgTests() {
    const box = document.getElementById('dbgtests');
    if (box) box.innerHTML = '<div class="dim">Se rulează…</div>';
    setTimeout(() => {
      const res = runSelfTests({ quick: false });
      if (box) box.innerHTML = res.map(r => `<div class="${r.pass ? 'good' : 'bad'} small">${r.pass ? 'PASS' : 'FAIL'} — ${esc(r.name)} <span class="dim">(${r.ms} ms) ${esc(r.msg)}</span></div>`).join('');
      UI.lastHtml = {}; renderAll();
    }, 30);
  },
};
// ============================================================
// FREE PRACTICE (you answer yourself)
// ============================================================
function openPractice() {
  const m = PRACTICE;
  if (!m) return;
  UI.modalKind = { type: 'practice' };
  const fb = m.last ? `<div class="${m.last.right ? 'good' : 'bad'} small" style="margin-bottom:8px">${m.last.right ? '✓ Corect!' : '✗ Greșit — răspunsul era <b>' + esc(m.last.answer) + '</b>'}</div>` : '';
  if (m.done) {
    openModal(modalHead('Antrenament liber') + fb + `<div class="center" style="padding:10px"><div class="result-big">${m.correct}/${m.qs.length}</div><div class="cr" style="margin-top:6px">+${fmt(m.cr)} CR</div></div>
      <div class="row" style="justify-content:center">${btn('Gata', 'closeModal', undefined, '', 'primary')}</div>`);
    return;
  }
  const q = m.qs[m.i];
  openModal(modalHead(`Antrenament liber · ${m.i + 1}/${m.qs.length}`) + fb + `<div class="tiny dim">${q.kind === 'math' ? 'MATEMATICĂ' : 'CULTURĂ GENERALĂ · ' + esc(q.cat).toUpperCase()} · dificultate ${q.diff}/10</div>
    <div class="qtext" style="margin:10px 0">${esc(q.text)}</div>
    <div class="opts">${q.options.map(o => `<button class="opt live" data-act="practiceAnswer" data-args="${esc(JSON.stringify(o))}">${esc(o)}</button>`).join('')}</div>`);
}
Object.assign(HANDLERS, {
  claimDaily() { doAct(() => actClaimDaily(todayStr())); },
  rescue() { doAct(() => actRescue()); },
  startPractice() { const r = doAct(() => actStartPractice(), true); if (r && r.ok) openPractice(); },
  practiceAnswer(o) { practiceAnswer(o); openPractice(); if (PRACTICE && PRACTICE.done) saveGame(); },
});

// ============================================================
// QUIZ RAPID & SUPRAVIEȚUIRE (jucătorul răspunde) — fereastră proprie
// ============================================================
const OPT_KEYS = ['A', 'B', 'C', 'D'];
function htmlQuickGame(m) {
  const Q = CONFIG.QUICK, surv = m.mode === 'survival';
  const title = surv ? '♥ Supraviețuire' : '▶ Quiz Rapid';
  const head = `<div class="modal-head"><h2>${title}</h2><button class="iconbtn" data-act="quickQuit" aria-label="${m.done ? 'Închide' : 'Renunță'}" title="${m.done ? 'Închide' : 'Renunță (păstrezi recompensele de până acum)'}">✕</button></div>`;
  if (m.done) return head + htmlQuickEnd(m);
  const q = m.q, reveal = m.phase === 'reveal', last = m.last;
  const mult = quickComboMult(m.streak);
  const left = surv
    ? `<div><span class="hearts">${'♥'.repeat(Math.max(0, m.lives))}<span class="mute">${'♥'.repeat(Math.max(0, Q.survival.lives - m.lives))}</span></span><div class="tiny dim">Nivel ${q.level}/10 · corecte ${m.correct}${S.quick.survBest ? ' · record ' + S.quick.survBest : ''}</div></div>`
    : `<div><div class="tiny dim qlabel">ÎNTREBAREA</div><b class="qnum">${Math.min(m.i + (reveal ? 0 : 1), m.n)}</b><span class="dim">/${m.n}</span><div class="qdots">${Array.from({ length: m.n }, (_, i) => `<i class="${i < m.answered ? (m.hist[i] ? 'ok' : 'bad') : i === m.answered ? 'cur' : ''}"></i>`).join('')}</div></div>`;
  const combo = `<div class="qcombo ${mult > 1 ? 'on' : ''} ${reveal && last && last.comboUp ? 'bump' : ''}">×${String(mult).replace('.', ',')}<small>COMBO</small></div>`;
  const right = `<div class="qscore"><b>${fmt(m.score)}</b> <span class="tiny dim">puncte</span><div class="cr small">+${fmt(m.cr)} CR</div></div>`;
  const opts = q.options.map((o, i) => {
    let cls = 'opt qopt';
    const removed = m.removed.includes(o);
    if (removed) cls += ' removed';
    if (reveal) {
      if (o === q.answer) cls += ' right';
      else if (last && last.choice === o) cls += ' wrongpick';
      else cls += ' faded';
    } else if (!removed) cls += ' live';
    if (m.aiHint && m.aiHint.option === o) cls += ' aipick';
    const mark = m.aiHint && m.aiHint.option === o ? `<span class="aimark">🤖 ${m.aiHint.conf}%</span>` : '';
    const dis = reveal || removed ? ' disabled' : '';
    return `<button type="button" class="${cls}" data-act="quickAnswer" data-args="${i}"${dis}><b class="okey">${OPT_KEYS[i]}</b> ${esc(o)}${mark}</button>`;
  }).join('');
  let fb = '';
  if (reveal && last) {
    if (last.right) fb = `<span class="good">✓ Corect! +${fmt(last.cr)} CR · +${last.pts} puncte${last.comboUp ? ` · <b class="warn">COMBO ×${String(quickComboMult(m.streak)).replace('.', ',')}!</b>` : ''}</span>`;
    else fb = `<span class="bad">${last.timeout ? '⏱ Timp expirat' : '✗ Greșit'} — răspunsul corect: <b>${esc(last.answer)}</b>${surv ? ' · −1 viață' : ''}</span>`;
  } else if (m.aiHint) {
    fb = `<span style="color:var(--b)">🤖 AI-ul tău crede că e <b>„${esc(m.aiHint.option)}”</b> · încredere ${m.aiHint.conf}%</span>`;
  }
  const qa = !reveal && !m.aiHint && m.aiLeft > 0 ? '' : (m.aiLeft <= 0 && !m.aiHint ? 'Ai folosit „Întreabă AI-ul” în acest joc' : 'Indisponibil acum');
  const qf = !reveal && !m.removed.length && m.fiftyLeft > 0 ? '' : (m.fiftyLeft <= 0 && !m.removed.length ? 'Ai folosit 50/50 în acest joc' : 'Indisponibil acum');
  const core = equippedOfType('core');
  const tip = core ? `<span class="good">Nucleu echipat: +${Q.coreBonusAI} „Întreabă AI-ul” pe joc</span>` : `Sfat: o carte <b>Nucleu</b> echipată îți dă încă un „Întreabă AI-ul”. Antrenează AI-ul ca să fie mai sigur pe el.`;
  return head + `<div class="qhead">${left}${combo}${right}</div>
    <div class="qtimer-row"><div class="timer"><i id="qbar"></i></div><span id="qsec">${Math.ceil(Q.timeMs / 1000)}</span></div>
    <div class="tiny dim">${q.kind === 'math' ? 'MATEMATICĂ' : 'CULTURĂ GENERALĂ · ' + esc(q.cat).toUpperCase()} · dificultate ${q.diff}/10</div>
    <div class="qtext">${esc(q.text)}</div>
    <div class="opts">${opts}</div>
    <div class="qfb">${fb}</div>
    <div class="qhelpers">${btn(`🤖 Întreabă AI-ul <span class="cost">(${m.aiLeft})</span>`, 'quickAI', undefined, qa, 'accent')}${btn(`✂ 50/50 <span class="cost">(${m.fiftyLeft})</span>`, 'quickFifty', undefined, qf, '')}</div>
    <div class="tiny dim qtip">${tip}</div>
    ${m.full ? '' : `<div class="tiny warn" style="margin-top:4px">Ai jucat deja ${CONFIG.QUICK.dailyFull} jocuri azi: acum primești ${Math.round(Q.reducedMult * 100)}% din recompense.</div>`}`;
}
function htmlQuickEnd(m) {
  const r = m.result || {}, surv = m.mode === 'survival', d = quickDay();
  const big = surv ? `${r.correct} <span class="small dim">corecte</span>` : `${fmt(r.score)} <span class="small dim">puncte</span>`;
  const rewards = [`<span class="cr">+${fmt(r.cr)} CR</span>`, `<span class="dtc">+${r.dt} DT</span>`];
  if (r.energy) rewards.push(`<span class="dtc">+${r.energy} energie Laborator AI</span>`);
  if (r.tax) rewards.push(`<span class="gvc">seiful breslei +${fmt(r.tax)} GV</span>`);
  return `<div class="quick-end center">
    ${r.record ? '<div class="record">RECORD NOU!</div>' : r.firstBest ? '<div class="tiny dim" style="letter-spacing:.1em">PRIMUL TĂU RECORD</div>' : ''}
    ${r.perfect ? '<div class="good" style="font-weight:800;letter-spacing:.08em">PERFECT 10/10!</div>' : ''}
    <div class="result-big">${big}</div>
    ${r.abandoned ? '<div class="tiny warn">Joc întrerupt — ai păstrat recompensele de până acum.</div>' : ''}
    <div class="kv end-kv"><span>Răspunsuri corecte</span><b>${r.correct}/${surv ? r.answered : r.total}</b>
      ${surv ? `<span>Scor</span><b>${fmt(r.score)}</b>` : ''}
      <span>Cel mai bun combo</span><b class="warn">×${String(r.bestMult || 1).replace('.', ',')} <span class="dim">(${nRo(r.bestStreak || 0, 'corect', 'corecte')} la rând)</span></b>
      <span>${surv ? 'Record Supraviețuire' : 'Record Quiz Rapid'}</span><b>${surv ? S.quick.survBest : fmt(S.quick.best)}</b></div>
    <div class="end-rewards">${rewards.join(' · ')}</div>
    ${r.card ? `<div style="margin:12px auto 0;max-width:160px">${nftCard(r.card)}</div><div class="good small">CARTE OBȚINUTĂ!</div>` : ''}
    <div class="tiny ${d.full ? 'dim' : 'warn'}" style="margin-top:6px">Jocuri cu recompensă întreagă azi: ${d.used}/${d.limit}${r.full ? '' : ' · acest joc: 25% din recompense'}</div>
    ${r.unlocked && r.unlocked.length ? `<div class="col" style="margin-top:12px;text-align:left">${htmlUnlocked(r.unlocked)}</div>` : ''}
    <div class="row end-btns">${btn('↻ Joacă din nou', 'quickAgain', undefined, '', 'primary big')}${btn('Închide', 'quickClose', undefined, '', 'big')}</div>
  </div>`;
}
function openQuick() {
  openModal('', true);
  UI.modalKind = { type: 'quick' };
  UI.lastQuickHtml = null;
  const box = $('#modal .modal-box');
  if (box) box.classList.add('quick-box');
  renderQuick();
}
function quickModalOpen() { return !!(UI.modalOpen && UI.modalKind && UI.modalKind.type === 'quick'); }
function renderQuick() {
  if (!QUICK || !quickModalOpen()) return;
  const html = htmlQuickGame(QUICK);
  if (html !== UI.lastQuickHtml) {
    UI.lastQuickHtml = html;
    const box = $('#modal .modal-box');
    if (box) box.innerHTML = html;
  }
  updateQuickTimer();
}
function updateQuickTimer() {
  const m = QUICK, bar = document.getElementById('qbar'), sec = document.getElementById('qsec');
  if (!m || !bar) return;
  const T = CONFIG.QUICK.timeMs;
  const left = m.phase === 'question' ? clamp(1 - (performance.now() - m.qStart) / T, 0, 1) : 0;
  bar.style.transform = `scaleX(${left.toFixed(3)})`;
  bar.style.background = left < 0.25 ? 'var(--bad)' : left < 0.5 ? 'var(--warn)' : 'var(--b)';
  if (sec) { const s = String(Math.ceil(left * T / 1000)); if (sec.textContent !== s) sec.textContent = s; sec.className = left < 0.25 ? 'bad' : ''; }
}
// apelat la fiecare cadru din main.js
function quickTick(now) {
  const m = QUICK;
  if (!m || m.done) return;
  const wasPhase = m.phase;
  if (quickUpdate(now)) {
    if (wasPhase === 'question' && m.last) setPetState('wrong', 900); // timp expirat
    if (m.done) afterQuickDone();
    else renderQuick();
  }
  updateQuickTimer();
}
function afterQuickDone() {
  const m = QUICK, r = m && m.result;
  if (!r) return;
  if (r.answered) {
    UI.lastResult = `${m.mode === 'quick' ? 'Quiz Rapid' : 'Supraviețuire'} — ${r.correct} corecte, ${fmt(r.score)} puncte, <span class="cr">+${fmt(r.cr)} CR</span> · <span class="dtc">+${r.dt} DT</span>${r.record ? ' · <b class="warn">record nou!</b>' : ''}`;
    setPetState(r.record || r.perfect ? 'correct' : 'idle', 1500);
  }
  if (!quickModalOpen()) { // fereastra a fost închisă între timp
    if (r.unlocked && r.unlocked.length) toast('Nou deblocat: ' + r.unlocked.map(f => f.name).join(', '), 'warn');
  }
  renderQuick();
  renderAll();
}
function startQuickUI(mode) {
  const r = doAct(() => startQuickGame(mode, performance.now()), true);
  if (r && r.ok) openQuick();
}
Object.assign(HANDLERS, {
  startQuick() { QUICK = QUICK && QUICK.done ? null : QUICK; startQuickUI('quick'); },
  startSurvival() { QUICK = QUICK && QUICK.done ? null : QUICK; startQuickUI('survival'); },
  quickAnswer(i) {
    const m = QUICK;
    if (!m || m.done || m.phase !== 'question') return;
    const o = m.q.options[i];
    if (o === undefined || m.removed.includes(o)) return;
    const r = quickAnswer(m, o, performance.now());
    if (r.ok) setPetState(m.last.right ? 'correct' : 'wrong', 900);
    renderQuick();
  },
  quickAI() { const r = quickAskAI(QUICK); if (!r.ok) toast(r.msg, 'err'); else setPetState('thinking', 1200); renderQuick(); },
  quickFifty() { const r = quickFifty(QUICK); if (!r.ok) toast(r.msg, 'err'); renderQuick(); },
  quickQuit() {
    if (QUICK && !QUICK.done) { finishQuick(QUICK, true); afterQuickDone(); if (!QUICK.result.answered) { QUICK = null; closeModal(); } }
    else { closeModal(); }
  },
  quickClose() { closeModal(); },
  quickAgain() { const mode = QUICK ? QUICK.mode : 'quick'; QUICK = null; closeModal(); startQuickUI(mode); },
  nsEquip(id) { doAct(() => actEquip(id)); },
  gotoFeature(id) {
    const f = featureById(id); if (!f || !isUnlocked(id)) return;
    if (quickModalOpen() || UI.modalOpen) closeModal();
    if (f.panel === 'center') { UI.centerTab = f.tab; UI.view = 'center'; }
    else if (f.panel === 'right') { UI.rightTab = f.tab; UI.view = 'right'; }
    else UI.view = 'left';
    if (S.unlock.fresh === id) S.unlock.fresh = null;
    renderAll();
    setTimeout(() => {
      const el = f.panel === 'left' ? document.getElementById('stands') : null;
      if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 90), behavior: 'smooth' });
      else window.scrollTo(0, 0);
    }, 30);
  },
});

// ============================================================
// ACCOUNT (ID + PIN cloud save)
// ============================================================
function fmtAgo(ms) { if (!ms) return 'niciodată'; const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? 'acum ' + s + ' s' : s < 3600 ? 'acum ' + Math.round(s / 60) + ' min' : 'acum ' + Math.round(s / 3600) + ' h'; }
function openAccount(msg) {
  UI.modalKind = { type: 'account' };
  const err = msg ? `<div class="${msg.ok ? 'good' : 'bad'} small" style="margin-bottom:8px">${esc(msg.text)}</div>` : '';
  if (!CLOUD.enabled()) {
    openModal(modalHead('Cont') + `<div class="small">Conturile cloud nu sunt încă activate pe acest server. Progresul tău e salvat pe acest dispozitiv; folosește Setări → Exportă ca să-l muți.</div>`);
    return;
  }
  if (!CLOUD.loggedIn()) {
    openModal(modalHead('☁ Contul tău') + err + `<div class="small dim" style="margin-bottom:10px">Alege un <b>ID</b> și un <b>PIN</b> — fără e-mail, fără confirmare. Cu ele poți continua jocul pe orice telefon sau calculator.</div>
      <div class="col"><input type="text" maxlength="20" autocomplete="username" placeholder="ID (3-20 litere/cifre)" data-in="acctUser" value="${esc(UI.inputs.acctUser || '')}">
      <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" placeholder="PIN (4-8 cifre)" data-in="acctPin" value="${esc(UI.inputs.acctPin || '')}"></div>
      <div class="row" style="margin-top:10px">${btn('Conectare', 'acctLogin', undefined, UI.acctBusy ? 'Te rog așteaptă' : '', 'primary')}${btn('Creează cont', 'acctRegister', undefined, UI.acctBusy ? 'Te rog așteaptă' : '', 'accent')}</div>
      <div class="tiny mute" style="margin-top:8px">Ține minte PIN-ul: nu există e-mail pentru recuperare. Nu folosi un PIN pe care îl ai la bancă sau la telefon. 5 PIN-uri greșite blochează contul pentru 15 minute.</div>`);
    return;
  }
  const a = CLOUD.acct, st = CLOUD.status;
  const stTxt = st === 'conflict' ? '<b class="warn">Alt dispozitiv a salvat un progres mai nou</b>' : st === 'error' ? `<b class="bad">${esc(CLOUD.errText(CLOUD.lastError))}</b>` : st === 'syncing' ? 'se sincronizează…' : '<b class="good">salvat</b>';
  const conflict = st === 'conflict' ? `<div class="card hl" style="margin-top:10px"><h4>Ce progres păstrezi?</h4><div class="small dim">Contul a fost salvat de pe alt dispozitiv după ultima sincronizare a acestuia.</div>
      <div class="row" style="margin-top:8px">${btn('Încarcă progresul din cloud', 'acctLoadCloud', undefined, '', 'primary')}${btn('Păstrează acest dispozitiv (suprascrie cloud-ul)', 'acctForce', undefined, '', 'danger')}</div></div>` : '';
  openModal(modalHead('☁ ' + esc(a.user)) + err + `<div class="kv"><span>Stare</span><span>${stTxt}</span><span>Ultima salvare în cloud</span><b>${fmtAgo(a.lastSync)}</b><span>Versiune salvare</span><b>${a.version || 0}</b></div>${conflict}
    <div class="row" style="margin-top:12px">${btn('Salvează acum', 'acctSync', undefined, UI.acctBusy || st === 'conflict' ? 'Rezolvă mai întâi conflictul' : '', 'primary')}${btn('Deconectare', 'acctLogout', undefined, '', '')}</div>
    <div class="card" style="margin-top:12px"><h4>Schimbă PIN-ul</h4><div class="row"><input type="password" inputmode="numeric" maxlength="8" placeholder="PIN nou" data-in="acctNewPin" style="flex:1;width:auto">${btn('Schimbă', 'acctChangePin', undefined, '', 'sm')}</div></div>
    <div class="row" style="margin-top:10px">${btn('Șterge contul', 'acctDelete', undefined, '', 'sm danger')}</div>`);
}
async function acctRun(fn) {
  if (UI.acctBusy) return null;
  UI.acctBusy = true;
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, error: e.message }; }
  UI.acctBusy = false;
  renderAll();
  return r;
}
function adoptSave(st) {
  S = st; ARENA = null; AILAB = null;
  saveGame(); UI.lastHtml = {}; UI.lastResult = null;
  renderLogShell(); renderAll();
}
Object.assign(HANDLERS, {
  openAccount() { openAccount(); },
  async acctRegister() {
    const r = await acctRun(() => CLOUD.register(UI.inputs.acctUser, UI.inputs.acctPin));
    if (!r) return;
    if (r.ok) { UI.inputs.acctPin = ''; S.tutorialStep = Math.max(S.tutorialStep || 0, 0); saveGame(); openAccount({ ok: true, text: 'Cont creat! Progresul tău e acum salvat în cloud.' }); log('SYSTEM', `Contul cloud „${CLOUD.acct.user}” a fost creat.`); }
    else openAccount({ ok: false, text: CLOUD.errText(r.error) });
  },
  async acctLogin() {
    const r = await acctRun(() => CLOUD.login(UI.inputs.acctUser, UI.inputs.acctPin));
    if (!r) return;
    if (!r.ok) { openAccount({ ok: false, text: CLOUD.errText(r.error) }); return; }
    UI.inputs.acctPin = '';
    if (r.save) {
      adoptSave(r.save);
      closeModal();
      toast('Bine ai revenit, ' + CLOUD.acct.user + '! Progresul a fost încărcat din cloud.');
      CLOUD.lastSavedTime = S.time; CLOUD.status = 'ok';
    } else {
      await acctRun(() => CLOUD.sync(true));
      openAccount({ ok: true, text: 'Conectat. Contul era gol, așa că progresul de pe acest dispozitiv a fost salvat în el.' });
    }
  },
  async acctSync() { const r = await acctRun(() => CLOUD.sync(false)); if (r) openAccount(r.ok ? { ok: true, text: 'Salvat.' } : { ok: false, text: CLOUD.errText(r.error) }); },
  async acctForce() {
    confirmBox('Suprascrii cloud-ul?', 'Progresul salvat de pe celălalt dispozitiv va fi înlocuit cu progresul de pe acest dispozitiv.', 'Suprascrie', async () => { const r = await acctRun(() => CLOUD.sync(true)); openAccount(r && r.ok ? { ok: true, text: 'Cloud-ul a fost suprascris cu acest dispozitiv.' } : { ok: false, text: CLOUD.errText(r ? r.error : 'network') }); }, true);
  },
  async acctLoadCloud() {
    const a = CLOUD.acct;
    const r = await acctRun(() => CLOUD.login(a.user, a.pin));
    if (r && r.ok && r.save) { adoptSave(r.save); CLOUD.lastSavedTime = S.time; CLOUD.status = 'ok'; closeModal(); toast('Progresul din cloud a fost încărcat'); }
    else openAccount({ ok: false, text: CLOUD.errText(r ? r.error : 'network') });
  },
  acctLogout() {
    confirmBox('Te deconectezi?', 'Acest dispozitiv nu mai salvează în contul tău. Progresul rămâne în siguranță în cloud; te poți conecta oricând cu ID-ul și PIN-ul.', 'Deconectare', () => { CLOUD.logout(); toast('Deconectat'); });
  },
  async acctChangePin() {
    const r = await acctRun(() => CLOUD.changePin(CLOUD.acct.pin, String(UI.inputs.acctNewPin || '').trim()));
    UI.inputs.acctNewPin = '';
    openAccount(r && r.ok ? { ok: true, text: 'PIN schimbat.' } : { ok: false, text: CLOUD.errText(r ? r.error : 'network') });
  },
  acctDelete() {
    confirmBox('Ștergi contul?', 'Copia din cloud a progresului și răspunsurile tale din Laboratorul AI se șterg definitiv. Jocul de pe acest dispozitiv rămâne.', 'Șterge contul', async () => {
      const r = await acctRun(() => CLOUD.deleteAccount(CLOUD.acct.pin));
      toast(r && r.ok ? 'Cont șters' : CLOUD.errText(r ? r.error : 'network'), r && r.ok ? '' : 'err');
    }, true);
  },
  welcomeGuest() { closeModal(); showTutorial(S.tutorialStep || 0); },
  welcomeAccount() { openAccount(); },
});
// first launch on a new device: offer to log in before the tutorial
function showWelcome() {
  openModal(modalHead('Bun venit în CyberNet') + `<div class="small" style="line-height:1.6">Ai deja un cont? Conectează-te cu <b>ID</b>-ul și <b>PIN</b>-ul tău ca să continui jocul. Ești nou aici? Creează unul în câteva secunde — fără e-mail — sau joacă direct ca invitat (progresul se salvează doar pe acest dispozitiv).</div>
    <div class="col" style="margin-top:12px">${btn('Conectare / creează cont', 'welcomeAccount', undefined, '', 'block primary big')}${btn('Joacă ca invitat', 'welcomeGuest', undefined, '', 'block')}</div>`);
}

function aiSubmit(text) {
  const r = aiAnswer(text);
  if (!r.ok) return;
  UI.inputs.aiAnswer = '';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // let the panel re-render
  if (r.last) {
    const res = doAct(() => actAIFinish(), true);
    if (res && res.ok) {
      toast(res.unique ? 'CARTE UNICĂ! AI-ul tău îți mulțumește.' : `Lecție completă: ${nRo(res.useful, 'răspuns util', 'răspunsuri utile')}`, res.unique ? 'warn' : '');
      setPetState('correct', 1500);
      if (CLOUD.loggedIn() && AILAB && AILAB.batch) CLOUD.sendAIAnswers(AILAB.batch);
      if (AI_BRIDGE.connected() && AILAB && AILAB.batch) AI_BRIDGE.submitAnswers(S.player.name, AILAB.batch).then(sent => { if (!sent) toast('AI-ul nu a putut fi contactat – răspunsurile rămân pe acest dispozitiv', 'warn'); });
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
  openModal(modalHead('Setări') + `<div class="col">
    <div class="card"><h4>Salvare</h4><div class="small dim">Salvare automată la fiecare ${CONFIG.AUTOSAVE_MS / 1000} s pe acest dispozitiv${storageOk() ? '' : ' — <b class="bad">stocare indisponibilă, progresul nu va fi păstrat</b>'}. Exportă ca să muți jocul pe alt dispozitiv.</div>
      <textarea id="savebox" rows="4" placeholder="Lipește aici o salvare ca s-o imporți" style="margin-top:8px"></textarea>
      <div class="row" style="margin-top:6px">${btn('Exportă', 'exportSave', undefined, '', 'accent')}${btn('Importă', 'importSave')}${btn('Tutorial', 'tutorial', 0)}${btn('Unelte pentru dezvoltatori', 'dbgOpen')}</div></div>
    <div class="card"><h4>Cont</h4><div class="small dim">${CLOUD.enabled() ? (CLOUD.loggedIn() ? `Conectat ca <b class="good">${esc(CLOUD.acct.user)}</b> — progresul se salvează în cloud.` : 'Neconectat — progresul se salvează doar pe acest dispozitiv.') : 'Conturile cloud nu sunt încă activate pe acest server — progresul se salvează doar pe acest dispozitiv. Folosește Exportă ca să-l muți.'}</div>
      ${CLOUD.enabled() ? `<div class="row" style="margin-top:6px">${btn(CLOUD.loggedIn() ? 'Gestionează contul' : 'Conectare / creează cont', 'openAccount', undefined, '', 'sm primary')}</div>` : ''}</div>
    <div class="card"><h4>Laborator AI</h4><div class="small dim">${nRo(S.ai.collected.length, 'răspuns salvat', 'răspunsuri salvate')} pe acest dispozitiv. Conexiune AI: ${AI_BRIDGE.connected() ? '<b class="good">' + esc(AI_BRIDGE.endpoint) + '</b>' : '<b class="warn">offline</b>'}</div>
      <div class="field" style="margin-top:6px"><input type="text" placeholder="Adresa AI, ex. http://localhost:8765 (gol = offline)" data-in="aiEndpoint" value="${esc(UI.inputs.aiEndpoint !== undefined ? UI.inputs.aiEndpoint : AI_BRIDGE.endpoint)}">${btn('Salvează', 'aiEndpoint', undefined, '', 'sm')}</div>
      <div class="row" style="margin-top:6px">${btn('Exportă răspunsurile mele', 'aiExport', undefined, S.ai.collected.length ? '' : 'Încă nu ai răspunsuri', 'sm')}${btn('Șterge răspunsurile mele din Laboratorul AI', 'aiDelete', undefined, S.ai.collected.length ? '' : 'Încă nu ai răspunsuri', 'sm danger')}</div></div>
    <div class="card"><h4>Joc</h4><div class="kv"><span>Timp de joc</span><b>${gameClock(S.time)}</b><span>Seed</span><b>${S.seed}</b><span>Versiune</span><b>${CONFIG.VERSION}</b></div>
      <div class="row" style="margin-top:8px">${btn('Resetează jocul', 'resetGame', undefined, '', 'danger')}</div></div></div>`);
}
HANDLERS.dbgOpen = () => openDebug();
function openDebug() {
  UI.debug = true;
  const e = S.econ;
  const infl = e.lastHour.burned ? (e.lastHour.minted / e.lastHour.burned).toFixed(2) : '∞';
  openModal(modalHead('Panou de depanare') + `<div class="col">
    <div class="row"><span class="small">Viteza timpului:</span>${[1, 10, 100].map(x => `<button class="chip ${UI.speed === x ? 'on' : ''}" data-act="dbgSpeed" data-args="${x}">x${x}</button>`).join('')}${btn('+1 oră', 'dbgAdd', 'hour', '', 'sm')}</div>
    <div class="row">${[['cr', '+100K CR'], ['dt', '+100 DT'], ['land', '+1000 SU'], ['shards', '+500 fragmente'], ['nft', '+Echipament Rar (4 tipuri)'], ['nftrand', '+10 cărți'], ['unique', '+1 Unică'], ['recal', '+5 Recalibratoare'], ['energy', 'Energie AI maximă'], ['live', 'Reîmprospătează quiz live'], ['rating', '+100 rating'], ['stamina', 'Stamina plină'], ['crit', 'Forțează starea critică'], ['season', 'Încheie sezonul'], ['unlock', 'Deblochează tot']].map(([k, l]) => btn(l, 'dbgAdd', k, '', 'sm')).join('')}</div>
    <div class="card"><h4>Economie</h4><div class="kv"><span>CR emise total</span><b>${fmt(e.minted)}</b><span>CR arse total</span><b>${fmt(e.burned)}</b><span>Ultima oră emise / arse</span><b>${fmt(e.lastHour.minted)} / ${fmt(e.lastHour.burned)}</b><span>Indicator inflație (emise/arse)</span><b class="${infl > 2 ? 'warn' : 'good'}">${infl}</b><span>Cache grafică</span><b>${Art.cacheSize()}</b><span>Anunțuri pe piață</span><b>${S.market.listings.length}</b></div></div>
    <div class="card"><div class="row between"><h4 style="margin:0">Autoteste</h4>${btn('Rulează testele', 'dbgTests', undefined, '', 'sm primary')}</div><div id="dbgtests" style="margin-top:6px"></div></div></div>`, true);
}

// ---------- tutorial ----------
const TUTORIAL = [
  ['Răspunzi la întrebări, câștigi CR și DT', `Apasă <b class="good">▶ Joacă acum — Quiz Rapid</b>: 10 întrebări, iar <b>tu</b> alegi răspunsul. Răspunsurile corecte la rând cresc <b class="warn">combo</b>-ul (până la ×3) și îți aduc <b class="cr">Credite (CR)</b> și <b class="dtc">Tokeni de date (DT)</b>.`],
  ['Antrenează-ți AI-ul cu DT', `Cheltuie DT în panoul <b>Baza de antrenament AI</b> ca să-i crești AI-ului tău IQ-ul matematic și cultura generală. Un AI mai bun îți dă sugestii mai sigure când apeși <b>🤖 Întreabă AI-ul</b> și joacă singur în <b>Arena Solo</b>.`],
  ['Restul se deblochează pe măsură ce joci', `Multiplayer, Piața, Laboratorul AI, terenul, sezonul și breslele apar treptat, după câteva jocuri. Nu trebuie să înveți totul acum — cardul <b style="color:var(--b)">Următorul pas</b> îți spune mereu ce merită făcut.`],
];
function showTutorial(step) {
  if (step >= TUTORIAL.length) { S.tutorialStep = TUTORIAL.length; saveGame(); closeModal(); return; }
  const [t, b] = TUTORIAL[step];
  openModal(modalHead(`${step + 1}/${TUTORIAL.length} · ${t}`) + `<div style="line-height:1.6">${b}</div><div class="row" style="justify-content:flex-end;margin-top:14px">${btn('Sari peste', 'tutorial', TUTORIAL.length)}${btn(step === TUTORIAL.length - 1 ? 'Începe să joci' : 'Înainte', 'tutorial', step + 1, '', 'primary')}</div>`);
}

function showAwaySummary(before, ms) {
  const g = playerGuild();
  const d = (a, b) => b - a;
  const rows = [
    ['Timp simulat', fmtTime(ms)],
    ['Credite', `${d(before.cr, S.player.cr) >= 0 ? '+' : ''}${fmt(d(before.cr, S.player.cr))} CR`],
    ['Tokeni de date', `+${Math.max(0, d(before.dt, S.player.dt))} DT`],
    ['Cărți vândute', d(before.sold, counter('cardSold') + counter('nftSold'))],
    ['Comisioane stand', `+${fmt(d(before.comm, S.market.standEarned))} CR`],
    ['Extinderi server', d(before.exp, S.server.expansions)],
  ];
  if (g && before.vault !== null) rows.push(['Seiful breslei', `+${fmt(d(before.vault, g.vault))} GV`]);
  openModal(modalHead('Cât ai lipsit') + `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>
    <div class="tiny dim" style="margin-top:8px">Progresul offline e limitat la ${CONFIG.OFFLINE_CAP_HOURS} ore: venitul pasiv, întreținerea, fluxul de DT și restul lumii continuă; turneele nu.</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px">${btn('Continuă', 'closeModal', undefined, '', 'primary')}</div>`);
}

function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) { if (e.target.id === 'modal' && !quickModalOpen()) closeModal(); return; }
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
    if (e.key === 'Escape' && UI.modalOpen) { if (quickModalOpen()) { if (QUICK && QUICK.done) closeModal(); } else closeModal(); }
    if (quickModalOpen() && QUICK && !QUICK.done && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toUpperCase(), i = ['1', '2', '3', '4'].indexOf(k) >= 0 ? Number(k) - 1 : OPT_KEYS.indexOf(k);
      if (i >= 0) { e.preventDefault(); HANDLERS.quickAnswer(i); return; }
    }
    if (e.key === '`' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) openDebug();
    if (e.key === 'Enter' && document.activeElement && document.activeElement.dataset.in === 'donate') HANDLERS.donate();
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement && document.activeElement.dataset.in === 'aiAnswer') { e.preventDefault(); HANDLERS.aiSend(); }
  });
  onLog = appendLog;
}
