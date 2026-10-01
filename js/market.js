'use strict';
/* ============================================================
   MARKET — bot listings, bot trades, player listings, stand
   ============================================================ */

function standActive() { return !!(S.market.stand && !S.econ.offline); }
function standShare() { return standActive() ? CONFIG.MARKET.standLevels[S.market.stand.level].share : 0; }

function recordTrade(c, price) {
  const h = S.market.history;
  if (!h[c.type]) h[c.type] = [];
  h[c.type].push({ t: S.time, p: price, pl: c.plus, r: c.rarity });
  if (h[c.type].length > CONFIG.MARKET.historyMax) h[c.type].shift();
}
function standCommission(price, desc) {
  const c = Math.floor(price * CONFIG.MARKET.standFee * (1 + bonuses().eff.comm / 100));
  if (c > 0) {
    addCR(c, 'commission');
    S.market.standEarned += c;
    count('commissionTrades');
    if (chance(0.25) || c >= 200) log('TRADE', `Your stand earned ${fmt(c)} CR commission (${desc}).`);
  }
  return c;
}

function randomMarketPlus() { return weightedIndex([60, 25, 10, 4, 1]); }
function botListCard() {
  const n = mintCard({ plus: randomMarketPlus() });
  const f = fairValue(n);
  const price = Math.max(5, Math.round(f * randRange(1 - CONFIG.MARKET.botListSpread, 1 + CONFIG.MARKET.botListSpread)));
  const seller = pick(S.bots);
  const venue = standActive() && chance(standShare()) ? 'stand' : 'server';
  S.market.listings.push({ id: newId('l'), card: n, price, seller: seller.id, venue, expires: S.time + CONFIG.MARKET.listingTtlMs * randRange(0.3, 1) });
}
function playerListings() { return S.market.listings.filter(l => l.seller === 'player'); }
function listingCard(l) { return l.seller === 'player' ? S.inv.find(n => n.id === l.cardId) : l.card; }

function marketMinute(ms) {
  const M = CONFIG.MARKET, mk = S.market;
  const hourFrac = ms / CONFIG.HOUR;
  // expire listings
  for (const l of mk.listings.slice()) {
    if (S.time < l.expires) continue;
    mk.listings = mk.listings.filter(x => x !== l);
    if (l.seller === 'player') {
      const n = S.inv.find(x => x.id === l.cardId);
      if (n) n.listed = null;
      log('TRADE', `Your listing expired: ${n ? cardLabel(n) : 'item'} returned to inventory.`);
    }
  }
  // bots list new items
  let botCount = mk.listings.filter(l => l.seller !== 'player').length;
  for (let i = 0; i < 3 && botCount < M.botListingsTarget; i++) { botListCard(); botCount++; }
  // bots buy listed bot items
  for (const l of mk.listings.slice()) {
    if (l.seller === 'player') continue;
    const ratio = l.price / fairValue(l.card);
    const p = ratio <= 0.9 ? 0.05 : ratio <= 1 ? 0.02 : ratio <= 1.15 ? 0.008 : 0.002;
    if (chance(p)) {
      mk.listings = mk.listings.filter(x => x !== l);
      recordTrade(l.card, l.price);
      if (l.venue === 'stand' && standActive()) standCommission(l.price, 'bot sale of ' + cardLabel(l.card));
    }
  }
  // bot-to-bot trades happening across the net
  const boom = currentEvent().id === 'market_boom' ? 1.5 : 1;
  mk.botTradeAcc += M.botTradesPerHour * boom * hourFrac;
  while (mk.botTradeAcc >= 1) {
    mk.botTradeAcc -= 1;
    const type = pick(CONFIG.CARDS.types).id, plus = randomMarketPlus(), rarity = rollCardRarity();
    const fake = { type, plus, rarity, q: randRange(0.8, 1.2) };
    const price = Math.round(fairValue(fake) * randRange(0.8, 1.2));
    recordTrade(fake, price);
    if (standActive() && chance(standShare())) standCommission(price, `bot trade ${rarityOf(rarity).name} ${cardType(type).name}${plus ? ' +' + plus : ''}`);
  }
  // player listings may sell
  for (const l of playerListings()) {
    const n = S.inv.find(x => x.id === l.cardId);
    if (!n) { mk.listings = mk.listings.filter(x => x !== l); continue; }
    const ratio = l.price / fairValue(n);
    const f = ratio <= 0.8 ? 2 : ratio <= 1 ? 1 : ratio <= 1.2 ? 0.4 : ratio <= 1.5 ? 0.1 : 0.01;
    if (chance(M.playerSaleChancePerHour * f * hourFrac)) {
      const fee = l.venue === 'stand' ? 0 : Math.ceil(l.price * M.serverFee);
      mk.listings = mk.listings.filter(x => x !== l);
      S.inv = S.inv.filter(x => x !== n);
      S.equipped = S.equipped.filter(id => id !== n.id);
      recordTrade(n, l.price);
      addCR(l.price - fee, 'sales');
      count('cardSold');
      log('TRADE', `SOLD ${cardLabel(n)} to ${pick(S.bots).name} for ${fmt(l.price)} CR (fee ${fmt(fee)}).`);
    }
  }
  // type demand drifts
  for (const t in mk.demand) mk.demand[t] = clamp(mk.demand[t] * Math.exp(randRange(-0.01, 0.01)), 0.7, 1.4);
}
function marketStep(dtMs) {
  S.market.acc = (S.market.acc || 0) + dtMs;
  while (S.market.acc >= 60000) { S.market.acc -= 60000; marketMinute(60000); }
}

// ---------- reasons ----------
function whyBuyListing(lid) {
  const l = S.market.listings.find(x => x.id === lid);
  if (!l) return 'Listing no longer available';
  if (l.seller === 'player') return 'You cannot buy your own listing';
  if (invFull()) return 'Inventory full';
  if (!canPayCR(l.price)) return `Need ${fmt(l.price - S.player.cr)} CR more`;
  return '';
}
function listingFee(price) { return Math.max(1, Math.ceil(price * CONFIG.MARKET.listingFee)); }
function whyList(nid, price, venue) {
  const n = S.inv.find(x => x.id === nid);
  if (!n) return 'Select a card';
  const r = cardStatusReason(n);
  if (r) return r;
  if (!(Number.isInteger(price) && price >= 1)) return 'Enter a whole price of at least 1 CR';
  if (price > 1e12) return 'Price too high';
  if (playerListings().length >= CONFIG.MARKET.maxListings) return `Max ${CONFIG.MARKET.maxListings} active listings`;
  if (venue === 'stand' && !standActive()) return 'You have no active Marketplace Stand';
  if (!canPayCR(listingFee(price))) return `Listing fee ${fmt(listingFee(price))} CR`;
  return '';
}
function whyBuildMarketStand() {
  const M = CONFIG.MARKET;
  if (S.market.stand) return 'Already built';
  if (S.player.league < M.standLeague) return `Requires ${CONFIG.LEAGUES[M.standLeague].name} league`;
  if (serverFrozen()) return 'Infrastructure frozen: ' + fmtTime(S.server.freezeUntil - S.time);
  if (landFree() < M.standLand) return `Need ${fmt(M.standLand - landFree())} more free land (SU)`;
  if (!canPayCR(M.standCost)) return `Need ${fmt(M.standCost - S.player.cr)} CR more`;
  return '';
}
function whyUpgradeMarketStand() {
  const M = CONFIG.MARKET, st = S.market.stand;
  if (!st) return 'Build the stand first';
  if (st.level >= M.standLevels.length - 1) return 'Max level';
  if (serverFrozen()) return 'Infrastructure frozen: ' + fmtTime(S.server.freezeUntil - S.time);
  const c = M.standLevels[st.level + 1].cost;
  if (!canPayCR(c)) return `Need ${fmt(c - S.player.cr)} CR more`;
  return '';
}
