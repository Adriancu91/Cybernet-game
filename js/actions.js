'use strict';
/* ============================================================
   ACTIONS — the ONLY way the player changes the game state.
   Each action: validate (why* returns a reason) -> pay -> apply -> log.
   Returns { ok, msg }.
   ============================================================ */

const ok = (msg) => ({ ok: true, msg: msg || '' });
const fail = (msg) => ({ ok: false, msg });

// ---------- training ----------
function bestStandId() {
  let best = null, m = 1;
  for (const s of S.stands) { const x = standMult(s.id); if (x > m) { m = x; best = s.id; } }
  return best;
}
function whyTrain(times) {
  const cd = (S.player.trainCdUntil || 0) - S.time;
  if (cd > 0) return 'Cooling down: ' + fmtTime(cd);
  if (S.player.dt < times) return `Need ${times - S.player.dt} more Data Tokens`;
  return '';
}
function actTrain(stat, times, standId) {
  times = times === 10 ? 10 : 1;
  if (!['math', 'trivia', 'speed'].includes(stat)) return fail('Unknown stat');
  const r = whyTrain(times); if (r) return fail(r);
  if (standId && !S.stands.find(s => s.id === standId)) standId = null;
  spendDT(times);
  let total = 0;
  for (let i = 0; i < times; i++) {
    const g = trainGain(stat, standId);
    total += g;
    if (stat === 'math') S.player.math += g;
    else if (stat === 'trivia') S.player.trivia += g;
    else S.player.speedPoints += g;
  }
  S.player.trainCdUntil = S.time + CONFIG.PET.trainCooldownMs;
  count('trains', times);
  missionProgress('train', times);
  const name = stat === 'math' ? 'Math IQ' : stat === 'trivia' ? 'Trivia DB' : 'Speed';
  return ok(`+${total.toFixed(1)} ${name} (x${standMult(standId)} stand)`);
}

// ---------- data tokens ----------
function whyBuyDT(n) {
  if (!(n >= 1)) return 'Enter an amount';
  if (!canPayCR(dtPriceFor(n))) return `Need ${fmt(dtPriceFor(n) - S.player.cr)} CR more`;
  return '';
}
function actBuyDT(n) {
  n = Math.floor(n);
  const r = whyBuyDT(n); if (r) return fail(r);
  const price = dtPriceFor(n);
  spendCR(price, 'dt');
  S.player.dtBuys.push({ t: S.time, n });
  addDT(n);
  return ok(`Bought ${n} DT for ${fmt(price)} CR`);
}

// ---------- land ----------
function whyBuyLand(n) {
  if (!(n >= 1)) return 'Choose a plot';
  if (n > CONFIG.LAND.heavyPlot && serverFrozen()) return 'Infrastructure frozen: ' + fmtTime(S.server.freezeUntil - S.time);
  if (usedSpace() + n > S.server.total) return 'Not enough free space on the Global Server';
  if (!canPayCR(n * landPrice())) return `Need ${fmt(n * landPrice() - S.player.cr)} CR more`;
  return '';
}
function actBuyLand(n) {
  const r = whyBuyLand(n); if (r) return fail(r);
  const cost = n * landPrice();
  spendCR(cost, 'land');
  S.player.land += n;
  log('SERVER', `You bought ${fmt(n)} SU of land for ${fmt(cost)} CR.`);
  checkServerCapacity();
  return ok(`+${n} SU land`);
}

// ---------- stands ----------
function whyBuildStand() {
  const t = CONFIG.STAND_TIERS[0];
  if (S.stands.length >= CONFIG.MAX_STANDS) return `Max ${CONFIG.MAX_STANDS} stands`;
  if (landFree() < t.land) return `Need ${t.land - landFree()} more free land (SU)`;
  if (!canPayCR(t.cost)) return `Need ${fmt(t.cost - S.player.cr)} CR more`;
  return '';
}
function actBuildStand() {
  const r = whyBuildStand(); if (r) return fail(r);
  spendCR(CONFIG.STAND_TIERS[0].cost, 'stands');
  const s = { id: newId('s'), tier: 0 };
  S.stands.push(s);
  log('SYSTEM', `Training Stand #${S.stands.length} built (x2).`);
  return ok('Stand built');
}
function whyUpgradeStand(id) {
  const s = S.stands.find(x => x.id === id);
  if (!s) return 'Stand not found';
  if (s.tier >= CONFIG.STAND_TIERS.length - 1) return 'Max tier (x10)';
  const nx = CONFIG.STAND_TIERS[s.tier + 1];
  if (S.player.league < nx.league) return `Requires ${CONFIG.LEAGUES[nx.league].name} league`;
  if (s.tier + 1 >= CONFIG.HEAVY_STAND_TIER && serverFrozen()) return 'Infrastructure frozen: ' + fmtTime(S.server.freezeUntil - S.time);
  const extra = nx.land - CONFIG.STAND_TIERS[s.tier].land;
  if (landFree() < extra) return `Need ${fmt(extra - landFree())} more free land (SU)`;
  if (!canPayCR(nx.cost)) return `Need ${fmt(nx.cost - S.player.cr)} CR more`;
  return '';
}
function actUpgradeStand(id) {
  const r = whyUpgradeStand(id); if (r) return fail(r);
  const s = S.stands.find(x => x.id === id);
  const nx = CONFIG.STAND_TIERS[s.tier + 1];
  spendCR(nx.cost, 'stands');
  s.tier++;
  log('SYSTEM', `Training Stand upgraded to x${nx.mult}.`);
  return ok('Upgraded to x' + nx.mult);
}
function standRefund(s) {
  let inv = 0;
  for (let i = 0; i <= s.tier; i++) inv += CONFIG.STAND_TIERS[i].cost;
  return Math.floor(inv * CONFIG.DEMOLISH_REFUND);
}
function actDemolishStand(id) {
  const s = S.stands.find(x => x.id === id);
  if (!s) return fail('Stand not found');
  const refund = standRefund(s);
  S.stands = S.stands.filter(x => x !== s);
  addCR(refund, 'refund');
  log('SYSTEM', `Stand demolished: +${fmt(refund)} CR refund, ${CONFIG.STAND_TIERS[s.tier].land} SU land freed.`);
  return ok('Demolished');
}

// ---------- arena ----------
function actSolo(now) { return startSolo(now); }
function actMulti(now) { return startMulti(now); }

// ---------- NFTs ----------
function whyEquip(id) {
  const n = S.inv.find(x => x.id === id);
  if (!n) return 'Not found';
  if (isEquipped(id)) return 'Already equipped';
  if (n.listed) return 'Listed on market';
  if (S.equipped.length >= CONFIG.NFT.equipSlots) return `All ${CONFIG.NFT.equipSlots} equip slots are full`;
  return '';
}
function actEquip(id) {
  const r = whyEquip(id); if (r) return fail(r);
  S.equipped.push(id);
  return ok('Equipped');
}
function actUnequip(id) {
  if (!isEquipped(id)) return fail('Not equipped');
  S.equipped = S.equipped.filter(x => x !== id);
  return ok('Unequipped');
}
function actToggleLock(id) {
  const n = S.inv.find(x => x.id === id);
  if (!n) return fail('Not found');
  n.locked = !n.locked;
  return ok(n.locked ? 'Locked' : 'Unlocked');
}
function actFuse(ids) {
  const r = whyFuse(ids); if (r) return fail(r);
  const out = doFusion(ids);
  return Object.assign(ok('Fusion complete'), { nft: out });
}
function actAscend(ids) {
  const r = whyAscend(ids); if (r) return fail(r);
  spendCR(CONFIG.NFT.ascensionFee, 'fusion');
  const keep = S.inv.find(n => n.id === ids[0]);
  S.inv = S.inv.filter(n => !ids.includes(n.id) || n === keep);
  keep.stars = (keep.stars || 0) + 1;
  S.player.ascensions++;
  log('SYSTEM', `ASCENSION: ${nftName(keep)} gained a prestige star (${keep.stars}).`);
  return ok('Ascended');
}
function whySalvage(id) {
  const n = S.inv.find(x => x.id === id);
  if (!n) return 'Not found';
  return nftStatusReason(n);
}
function actSalvage(ids) {
  if (!Array.isArray(ids)) ids = [ids];
  ids = [...new Set(ids)];
  for (const id of ids) { const r = whySalvage(id); if (r) return fail(r); }
  if (!ids.length) return fail('Select NFTs to salvage');
  let total = 0;
  for (const id of ids) { const n = S.inv.find(x => x.id === id); total += salvageValue(n); }
  S.inv = S.inv.filter(n => !ids.includes(n.id));
  addShards(total);
  missionProgress('salvage', ids.length);
  log('SYSTEM', `Salvaged ${ids.length} NFT(s) into ${total} shards.`);
  return ok(`+${total} shards`);
}
function whyShardBuy(theme, slot) {
  if (!themeById(theme)) return 'Choose a theme';
  if (!(slot >= 0 && slot <= 4)) return 'Choose a slot';
  if (invFull()) return 'Inventory full';
  if (S.player.shards < CONFIG.NFT.shardBuyCost) return `Need ${CONFIG.NFT.shardBuyCost - S.player.shards} more shards`;
  return '';
}
function actShardBuy(theme, slot) {
  slot = Number(slot);
  const r = whyShardBuy(theme, slot); if (r) return fail(r);
  S.player.shards -= CONFIG.NFT.shardBuyCost;
  const n = giveNFT(mintNFT({ theme, slot, level: 1 }), 'shard exchange');
  return Object.assign(ok('NFT forged from shards'), { nft: n });
}

// ---------- guild ----------
function actJoinGuild(gid) {
  const r = whyJoinGuild(gid); if (r) return fail(r);
  const g = guildById(gid);
  S.player.guildId = g.id;
  g.contrib.player = g.contrib.player || 0;
  log('GUILD', `You joined [${g.tag}] ${g.name}.`);
  return ok('Joined ' + g.name);
}
function actCreateGuild(name) {
  const r = whyCreateGuild(name); if (r) return fail(r);
  name = name.trim();
  spendCR(CONFIG.GUILD.createCost, 'guild');
  const tag = (name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).map(w => w[0] || '').join('') + name.replace(/[^A-Za-z0-9]/g, '')).toUpperCase().slice(0, 4).padEnd(3, 'X');
  const g = newGuild(name, tag, true);
  S.guilds.push(g);
  S.player.guildId = g.id;
  g.contrib.player = 0;
  log('GUILD', `You founded [${g.tag}] ${g.name}. Bots will start applying to join.`);
  return ok('Guild created');
}
function actLeaveGuild() {
  const g = playerGuild();
  if (!g) return fail('Not in a guild');
  S.player.guildId = null;
  S.player.guildLeftAt = S.time;
  if (g.isPlayer) g.isPlayer = false; // the guild lives on, run by its bots
  log('GUILD', `You left [${g.tag}] ${g.name}. You can join another guild in 24h.`);
  return ok('Left guild');
}
function actDonate(n) {
  n = Math.floor(n);
  const r = whyDonate(n); if (r) return fail(r);
  const g = playerGuild();
  spendCR(n, 'donation');
  g.vault += n;
  g.contrib.player = (g.contrib.player || 0) + n;
  missionProgress('donate', n);
  log('GUILD', `You donated ${fmt(n)} CR to [${g.tag}] vault (now ${fmt(g.vault)} GV).`);
  return ok('Donated');
}
function actUpgradeHQ() {
  const r = whyUpgradeHQ(); if (r) return fail(r);
  const g = playerGuild(), c = hqCost(g);
  g.vault -= c.total;
  g.land += c.landNeeded;
  g.hq++;
  log('GUILD', `[${g.tag}] Guild HQ level ${g.hq} built (${fmt(c.landNeeded)} SU guild land + ${fmt(c.fee)} GV fee).`);
  checkServerCapacity();
  return ok('HQ level ' + g.hq);
}
function actBuyCosmetic(id) {
  const r = whyBuyCosmetic(id); if (r) return fail(r);
  const c = CONFIG.COSMETICS.find(x => x.id === id), g = playerGuild();
  g.vault -= c.cost;
  S.player.cosmetics.owned.push(id);
  log('GUILD', `Unlocked cosmetic "${c.name}" for ${fmt(c.cost)} GV.`);
  return ok('Unlocked ' + c.name);
}
function actUseCosmetic(id) {
  const c = CONFIG.COSMETICS.find(x => x.id === id);
  if (!c || !S.player.cosmetics.owned.includes(id)) return fail('Not owned');
  S.player.cosmetics[c.type] = id;
  return ok(c.name + ' active');
}

// ---------- market ----------
function actBuyListing(lid) {
  const r = whyBuyListing(lid); if (r) return fail(r);
  const l = S.market.listings.find(x => x.id === lid);
  spendCR(l.price, 'market');
  S.market.listings = S.market.listings.filter(x => x !== l);
  l.nft.listed = null;
  giveNFT(l.nft, 'market purchase');
  recordTrade(l.nft, l.price);
  count('nftBought');
  missionProgress('buy_nft', 1);
  log('TRADE', `You bought ${nftName(l.nft)} L${l.nft.level} for ${fmt(l.price)} CR from ${(botById(l.seller) || { name: 'a trader' }).name}.`);
  return ok('Purchased');
}
function actListNFT(nid, price, venue) {
  price = Math.floor(Number(price));
  venue = venue === 'stand' ? 'stand' : 'server';
  const r = whyList(nid, price, venue); if (r) return fail(r);
  const n = S.inv.find(x => x.id === nid);
  const fee = listingFee(price);
  spendCR(fee, 'listing');
  const l = { id: newId('l'), nftId: nid, price, seller: 'player', venue, expires: S.time + CONFIG.MARKET.listingTtlMs };
  n.listed = l.id;
  S.equipped = S.equipped.filter(id => id !== nid);
  S.market.listings.push(l);
  log('TRADE', `Listed ${nftName(n)} L${n.level} for ${fmt(price)} CR on the ${venue === 'stand' ? 'your stand' : 'server market'} (fee ${fee} CR).`);
  return ok('Listed');
}
function actCancelListing(lid) {
  const l = S.market.listings.find(x => x.id === lid && x.seller === 'player');
  if (!l) return fail('Listing not found');
  const n = S.inv.find(x => x.id === l.nftId);
  if (n) n.listed = null;
  S.market.listings = S.market.listings.filter(x => x !== l);
  return ok('Listing cancelled (fee not refunded)');
}
function actBuildMarketStand() {
  const r = whyBuildMarketStand(); if (r) return fail(r);
  spendCR(CONFIG.MARKET.standCost, 'marketStand');
  S.market.stand = { level: 0, built: S.time };
  log('TRADE', `Your NFT Marketplace Stand is OPEN. You earn ${CONFIG.MARKET.standFee * 100}% of every trade routed through it.`);
  return ok('Stand opened');
}
function actUpgradeMarketStand() {
  const r = whyUpgradeMarketStand(); if (r) return fail(r);
  const nx = CONFIG.MARKET.standLevels[S.market.stand.level + 1];
  spendCR(nx.cost, 'marketStand');
  S.market.stand.level++;
  log('TRADE', `Marketplace Stand upgraded to level ${S.market.stand.level + 1} (${nx.share * 100}% traffic).`);
  return ok('Upgraded');
}
function actDemolishMarketStand() {
  if (!S.market.stand) return fail('No stand');
  let inv = CONFIG.MARKET.standCost;
  for (let i = 1; i <= S.market.stand.level; i++) inv += CONFIG.MARKET.standLevels[i].cost;
  const refund = Math.floor(inv * CONFIG.DEMOLISH_REFUND);
  S.market.stand = null;
  for (const l of S.market.listings) if (l.venue === 'stand') l.venue = 'server';
  addCR(refund, 'refund');
  log('TRADE', `Marketplace Stand demolished: +${fmt(refund)} CR refund.`);
  return ok('Demolished');
}

// ---------- missions & meta ----------
function actClaimMission(i) {
  const m = S.missions.list[i];
  if (!m) return fail('Mission not found');
  if (m.claimed) return fail('Already claimed');
  if (m.progress < m.target) return fail('Not complete yet');
  m.claimed = true;
  addDT(m.reward.dt); addCR(m.reward.cr, 'missions'); addShards(m.reward.shards);
  const n = rollDrop(0.25, 'mission reward');
  count('missionsDone');
  return ok(`+${m.reward.dt} DT, +${fmt(m.reward.cr)} CR, +${m.reward.shards} shards${n ? ', +1 NFT!' : ''}`);
}
function actRebirth() {
  const r = whyRebirth(); if (r) return fail(r);
  const p = S.player, gain = legacyGain();
  p.legacy += gain; p.rebirths++;
  p.math = CONFIG.START.math; p.trivia = CONFIG.START.trivia; p.speedPoints = 0;
  p.rating = CONFIG.START.rating; p.league = 0;
  S.stands = [];
  log('SYSTEM', `NEURAL REBIRTH #${p.rebirths}: +${gain} Legacy (now ${p.legacy}, permanent +${Math.round(legacyBonus() * 100)}% training & CR). Stats and stands reset; NFTs, land, CR, guild and cosmetics kept.`);
  return ok('Reborn');
}
function actSetName(name) {
  name = String(name || '').trim().replace(/[<>]/g, '');
  if (name.length < 2 || name.length > 16) return fail('Name must be 2-16 characters');
  S.player.name = name;
  return ok('Name set');
}

// ---------- exploring land tiles ----------
function tileCount() { return Math.floor(S.player.land / CONFIG.EXPLORE.tileSU); }
function tilesExplored() { return Object.keys(S.player.tiles || {}).length; }
function whyExplore(i) {
  if (!Number.isInteger(i) || i < 0 || i >= tileCount()) return 'Tile not on your land';
  if (S.player.tiles[i]) return 'Already explored';
  return '';
}
function actExplore(i) {
  i = Number(i);
  const r = whyExplore(i); if (r) return fail(r);
  const T = CONFIG.EXPLORE.table;
  const e = T[weightedIndex(T.map(x => x.weight))];
  let text = '', kind = e.kind;
  if (kind === 'dt') text = `+${addDT(randInt(e.min, e.max))} DT`;
  else if (kind === 'cr') text = `+${fmt(addCR(randInt(e.min, e.max), 'explore'))} CR`;
  else if (kind === 'shards') text = `+${addShards(randInt(e.min, e.max))} shards`;
  else if (kind === 'jackpot') text = `JACKPOT +${fmt(addCR(randInt(e.min, e.max), 'explore'))} CR`;
  else {
    const n = giveNFT(mintNFT({}), 'land exploration');
    if (n) text = `NFT: ${nftName(n)} [${CONFIG.NFT.rarities[n.rarity].name}]`;
    else { kind = 'dt'; text = `+${addDT(5)} DT (inventory full)`; }
  }
  S.player.tiles[i] = kind[0];
  count('tilesExplored');
  if (kind === 'nft' || kind === 'jackpot') log('SYSTEM', `Exploring sector #${i + 1}: ${text}`);
  return Object.assign(ok(text), { kind });
}
function actExploreAll(max) {
  const n = tileCount(), got = { dt: 0, cr: 0, shards: 0, nft: 0, j: 0 };
  let done = 0;
  const crBefore = S.player.cr, dtBefore = S.player.dt, shBefore = S.player.shards;
  for (let i = 0; i < n && done < (max || 1e9); i++) {
    if (S.player.tiles[i]) continue;
    const r = actExplore(i);
    if (r.ok) { done++; if (r.kind === 'nft') got.nft++; if (r.kind === 'jackpot') got.j++; }
  }
  if (!done) return fail('Nothing left to explore - buy more land');
  log('SYSTEM', `Explored ${done} sectors.`);
  return ok(`Explored ${done}: +${fmt(S.player.cr - crBefore)} CR, +${S.player.dt - dtBefore} DT, +${S.player.shards - shBefore} shards${got.nft ? `, ${got.nft} NFT` : ''}${got.j ? `, ${got.j} jackpot` : ''}`);
}
