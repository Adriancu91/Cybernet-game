'use strict';
/* ============================================================
   CARDS — 4 fair types (Core, Virtual Memory, Hardware, Cooler),
   5 craftable rarities + Unique, upgrades +0..+4, evolution,
   random bonus stats (rerollable), heat, sets, album, shards.
   Values are computed from rolls, never stored, so upgrades,
   evolutions and rebalancing always stay consistent.
   ============================================================ */

function cardType(id) { return CONFIG.CARDS.types.find(t => t.id === id) || CONFIG.CARDS.types[0]; }
function rarityOf(r) { return CONFIG.CARDS.rarities[r]; }
function cardName(c) { return rarityOf(c.rarity).name + ' ' + cardType(c.type).name; }
function cardLabel(c) { return cardName(c) + (c.plus ? ' +' + c.plus : ''); }

function rollCardRarity() {
  const w = CONFIG.CARDS.rarities.map(r => r.weight);
  return weightedIndex(w);
}
function pickBonusTypes(n, keep) {
  const all = Object.keys(CONFIG.CARDS.stats);
  const out = (keep || []).slice(0, n);
  const free = shuffle(all.filter(t => !out.includes(t)));
  while (out.length < n && free.length) out.push(free.pop());
  return out;
}
function rollValue() { return Math.round(randRange(CONFIG.CARDS.rollMin, CONFIG.CARDS.rollMax) * 100) / 100; }

function mintCard(opts) {
  opts = opts || {};
  const C = CONFIG.CARDS;
  const type = opts.type || pick(C.types).id;
  const rarity = opts.rarity !== undefined ? opts.rarity : rollCardRarity();
  const plus = clamp(opts.plus || 0, 0, C.maxPlus);
  const bonus = pickBonusTypes(rarityOf(rarity).bonus).map(t => ({ type: t, roll: rollValue() }));
  return {
    id: newId('c'), dna: (rand() * 4294967295) >>> 0, type, rarity, plus,
    mainRoll: rollValue(), bonus, createdAt: S.time, locked: false, listed: null,
  };
}

// ---------- stat values ----------
function round1(v) { return Math.round(v * 10) / 10; }
function cardMainType(c) { return cardType(c.type).main; }
function cardMainValue(c) {
  const C = CONFIG.CARDS, A = C.stats[cardMainType(c)];
  return round1(A.base * C.mainFactor * rarityOf(c.rarity).mult * (1 + C.plusGrowth * c.plus) * c.mainRoll);
}
function cardBonusValue(c, b) {
  const C = CONFIG.CARDS, A = C.stats[b.type];
  return round1(A.base * rarityOf(c.rarity).mult * (1 + C.bonusPlusGrowth * c.plus) * b.roll);
}
function cardStats(c) {
  const out = [{ type: cardMainType(c), value: cardMainValue(c), main: true }];
  for (const b of c.bonus) out.push({ type: b.type, value: cardBonusValue(c, b), main: false });
  return out;
}
function statText(s) { const A = CONFIG.CARDS.stats[s.type]; return `${A.sign}${s.value}${A.unit} ${A.name}`; }
function cardQuality(c) { return (c.mainRoll + c.bonus.reduce((s, b) => s + b.roll, 0)) / (1 + c.bonus.length); }

// ---------- heat ----------
function cardHeat(c) {
  const H = CONFIG.CARDS.heat, t = cardType(c.type);
  if (!t.heat) return 0;
  return round1(t.heat * (1 + H.rarityGrowth * c.rarity) * (1 + H.plusGrowth * c.plus));
}
function cardCooling(c) {
  const H = CONFIG.CARDS.heat, t = cardType(c.type);
  if (!t.cool) return 0;
  return round1(t.cool * (1 + H.coolRarityGrowth * c.rarity) * (1 + H.coolPlusGrowth * c.plus));
}

// ---------- fair value (market) ----------
function fairValue(c) {
  const M = CONFIG.MARKET;
  const demand = (S.market.demand && S.market.demand[c.type]) || 1;
  const steps = c.rarity * 1.6 + c.plus * 0.45;
  return Math.max(10, Math.round(M.fairBase * Math.pow(M.fairGrowth, steps) * (c.q || cardQuality(c)) * demand));
}

// ---------- inventory ----------
function invFull() { return S.inv.length >= CONFIG.CARDS.inventoryMax; }
function albumKey(type, rarity) { return type + ':' + rarity; }
function recordAlbum(c) {
  const A = CONFIG.CARDS.album, k = albumKey(c.type, c.rarity);
  if (S.album[k]) return;
  S.album[k] = S.time;
  addShards(A.entryShards);
  log('SYSTEM', `ALBUM: new entry ${cardName(c)} (+${A.entryShards} shards).`);
  // a full rarity column (all 4 types) pays a bigger reward
  if (CONFIG.CARDS.types.every(t => S.album[albumKey(t.id, c.rarity)])) {
    const sh = A.columnShards[c.rarity] || 0;
    addShards(sh);
    S.player.recal += A.columnRecal;
    log('SYSTEM', `ALBUM: ${rarityOf(c.rarity).name} column complete! +${sh} shards, +${A.columnRecal} Neural Recalibrator.`);
  }
}
function giveCard(c, reason) {
  if (invFull()) { log('SYSTEM', `Inventory full - ${cardName(c)} was lost. Salvage some cards!`); return null; }
  S.inv.push(c);
  count('cardGot');
  if (c.rarity === 4) count('legendaryGot');
  if (c.rarity === CONFIG.CARDS.UNIQUE) count('uniqueGot');
  recordAlbum(c);
  if (reason) log('SYSTEM', `Card acquired: ${cardLabel(c)} (${reason})`);
  return c;
}
function dropChance(base) { return Math.min(0.95, base * (currentEvent().id === 'double_drops' ? 2 : 1)); }
function rollDrop(baseChance, reason) {
  if (!chance(dropChance(baseChance))) return null;
  const ev = currentEvent();
  const opts = {};
  if (ev.id === 'double_drops' && chance(0.5)) opts.type = ev.featured.id;
  if (S.player.league >= 3 && chance(0.1 + 0.05 * (S.player.league - 3))) opts.plus = 1;
  return giveCard(mintCard(opts), reason);
}
function isEquipped(id) { return S.equipped.includes(id); }
function cardStatusReason(c) {
  if (c.listed) return 'Listed on market';
  if (isEquipped(c.id)) return 'Equipped - unequip first';
  if (c.locked) return 'Locked - unlock first';
  return '';
}
function equippedOfType(type) { return S.equipped.map(id => S.inv.find(c => c.id === id)).find(c => c && c.type === type) || null; }

// ---------- upgrade (+0 .. +4) ----------
function upgradeCost(c) {
  const U = CONFIG.CARDS.upgrade, r = Math.min(c.rarity, 4);
  return { cr: Math.round(U.cr * Math.pow(U.crGrowth, r) * (c.plus + 1)), shards: Math.round(U.shards * Math.pow(U.shardGrowth, r) * (c.plus + 1)) };
}
function whyUpgradeCard(id) {
  const c = S.inv.find(x => x.id === id);
  if (!c) return 'Card not found';
  if (c.listed) return 'Listed on market';
  if (c.plus >= CONFIG.CARDS.maxPlus) return c.rarity < CONFIG.CARDS.MAX_CRAFT_RARITY ? 'At +4 - evolve it to the next rarity' : 'Max level';
  const k = upgradeCost(c);
  if (!canPayCR(k.cr)) return `Need ${fmt(k.cr - S.player.cr)} CR more`;
  if (S.player.shards < k.shards) return `Need ${k.shards - S.player.shards} more shards`;
  return '';
}
function doUpgradeCard(id) {
  const c = S.inv.find(x => x.id === id), k = upgradeCost(c);
  spendCR(k.cr, 'upgrade');
  S.player.shards -= k.shards;
  c.plus++;
  count('upgrades');
  if (typeof missionProgress === 'function') missionProgress('upgrade', 1);
  log('SYSTEM', `UPGRADE: ${cardName(c)} is now +${c.plus}.`);
  return c;
}

// ---------- evolve (+4 -> next rarity at +0) ----------
function evolveCost(c) { return CONFIG.CARDS.evolve[c.rarity] || null; }
function whyEvolveCard(id) {
  const c = S.inv.find(x => x.id === id);
  if (!c) return 'Card not found';
  if (c.listed) return 'Listed on market';
  if (c.rarity >= CONFIG.CARDS.MAX_CRAFT_RARITY) return c.rarity === CONFIG.CARDS.UNIQUE ? 'Unique cards cannot evolve' : 'Legendary is the top craftable rarity';
  if (c.plus < CONFIG.CARDS.maxPlus) return `Upgrade to +${CONFIG.CARDS.maxPlus} first`;
  const k = evolveCost(c);
  if (!canPayCR(k.cr)) return `Need ${fmt(k.cr - S.player.cr)} CR more`;
  if (S.player.shards < k.shards) return `Need ${k.shards - S.player.shards} more shards`;
  return '';
}
function doEvolveCard(id) {
  const c = S.inv.find(x => x.id === id), k = evolveCost(c);
  spendCR(k.cr, 'evolve');
  S.player.shards -= k.shards;
  c.rarity++;
  c.plus = 0;
  // gain the extra bonus stat slots of the new rarity; existing stats keep their rolls
  const want = rarityOf(c.rarity).bonus;
  const types = pickBonusTypes(want, c.bonus.map(b => b.type));
  for (const t of types) if (!c.bonus.find(b => b.type === t)) c.bonus.push({ type: t, roll: rollValue() });
  count('evolves');
  recordAlbum(c);
  if (c.rarity === 4) count('legendaryGot');
  log('SYSTEM', `EVOLUTION: your ${cardType(c.type).name} became ${rarityOf(c.rarity).name}!`);
  return c;
}

// ---------- reroll random bonus stats (Neural Recalibrator) ----------
function whyRerollCard(id) {
  const c = S.inv.find(x => x.id === id);
  if (!c) return 'Card not found';
  if (c.listed) return 'Listed on market';
  if (S.player.recal < 1) return 'Need a Neural Recalibrator (guaranteed from every AI Lab round)';
  return '';
}
function doRerollCard(id) {
  const c = S.inv.find(x => x.id === id);
  S.player.recal--;
  c.bonus = pickBonusTypes(rarityOf(c.rarity).bonus).map(t => ({ type: t, roll: rollValue() }));
  count('rerolls');
  log('SYSTEM', `RECALIBRATED: ${cardLabel(c)} got new bonus stats.`);
  return c;
}

// ---------- shards ----------
function salvageValue(c) { return Math.round(CONFIG.CARDS.shardBase * rarityOf(c.rarity).shards * (1 + c.plus * 0.5)); }

// ---------- migration of v1 NFT saves ----------
function nftToCard(n) {
  const slotType = ['core', 'cooler', 'memory', 'hardware', 'hardware'];
  const rarityMap = [0, 2, 3, 4];
  const rarity = rarityMap[n.rarity] !== undefined ? rarityMap[n.rarity] : 0;
  const types = (n.affixes || []).map(a => a.type).filter(t => CONFIG.CARDS.stats[t]);
  const bonus = pickBonusTypes(CONFIG.CARDS.rarities[rarity].bonus, types).map(t => ({ type: t, roll: clamp(n.q || 1, CONFIG.CARDS.rollMin, CONFIG.CARDS.rollMax) }));
  return {
    id: n.id, dna: n.dna, type: slotType[n.slot] || 'core', rarity, plus: clamp((n.level || 1) - 1, 0, CONFIG.CARDS.maxPlus),
    mainRoll: clamp(n.q || 1, CONFIG.CARDS.rollMin, CONFIG.CARDS.rollMax), bonus, createdAt: n.createdAt || 0, locked: !!n.locked, listed: null,
  };
}
function migrateNftSave(data) {
  if (!data.inv || !data.inv.length || data.inv[0].type) return;
  const prev = S; S = data;
  try {
    S.inv = S.inv.map(nftToCard);
    // keep the best equipped card per type
    const eq = {};
    for (const id of S.equipped || []) {
      const c = S.inv.find(x => x.id === id);
      if (!c) continue;
      const cur = eq[c.type];
      if (!cur || c.rarity * 10 + c.plus > cur.rarity * 10 + cur.plus) eq[c.type] = c;
    }
    S.equipped = Object.values(eq).map(c => c.id);
    // old market listings cannot be converted reliably: drop them, the market refills
    S.market.listings = [];
    S.market.history = {};
    S.market.demand = {};
    for (const t of CONFIG.CARDS.types) S.market.demand[t.id] = 1;
    for (const c of S.inv) S.album[albumKey(c.type, c.rarity)] = S.album[albumKey(c.type, c.rarity)] || S.time;
    log('SYSTEM', `Upgrade to v2: your ${S.inv.length} NFTs were converted into cards.`);
  } finally { S = prev; }
}
