'use strict';
/* ============================================================
   CORE — seeded RNG, helpers, state, currencies, log, save/load
   ============================================================ */

let S = null; // the whole game state (serializable)

// ---------- seeded RNG (mulberry32, state kept in S.rng) ----------
function rngNext(seedObj) {
  let a = (seedObj.rng = (seedObj.rng + 0x6d2b79f5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rand() { return rngNext(S); }
function randInt(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
function randRange(a, b) { return a + rand() * (b - a); }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function chance(p) { return rand() < p; }
function weightedIndex(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
// independent deterministic RNG from a number (for art)
function seededRng(seed) { const o = { rng: seed | 0 }; return () => rngNext(o); }

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sigmoid = x => 1 / (1 + Math.exp(-x));
function fmt(n) {
  if (n === null || n === undefined || !isFinite(n)) return '0';
  const neg = n < 0; n = Math.abs(n);
  let s;
  // Romanian style: decimal comma, dot as thousands separator
  const short = (v, suf) => v.toFixed(1).replace(/\.0$/, '').replace('.', ',') + suf;
  if (n >= 1e12) s = short(n / 1e12, 'T');
  else if (n >= 1e9) s = short(n / 1e9, 'Mld');
  else if (n >= 1e6) s = short(n / 1e6, 'M');
  else if (n >= 1e4) s = short(n / 1e3, 'K');
  else s = String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + s;
}
function fmtPct(n, d = 1) { return String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).replace('.', ',') + '%'; }
function fmtTime(ms) {
  ms = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(ms / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60;
  if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
  if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
  return s + 's';
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function newId(prefix) { return prefix + (S.nextId++).toString(36); }
function gameDay() { return Math.floor(S.time / CONFIG.DAY); }

// ---------- new game ----------
function newState(seed) {
  if (seed === undefined) seed = (Date.now() ^ (Math.random() * 1e9)) | 0;
  const st = CONFIG.START;
  const s = {
    v: CONFIG.SAVE_VERSION,
    seed: seed, rng: seed,
    time: 0, realTs: Date.now(), created: Date.now(),
    nextId: 1,
    player: {
      name: 'Tu', cr: st.cr, dt: st.dt, land: st.land, shards: st.shards,
      math: st.math, trivia: st.trivia, speedPoints: st.speedPoints,
      rating: st.rating, league: 0, peakLeague: 0,
      stamina: CONFIG.SOLO.staminaMax, staminaAcc: 0, dtAcc: 0,
      dtBuys: [], trainCdUntil: 0, tiles: {}, guildId: null, guildLeftAt: -Infinity,
      legacy: 0, rebirths: 0, ascensions: 0,
      cosmetics: { owned: ['theme_classic', 'font_default', 'badge_none'], theme: 'theme_classic', font: 'font_default', badge: 'badge_none' },
      titles: [], title: '',
      recal: 0,                // Neural Recalibrators: reroll a card's bonus stats
      daily: { last: '', streak: 0 },
      practiceUntil: 0, rescueUntil: -Infinity,
    },
    album: {},                 // 'type:rarity' -> first time obtained
    ai: { energy: 1, acc: 0, pity: 0, rounds: 0, useful: 0, milestone: 0, consent: false, collected: [] },
    stands: [],
    econ: { upkeepAcc: 0, debt: 0, offline: false, minted: 0, burned: 0, hour: { start: 0, minted: 0, burned: 0 }, lastHour: { minted: 0, burned: 0 } },
    server: { total: CONFIG.SERVER.startTotal, botLand: 0, state: 'NORMAL', freezeUntil: 0, expansions: 0, history: [], botBuyAcc: 0, alarmSeen: true },
    bots: [], guilds: [],
    inv: [], equipped: [], fusionPity: {},
    market: { listings: [], history: [], stand: null, botTradeAcc: 0, standEarned: 0 },
    season: { index: 1, start: 0 },
    missions: { day: -1, list: [] },
    ach: {},
    counters: {},
    log: [],
    recentTrivia: [],
    tutorialStep: 0,
  };
  const prev = S; S = s;
  s.server.botLand = Math.floor(s.server.total * CONFIG.SERVER.startUsedRatio);
  if (typeof initWorld === 'function') initWorld();
  S = prev;
  return s;
}

// ---------- counters ----------
function count(key, n = 1) { S.counters[key] = (S.counters[key] || 0) + n; }
function counter(key) { return S.counters[key] || 0; }

// ---------- currencies (the only place balances change) ----------
function addCR(n, source) {
  n = Math.floor(n);
  if (!(n > 0)) return 0;
  S.player.cr += n;
  S.econ.minted += n; S.econ.hour.minted += n;
  count('crEarned', n);
  if (source) count('cr_' + source, n);
  // pay upkeep debt first
  if (S.econ.debt > 0) {
    const pay = Math.min(S.econ.debt, S.player.cr);
    S.player.cr -= pay; S.econ.debt -= pay;
    if (S.econ.debt === 0 && S.econ.offline) { S.econ.offline = false; log('SYSTEM', 'Datoria de întreținere a fost achitată - structurile sunt din nou ONLINE.'); }
  }
  if (typeof missionProgress === 'function') missionProgress('earn', n);
  return n;
}
function canPayCR(n) { return S.player.cr >= Math.ceil(n); }
function spendCR(n, sink) {
  n = Math.ceil(n);
  if (n < 0 || S.player.cr < n) return false;
  S.player.cr -= n;
  S.econ.burned += n; S.econ.hour.burned += n;
  if (sink) count('spent_' + sink, n);
  return true;
}
function addDT(n) { n = Math.floor(n); if (n > 0) S.player.dt += n; return n; }
function spendDT(n) { if (S.player.dt < n) return false; S.player.dt -= n; return true; }
function addShards(n) { n = Math.floor(n); if (n > 0) { S.player.shards += n; count('shardsEarned', n); } return n; }

// ---------- log ----------
let onLog = null;
function log(tag, msg) {
  const e = { t: S.time, tag: tag, msg: msg };
  S.log.push(e);
  if (S.log.length > CONFIG.LOG_MAX) S.log.splice(0, S.log.length - CONFIG.LOG_MAX);
  if (onLog) onLog(e);
}

// ---------- save / load ----------
function storageOk() {
  try { const k = '__cn_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
}
function serialize(st) { return JSON.stringify(st, (k, v) => (v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v)); }
function deserialize(txt) { return JSON.parse(txt, (k, v) => (v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v)); }

function saveGame() {
  if (!S) return false;
  S.realTs = Date.now();
  try { localStorage.setItem(CONFIG.SAVE_KEY, serialize(S)); return true; } catch (e) { return false; }
}
function loadGame() {
  try {
    const txt = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!txt) return null;
    return migrate(deserialize(txt));
  } catch (e) { console.warn('Load failed', e); return null; }
}
function migrate(data) {
  if (!data || typeof data !== 'object' || !data.player) throw new Error('Fișier de salvare invalid');
  // fill any fields missing from older saves with defaults
  const fresh = newState(data.seed || 1);
  function fill(target, def) {
    for (const k in def) {
      if (!(k in target)) target[k] = def[k];
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && target[k] && typeof target[k] === 'object') fill(target[k], def[k]);
    }
  }
  const oldV = data.v || 1;
  fill(data, fresh);
  if (oldV < 2 && typeof migrateNftSave === 'function') migrateNftSave(data);
  if (data.bots.length === 0) data.bots = fresh.bots;
  if (data.guilds.length === 0) data.guilds = fresh.guilds;
  data.v = CONFIG.SAVE_VERSION;
  return data;
}
function exportSave() { return btoa(unescape(encodeURIComponent(serialize(S)))); }
function importSave(text) {
  text = String(text).trim();
  let json = text;
  if (!text.startsWith('{')) json = decodeURIComponent(escape(atob(text)));
  return migrate(deserialize(json));
}
function wipeSave() { try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) { } }
