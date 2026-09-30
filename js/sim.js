'use strict';
/* ============================================================
   SIM — world, pet math, bonuses, stands, land, global server,
   economy and the fixed simulation step
   ============================================================ */

// ---------- world ----------
function botName(used) {
  for (let i = 0; i < 50; i++) {
    const n = pick(BOT_PREFIX) + pick(BOT_SUFFIX) + (chance(0.4) ? randInt(1, 99) : '');
    if (!used.has(n)) { used.add(n); return n; }
  }
  return 'Bot' + randInt(1000, 9999);
}
function makeBot(rating, usedNames) {
  return {
    id: newId('b'), name: botName(usedNames), rating: Math.round(rating), guildId: null,
    activity: randRange(0.3, 1), noise: randRange(1 - CONFIG.BOTS.statNoise, 1 + CONFIG.BOTS.statNoise),
    noiseMs: randRange(0.9, 1.1), bias: randRange(0.85, 1.15), seed: (rand() * 4294967295) | 0,
  };
}
function initWorld() {
  const used = new Set();
  for (let i = 0; i < CONFIG.BOTS.count; i++) {
    // ratings spread across all leagues, most in the lower ones
    const r = 900 + Math.abs(randRange(-1, 1) + randRange(-1, 1)) * 420;
    S.bots.push(makeBot(r, used));
  }
  const names = shuffle(GUILD_NAMES.slice()).slice(0, CONFIG.GUILD.botGuilds);
  const free = shuffle(S.bots.slice());
  for (const [name, tag] of names) {
    const g = newGuild(name, tag, false);
    const n = randInt(6, 13);
    for (let i = 0; i < n && free.length > 8; i++) { const b = free.pop(); b.guildId = g.id; g.members.push(b.id); g.contrib[b.id] = randInt(100, 5000); }
    g.vault = randInt(2000, 30000);
    const hq = randInt(0, 2);
    for (let l = 0; l < hq; l++) { g.hq = l + 1; g.land = CONFIG.GUILD.hq[l].land; }
    S.guilds.push(g);
  }
  S.market.demand = {};
  for (const t of CONFIG.NFT.themes) S.market.demand[t.id] = randRange(0.85, 1.15);
  for (let i = 0; i < CONFIG.MARKET.botListingsTarget; i++) botListNFT();
  S.server.history.push({ t: 0, total: S.server.total, used: usedSpace() });
  if (typeof ensureMissions === 'function') ensureMissions();
}
function newGuild(name, tag, isPlayer) {
  return { id: newId('g'), name: name, tag: tag, seed: (rand() * 4294967295) | 0, vault: 0, hq: 0, land: 0, members: [], contrib: {}, isPlayer: !!isPlayer, created: S.time };
}
function botById(id) { return S.bots.find(b => b.id === id); }
function guildById(id) { return S.guilds.find(g => g.id === id); }
function playerGuild() { return S.player.guildId ? guildById(S.player.guildId) : null; }

// ---------- leagues ----------
function leagueOf(rating) {
  let l = 0;
  for (let i = 0; i < CONFIG.LEAGUES.length; i++) if (rating >= CONFIG.LEAGUES[i].min) l = i;
  return l;
}
function updatePlayerLeague() {
  const p = S.player, L = CONFIG.LEAGUES;
  const old = p.league;
  while (p.league < L.length - 1 && p.rating >= L[p.league + 1].min) p.league++;
  while (p.league > 0 && p.rating < L[p.league].min - CONFIG.DEMOTION_BUFFER) p.league--;
  if (p.league > old) {
    log('ARENA', `PROMOTED to ${L[p.league].name} league! Soft cap now ${fmt(softCap())}.`);
    if (p.league > p.peakLeague) p.peakLeague = p.league;
  } else if (p.league < old) log('ARENA', `Demoted to ${L[p.league].name} league.`);
}

// ---------- event of the week ----------
const WEEKLY_EVENTS = [
  { id: 'train_frenzy', name: 'Training Frenzy', desc: '+25% training gain for everyone' },
  { id: 'math_week', name: 'Math Week', desc: 'Arena questions are math only' },
  { id: 'double_drops', name: 'Double Drops', desc: 'NFT drop chances x2, half of drops use the featured theme' },
  { id: 'trivia_week', name: 'Trivia Week', desc: 'Arena questions are trivia only' },
  { id: 'market_boom', name: 'Market Boom', desc: 'Bot trading volume x1.5' },
];
function currentEvent() {
  const week = Math.floor(S.time / (7 * CONFIG.DAY));
  const ev = WEEKLY_EVENTS[(week + (S.seed >>> 0)) % WEEKLY_EVENTS.length];
  const theme = CONFIG.NFT.themes[(week + 3) % CONFIG.NFT.themes.length];
  return Object.assign({ week: week, theme: theme, endsIn: (week + 1) * 7 * CONFIG.DAY - S.time }, ev);
}
function questionMode() {
  const e = currentEvent().id;
  return e === 'math_week' ? 'math' : e === 'trivia_week' ? 'trivia' : 'mixed';
}

// ---------- bonuses (NFTs -> raw -> capped effective) ----------
function capValue(raw, cap) { return raw <= 0 ? 0 : cap * (1 - Math.exp(-raw / cap)); }
function equippedItems() { return S.equipped.map(id => S.inv.find(n => n.id === id)).filter(n => n && !n.listed); }
function activeSets() {
  const items = equippedItems();
  const groups = {};
  for (const n of items) { const k = n.theme + ':' + n.level; (groups[k] = groups[k] || []).push(n); }
  const sets = [];
  for (const k in groups) {
    const bySlot = {};
    for (const n of groups[k]) if (!(n.slot in bySlot)) bySlot[n.slot] = n;
    if (Object.keys(bySlot).length === 5) {
      const lvl = groups[k][0].level;
      sets.push({ theme: groups[k][0].theme, level: lvl, mult: Math.pow(2, lvl), ids: Object.values(bySlot).map(n => n.id) });
    }
  }
  return sets;
}
function bonuses() {
  const raw = { cr: 0, speed: 0, train: 0, dt: 0, comm: 0 };
  const sets = activeSets();
  const multOf = {};
  for (const s of sets) for (const id of s.ids) multOf[id] = s.mult;
  for (const n of equippedItems()) {
    const m = multOf[n.id] || 1;
    for (const a of n.affixes) raw[a.type] += a.value * m;
  }
  const eff = {}, capped = {};
  for (const k in raw) {
    const cap = CONFIG.NFT.affixes[k].cap;
    eff[k] = capValue(raw[k], cap);
    capped[k] = raw[k] > cap * 0.5;
  }
  return { raw, eff, capped, sets };
}
function legacyBonus() { return Math.min(CONFIG.PRESTIGE.legacyCap, S.player.legacy * CONFIG.PRESTIGE.legacyPerPoint); }
function guildPerk() { const g = playerGuild(); return g && g.hq > 0 ? CONFIG.GUILD.hq[g.hq - 1].perk : 0; }
function crMultiplier() { return 1 + bonuses().eff.cr / 100 + legacyBonus(); }

// ---------- pet ----------
function softCap() { return CONFIG.PET.softCapByLeague[S.player.league]; }
function petBaseMs() {
  const P = CONFIG.PET;
  return P.speedFloorMs + (P.speedStartMs - P.speedFloorMs) * Math.exp(-S.player.speedPoints / P.speedK);
}
function petMs() {
  const red = bonuses().eff.speed / 100;
  return Math.max(CONFIG.PET.speedFloorMs, Math.round(petBaseMs() * (1 - red)));
}
function petPower() { const p = S.player; return p.math + p.trivia + p.speedPoints; }
function petLevelInfo() {
  const x = Math.max(0, petPower() - (CONFIG.START.math + CONFIG.START.trivia)) / CONFIG.PET.levelDivisor;
  const lvl = Math.floor(Math.sqrt(x)) + 1;
  const cur = Math.pow(lvl - 1, 2), next = Math.pow(lvl, 2);
  return { level: lvl, progress: clamp((x - cur) / (next - cur), 0, 1) };
}
function standMult(standId) {
  if (!standId) return 1;
  const s = S.stands.find(x => x.id === standId);
  if (!s || S.econ.offline) return 1;
  return CONFIG.STAND_TIERS[s.tier].mult;
}
function trainGain(stat, standId) {
  const P = CONFIG.PET;
  let g = P.trainBase * standMult(standId) * (1 + bonuses().eff.train / 100 + legacyBonus());
  if (currentEvent().id === 'train_frenzy') g *= 1.25;
  if (stat === 'speed') return g * P.speedTrainFactor;
  const cur = stat === 'math' ? S.player.math : S.player.trivia;
  return g / (1 + Math.pow(cur / softCap(), P.softCapPower));
}

// ---------- stands & land ----------
function landUsed() {
  let u = 0;
  for (const s of S.stands) u += CONFIG.STAND_TIERS[s.tier].land;
  if (S.market.stand) u += CONFIG.MARKET.standLand;
  return u;
}
function landFree() { return S.player.land - landUsed(); }
function upkeepPerHour() {
  let u = 0;
  for (const s of S.stands) u += CONFIG.STAND_TIERS[s.tier].upkeep;
  if (S.market.stand) u += CONFIG.MARKET.standLevels[S.market.stand.level].upkeep;
  return u;
}

// ---------- global server ----------
function usedSpace() {
  let u = S.server.botLand + S.player.land;
  for (const g of S.guilds) u += g.land;
  return u;
}
function usedRatio() { return usedSpace() / S.server.total; }
function landPrice() { const r = usedRatio(); return Math.ceil(CONFIG.LAND.basePrice * (1 + CONFIG.LAND.scarcityK * r * r)); }
function serverFrozen() { return S.server.state === 'CRITICAL' && S.time < S.server.freezeUntil; }
function checkServerCapacity() {
  const sv = S.server;
  if (sv.state === 'NORMAL' && 1 - usedRatio() < 1 - CONFIG.SERVER.criticalRatio) {
    sv.state = 'CRITICAL';
    sv.freezeUntil = S.time + CONFIG.SERVER.freezeMs;
    sv.alarmSeen = false;
    count('criticalEvents');
    log('SERVER', `!! SERVER CAPACITY CRITICAL - free space ${fmtPct((1 - usedRatio()) * 100)}. Heavy infrastructure frozen for ${fmtTime(CONFIG.SERVER.freezeMs)}.`);
  }
}
function serverStep() {
  const sv = S.server;
  if (sv.state === 'CRITICAL' && S.time >= sv.freezeUntil) {
    const old = sv.total;
    sv.total = Math.floor(sv.total * CONFIG.SERVER.expandFactor);
    sv.state = 'NORMAL';
    sv.expansions++;
    count('expansions');
    sv.history.push({ t: S.time, total: sv.total, used: usedSpace() });
    log('SERVER', `Rebalancing done. Global capacity expanded ${fmt(old)} -> ${fmt(sv.total)} SU (expansion #${sv.expansions}).`);
  }
  checkServerCapacity();
}
function recordServerHistory() {
  const h = S.server.history;
  h.push({ t: S.time, total: S.server.total, used: usedSpace() });
  if (h.length > CONFIG.SERVER.historyMax) h.splice(0, h.length - CONFIG.SERVER.historyMax);
}

// ---------- DT price ----------
function dtRecentBought() {
  const cutoff = S.time - CONFIG.DT.buyWindowMs;
  S.player.dtBuys = (S.player.dtBuys || []).filter(b => b.t > cutoff);
  return S.player.dtBuys.reduce((s, b) => s + b.n, 0);
}
function dtPriceFor(n) {
  // each DT bought raises the price of the next by 1%
  const base = CONFIG.DT.buyBasePrice, step = CONFIG.DT.buyPriceStep;
  const k = dtRecentBought();
  let total = 0;
  for (let i = 0; i < n; i++) total += base * (1 + step * (k + i));
  return Math.ceil(total);
}

// ---------- the simulation step ----------
function step(dtMs) {
  const p = S.player;
  S.time += dtMs;
  const b = bonuses();

  // DT trickle
  if (p.dt < CONFIG.DT.stockCap) {
    p.dtAcc += dtMs * (1 + b.eff.dt / 100 + guildPerk() / 100);
    while (p.dtAcc >= CONFIG.DT.trickleEveryMs && p.dt < CONFIG.DT.stockCap) { p.dt++; p.dtAcc -= CONFIG.DT.trickleEveryMs; }
    if (p.dt >= CONFIG.DT.stockCap) p.dtAcc = 0;
  } else p.dtAcc = 0;

  // stamina
  if (p.stamina < CONFIG.SOLO.staminaMax) {
    p.staminaAcc += dtMs;
    if (p.staminaAcc >= CONFIG.SOLO.staminaRegenMs) { p.stamina++; p.staminaAcc -= CONFIG.SOLO.staminaRegenMs; }
  } else p.staminaAcc = 0;

  // upkeep
  const e = S.econ;
  if (!e.offline) {
    e.upkeepAcc += upkeepPerHour() * dtMs / CONFIG.HOUR;
    const due = Math.floor(e.upkeepAcc);
    if (due > 0) {
      e.upkeepAcc -= due;
      const pay = Math.min(due, p.cr);
      if (pay > 0) spendCR(pay, 'upkeep');
      if (pay < due) {
        e.debt += due - pay; e.offline = true;
        log('SYSTEM', `Not enough CR for upkeep - structures OFFLINE until ${fmt(e.debt)} CR debt is paid (paid automatically from income).`);
      }
    }
  }

  // hourly stats
  if (S.time - e.hour.start >= CONFIG.HOUR) {
    e.lastHour = { minted: e.hour.minted, burned: e.hour.burned };
    e.hour = { start: S.time, minted: 0, burned: 0 };
    recordServerHistory();
  }

  // bots buy land
  const sv = S.server;
  if (1 - usedRatio() > 0.05) {
    sv.botBuyAcc += sv.total * CONFIG.SERVER.botBuyPerHour * dtMs / CONFIG.HOUR;
    if (sv.botBuyAcc >= 1) { const n = Math.floor(sv.botBuyAcc); sv.botBuyAcc -= n; sv.botLand += n; }
  }
  serverStep();

  if (typeof guildStep === 'function') guildStep(dtMs);
  if (typeof marketStep === 'function') marketStep(dtMs);
  if (typeof metaStep === 'function') metaStep(dtMs);
}

// run many steps (offline catch-up, debug speed)
function simulate(ms) {
  const n = Math.floor(ms / CONFIG.TICK_MS);
  for (let i = 0; i < n; i++) step(CONFIG.TICK_MS);
  return n;
}
