'use strict';
/* ============================================================
   TERITORIU — harta rețelei (7 × 7 sectoare în 8 cartiere),
   dueluri de quiz pentru sectoare, atacuri de apărare, bonusuri
   din teritoriu și o lume de boți care își mută granițele.
   Logica nu atinge DOM-ul; terr_ui.js o afișează.
   Duelul folosește motorul Quiz Rapid (quick.js, mode 'duel').
   ============================================================ */

const TERR_DISTRICTS = [
  { id: 'neon',    name: 'Cartierul Neon',     tier: 0, color: '#ff4fd8' },
  { id: 'port',    name: 'Portul de Date',     tier: 0, color: '#00e5ff' },
  { id: 'docks',   name: 'Docurile Cuantice',  tier: 0, color: '#7b61ff' },
  { id: 'pixel',   name: 'Mahalaua Pixel',     tier: 0, color: '#bfefff' },
  { id: 'silicon', name: 'Bulevardul Siliciu', tier: 1, color: '#ffd24a' },
  { id: 'algo',    name: 'Piața Algoritmilor', tier: 1, color: '#6ab8ff' },
  { id: 'crypt',   name: 'Nucleul Criptat',    tier: 2, color: '#ff7a2f' },
  { id: 'tower',   name: 'Turnul Central',     tier: 3, color: '#ff3b5c' },
];
const TERR_COLS = 'ABCDEFGHIJ';

// ---------- geometria hărții (calculată o singură dată) ----------
let TERR_MAP_CACHE = null;
function terrMap() {
  const N = CONFIG.TERRITORY.size;
  if (TERR_MAP_CACHE && TERR_MAP_CACHE.N === N) return TERR_MAP_CACHE.cells;
  const c = (N - 1) / 2, cells = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - c, dy = y - c, r = Math.max(Math.abs(dx), Math.abs(dy));
    const tier = clamp(Math.round(c - r), 0, 3);
    // laturile inelului, „în morișcă”: fiecare latură are același număr de sectoare
    let side;
    if (dy === -r && dx > -r) side = 'top';
    else if (dx === r && dy > -r) side = 'right';
    else if (dy === r && dx < r) side = 'bottom';
    else side = 'left';
    let district;
    if (tier === 0) district = { top: 'port', right: 'docks', bottom: 'neon', left: 'pixel' }[side];
    else if (tier === 1) district = side === 'top' || side === 'right' ? 'silicon' : 'algo';
    else if (tier === 2) district = 'crypt';
    else district = 'tower';
    cells.push({ i: y * N + x, x, y, ring: r, tier, district, label: TERR_COLS[x] + (y + 1) });
  }
  for (const cell of cells) {
    cell.nb = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([ax, ay]) => [cell.x + ax, cell.y + ay])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N).map(([x, y]) => y * N + x);
  }
  TERR_MAP_CACHE = { N, cells };
  return cells;
}
function terrCell(i) { return terrMap()[i]; }
function terrDistrict(id) { return TERR_DISTRICTS.find(d => d.id === id); }
function terrTier(i) { return CONFIG.TERRITORY.tiers[terrCell(i).tier]; }
function terrLabel(i) { const c = terrCell(i); return `${c.label} · ${terrDistrict(c.district).name}`; }

// ---------- stare ----------
function newTerritoryState() { return { owner: [], explored: {}, cd: {}, botAcc: 0, rev: 0, feed: [], buildings: [] }; }
function newDuelState() { return { wins: 0, losses: 0, captures: 0, defended: 0, lost: 0, played: 0, attacks: [], nextAttackAt: -1 }; }
function terrReady() { return !!(S && S.territory && S.territory.owner && S.territory.owner.length); }
function isPlayerSector(i) { return S.territory.owner[i] === 'p'; }
function territoryCount() {
  if (!terrReady()) return 0;
  let n = 0;
  for (const o of S.territory.owner) if (o === 'p') n++;
  return n;
}
function territoryLand(n) {
  const T = CONFIG.TERRITORY;
  return T.baseSU + T.suPerSector * (n === undefined ? territoryCount() : n);
}
// terenul (SU) nu se mai cumpără: e derivat din sectoarele deținute
function syncLand() { if (terrReady()) S.player.land = territoryLand(); }
function terrSetOwner(i, o) {
  S.territory.owner[i] = o;
  S.territory.rev++;
  syncLand();
}
function terrFeed(text) {
  const f = S.territory.feed || (S.territory.feed = []);
  f.push({ t: S.time, text });
  if (f.length > 6) f.splice(0, f.length - 6);
}

// ---------- lumea de start ----------
function initTerritory() {
  const T = CONFIG.TERRITORY, map = terrMap();
  if (!S.territory) S.territory = newTerritoryState();
  if (!S.duel) S.duel = newDuelState();
  const t = S.territory;
  t.owner = new Array(map.length).fill(null);
  t.rev++;
  const bots = S.bots.slice().sort((a, b) => a.rating - b.rating);
  // fiecare cartier are câțiva „stăpâni” (boți din aceeași zonă de rating), ca să se vadă grupuri de bresle
  for (const D of TERR_DISTRICTS) {
    const lo = Math.floor(bots.length * D.tier / 4), hi = Math.max(lo + 1, Math.floor(bots.length * (D.tier + 1) / 4));
    const band = bots.slice(lo, hi);
    const lords = band.length ? shuffle(band.slice()).slice(0, randInt(2, 3)) : [];
    for (const c of map) {
      if (c.district !== D.id || c.i === T.home) continue;
      if (!lords.length || chance(T.neutralShare)) continue;
      t.owner[c.i] = chance(0.8) ? pick(lords).id : (band.length ? pick(band).id : pick(lords).id);
    }
  }
  t.owner[T.home] = 'p';
  syncLand();
}

// ---------- vecinătate ----------
function terrNeighbors(i) { return terrCell(i).nb; }
function terrAttackOn(i) { return S.duel.attacks.find(a => a.idx === i) || null; }
function terrAttackable(i) { return !isPlayerSector(i) && terrNeighbors(i).some(isPlayerSector); }
function terrOwnerInfo(i, ownerId) {
  const o = ownerId !== undefined ? ownerId : S.territory.owner[i];
  if (o === 'p') { const g = playerGuild(); return { kind: 'p', name: S.player.name, tag: g ? g.tag : '' }; }
  const b = o ? botById(o) : null;
  if (!b) return { kind: 'neutral', name: 'Sentinelă neutră', tag: '' };
  const g = b.guildId ? guildById(b.guildId) : null;
  return { kind: 'bot', id: b.id, name: b.name, tag: g ? g.tag : '', guild: g, bot: b };
}

// ---------- bonusuri din teritoriu ----------
let TERR_HELP_CACHE = { s: null, key: '' };
const TERR_HELP_ZERO = { sectors: 0, askExtra: 0, accBonus: 0, timeBonusSec: 0, crPct: 0, fiftyExtra: 0, dtPct: 0, districts: [], fullDistricts: 0, next: null };
function territoryHelp() {
  if (!terrReady()) return TERR_HELP_ZERO;
  const t = S.territory, n = territoryCount(), key = t.rev + ':' + n;
  if (TERR_HELP_CACHE.s === S && TERR_HELP_CACHE.key === key) return TERR_HELP_CACHE.v;
  const T = CONFIG.TERRITORY;
  const v = { sectors: n, askExtra: 0, accBonus: 0, timeBonusSec: 0, crPct: Math.min(T.crPctCap, Math.max(0, n - 1) * T.crPctPerSector), fiftyExtra: 0, dtPct: 0, districts: [], fullDistricts: 0, next: null };
  for (const m of T.milestones) {
    if (n >= m.n) { v.askExtra += m.ask || 0; v.accBonus += m.acc || 0; v.timeBonusSec += m.timeSec || 0; }
    else if (!v.next) v.next = m;
  }
  v.accBonus = Math.round(v.accBonus * 1000) / 1000;
  const map = terrMap();
  for (const D of TERR_DISTRICTS) {
    const cells = map.filter(c => c.district === D.id);
    const owned = cells.filter(c => t.owner[c.i] === 'p').length;
    const full = owned === cells.length;
    v.districts.push({ id: D.id, name: D.name, tier: D.tier, color: D.color, owned, total: cells.length, full });
    if (full) { v.fullDistricts++; v.fiftyExtra += T.district.fifty; v.dtPct += T.district.dtPct; }
  }
  v.fiftyExtra = Math.min(T.district.fiftyCap, v.fiftyExtra);
  TERR_HELP_CACHE = { s: S, key, v };
  return v;
}
// textul unui prag: „+1 Întreabă AI-ul”, „+2 s la cronometru”...
function terrMilestoneText(m) {
  const out = [];
  if (m.ask) out.push(`+${m.ask} „Întreabă AI-ul”`);
  if (m.acc) out.push(`+${Math.round(m.acc * 100)}% precizie pentru sugestia AI-ului`);
  if (m.timeSec) out.push(`+${m.timeSec} s la cronometru`);
  return out.join(', ');
}

// ---------- adversarul ----------
// statistica de care are nevoie un bot ca să răspundă corect cu probabilitatea p la dificultatea d (inversul answerProb)
function statForAcc(p, diff) {
  const A = CONFIG.AI;
  const req = A.reqBase * Math.pow(diff, A.reqExp), scale = A.scaleFrac * req + A.scaleAdd;
  p = clamp(p, 0.02, 0.98);
  return Math.max(1, req + scale * Math.log(p / (1 - p)));
}
function terrOpponent(i) {
  const cell = terrCell(i), tier = CONFIG.TERRITORY.tiers[cell.tier];
  const atk = terrAttackOn(i);
  const info = terrOwnerInfo(i, atk ? atk.by : undefined);
  const noise = info.bot ? info.bot.noise : 1;
  const acc = clamp(tier.acc + (noise - 1) * 0.2, 0.3, 0.95);
  const mid = (tier.diff[0] + tier.diff[1]) / 2;
  return { id: info.id || null, name: info.name, tag: info.tag, kind: info.kind, tier: cell.tier, tierName: tier.name, acc, stat: statForAcc(acc, mid) };
}
function terrDuelReward(i) {
  const tier = terrTier(i), L = CONFIG.LEAGUES[S.player.league];
  return { cr: Math.round(tier.winCR * L.reward * crMultiplier()), dt: tier.winDT, explore: !S.territory.explored[i] };
}

// ---------- duel ----------
function whyDuel(i) {
  if (typeof isUnlocked === 'function' && !isUnlocked('land')) return lockReason('land');
  if (!terrReady()) return 'Harta nu este pregătită';
  if (!Number.isInteger(i) || i < 0 || i >= S.territory.owner.length) return 'Sector necunoscut';
  const atk = terrAttackOn(i);
  if (isPlayerSector(i) && !atk) return 'Sectorul este deja al tău';
  if (!atk && !terrAttackable(i)) return 'Prea departe — cucerește mai întâi un sector vecin';
  const cd = (S.territory.cd[i] || 0) - S.time;
  if (cd > 0) return 'Adversarul se reface: revanșă în ' + fmtTime(cd);
  return whyQuick();
}
function actStartDuel(i, now, today) {
  i = Number(i);
  const r = whyDuel(i); if (r) return fail(r);
  const opp = terrOpponent(i), tier = terrTier(i);
  const res = startQuickGame('duel', now, today, {
    n: CONFIG.TERRITORY.questions,
    duel: { idx: i, defense: !!terrAttackOn(i), opp, stat: opp.stat, diff: tier.diff.slice(), oppCorrect: 0, oppTime: 0, oppHist: [], plan: null },
  });
  if (res.ok) res.msg = `Duel cu ${opp.name} pentru ${terrCell(i).label}`;
  return res;
}
// apelat de quick.js la fiecare întrebare nouă: când și cum răspunde adversarul
function duelPlanQuestion(m) {
  const d = m.duel, tier = CONFIG.TERRITORY.tiers[d.opp.tier];
  const right = rand() < answerProb(d.stat, m.q.diff);
  const t = Math.round(randRange(tier.tMin, tier.tMax) + (m.q.diff - tier.diff[0]) * 300);
  d.plan = { right, t: Math.min(t, m.timeMs), timeout: t >= m.timeMs, done: false };
}
// adversarul răspunde (la timpul lui sau, cel târziu, când se dezvăluie răspunsul)
function duelOppAnswer(m) {
  const d = m.duel;
  if (!d || !d.plan || d.plan.done) return false;
  d.plan.done = true;
  const ok = d.plan.right && !d.plan.timeout;
  if (ok) d.oppCorrect++;
  d.oppTime += d.plan.timeout ? m.timeMs : d.plan.t;
  d.oppHist.push(ok);
  return true;
}
function duelTick(m, now) {
  const d = m.duel;
  if (m.phase === 'question' && d && d.plan && !d.plan.done && now - m.qStart >= d.plan.t) return duelOppAnswer(m);
  return false;
}
// rezultatul (apelat din finishQuick)
function duelFinish(m, abandoned) {
  const d = m.duel, T = CONFIG.TERRITORY, tier = T.tiers[d.opp.tier], L = CONFIG.LEAGUES[m.league], sq = S.quick;
  const res = { mode: 'duel', abandoned: !!abandoned, idx: d.idx, label: terrCell(d.idx).label, defense: d.defense, opp: d.opp,
    correct: m.correct, answered: m.answered, total: m.n, oppCorrect: d.oppCorrect, myTime: m.time || 0, oppTime: d.oppTime,
    win: false, tie: false, cr: 0, dt: 0, explore: null, tax: 0, full: m.full, unlocked: [], perfect: false };
  if (m.answered === 0) {
    // renunțat înainte de primul răspuns: nu consumă un joc și nu e înfrângere
    if (sq.day === m.day) sq.dayGames = Math.max(0, sq.dayGames - 1);
    return res;
  }
  res.tie = m.correct === d.oppCorrect;
  res.win = !abandoned && (m.correct > d.oppCorrect || (res.tie && res.myTime <= d.oppTime));
  const mult = m.full ? 1 : CONFIG.QUICK.reducedMult;
  let cr = 0, dt = 0;
  S.duel.played++;
  count('duelPlayed');
  if (res.win) {
    S.duel.wins++;
    if (d.defense) {
      S.duel.attacks = S.duel.attacks.filter(a => a.idx !== d.idx);
      S.duel.defended++;
      cr = T.attack.defendCR * L.reward * crMultiplier() * mult;
      dt = T.attack.defendDT * mult;
      log('ARENA', `APĂRARE REUȘITĂ: ${terrLabel(d.idx)} rămâne al tău (${m.correct}–${d.oppCorrect} cu ${d.opp.name}).`);
      terrFeed(`Ai respins atacul lui ${d.opp.name} în ${terrCell(d.idx).label}`);
    } else {
      terrSetOwner(d.idx, 'p');
      delete S.territory.cd[d.idx];
      S.duel.captures++;
      count('sectorsCaptured');
      cr = tier.winCR * L.reward * crMultiplier() * mult;
      dt = tier.winDT * mult;
      if (!S.territory.explored[d.idx]) res.explore = terrExploreReward(d.idx);
      const bld = incomeAt(d.idx);
      res.reactivated = bld ? incomeType(bld.type).name : null;
      log('ARENA', `SECTOR CUCERIT: ${terrLabel(d.idx)} (${m.correct}–${d.oppCorrect} cu ${d.opp.name}). Ai acum ${territoryCount()} sectoare.${bld ? ` Clădirea ${res.reactivated} funcționează din nou.` : ''}`);
      terrFeed(`Ai cucerit ${terrCell(d.idx).label} de la ${d.opp.name}`);
    }
  } else {
    S.duel.losses++;
    S.territory.cd[d.idx] = S.time + T.cooldownMs;
    cr = m.correct * T.loseCRPerCorrect * L.reward * mult;
    log('ARENA', `Duel pierdut pentru ${terrLabel(d.idx)} (${m.correct}–${d.oppCorrect} cu ${d.opp.name})${abandoned ? ' — abandonat' : ''}. Revanșă în ${fmtTime(T.cooldownMs)}.`);
  }
  res.cr = addCR(Math.round(cr), 'duel');
  res.dt = addDT(Math.floor(dt));
  res.tax = res.cr > 0 ? guildTax(res.cr, 'your') : 0;
  res.sectors = territoryCount();
  res.unlocked = typeof checkUnlocks === 'function' ? checkUnlocks() : [];
  if (typeof saveGame === 'function' && typeof window !== 'undefined') saveGame();
  return res;
}
// recompensa unică la prima cucerire a unui sector (fosta explorare a terenului)
function terrExploreReward(i) {
  const Tb = CONFIG.EXPLORE.table;
  const e = Tb[weightedIndex(Tb.map(x => x.weight))];
  let text = '', kind = e.kind, card = null;
  if (kind === 'dt') text = `+${addDT(randInt(e.min, e.max))} DT`;
  else if (kind === 'cr') text = `+${fmt(addCR(randInt(e.min, e.max), 'explore'))} CR`;
  else if (kind === 'shards') text = `+${addShards(randInt(e.min, e.max))} Fragmente`;
  else if (kind === 'jackpot') text = `JACKPOT +${fmt(addCR(randInt(e.min, e.max), 'explore'))} CR`;
  else {
    card = giveCard(mintCard({}), 'explorarea unui sector');
    if (card) text = `Carte: ${cardLabel(card)}`;
    else { kind = 'dt'; text = `+${addDT(5)} DT (inventar plin)`; }
  }
  S.territory.explored[i] = kind === 'card' ? 'n' : kind[0];
  count('tilesExplored');
  return { kind, text, card };
}

// ---------- creștere contiguă (migrare și depanare) ----------
// adaugă până la k sectoare lipite de teritoriu, întâi pe inelul exterior, apoi spre centru
function terrGrowContiguous(k, markExplored) {
  const map = terrMap(), t = S.territory, home = terrCell(CONFIG.TERRITORY.home);
  let added = 0;
  while (added < k) {
    let best = null, bestKey = Infinity;
    for (const c of map) {
      if (t.owner[c.i] === 'p' || !c.nb.some(j => t.owner[j] === 'p')) continue;
      const key = c.tier * 100 + Math.abs(c.x - home.x) + Math.abs(c.y - home.y);
      if (key < bestKey) { bestKey = key; best = c; }
    }
    if (!best) break;
    t.owner[best.i] = 'p';
    delete t.cd[best.i];
    if (markExplored) t.explored[best.i] = t.explored[best.i] || 'd';
    added++;
  }
  t.rev++;
  syncLand();
  return added;
}
// salvări vechi: terenul cumpărat devine sectoare (cel puțin cât să încapă standurile existente)
function migrateTerritory(data) {
  const prev = S; S = data;
  try {
    const T = CONFIG.TERRITORY, oldLand = Number(data.player.land) || 0;
    data.territory = newTerritoryState();
    data.duel = data.duel && typeof data.duel === 'object' && data.duel.attacks ? data.duel : newDuelState();
    initTerritory();
    const used = typeof landUsed === 'function' ? landUsed() : 0;
    const need = Math.max(1, Math.ceil((oldLand - T.baseSU) / T.suPerSector), Math.ceil((used - T.baseSU) / T.suPerSector));
    terrGrowContiguous(Math.min(terrMap().length, need) - 1, true);
    S.territory.explored[T.home] = 'd';
    syncLand();
  } finally { S = prev; }
  return data;
}

// ---------- pasul simulării: boți, atacuri ----------
function territoryStep(dtMs) {
  if (!terrReady()) return;
  const t = S.territory, du = S.duel, T = CONFIG.TERRITORY, A = T.attack;
  incomeStep(dtMs);
  t.botAcc += dtMs * T.botMovesPerHour / CONFIG.HOUR;
  while (t.botAcc >= 1) { t.botAcc -= 1; terrBotMove(); }
  // atacuri expirate: sectorul trece la atacator
  if (du.attacks.length) {
    for (const a of du.attacks.slice()) if (S.time >= a.until) terrLoseSector(a);
  }
  // atacuri noi (rar, cel mult A.maxActive deodată)
  if (territoryCount() < A.minSectors) { du.nextAttackAt = -1; return; }
  if (du.nextAttackAt < 0) du.nextAttackAt = S.time + A.firstAfterMs;
  else if (S.time >= du.nextAttackAt) {
    terrSpawnAttack();
    du.nextAttackAt = S.time + Math.round(randRange(A.minGapMs, A.maxGapMs));
  }
}
function terrBorderSectors() {
  const home = CONFIG.TERRITORY.home;
  return terrMap().filter(c => c.i !== home && isPlayerSector(c.i) && !terrAttackOn(c.i) && c.nb.some(j => !isPlayerSector(j)));
}
function terrSpawnAttack(force) {
  const du = S.duel, A = CONFIG.TERRITORY.attack;
  if (du.attacks.length >= A.maxActive && !force) return null;
  const cand = terrBorderSectors();
  if (!cand.length) return null;
  // sectoarele cu clădiri de venit sunt ținte de 2× mai probabile; vecinii boți contează și ei
  const hasBotNb = c => c.nb.some(j => { const o = S.territory.owner[j]; return o && o !== 'p'; });
  const c = cand[weightedIndex(cand.map(x => (incomeAt(x.i) ? 2 : 1) * (hasBotNb(x) ? 2 : 1)))];
  const botNb = c.nb.map(j => S.territory.owner[j]).filter(o => o && o !== 'p' && botById(o));
  const by = botNb.length ? pick(botNb) : pick(S.bots).id;
  const a = { idx: c.i, by, at: S.time, until: S.time + A.timerMs };
  du.attacks.push(a);
  const info = terrOwnerInfo(c.i, by);
  const bld = incomeAt(c.i);
  log('ARENA', `⚠ ATAC: ${info.name}${info.tag ? ' [' + info.tag + ']' : ''} îți atacă sectorul ${terrLabel(c.i)}${bld ? ' — și clădirea ta: ' + incomeType(bld.type).name : ''}! Apără-l în ${fmtTime(A.timerMs)} sau îl pierzi.`);
  terrFeed(`${info.name} îți atacă sectorul ${c.label}`);
  return a;
}
function terrLoseSector(a) {
  const du = S.duel;
  du.attacks = du.attacks.filter(x => x !== a);
  if (!isPlayerSector(a.idx) || a.idx === CONFIG.TERRITORY.home) return;
  const by = botById(a.by) ? a.by : null;
  terrSetOwner(a.idx, by);
  du.lost++;
  const info = terrOwnerInfo(a.idx);
  const bld = incomeAt(a.idx);
  log('ARENA', `Ai pierdut sectorul ${terrLabel(a.idx)} în fața lui ${info.name} — atacul nu a fost respins la timp.${bld ? ` Clădirea ${incomeType(bld.type).name} este acum INACTIVĂ (recucerește sectorul ca s-o repornești).` : ''}`);
  terrFeed(`${info.name} ți-a luat sectorul ${terrCell(a.idx).label}`);
}
// boții își mută granițele: ocupă sectoare neutre, se fură între ei, uneori abandonează câte unul
function terrBotMove() {
  const t = S.territory, map = terrMap();
  const c = map[randInt(0, map.length - 1)];
  const o = t.owner[c.i];
  if (o === 'p' || !o) return;
  if (chance(0.12)) { t.owner[c.i] = null; t.rev++; return; }
  const j = pick(c.nb);
  const oj = t.owner[j];
  if (oj === 'p' || oj === o) return;
  t.owner[j] = o;
  t.rev++;
  const a = terrOwnerInfo(j, o);
  if (oj) {
    const b = terrOwnerInfo(j, oj);
    terrFeed(`${a.name}${a.tag ? ' [' + a.tag + ']' : ''} a cucerit ${terrCell(j).label} de la ${b.name}`);
  } else terrFeed(`${a.name}${a.tag ? ' [' + a.tag + ']' : ''} a ocupat sectorul neutru ${terrCell(j).label}`);
}

// ---------- depanare ----------
function terrDebugGrant(k) { const n = terrGrowContiguous(k, false); return ok(`+${n} sectoare`); }
function terrDebugAttack() {
  if (!terrBorderSectors().length) terrGrowContiguous(2, false);
  const a = terrSpawnAttack(true);
  return a ? ok('Atac declanșat asupra ' + terrCell(a.idx).label) : fail('Nu există sector de graniță de atacat');
}

// ============================================================
// CLĂDIRI DE VENIT PASIV
// O clădire stă pe un sector; produce doar cât sectorul e al tău.
// Doar sectoarele de la MARGINE (vecine cu un sector care nu e al tău) pot fi atacate;
// marginea hărții nu contează ca margine.
// ============================================================
function incomeCfg() { return CONFIG.TERRITORY.income; }
function incomeType(id) { return incomeCfg().types.find(t => t.id === id) || null; }
function incomeList() { if (!S.territory.buildings) S.territory.buildings = []; return S.territory.buildings; }
function incomeAt(i) { return terrReady() ? incomeList().find(b => b.idx === i) || null : null; }
function incomeActive(b) { return isPlayerSector(b.idx); }
// sector de margine: al tău și vecin (sus/jos/stânga/dreapta) cu un sector care nu e al tău
function terrIsBorder(i) { return isPlayerSector(i) && terrNeighbors(i).some(j => !isPlayerSector(j)); }
// expus = poate fi atacat (baza nu e atacată niciodată)
function terrExposed(i) { return i !== CONFIG.TERRITORY.home && terrIsBorder(i); }

// „💎 Sector bogat”: ales determinist din sămânța jocului, câteva pe cartier, mai multe spre centru
let TERR_RICH_CACHE = { seed: null, set: null };
function terrRichSet() {
  if (TERR_RICH_CACHE.seed === S.seed && TERR_RICH_CACHE.set) return TERR_RICH_CACHE.set;
  const r = seededRng((S.seed ^ 0x5eed1e) | 0), map = terrMap(), set = new Set();
  for (const D of TERR_DISTRICTS) {
    const cells = map.filter(c => c.district === D.id && c.i !== CONFIG.TERRITORY.home).map(c => c.i);
    for (let k = cells.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [cells[k], cells[j]] = [cells[j], cells[k]]; }
    cells.slice(0, incomeCfg().richPerDistrict[D.tier] || 0).forEach(i => set.add(i));
  }
  TERR_RICH_CACHE = { seed: S.seed, set };
  return set;
}
function terrIsRich(i) { return terrRichSet().has(i); }

function incomeSlots(n) {
  const I = incomeCfg();
  n = n === undefined ? territoryCount() : n;
  if (n < I.slotsFirstAt) return 0;
  return Math.min(I.slotsMax, 1 + Math.floor((n - I.slotsFirstAt) / I.slotsEvery));
}
function incomeNextSlotAt() {
  const I = incomeCfg(), cur = incomeSlots();
  if (cur >= I.slotsMax) return null;
  return I.slotsFirstAt + cur * I.slotsEvery;
}
function incomeRate(b) { // pe oră, cu bonusul de sector bogat
  const T = incomeType(b.type);
  return T.levels[b.level].rate * (terrIsRich(b.idx) ? incomeCfg().richMult : 1);
}
function incomeInvested(b) { const T = incomeType(b.type); let c = 0; for (let l = 0; l <= b.level; l++) c += T.levels[l].cost; return c; }
function incomeTotals() {
  const out = { cr: 0, dt: 0, shards: 0, active: 0, inactive: 0 };
  if (!terrReady()) return out;
  for (const b of incomeList()) {
    if (!incomeActive(b)) { out.inactive++; continue; }
    out.active++;
    out[incomeType(b.type).res] += incomeRate(b);
  }
  return out;
}
// producție continuă (și offline, prin pasul simulării — limitat de plafonul offline)
function incomeStep(dtMs) {
  const list = S.territory.buildings;
  if (!list || !list.length) return;
  for (const b of list) {
    if (!incomeActive(b)) continue;
    b.acc = (b.acc || 0) + incomeRate(b) * dtMs / CONFIG.HOUR;
    if (b.acc < 1) continue;
    const n = Math.floor(b.acc);
    b.acc -= n;
    const res = incomeType(b.type).res;
    if (res === 'cr') addCR(n, 'passive');
    else if (res === 'dt') addDT(n);
    else addShards(n);
    b.made = (b.made || 0) + n;
    count('passive_' + res, n);
  }
}

function whyBuildIncome(i, type) {
  const T = incomeType(type);
  if (!T) return 'Alege o clădire';
  if (!terrReady() || !isPlayerSector(i)) return 'Poți construi doar pe sectoarele tale';
  if (incomeAt(i)) return 'Sectorul are deja o clădire';
  const slots = incomeSlots();
  if (incomeList().length >= slots) {
    const nx = incomeNextSlotAt();
    return slots === 0 ? `Primul loc de construcție vine la ${incomeCfg().slotsFirstAt} sectoare` : `Toate cele ${slots} locuri sunt ocupate${nx ? ` — următorul la ${nx} sectoare` : ''}`;
  }
  if (!canPayCR(T.levels[0].cost)) return `Îți mai trebuie ${fmt(T.levels[0].cost - S.player.cr)} CR`;
  return '';
}
function actBuildIncome(i, type) {
  i = Number(i);
  const r = whyBuildIncome(i, type); if (r) return fail(r);
  const T = incomeType(type);
  spendCR(T.levels[0].cost, 'income');
  const b = { id: newId('i'), type, level: 0, idx: i, acc: 0, made: 0 };
  incomeList().push(b);
  log('SYSTEM', `${T.name} construită pe ${terrLabel(i)}: +${incomeRate(b)} ${incomeResName(T.res)}/h${terrExposed(i) ? ' — atenție, e la margine și poate fi atacată' : ' — protejată în interior'}.`);
  return Object.assign(ok(`${T.name} construită`), { b });
}
function incomeResName(res) { return res === 'cr' ? 'CR' : res === 'dt' ? 'DT' : 'fragmente'; }
function whyUpgradeIncome(id) {
  const b = incomeList().find(x => x.id === id);
  if (!b) return 'Clădirea nu a fost găsită';
  const T = incomeType(b.type), nx = T.levels[b.level + 1];
  if (!nx) return 'Nivel maxim';
  if (!incomeActive(b)) return 'Clădirea e inactivă — recucerește sectorul';
  if (!canPayCR(nx.cost)) return `Îți mai trebuie ${fmt(nx.cost - S.player.cr)} CR`;
  return '';
}
function actUpgradeIncome(id) {
  const r = whyUpgradeIncome(id); if (r) return fail(r);
  const b = incomeList().find(x => x.id === id), T = incomeType(b.type);
  spendCR(T.levels[b.level + 1].cost, 'income');
  b.level++;
  return ok(`${T.name} nivel ${b.level + 1}: +${incomeRate(b)} ${incomeResName(T.res)}/h`);
}
function incomeMoveFee(b) { return Math.ceil(incomeInvested(b) * incomeCfg().moveFee); }
function whyMoveIncome(id, i) {
  const b = incomeList().find(x => x.id === id);
  if (!b) return 'Clădirea nu a fost găsită';
  if (!isPlayerSector(i)) return 'Poți muta clădirea doar pe un sector al tău';
  if (incomeAt(i)) return 'Sectorul are deja o clădire';
  if (!canPayCR(incomeMoveFee(b))) return `Mutarea costă ${fmt(incomeMoveFee(b))} CR`;
  return '';
}
function actMoveIncome(id, i) {
  i = Number(i);
  const r = whyMoveIncome(id, i); if (r) return fail(r);
  const b = incomeList().find(x => x.id === id), fee = incomeMoveFee(b);
  spendCR(fee, 'income');
  b.idx = i; b.acc = 0;
  return ok(`${incomeType(b.type).name} mutată pe ${terrCell(i).label} (${fmt(fee)} CR)`);
}
function incomeRefund(b) { return Math.floor(incomeInvested(b) * incomeCfg().dismantleRefund); }
function actDismantleIncome(id) {
  const b = incomeList().find(x => x.id === id);
  if (!b) return fail('Clădirea nu a fost găsită');
  const refund = incomeRefund(b);
  S.territory.buildings = incomeList().filter(x => x !== b);
  addCR(refund, 'refund');
  return ok(`${incomeType(b.type).name} demontată: +${fmt(refund)} CR`);
}
