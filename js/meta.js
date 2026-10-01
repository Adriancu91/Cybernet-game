'use strict';
/* ============================================================
   META — daily missions, achievements, seasons, prestige,
   leaderboards
   ============================================================ */

// ---------- missions ----------
const MISSION_TYPES = [
  { type: 'train',      text: n => `Train your AI ${n} times`,               target: () => 20 },
  { type: 'solo_win',   text: n => `Win ${n} Solo Arena run`,                target: () => 1 },
  { type: 'multi_play', text: n => `Play ${n} Multiplayer matches`,          target: () => 2 },
  { type: 'multi_top3', text: n => `Finish top 3 in Multiplayer ${n} time`,  target: () => 1 },
  { type: 'earn',       text: n => `Earn ${fmt(n)} CR`,                      target: () => 800 * CONFIG.LEAGUES[S.player.league].reward },
  { type: 'buy_card',   text: n => `Buy ${n} card from the market`,          target: () => 1 },
  { type: 'override',   text: n => `Answer ${n} Human Override correctly`,   target: () => 1 },
  { type: 'donate',     text: n => `Donate ${fmt(n)} CR to your guild`,      target: () => 200 },
  { type: 'salvage',    text: n => `Salvage ${n} cards into shards`,         target: () => 2 },
  { type: 'upgrade',    text: n => `Upgrade cards ${n} times`,               target: () => 2 },
  { type: 'ai_round',   text: n => `Teach your AI in the AI Lab ${n} time`,  target: () => 1 },
];
function ensureMissions() {
  const d = gameDay();
  if (S.missions.day === d) return;
  S.missions.day = d;
  const types = shuffle(MISSION_TYPES.slice()).slice(0, CONFIG.MISSIONS_PER_DAY);
  const L = CONFIG.LEAGUES[S.player.league];
  S.missions.list = types.map(t => {
    const target = Math.round(t.target());
    return { type: t.type, text: t.text(target), target, progress: 0, claimed: false,
      reward: { dt: 20, cr: 150 * L.reward, shards: 10 } };
  });
  if (S.time > 1000) log('SYSTEM', 'New daily missions are available.');
}
function missionProgress(type, n) {
  if (!S.missions || !S.missions.list) return;
  for (const m of S.missions.list) {
    if (m.type === type && m.progress < m.target) {
      m.progress = Math.min(m.target, m.progress + n);
      if (m.progress >= m.target) log('SYSTEM', `Mission complete: ${m.text} - claim your reward!`);
    }
  }
}

// ---------- achievements ----------
const ACHIEVEMENTS = [
  ['first_train', 'Hello World', 'Train your AI once', () => counter('trains') >= 1],
  ['train_100', 'Gradient Descent', 'Train 100 times', () => counter('trains') >= 100],
  ['train_1000', 'Deep Learning', 'Train 1,000 times', () => counter('trains') >= 1000],
  ['stand_1', 'Foundation', 'Build a Training Stand', () => S.stands.length >= 1],
  ['stand_3', 'Campus', 'Own 3 Training Stands', () => S.stands.length >= 3],
  ['stand_x6', 'Overclocked', 'Upgrade a stand to x6', () => S.stands.some(s => s.tier >= 2)],
  ['stand_x10', 'Supercomputer', 'Upgrade a stand to x10', () => S.stands.some(s => s.tier >= 4)],
  ['solo_1', 'Solo Survivor', 'Win a Solo Arena run', () => counter('soloWins') >= 1],
  ['solo_10', 'Lone Wolf', 'Win 10 Solo Arena runs', () => counter('soloWins') >= 10],
  ['solo_perfect', 'Flawless', 'Win a Solo run with 10/10 correct', () => counter('soloPerfect') >= 1],
  ['multi_1', 'Lobby Rat', 'Play a Multiplayer match', () => counter('multiPlayed') >= 1],
  ['multi_win', 'Champion', 'Finish 1st in Multiplayer', () => counter('multiWins') >= 1],
  ['multi_win10', 'Dynasty', 'Finish 1st in Multiplayer 10 times', () => counter('multiWins') >= 10],
  ['override_1', 'Human After All', 'Answer a Human Override correctly', () => counter('overrideOk') >= 1],
  ['override_10', 'Cyborg', 'Answer 10 Human Overrides correctly', () => counter('overrideOk') >= 10],
  ['silver', 'Silver Circuit', 'Reach Silver league', () => S.player.peakLeague >= 1],
  ['gold', 'Golden Logic', 'Reach Gold league', () => S.player.peakLeague >= 2],
  ['platinum', 'Platinum Processor', 'Reach Platinum league', () => S.player.peakLeague >= 3],
  ['diamond', 'Diamond Core', 'Reach Diamond league', () => S.player.peakLeague >= 4],
  ['neural', 'Neural Ascendant', 'Reach Neural league', () => S.player.peakLeague >= 5],
  ['card_1', 'Collector', 'Get your first card', () => counter('cardGot') + counter('nftGot') >= 1],
  ['card_50', 'Hoarder', 'Get 50 cards', () => counter('cardGot') + counter('nftGot') >= 50],
  ['upgrade_1', 'Overclocker', 'Upgrade a card', () => counter('upgrades') >= 1],
  ['plus_4', 'Maxed Out', 'Own a +4 card', () => S.inv.some(c => c.plus >= 4)],
  ['evolve_1', 'Evolution', 'Evolve a card to the next rarity', () => counter('evolves') >= 1],
  ['set_1', 'Full Rig', 'Equip all 4 card types at once', () => !!activeSet()],
  ['legendary', 'Golden Ticket', 'Get a Legendary card', () => counter('legendaryGot') >= 1],
  ['unique', 'One of a Kind', 'Get a Unique card from the AI Lab', () => counter('uniqueGot') >= 1],
  ['album_col', 'Album Page', 'Complete a rarity column in the album', () => CONFIG.CARDS.rarities.some((r, i) => CONFIG.CARDS.types.every(t => S.album[t.id + ':' + i]))],
  ['ai_1', 'First Lesson', 'Teach your AI in the AI Lab', () => S.ai.rounds >= 1],
  ['ai_25', 'Mentor', 'Give your AI 25 useful answers', () => S.ai.useful >= 25],
  ['ai_200', 'Professor', 'Give your AI 200 useful answers', () => S.ai.useful >= 200],
  ['guild_join', 'Better Together', 'Join or create a guild', () => !!S.player.guildId],
  ['guild_hq', 'Headquarters', 'Your guild has an HQ', () => { const g = playerGuild(); return !!(g && g.hq >= 1); }],
  ['cosmetic', 'Fresh Paint', 'Unlock a cosmetic', () => S.player.cosmetics.owned.length > 3],
  ['market_buy', 'Shopper', 'Buy a card on the market', () => counter('cardBought') + counter('nftBought') >= 1],
  ['market_sell', 'Merchant', 'Sell a card on the market', () => counter('cardSold') + counter('nftSold') >= 1],
  ['market_stand', 'Trade Baron', 'Build a Marketplace Stand', () => !!S.market.stand],
  ['explore_10', 'Scout', 'Explore 10 land sectors', () => counter('tilesExplored') >= 10],
  ['explore_100', 'Cartographer', 'Explore 100 land sectors', () => counter('tilesExplored') >= 100],
  ['land_1000', 'Landlord', 'Own 1,000 SU of land', () => S.player.land >= 1000],
  ['expansion', 'Witness', 'See a global server expansion', () => counter('expansions') >= 1],
  ['cr_100k', 'Six Figures', 'Earn 100K CR in total', () => counter('crEarned') >= 1e5],
  ['cr_1m', 'Millionaire', 'Earn 1M CR in total', () => counter('crEarned') >= 1e6],
  ['pet_10', 'Grown Up', 'Reach Pet Level 10', () => petLevelInfo().level >= 10],
  ['rebirth', 'Neural Rebirth', 'Prestige your AI', () => S.player.rebirths >= 1],
  ['season', 'Season Veteran', 'Finish a season', () => S.season.index >= 2],
];
const ACH_REWARD_SHARDS = 10;
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (S.ach[a[0]]) continue;
    let ok = false;
    try { ok = a[3](); } catch (e) { ok = false; }
    if (ok) {
      S.ach[a[0]] = S.time;
      addShards(ACH_REWARD_SHARDS);
      log('SYSTEM', `ACHIEVEMENT UNLOCKED: ${a[1]} (+${ACH_REWARD_SHARDS} shards)`);
      if (typeof onAchievement === 'function') onAchievement(a);
    }
  }
}

// ---------- seasons ----------
function seasonEndsIn() { return S.season.start + CONFIG.SEASON.lengthMs - S.time; }
function endSeason() {
  const p = S.player, L = CONFIG.LEAGUES;
  const r = CONFIG.SEASON.rewards[p.league];
  addCR(r.cr, 'season'); addShards(r.shards);
  const title = `S${S.season.index} ${L[p.league].name}`;
  p.titles.push(title);
  const rank = leaderboard('rating').findIndex(e => e.isPlayer) + 1;
  log('SYSTEM', `SEASON ${S.season.index} ENDED. Rank #${rank}, league ${L[p.league].name}: +${fmt(r.cr)} CR, +${r.shards} shards, title "${title}".`);
  const f = CONFIG.SEASON.softReset;
  p.rating = Math.round(1000 + (p.rating - 1000) * f);
  p.league = leagueOf(p.rating);
  for (const b of S.bots) b.rating = Math.round(1000 + (b.rating - 1000) * (f + 0.3));
  S.season.index++;
  S.season.start = S.time;
}

// ---------- prestige ----------
function legacyGain() { const p = S.player; return 1 + Math.floor((p.math + p.trivia + p.speedPoints) / CONFIG.PRESTIGE.statsPerPoint); }
function whyRebirth() {
  if (S.player.league < CONFIG.PRESTIGE.league) return `Requires ${CONFIG.LEAGUES[CONFIG.PRESTIGE.league].name} league`;
  if (typeof arenaBusy === 'function' && arenaBusy()) return 'Finish your match first';
  return '';
}

// ---------- leaderboards ----------
function leaderboard(kind) {
  const p = S.player;
  const rows = [];
  if (kind === 'rating') {
    for (const b of S.bots) rows.push({ name: b.name, value: b.rating, tag: b.guildId ? guildById(b.guildId).tag : '' });
    rows.push({ name: p.name, value: p.rating, isPlayer: true, tag: playerGuild() ? playerGuild().tag : '' });
  } else if (kind === 'guild') {
    for (const g of S.guilds) rows.push({ name: g.name, value: g.vault, tag: g.tag, isPlayer: g.id === p.guildId });
  } else if (kind === 'power') {
    for (const b of S.bots) { const st = botStats(b); rows.push({ name: b.name, value: Math.round(st.math + st.trivia), tag: b.guildId ? guildById(b.guildId).tag : '' }); }
    rows.push({ name: p.name, value: Math.round(p.math + p.trivia), isPlayer: true });
  }
  rows.sort((a, b) => b.value - a.value);
  return rows;
}

function metaStep(dtMs) {
  ensureMissions();
  if (seasonEndsIn() <= 0) endSeason();
  S.metaAcc = (S.metaAcc || 0) + dtMs;
  if (S.metaAcc >= 5000) { S.metaAcc = 0; checkAchievements(); }
}
