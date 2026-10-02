'use strict';
/* ============================================================
   META — daily missions, achievements, seasons, prestige,
   leaderboards
   ============================================================ */

// ---------- missions ----------
// Romanian counting: "1 carte", "5 cărți", "20 de cărți" ("de" when the last two digits are 0 or >= 20)
function metaRoCount(n, one, many) {
  if (n === 1) return '1 ' + one;
  const r = n % 100;
  return n + ((r === 0 && n > 0) || r >= 20 ? ' de ' : ' ') + many;
}
const MISSION_TYPES = [
  { type: 'train',      text: n => `Antrenează-ți AI-ul de ${metaRoCount(n, 'dată', 'ori')}`, target: () => 20 },
  { type: 'solo_win',   text: n => `Câștigă ${metaRoCount(n, 'rundă', 'runde')} în Arena Solo`, target: () => 1 },
  { type: 'multi_play', text: n => `Joacă ${metaRoCount(n, 'meci', 'meciuri')} Multiplayer`, target: () => 2 },
  { type: 'multi_top3', text: n => `Termină în top 3 la Multiplayer de ${metaRoCount(n, 'dată', 'ori')}`, target: () => 1 },
  { type: 'earn',       text: n => `Câștigă ${fmt(n)} CR`, target: () => 800 * CONFIG.LEAGUES[S.player.league].reward },
  { type: 'buy_card',   text: n => `Cumpără ${metaRoCount(n, 'carte', 'cărți')} de pe Piață`, target: () => 1 },
  { type: 'override',   text: n => `Răspunde corect la ${metaRoCount(n, 'Intervenție umană', 'Intervenții umane')}`, target: () => 1 },
  { type: 'donate',     text: n => `Donează ${fmt(n)} CR breslei tale`, target: () => 200 },
  { type: 'salvage',    text: n => `Reciclează ${metaRoCount(n, 'carte', 'cărți')} în fragmente`, target: () => 2 },
  { type: 'upgrade',    text: n => `Îmbunătățește cărți de ${metaRoCount(n, 'dată', 'ori')}`, target: () => 2 },
  { type: 'ai_round',   text: n => `Învață-ți AI-ul în Laboratorul AI de ${metaRoCount(n, 'dată', 'ori')}`, target: () => 1 },
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
  if (S.time > 1000) log('SYSTEM', 'Au apărut misiuni zilnice noi.');
}
function missionProgress(type, n) {
  if (!S.missions || !S.missions.list) return;
  for (const m of S.missions.list) {
    if (m.type === type && m.progress < m.target) {
      m.progress = Math.min(m.target, m.progress + n);
      if (m.progress >= m.target) log('SYSTEM', `Misiune îndeplinită: ${m.text} - revendică-ți recompensa!`);
    }
  }
}

// ---------- achievements ----------
const ACHIEVEMENTS = [
  ['first_train', 'Salut, lume', 'Antrenează-ți AI-ul o dată', () => counter('trains') >= 1],
  ['train_100', 'Coborâre pe gradient', 'Antrenează-ți AI-ul de 100 de ori', () => counter('trains') >= 100],
  ['train_1000', 'Învățare profundă', 'Antrenează-ți AI-ul de 1.000 de ori', () => counter('trains') >= 1000],
  ['stand_1', 'Fundația', 'Construiește un Stand de antrenament', () => S.stands.length >= 1],
  ['stand_3', 'Campus', 'Deține 3 Standuri de antrenament', () => S.stands.length >= 3],
  ['stand_x6', 'Overclockat', 'Îmbunătățește un stand la x6', () => S.stands.some(s => s.tier >= 2)],
  ['stand_x10', 'Supercomputer', 'Îmbunătățește un stand la x10', () => S.stands.some(s => s.tier >= 4)],
  ['solo_1', 'Supraviețuitor solitar', 'Câștigă o rundă în Arena Solo', () => counter('soloWins') >= 1],
  ['solo_10', 'Lup singuratic', 'Câștigă 10 runde în Arena Solo', () => counter('soloWins') >= 10],
  ['solo_perfect', 'Impecabil', 'Câștigă o rundă Solo cu 10/10 răspunsuri corecte', () => counter('soloPerfect') >= 1],
  ['multi_1', 'Șobolan de lobby', 'Joacă un meci Multiplayer', () => counter('multiPlayed') >= 1],
  ['multi_win', 'Campion', 'Termină pe locul 1 la Multiplayer', () => counter('multiWins') >= 1],
  ['multi_win10', 'Dinastie', 'Termină pe locul 1 la Multiplayer de 10 ori', () => counter('multiWins') >= 10],
  ['override_1', 'Totuși uman', 'Răspunde corect la o Intervenție umană', () => counter('overrideOk') >= 1],
  ['override_10', 'Cyborg', 'Răspunde corect la 10 Intervenții umane', () => counter('overrideOk') >= 10],
  ['silver', 'Circuit de Argint', 'Ajungi în liga Argint', () => S.player.peakLeague >= 1],
  ['gold', 'Logică de Aur', 'Ajungi în liga Aur', () => S.player.peakLeague >= 2],
  ['platinum', 'Procesor de Platină', 'Ajungi în liga Platină', () => S.player.peakLeague >= 3],
  ['diamond', 'Nucleu de Diamant', 'Ajungi în liga Diamant', () => S.player.peakLeague >= 4],
  ['neural', 'Ascensiune neurală', 'Ajungi în liga Neural', () => S.player.peakLeague >= 5],
  ['card_1', 'Colecționar', 'Obține prima ta carte', () => counter('cardGot') + counter('nftGot') >= 1],
  ['card_50', 'Strângător', 'Obține 50 de cărți', () => counter('cardGot') + counter('nftGot') >= 50],
  ['upgrade_1', 'Overclocker', 'Îmbunătățește o carte', () => counter('upgrades') >= 1],
  ['plus_4', 'La maximum', 'Deține o carte +4', () => S.inv.some(c => c.plus >= 4)],
  ['evolve_1', 'Evoluție', 'Evoluează o carte la raritatea următoare', () => counter('evolves') >= 1],
  ['set_1', 'Echipament complet', 'Echipează simultan toate cele 4 tipuri de cărți', () => !!activeSet()],
  ['legendary', 'Biletul de aur', 'Obține o carte Legendară', () => counter('legendaryGot') >= 1],
  ['unique', 'Unic în felul său', 'Obține o carte Unică din Laboratorul AI', () => counter('uniqueGot') >= 1],
  ['album_col', 'Pagină de album', 'Completează o coloană de raritate în album', () => CONFIG.CARDS.rarities.some((r, i) => CONFIG.CARDS.types.every(t => S.album[t.id + ':' + i]))],
  ['ai_1', 'Prima lecție', 'Învață-ți AI-ul în Laboratorul AI', () => S.ai.rounds >= 1],
  ['ai_25', 'Mentor', 'Dă-i AI-ului tău 25 de răspunsuri utile', () => S.ai.useful >= 25],
  ['ai_200', 'Profesor', 'Dă-i AI-ului tău 200 de răspunsuri utile', () => S.ai.useful >= 200],
  ['guild_join', 'Împreună e mai bine', 'Alătură-te unei bresle sau creează una', () => !!S.player.guildId],
  ['guild_hq', 'Cartier general', 'Breasla ta are un Sediu al breslei', () => { const g = playerGuild(); return !!(g && g.hq >= 1); }],
  ['cosmetic', 'Vopsea proaspătă', 'Deblochează un element cosmetic', () => S.player.cosmetics.owned.length > 3],
  ['market_buy', 'Cumpărător', 'Cumpără o carte de pe Piață', () => counter('cardBought') + counter('nftBought') >= 1],
  ['market_sell', 'Negustor', 'Vinde o carte pe Piață', () => counter('cardSold') + counter('nftSold') >= 1],
  ['market_stand', 'Baron al comerțului', 'Construiește un Stand de piață', () => !!S.market.stand],
  ['explore_10', 'Cercetaș', 'Explorează 10 sectoare de teren', () => counter('tilesExplored') >= 10],
  ['explore_100', 'Cartograf', 'Explorează 100 de sectoare de teren', () => counter('tilesExplored') >= 100],
  ['land_1000', 'Moșier', 'Deține 1.000 SU de teren', () => S.player.land >= 1000],
  ['expansion', 'Martor', 'Asistă la o extindere globală a serverului', () => counter('expansions') >= 1],
  ['cr_100k', 'Șase cifre', 'Câștigă în total 100K CR', () => counter('crEarned') >= 1e5],
  ['cr_1m', 'Milionar', 'Câștigă în total 1M CR', () => counter('crEarned') >= 1e6],
  ['pet_10', 'Adult', 'Ajungi cu AI-ul tău la nivelul 10', () => petLevelInfo().level >= 10],
  ['rebirth', 'Renaștere neurală', 'Trece AI-ul printr-o Renaștere neurală (prestigiu)', () => S.player.rebirths >= 1],
  ['season', 'Veteran de sezon', 'Termină un sezon', () => S.season.index >= 2],
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
      log('SYSTEM', `REALIZARE DEBLOCATĂ: ${a[1]} (+${ACH_REWARD_SHARDS} fragmente)`);
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
  log('SYSTEM', `SEZONUL ${S.season.index} S-A ÎNCHEIAT. Locul #${rank}, liga ${L[p.league].name}: +${fmt(r.cr)} CR, +${r.shards} fragmente, titlul „${title}”.`);
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
  if (S.player.league < CONFIG.PRESTIGE.league) return `Necesită liga ${CONFIG.LEAGUES[CONFIG.PRESTIGE.league].name}`;
  if (typeof arenaBusy === 'function' && arenaBusy()) return 'Termină mai întâi meciul în curs';
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
