'use strict';
/* ============================================================
   TOP REALIZĂRI UMANE — clasamente cu ce a făcut JUCĂTORUL
   singur (nu AI-ul de companie): recorduri, răspunsuri corecte,
   dueluri câștigate, teritoriu.
   Boții primesc valori deterministe (din rating + seed) care cresc
   încet în timp; nu se salvează nimic în plus. Dacă salvarea în
   cloud e configurată, recordurile se trimit și se aduce un top
   global cu jucători reali (insigna „👤 real”).
   Logica nu atinge DOM-ul; js/tf_ui.js o afișează.
   ============================================================ */

// ---------- accesori siguri (funcționează și fără teritoriu / dueluri) ----------
function topDuelWins() { return (S && S.duel && Number(S.duel.wins)) || 0; }
function topTerritory() {
  if (typeof territoryCount === 'function') { try { return territoryCount() || 0; } catch (e) { return 0; } }
  const t = S && S.territory;
  if (typeof t === 'number') return t;
  if (t && Array.isArray(t.owner)) return t.owner.filter(o => o === 'p').length;
  return 0;
}
function topHumanCorrect() { return counter('quickCorrect') + counter('tfCorrect') + counter('overrideOk'); }
function topTFBest() { return (S && S.tf && S.tf.best) || 0; }

// ---------- categoriile ----------
// bot: valoare = base + span·k + min(growCap, zile·grow·k·activitate); k = abilitate 0..1
const TOP_CATS = [
  { id: 'surv', name: 'Supraviețuire', unit: 'corecte într-o rundă', mine: () => S.quick.survBest || 0, bot: { base: 2, span: 26, grow: 0.08, growCap: 12, pow: 1.3, cap: 60 } },
  { id: 'quick', name: 'Quiz Rapid', unit: 'puncte (record)', mine: () => S.quick.best || 0, bot: { base: 300, span: 2400, grow: 6, growCap: 650, round: 10, cap: 3150 } },
  { id: 'tf', name: 'Adevărat/Fals', unit: 'puncte (record)', mine: topTFBest, bot: { base: 500, span: 5300, grow: 18, growCap: 1800, round: 10, cap: 9000 } },
  { id: 'correct', name: 'Răspunsuri corecte', unit: 'răspunsuri date de tine', mine: topHumanCorrect, bot: { base: 0, span: 300, grow: 30, growBase: 4, growCap: Infinity } },
  { id: 'duels', name: 'Dueluri câștigate', unit: 'dueluri', mine: topDuelWins, bot: { base: 0, span: 4, grow: 0.8, growCap: Infinity } },
  { id: 'territory', name: 'Teritoriu', unit: 'sectoare', mine: topTerritory, bot: { base: 1, span: 6, grow: 0.15, growCap: 40 } },
];
function topCat(id) { return TOP_CATS.find(c => c.id === id) || TOP_CATS[0]; }

// ---------- valori deterministe pentru boți ----------
function topBotSkill(b, catId) {
  const r = seededRng((b.seed | 0) ^ (tfHashNum(catId) * 2654435761));
  const u = r(), age = r();
  const s = clamp((b.rating - 850) / 1100, 0, 1);
  return { k: clamp(0.55 * s + 0.45 * u, 0, 1), age: age * 30 };
}
function tfHashNum(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
// sectoarele reale ale boților, dacă harta teritoriului există
function topBotSectors() {
  const t = S.territory;
  if (!t || !Array.isArray(t.owner) || !t.owner.length) return null;
  const m = {};
  for (const o of t.owner) if (o && o !== 'p') m[o] = (m[o] || 0) + 1;
  return m;
}
function topBotValue(b, cat, sectors) {
  if (cat.id === 'territory' && sectors) return sectors[b.id] || 0;
  const B = cat.bot, sk = topBotSkill(b, cat.id);
  const days = S.time / CONFIG.DAY + sk.age;
  const act = b.activity || 0.6;
  const k = B.pow ? Math.pow(sk.k, B.pow) : sk.k;
  const growth = Math.min(B.growCap, days * act * ((B.growBase || 0) + B.grow * sk.k));
  let v = B.base + B.span * k + growth;
  if (B.cap) v = Math.min(B.cap, v);
  v = B.round ? Math.round(v / B.round) * B.round : Math.floor(v);
  return Math.max(0, v);
}

// ---------- clasamentul ----------
// rânduri: { name, value, isPlayer?, real?, tag? } sortate descrescător; la egalitate jucătorul e primul
function topRanking(catId) {
  const cat = topCat(catId), rows = [];
  const sectors = cat.id === 'territory' ? topBotSectors() : null;
  for (const b of S.bots) {
    const g = b.guildId && typeof guildById === 'function' ? guildById(b.guildId) : null;
    rows.push({ name: b.name, value: topBotValue(b, cat, sectors), tag: g ? g.tag : '' });
  }
  const me = typeof CLOUD !== 'undefined' && CLOUD.loggedIn && CLOUD.loggedIn() ? CLOUD.acct.user.toLowerCase() : '';
  for (const r of TOP_CLOUD.rows(cat.id)) {
    if (r.u && r.u.toLowerCase() === me) continue; // contul tău apare deja ca rândul tău
    rows.push({ name: r.u, value: r.v, real: true });
  }
  const pg = typeof playerGuild === 'function' ? playerGuild() : null;
  rows.push({ name: S.player.name, value: Math.floor(cat.mine() || 0), isPlayer: true, tag: pg ? pg.tag : '' });
  rows.sort((a, b) => b.value - a.value || (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
// primele N + rândul jucătorului (și locul lui), chiar dacă e în afara topului
function topView(catId, n) {
  n = n || CONFIG.TOP.show;
  const rows = topRanking(catId);
  const mine = rows.find(r => r.isPlayer);
  return { cat: topCat(catId), rows: rows.slice(0, n), me: mine, total: rows.length, outside: mine.rank > n };
}
function topPlayerRanks() { const o = {}; for (const c of TOP_CATS) o[c.id] = topRanking(c.id).find(r => r.isPlayer).rank; return o; }
function topRecords() {
  const o = {};
  for (const c of TOP_CATS) o[c.id] = Math.floor(c.mine() || 0);
  return o;
}

// ---------- topul global din cloud (opțional, eșuează în tăcere) ----------
const TOP_CLOUD = {
  cache: {},          // catId -> { at, rows: [{ u, v }] }
  status: 'off',      // off | loading | ok | error
  lastSent: '',
  sending: false,
  on() { return typeof CLOUD !== 'undefined' && !!CLOUD.enabled && CLOUD.enabled(); },
  rows(catId) { const c = this.cache[catId]; return c && Array.isArray(c.rows) ? c.rows : []; },
  async fetch(catId, force) {
    if (!this.on()) { this.status = 'off'; return false; }
    const c = this.cache[catId];
    if (!force && c && Date.now() - c.at < CONFIG.TOP.cloudCacheMs) return false;
    this.cache[catId] = { at: Date.now(), rows: c ? c.rows : [] };
    this.status = 'loading';
    try {
      const res = await CLOUD.rpc('cn_top', { p_kind: catId, p_limit: CONFIG.TOP.cloudLimit });
      if (!res || !res.ok || !Array.isArray(res.rows)) { this.status = 'error'; return false; }
      this.cache[catId] = { at: Date.now(), rows: res.rows.filter(r => r && typeof r.u === 'string').map(r => ({ u: r.u.slice(0, 20), v: Math.max(0, Math.floor(Number(r.v) || 0)) })) };
      this.status = 'ok';
      return true;
    } catch (e) { this.status = 'error'; return false; }
  },
  // trimite recordurile doar când s-au schimbat și ești autentificat
  async submit() {
    if (!this.on() || !CLOUD.loggedIn() || this.sending) return false;
    const rec = topRecords(), key = JSON.stringify(rec);
    if (key === this.lastSent) return false;
    this.sending = true;
    try {
      const res = await CLOUD.rpc('cn_records_submit', { p_user: CLOUD.acct.user, p_pin: CLOUD.acct.pin, p_rec: rec });
      if (res && res.ok) { this.lastSent = key; for (const k in this.cache) this.cache[k].at = 0; return true; }
      return false;
    } catch (e) { return false; } finally { this.sending = false; }
  },
};
// apelat la finalul fiecărui joc (Adevărat sau Fals; ui-ul îl cheamă și după celelalte)
function topAfterGame() { if (TOP_CLOUD.on()) TOP_CLOUD.submit(); }

// ---------- realizări ----------
if (typeof ACHIEVEMENTS !== 'undefined') {
  ACHIEVEMENTS.push(
    ['top_10', 'În elita umană', 'Intră în top 10 la o categorie din Top realizări umane', () => S.bots.length > 0 && TOP_CATS.some(c => (c.mine() || 0) > 0 && topRanking(c.id).find(r => r.isPlayer).rank <= 10)],
    ['top_1', 'Numărul unu', 'Ocupă locul 1 la o categorie din Top realizări umane', () => S.bots.length > 0 && TOP_CATS.some(c => (c.mine() || 0) > 0 && topRanking(c.id)[0].isPlayer)],
  );
}
