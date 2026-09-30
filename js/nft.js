'use strict';
/* ============================================================
   NFT — minting, affixes, drops, fair value, fusion, shards
   ============================================================ */

function themeById(id) { return CONFIG.NFT.themes.find(t => t.id === id); }
function nftName(n) { return themeById(n.theme).name + ' ' + CONFIG.NFT.slots[n.slot]; }
function rollRarity(bonusIdx) {
  const w = CONFIG.NFT.rarities.map(r => r.weight);
  let r = weightedIndex(w);
  if (bonusIdx) r = Math.min(3, r + bonusIdx);
  return r;
}
function mintNFT(opts) {
  const N = CONFIG.NFT;
  const theme = opts.theme || pick(N.themes).id;
  const slot = opts.slot !== undefined ? opts.slot : randInt(0, 4);
  const level = opts.level || 1;
  const rarity = opts.rarity !== undefined ? opts.rarity : rollRarity(0);
  const R = N.rarities[rarity];
  const types = shuffle(Object.keys(N.affixes).slice()).slice(0, R.affixes);
  let qSum = 0;
  const affixes = types.map(t => {
    const roll = randRange(N.rollMin, N.rollMax);
    qSum += roll;
    const v = N.affixes[t].base * Math.pow(N.levelGrowth, level - 1) * R.mult * roll;
    return { type: t, value: Math.round(v * 10) / 10 };
  });
  return {
    id: newId('n'), dna: (rand() * 4294967295) >>> 0, theme, slot, level, rarity, affixes,
    q: Math.round((qSum / types.length) * 100) / 100, createdAt: S.time, locked: false, listed: null, stars: 0,
  };
}
function fairValue(n) {
  const M = CONFIG.MARKET;
  const R = CONFIG.NFT.rarities[n.rarity];
  const demand = (S.market.demand && S.market.demand[n.theme]) || 1;
  return Math.max(10, Math.round(M.fairBase * Math.pow(M.fairGrowth, n.level - 1) * Math.pow(R.mult, 1.5) * (n.q || 1) * demand));
}

// ---------- inventory ----------
function invFull() { return S.inv.length >= CONFIG.NFT.inventoryMax; }
function giveNFT(n, reason) {
  if (invFull()) { log('SYSTEM', `Inventory full - ${nftName(n)} was lost. Salvage some items!`); return null; }
  S.inv.push(n);
  count('nftGot');
  if (n.rarity === 3) count('legendaryGot');
  if (reason) log('SYSTEM', `NFT acquired: ${nftName(n)} L${n.level} [${CONFIG.NFT.rarities[n.rarity].name}] (${reason})`);
  return n;
}
function dropChance(base) { return Math.min(0.95, base * (currentEvent().id === 'double_drops' ? 2 : 1)); }
function rollDrop(baseChance, reason) {
  if (!chance(dropChance(baseChance))) return null;
  const ev = currentEvent();
  const opts = {};
  if (ev.id === 'double_drops' && chance(0.5)) opts.theme = ev.theme.id;
  if (S.player.league >= 3 && chance(0.1 + 0.05 * (S.player.league - 3))) opts.level = 2;
  return giveNFT(mintNFT(opts), reason);
}
function isEquipped(id) { return S.equipped.includes(id); }
function nftStatusReason(n) {
  if (n.listed) return 'Listed on market';
  if (isEquipped(n.id)) return 'Equipped - unequip first';
  if (n.locked) return 'Locked - unlock first';
  return '';
}

// ---------- fusion ----------
function fusionFee(level) { return Math.round(CONFIG.NFT.fusionFeeBase * Math.pow(CONFIG.NFT.fusionFeeGrowth, level - 1)); }
function whyFuse(ids) {
  if (!Array.isArray(ids) || ids.length !== 5) return 'Select exactly 5 NFTs';
  if (new Set(ids).size !== 5) return 'Duplicate selection';
  const items = ids.map(id => S.inv.find(n => n.id === id));
  if (items.some(n => !n)) return 'Item not in inventory';
  for (const n of items) { const r = nftStatusReason(n); if (r) return nftName(n) + ': ' + r; }
  const t = items[0].theme, l = items[0].level;
  if (items.some(n => n.theme !== t)) return 'All 5 must be the same theme';
  if (items.some(n => n.level !== l)) return 'All 5 must be the same level';
  if (new Set(items.map(n => n.slot)).size !== 5) return 'Need one of each slot (Core, Lens, Spine, Crown, Key)';
  if (l >= CONFIG.NFT.maxLevel) return 'Max level reached - use Ascension';
  if (!canPayCR(fusionFee(l))) return `Need ${fmt(fusionFee(l) - S.player.cr)} CR more`;
  return '';
}
function fusionPreview(ids) {
  const items = ids.map(id => S.inv.find(n => n.id === id));
  return { theme: items[0].theme, level: items[0].level + 1, fee: fusionFee(items[0].level) };
}
function doFusion(ids) {
  const items = ids.map(id => S.inv.find(n => n.id === id));
  const theme = items[0].theme, L = items[0].level;
  spendCR(fusionFee(L), 'fusion');
  S.inv = S.inv.filter(n => !ids.includes(n.id));
  // output slot with pity
  const key = theme + ':' + (L + 1);
  const owned = new Set(S.inv.filter(n => n.theme === theme && n.level === L + 1).map(n => n.slot));
  const missing = [0, 1, 2, 3, 4].filter(s => !owned.has(s));
  const pity = S.fusionPity[key] || 0;
  let slot;
  if (missing.length && pity >= CONFIG.NFT.fusionPity) slot = pick(missing);
  else slot = weightedIndex([0, 1, 2, 3, 4].map(s => (owned.has(s) ? 1 : CONFIG.NFT.fusionMissingWeight)));
  S.fusionPity[key] = owned.has(slot) ? pity + 1 : 0;
  const avgR = items.reduce((s, n) => s + n.rarity, 0) / 5;
  let rarity = Math.round(avgR);
  if (chance(0.15)) rarity = Math.min(3, rarity + 1);
  const out = mintNFT({ theme, slot, level: L + 1, rarity });
  S.inv.push(out);
  count('fusions'); count('nftGot');
  if (out.rarity === 3) count('legendaryGot');
  if (typeof missionProgress === 'function') missionProgress('fuse', 1);
  log('SYSTEM', `FUSION complete: 5 x L${L} burned -> ${nftName(out)} L${out.level} [${CONFIG.NFT.rarities[out.rarity].name}]`);
  return out;
}
function whyAscend(ids) {
  if (!Array.isArray(ids) || ids.length !== 5 || new Set(ids).size !== 5) return 'Select 5 Level 10 NFTs (one per slot, same theme)';
  const items = ids.map(id => S.inv.find(n => n.id === id));
  if (items.some(n => !n)) return 'Item not in inventory';
  for (const n of items) { const r = nftStatusReason(n); if (r) return r; }
  if (items.some(n => n.level !== CONFIG.NFT.maxLevel)) return 'All must be Level 10';
  if (items.some(n => n.theme !== items[0].theme) || new Set(items.map(n => n.slot)).size !== 5) return 'Need a full set of one theme';
  if (!canPayCR(CONFIG.NFT.ascensionFee)) return 'Need ' + fmt(CONFIG.NFT.ascensionFee) + ' CR';
  return '';
}

// ---------- shards ----------
function salvageValue(n) { return Math.round(CONFIG.NFT.shardBase * Math.pow(2, n.level - 1) * CONFIG.NFT.rarities[n.rarity].shards); }
