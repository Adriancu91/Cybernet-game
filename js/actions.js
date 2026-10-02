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
  if (cd > 0) return 'Răcire în curs: ' + fmtTime(cd);
  if (S.player.dt < times) return `Tokeni de date insuficienți - îți mai trebuie ${times - S.player.dt} DT`;
  return '';
}
function actTrain(stat, times, standId) {
  times = times === 10 ? 10 : 1;
  if (!['math', 'trivia', 'speed'].includes(stat)) return fail('Statistică necunoscută');
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
  const name = stat === 'math' ? 'IQ matematic' : stat === 'trivia' ? 'Cultură generală' : 'Viteză';
  return ok(`+${total.toFixed(1).replace('.', ',')} ${name} (stand x${standMult(standId)})`);
}

// ---------- data tokens ----------
function whyBuyDT(n) {
  if (!(n >= 1)) return 'Introdu o cantitate';
  if (!canPayCR(dtPriceFor(n))) return `Îți mai trebuie ${fmt(dtPriceFor(n) - S.player.cr)} CR`;
  return '';
}
function actBuyDT(n) {
  n = Math.floor(n);
  const r = whyBuyDT(n); if (r) return fail(r);
  const price = dtPriceFor(n);
  spendCR(price, 'dt');
  S.player.dtBuys.push({ t: S.time, n });
  addDT(n);
  return ok(`Ai cumpărat ${n} DT cu ${fmt(price)} CR`);
}

// ---------- land ----------
function whyBuyLand(n) {
  if (!(n >= 1)) return 'Alege o parcelă';
  if (n > CONFIG.LAND.heavyPlot && serverFrozen()) return 'Infrastructură înghețată: ' + fmtTime(S.server.freezeUntil - S.time);
  if (usedSpace() + n > S.server.total) return 'Spațiu liber insuficient pe Serverul global';
  if (!canPayCR(n * landPrice())) return `Îți mai trebuie ${fmt(n * landPrice() - S.player.cr)} CR`;
  return '';
}
function actBuyLand(n) {
  const r = whyBuyLand(n); if (r) return fail(r);
  const cost = n * landPrice();
  spendCR(cost, 'land');
  S.player.land += n;
  log('SERVER', `Ai cumpărat ${fmt(n)} SU de teren cu ${fmt(cost)} CR.`);
  checkServerCapacity();
  return ok(`+${n} SU teren`);
}

// ---------- stands ----------
function whyBuildStand() {
  const t = CONFIG.STAND_TIERS[0];
  if (S.stands.length >= CONFIG.MAX_STANDS) return `Maximum ${CONFIG.MAX_STANDS} standuri`;
  if (landFree() < t.land) return `Îți mai trebuie ${t.land - landFree()} SU de teren liber`;
  if (!canPayCR(t.cost)) return `Îți mai trebuie ${fmt(t.cost - S.player.cr)} CR`;
  return '';
}
function actBuildStand() {
  const r = whyBuildStand(); if (r) return fail(r);
  spendCR(CONFIG.STAND_TIERS[0].cost, 'stands');
  const s = { id: newId('s'), tier: 0 };
  S.stands.push(s);
  log('SYSTEM', `Standul de antrenament #${S.stands.length} a fost construit (x2).`);
  return ok('Stand construit');
}
function whyUpgradeStand(id) {
  const s = S.stands.find(x => x.id === id);
  if (!s) return 'Standul nu a fost găsit';
  if (s.tier >= CONFIG.STAND_TIERS.length - 1) return 'Nivel maxim (x10)';
  const nx = CONFIG.STAND_TIERS[s.tier + 1];
  if (S.player.league < nx.league) return `Necesită liga ${CONFIG.LEAGUES[nx.league].name}`;
  if (s.tier + 1 >= CONFIG.HEAVY_STAND_TIER && serverFrozen()) return 'Infrastructură înghețată: ' + fmtTime(S.server.freezeUntil - S.time);
  const extra = nx.land - CONFIG.STAND_TIERS[s.tier].land;
  if (landFree() < extra) return `Îți mai trebuie ${fmt(extra - landFree())} SU de teren liber`;
  if (!canPayCR(nx.cost)) return `Îți mai trebuie ${fmt(nx.cost - S.player.cr)} CR`;
  return '';
}
function actUpgradeStand(id) {
  const r = whyUpgradeStand(id); if (r) return fail(r);
  const s = S.stands.find(x => x.id === id);
  const nx = CONFIG.STAND_TIERS[s.tier + 1];
  spendCR(nx.cost, 'stands');
  s.tier++;
  log('SYSTEM', `Standul de antrenament a fost îmbunătățit la x${nx.mult}.`);
  return ok('Îmbunătățit la x' + nx.mult);
}
function standRefund(s) {
  let inv = 0;
  for (let i = 0; i <= s.tier; i++) inv += CONFIG.STAND_TIERS[i].cost;
  return Math.floor(inv * CONFIG.DEMOLISH_REFUND);
}
function actDemolishStand(id) {
  const s = S.stands.find(x => x.id === id);
  if (!s) return fail('Standul nu a fost găsit');
  const refund = standRefund(s);
  S.stands = S.stands.filter(x => x !== s);
  addCR(refund, 'refund');
  log('SYSTEM', `Stand demolat: rambursare +${fmt(refund)} CR, ${CONFIG.STAND_TIERS[s.tier].land} SU de teren eliberate.`);
  return ok('Demolat');
}

// ---------- arena ----------
function actSolo(now) { return startSolo(now); }
function actMulti(now) { return startMulti(now); }

// ---------- cards ----------
function whyEquip(id) {
  const c = S.inv.find(x => x.id === id);
  if (!c) return 'Cartea nu a fost găsită';
  if (isEquipped(id)) return 'Deja echipată';
  if (c.listed) return 'Listată pe Piață';
  return '';
}
// one card per type: equipping replaces the card of the same type
function actEquip(id) {
  const r = whyEquip(id); if (r) return fail(r);
  const c = S.inv.find(x => x.id === id);
  const old = equippedOfType(c.type);
  S.equipped = S.equipped.filter(x => !old || x !== old.id);
  S.equipped.push(id);
  return ok(old ? `Echipată (a înlocuit ${cardLabel(old)})` : 'Echipată');
}
function actUnequip(id) {
  if (!isEquipped(id)) return fail('Nu este echipată');
  S.equipped = S.equipped.filter(x => x !== id);
  return ok('Dezechipată');
}
function actToggleLock(id) {
  const c = S.inv.find(x => x.id === id);
  if (!c) return fail('Cartea nu a fost găsită');
  c.locked = !c.locked;
  return ok(c.locked ? 'Blocată' : 'Deblocată');
}
function actUpgradeCard(id) {
  const r = whyUpgradeCard(id); if (r) return fail(r);
  const c = doUpgradeCard(id);
  return Object.assign(ok(`${cardName(c)} îmbunătățită la +${c.plus}`), { card: c });
}
function actEvolveCard(id) {
  const r = whyEvolveCard(id); if (r) return fail(r);
  const c = doEvolveCard(id);
  return Object.assign(ok(`A evoluat la raritatea ${rarityOf(c.rarity).name}!`), { card: c });
}
function actRerollCard(id) {
  const r = whyRerollCard(id); if (r) return fail(r);
  const c = doRerollCard(id);
  return Object.assign(ok('Statistici bonus noi generate'), { card: c });
}
function whySalvage(id) {
  const c = S.inv.find(x => x.id === id);
  if (!c) return 'Cartea nu a fost găsită';
  return cardStatusReason(c);
}
function actSalvage(ids) {
  if (!Array.isArray(ids)) ids = [ids];
  ids = [...new Set(ids)];
  for (const id of ids) { const r = whySalvage(id); if (r) return fail(r); }
  if (!ids.length) return fail('Selectează cărțile de reciclat');
  let total = 0;
  for (const id of ids) { const c = S.inv.find(x => x.id === id); total += salvageValue(c); }
  S.inv = S.inv.filter(c => !ids.includes(c.id));
  addShards(total);
  missionProgress('salvage', ids.length);
  log('SYSTEM', `Cărți reciclate: ${ids.length}, transformate în ${total} Fragmente.`);
  return ok(`+${total} Fragmente`);
}
function whyForge(type) {
  if (!CONFIG.CARDS.types.find(t => t.id === type)) return 'Alege un tip';
  if (invFull()) return 'Inventar plin';
  if (S.player.shards < CONFIG.CARDS.forgeCost) return `Îți mai trebuie ${CONFIG.CARDS.forgeCost - S.player.shards} Fragmente`;
  return '';
}
function actForge(type) {
  const r = whyForge(type); if (r) return fail(r);
  S.player.shards -= CONFIG.CARDS.forgeCost;
  const c = giveCard(mintCard({ type, rarity: 0 }), 'forja de Fragmente');
  return Object.assign(ok('Carte forjată din Fragmente'), { card: c });
}

// ---------- guild ----------
function actJoinGuild(gid) {
  const r = whyJoinGuild(gid); if (r) return fail(r);
  const g = guildById(gid);
  S.player.guildId = g.id;
  g.contrib.player = g.contrib.player || 0;
  log('GUILD', `Te-ai alăturat breslei [${g.tag}] ${g.name}.`);
  return ok('Te-ai alăturat breslei ' + g.name);
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
  log('GUILD', `Ai fondat breasla [${g.tag}] ${g.name}. Boții vor începe să ceară să se alăture.`);
  return ok('Breaslă creată');
}
function actLeaveGuild() {
  const g = playerGuild();
  if (!g) return fail('Nu ești într-o breaslă');
  S.player.guildId = null;
  S.player.guildLeftAt = S.time;
  if (g.isPlayer) g.isPlayer = false; // the guild lives on, run by its bots
  log('GUILD', `Ai părăsit breasla [${g.tag}] ${g.name}. Te poți alătura altei bresle peste 24h.`);
  return ok('Ai părăsit breasla');
}
function actDonate(n) {
  n = Math.floor(n);
  const r = whyDonate(n); if (r) return fail(r);
  const g = playerGuild();
  spendCR(n, 'donation');
  g.vault += n;
  g.contrib.player = (g.contrib.player || 0) + n;
  missionProgress('donate', n);
  log('GUILD', `Ai donat ${fmt(n)} CR în seiful breslei [${g.tag}] (acum ${fmt(g.vault)} GV).`);
  return ok('Donație trimisă');
}
function actUpgradeHQ() {
  const r = whyUpgradeHQ(); if (r) return fail(r);
  const g = playerGuild(), c = hqCost(g);
  g.vault -= c.total;
  g.land += c.landNeeded;
  g.hq++;
  log('GUILD', `[${g.tag}] Sediul breslei, nivelul ${g.hq}, a fost construit (${fmt(c.landNeeded)} SU teren de breaslă + taxă ${fmt(c.fee)} GV).`);
  checkServerCapacity();
  return ok('Sediul breslei: nivelul ' + g.hq);
}
function actBuyCosmetic(id) {
  const r = whyBuyCosmetic(id); if (r) return fail(r);
  const c = CONFIG.COSMETICS.find(x => x.id === id), g = playerGuild();
  g.vault -= c.cost;
  S.player.cosmetics.owned.push(id);
  log('GUILD', `Element cosmetic deblocat: „${c.name}” pentru ${fmt(c.cost)} GV.`);
  return ok('Deblocat: ' + c.name);
}
function actUseCosmetic(id) {
  const c = CONFIG.COSMETICS.find(x => x.id === id);
  if (!c || !S.player.cosmetics.owned.includes(id)) return fail('Nu deții acest element');
  S.player.cosmetics[c.type] = id;
  return ok(c.name + ' - activ');
}

// ---------- market ----------
function actBuyListing(lid) {
  const r = whyBuyListing(lid); if (r) return fail(r);
  const l = S.market.listings.find(x => x.id === lid);
  spendCR(l.price, 'market');
  S.market.listings = S.market.listings.filter(x => x !== l);
  l.card.listed = null;
  giveCard(l.card, 'cumpărare din Piață');
  recordTrade(l.card, l.price);
  count('cardBought');
  missionProgress('buy_card', 1);
  log('TRADE', `Ai cumpărat ${cardLabel(l.card)} cu ${fmt(l.price)} CR de la ${(botById(l.seller) || { name: 'un comerciant' }).name}.`);
  return ok('Cumpărat');
}
function actListCard(nid, price, venue) {
  price = Math.floor(Number(price));
  venue = venue === 'stand' ? 'stand' : 'server';
  const r = whyList(nid, price, venue); if (r) return fail(r);
  const n = S.inv.find(x => x.id === nid);
  const fee = listingFee(price);
  spendCR(fee, 'listing');
  const l = { id: newId('l'), cardId: nid, price, seller: 'player', venue, expires: S.time + CONFIG.MARKET.listingTtlMs };
  n.listed = l.id;
  S.equipped = S.equipped.filter(id => id !== nid);
  S.market.listings.push(l);
  log('TRADE', `Ai listat ${cardLabel(n)} la ${fmt(price)} CR ${venue === 'stand' ? 'pe standul tău' : 'pe Piața serverului'} (taxă ${fee} CR).`);
  return ok('Listată');
}
function actCancelListing(lid) {
  const l = S.market.listings.find(x => x.id === lid && x.seller === 'player');
  if (!l) return fail('Anunțul nu a fost găsit');
  const n = S.inv.find(x => x.id === l.cardId);
  if (n) n.listed = null;
  S.market.listings = S.market.listings.filter(x => x !== l);
  return ok('Anunț anulat (taxa nu se rambursează)');
}
function actBuildMarketStand() {
  const r = whyBuildMarketStand(); if (r) return fail(r);
  spendCR(CONFIG.MARKET.standCost, 'marketStand');
  S.market.stand = { level: 0, built: S.time };
  log('TRADE', `Standul tău din Piața de cărți este DESCHIS. Câștigi ${CONFIG.MARKET.standFee * 100}% din fiecare tranzacție care trece prin el.`);
  return ok('Stand deschis');
}
function actUpgradeMarketStand() {
  const r = whyUpgradeMarketStand(); if (r) return fail(r);
  const nx = CONFIG.MARKET.standLevels[S.market.stand.level + 1];
  spendCR(nx.cost, 'marketStand');
  S.market.stand.level++;
  log('TRADE', `Standul din Piață a fost îmbunătățit la nivelul ${S.market.stand.level + 1} (${nx.share * 100}% din trafic).`);
  return ok('Îmbunătățit');
}
function actDemolishMarketStand() {
  if (!S.market.stand) return fail('Nu ai un stand');
  let inv = CONFIG.MARKET.standCost;
  for (let i = 1; i <= S.market.stand.level; i++) inv += CONFIG.MARKET.standLevels[i].cost;
  const refund = Math.floor(inv * CONFIG.DEMOLISH_REFUND);
  S.market.stand = null;
  for (const l of S.market.listings) if (l.venue === 'stand') l.venue = 'server';
  addCR(refund, 'refund');
  log('TRADE', `Standul din Piață a fost demolat: rambursare +${fmt(refund)} CR.`);
  return ok('Demolat');
}

// ---------- missions & meta ----------
function actClaimMission(i) {
  const m = S.missions.list[i];
  if (!m) return fail('Misiunea nu a fost găsită');
  if (m.claimed) return fail('Deja revendicată');
  if (m.progress < m.target) return fail('Încă nu este finalizată');
  m.claimed = true;
  addDT(m.reward.dt); addCR(m.reward.cr, 'missions'); addShards(m.reward.shards);
  const n = rollDrop(0.25, 'recompensă de misiune');
  count('missionsDone');
  return ok(`+${m.reward.dt} DT, +${fmt(m.reward.cr)} CR, +${m.reward.shards} Fragmente${n ? ', +1 carte!' : ''}`);
}
function actRebirth() {
  const r = whyRebirth(); if (r) return fail(r);
  const p = S.player, gain = legacyGain();
  p.legacy += gain; p.rebirths++;
  p.math = CONFIG.START.math; p.trivia = CONFIG.START.trivia; p.speedPoints = 0;
  p.rating = CONFIG.START.rating; p.league = 0;
  S.stands = [];
  log('SYSTEM', `RENAȘTERE NEURALĂ #${p.rebirths}: +${gain} Moștenire (acum ${p.legacy}, bonus permanent +${Math.round(legacyBonus() * 100)}% la antrenament și CR). Statisticile și standurile au fost resetate; cărțile, terenul, CR, breasla și elementele cosmetice se păstrează.`);
  return ok('Renaștere neurală reușită');
}
function actSetName(name) {
  name = String(name || '').trim().replace(/[<>]/g, '');
  if (name.length < 2 || name.length > 16) return fail('Numele trebuie să aibă între 2 și 16 caractere');
  S.player.name = name;
  return ok('Nume salvat');
}

// ---------- exploring land tiles ----------
function tileCount() { return Math.floor(S.player.land / CONFIG.EXPLORE.tileSU); }
function tilesExplored() { return Object.keys(S.player.tiles || {}).length; }
function whyExplore(i) {
  if (!Number.isInteger(i) || i < 0 || i >= tileCount()) return 'Sectorul nu se află pe terenul tău';
  if (S.player.tiles[i]) return 'Deja explorat';
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
  else if (kind === 'shards') text = `+${addShards(randInt(e.min, e.max))} Fragmente`;
  else if (kind === 'jackpot') text = `JACKPOT +${fmt(addCR(randInt(e.min, e.max), 'explore'))} CR`;
  else {
    const n = giveCard(mintCard({}), 'explorare teren');
    if (n) text = `Carte: ${cardLabel(n)}`;
    else { kind = 'dt'; text = `+${addDT(5)} DT (inventar plin)`; }
  }
  S.player.tiles[i] = kind === 'card' ? 'n' : kind[0]; // 'n' = card (kept from v1 saves)
  count('tilesExplored');
  if (kind === 'card' || kind === 'jackpot') log('SYSTEM', `Explorare sector #${i + 1}: ${text}`);
  return Object.assign(ok(text), { kind });
}
function actExploreAll(max) {
  const n = tileCount(), got = { dt: 0, cr: 0, shards: 0, card: 0, j: 0 };
  let done = 0;
  const crBefore = S.player.cr, dtBefore = S.player.dt, shBefore = S.player.shards;
  for (let i = 0; i < n && done < (max || 1e9); i++) {
    if (S.player.tiles[i]) continue;
    const r = actExplore(i);
    if (r.ok) { done++; if (r.kind === 'card') got.card++; if (r.kind === 'jackpot') got.j++; }
  }
  if (!done) return fail('Nu mai e nimic de explorat - cumpără mai mult teren');
  log('SYSTEM', `Sectoare explorate: ${done}.`);
  return ok(`Sectoare explorate: ${done} · +${fmt(S.player.cr - crBefore)} CR, +${S.player.dt - dtBefore} DT, +${S.player.shards - shBefore} Fragmente${got.card ? `, cărți: ${got.card}` : ''}${got.j ? `, jackpot: ${got.j}` : ''}`);
}

// ---------- always-available income ----------
function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function dailyInfo(today) {
  const dl = S.player.daily, I = CONFIG.INCOME;
  const claimed = dl.last === today;
  const cont = dl.last && dayDiff(dl.last, today) === 1;
  const streak = claimed ? dl.streak : (cont ? dl.streak + 1 : 1);
  const i = (streak - 1) % I.daily.length;
  const L = CONFIG.LEAGUES[S.player.league];
  return { claimed, streak, cr: I.daily[i] * L.reward, shards: I.dailyShards[i], dt: I.dailyDT[i], dayInCycle: i + 1 };
}
function actClaimDaily(today) {
  today = today || todayStr();
  const d = dailyInfo(today);
  if (d.claimed) return fail('Deja revendicat azi - revino mâine');
  S.player.daily = { last: today, streak: d.streak };
  addCR(d.cr, 'daily'); addShards(d.shards); addDT(d.dt);
  count('dailyClaims');
  log('SYSTEM', `Bonus zilnic (ziua ${d.streak} la rând): +${fmt(d.cr)} CR, +${d.dt} DT${d.shards ? ', +' + d.shards + ' Fragmente' : ''}.`);
  return ok(`Ziua ${d.streak}: +${fmt(d.cr)} CR, +${d.dt} DT${d.shards ? ', +' + d.shards + ' Fragmente' : ''}`);
}

// free practice: YOU answer (no stamina, no fee), small CR per correct answer
let PRACTICE = null; // not saved
function whyPractice() {
  if (PRACTICE && !PRACTICE.done) return 'Antrenamentul liber este deja în desfășurare';
  const cd = S.player.practiceUntil - S.time;
  if (cd > 0) return 'Următorul antrenament liber în ' + fmtTime(cd);
  return '';
}
function actStartPractice() {
  const r = whyPractice(); if (r) return fail(r);
  const used = new Set(), n = CONFIG.INCOME.practiceQuestions;
  const qs = [];
  for (let i = 0; i < n; i++) qs.push(genQuestion(S.player.league, used, questionMode()));
  PRACTICE = { qs, i: 0, correct: 0, last: null, done: false, cr: 0 };
  S.player.practiceUntil = S.time + CONFIG.INCOME.practiceCooldownMs;
  return ok('Antrenament liber început');
}
function practiceAnswer(choice) {
  const m = PRACTICE;
  if (!m || m.done || m.i >= m.qs.length) return fail('Niciun antrenament liber în desfășurare');
  const q = m.qs[m.i], right = checkAnswer(q, choice);
  if (right) m.correct++;
  m.last = { choice, right, answer: q.answer };
  m.i++;
  if (m.i >= m.qs.length) {
    m.done = true;
    m.cr = addCR(m.correct * CONFIG.INCOME.practiceCRPerCorrect * CONFIG.LEAGUES[S.player.league].reward, 'practice');
    count('practiceRuns');
    log('ARENA', `Antrenament liber: ${m.correct}/${m.qs.length} corecte, +${fmt(m.cr)} CR.`);
  }
  return ok(right ? 'Corect!' : 'Greșit - răspunsul corect era ' + q.answer);
}

// emergency credits: only when you cannot afford a Multiplayer entry fee
function rescueAmount() { return multiFee() * CONFIG.INCOME.rescueMult; }
function whyRescue() {
  if (S.player.cr >= multiFee()) return 'Disponibil doar când nu poți plăti taxa de intrare la Multiplayer';
  const cd = S.player.rescueUntil - S.time;
  if (cd > 0) return 'Disponibil din nou în ' + fmtTime(cd);
  return '';
}
function actRescue() {
  const r = whyRescue(); if (r) return fail(r);
  const n = addCR(rescueAmount(), 'rescue');
  S.player.rescueUntil = S.time + CONFIG.INCOME.rescueCooldownMs;
  count('rescues');
  log('SYSTEM', `Credite de urgență: +${fmt(n)} CR.`);
  return ok(`+${fmt(n)} CR - credite de urgență`);
}
