'use strict';
/* ============================================================
   CONFIG — every balance number of the game lives here.
   Change a value, reload the page, and the game uses it.
   ============================================================ */
const CONFIG = {
  VERSION: '1.0.0',
  SAVE_VERSION: 1,
  SAVE_KEY: 'cybernet_save_v1',

  // ---------- time ----------
  TICK_MS: 1000,              // one simulation step = 1 s of game time
  AUTOSAVE_MS: 10000,
  OFFLINE_CAP_HOURS: 8,
  HOUR: 3600000,
  DAY: 86400000,

  // ---------- start values ----------
  START: {
    cr: 1500,
    dt: 25,
    land: 20,
    shards: 0,
    math: 200,
    trivia: 200,
    speedPoints: 0,
    rating: 1000,
  },

  // ---------- data tokens ----------
  DT: {
    trickleEveryMs: 30000,     // +1 DT every 30 s
    stockCap: 50,              // trickle stops at this stockpile
    buyBasePrice: 12,          // CR per DT
    buyPriceStep: 0.01,        // +1% for every DT bought in the window
    buyWindowMs: 86400000,     // 24 h decay window
    maxBuyPerClick: 50,
  },

  // ---------- pet ----------
  PET: {
    trainBase: 5,              // stat points per DT before multipliers
    trainCooldownMs: 2000,
    softCapByLeague: [1000, 2000, 3500, 5500, 8000, 11000],
    softCapPower: 2,           // gain / (1 + (current/softCap)^power)
    speedStartMs: 2000,
    speedFloorMs: 150,
    speedK: 6000,              // ms = floor + (start-floor) * e^(-sp/k)
    speedTrainFactor: 0.5,     // speed points per stat point trained
    levelDivisor: 150,         // pet level = floor(sqrt(totalPower / divisor)) + 1
  },

  // ---------- stands ----------
  MAX_STANDS: 3,
  STAND_TIERS: [
    // mult, cost (CR to reach this tier), total land (SU), upkeep/h, league required (index)
    { mult: 2,  cost: 500,    land: 10,  upkeep: 10,   league: 0 },
    { mult: 4,  cost: 2500,   land: 30,  upkeep: 40,   league: 1 },
    { mult: 6,  cost: 10000,  land: 80,  upkeep: 150,  league: 2 },
    { mult: 8,  cost: 40000,  land: 200, upkeep: 500,  league: 3 },
    { mult: 10, cost: 150000, land: 500, upkeep: 1800, league: 4 },
  ],
  HEAVY_STAND_TIER: 2,         // tiers >= this index (x6+) freeze during server critical
  DEMOLISH_REFUND: 0.5,

  // ---------- land & global server ----------
  LAND: {
    basePrice: 20,             // CR per SU at 0% usage
    scarcityK: 3,              // price = base * (1 + k * usedRatio^2)
    plots: [10, 50, 100, 500, 1000],
    heavyPlot: 100,            // plots > this freeze during critical
  },
  SERVER: {
    startTotal: 30000,
    startUsedRatio: 0.30,
    criticalRatio: 0.5,        // free space below 50% -> critical
    freezeMs: 60000,
    expandFactor: 1.5,
    botBuyPerHour: 0.006,      // bots buy ~0.6% of total space per game hour
    historyMax: 60,
  },

  // ---------- leagues ----------
  LEAGUES: [
    { name: 'Bronze',   min: 0,    diff: [1, 3],  roundMs: 10000, reward: 1,  fee: 50,   house: 300,   color: '#cd7f32' },
    { name: 'Silver',   min: 1100, diff: [2, 4],  roundMs: 9500,  reward: 2,  fee: 100,  house: 600,   color: '#c0c8d4' },
    { name: 'Gold',     min: 1250, diff: [3, 6],  roundMs: 9000,  reward: 4,  fee: 200,  house: 1200,  color: '#f5c542' },
    { name: 'Platinum', min: 1400, diff: [4, 7],  roundMs: 8500,  reward: 8,  fee: 400,  house: 2400,  color: '#7fe3d8' },
    { name: 'Diamond',  min: 1550, diff: [6, 9],  roundMs: 8000,  reward: 15, fee: 800,  house: 4800,  color: '#6ab8ff' },
    { name: 'Neural',   min: 1700, diff: [7, 10], roundMs: 7500,  reward: 25, fee: 1500, house: 9000,  color: '#ff4fd8' },
  ],
  DEMOTION_BUFFER: 25,

  // ---------- questions / AI answer model ----------
  AI: {
    reqBase: 120,              // stat required for difficulty d = reqBase * d^reqExp
    reqExp: 1.875,
    scaleFrac: 0.25,           // sigmoid scale = scaleFrac * req + scaleAdd
    scaleAdd: 50,
    pMin: 0.05,
    pMax: 0.97,
    thinkPerDiffMs: 250,
    jitterMin: 0.8,
    jitterMax: 1.3,
  },
  RECENT_TRIVIA_MEMORY: 50,

  // ---------- solo arena ----------
  SOLO: {
    rounds: 10,
    lives: 3,
    staminaMax: 3,
    staminaRegenMs: 20 * 60000,
    winCR: 100,
    winDT: 10,
    failCRPerCorrect: 5,
    nftDropPerfect: 0.08,
  },

  // ---------- multiplayer ----------
  MULTI: {
    rounds: 10,
    minBots: 5,
    maxBots: 9,
    ratingWindow: 150,
    overrides: 2,
    revealMs: 1300,
    K: 40,
    drop: [0.35, 0.20, 0.10],  // NFT drop chance for place 1..3
  },

  // ---------- bots ----------
  BOTS: {
    count: 80,
    // bot stat by rating: bots at a league's entry rating are about as strong as the previous league's soft cap
    statCurve: [[800, 200], [900, 350], [1100, 1000], [1250, 2000], [1400, 3500], [1550, 5500], [1700, 8000], [1850, 11000], [2100, 15000]],
    statPerRatingAfter: 20,
    statNoise: 0.15,
    msStart: 2100,
    msPerRating: 2.0,
  },

  // ---------- NFTs ----------
  NFT: {
    themes: [
      { id: 'quantum', name: 'Quantum Relics', c: ['#39ff88', '#00e5ff'] },
      { id: 'synapse', name: 'Neon Synapse',   c: ['#ff4fd8', '#7b61ff'] },
      { id: 'chrome',  name: 'Chrome Circuit', c: ['#ffb020', '#00e5ff'] },
      { id: 'void',    name: 'Void Lattice',   c: ['#9b7bff', '#39ff88'] },
      { id: 'solar',   name: 'Solar Daemon',   c: ['#ff7a2f', '#ffe14d'] },
      { id: 'glitch',  name: 'Glitch Garden',  c: ['#6dff4f', '#ff4f7b'] },
    ],
    slots: ['Core', 'Lens', 'Spine', 'Crown', 'Key'],
    rarities: [
      { name: 'Common',    color: '#7b8595', weight: 60, affixes: 1, mult: 1.0, shards: 1 },
      { name: 'Rare',      color: '#3b82f6', weight: 28, affixes: 2, mult: 1.3, shards: 2 },
      { name: 'Epic',      color: '#a855f7', weight: 10, affixes: 3, mult: 1.7, shards: 4 },
      { name: 'Legendary', color: '#f5b400', weight: 2,  affixes: 3, mult: 2.3, shards: 8 },
    ],
    affixes: {
      cr:    { name: 'Tournament CR',   unit: '%', base: 4,   cap: 300, sign: '+' },
      speed: { name: 'Processing time', unit: '%', base: 1.5, cap: 40,  sign: '-' },
      train: { name: 'Training gain',   unit: '%', base: 5,   cap: 300, sign: '+' },
      dt:    { name: 'DT trickle',      unit: '%', base: 5,   cap: 200, sign: '+' },
      comm:  { name: 'Commission',      unit: '%', base: 3,   cap: 100, sign: '+' },
    },
    levelGrowth: 1.8,
    rollMin: 0.7,
    rollMax: 1.3,
    maxLevel: 10,
    equipSlots: 10,
    inventoryMax: 200,
    fusionFeeBase: 200,
    fusionFeeGrowth: 3,
    fusionMissingWeight: 3,
    fusionPity: 2,
    shardBase: 5,
    shardBuyCost: 60,
    ascensionFee: 1000000,
  },

  // ---------- guilds ----------
  GUILD: {
    taxRate: 0.10,
    createCost: 5000,
    leaveCooldownMs: 86400000,
    botGuilds: 6,
    maxMembers: 20,
    hq: [
      // guild land needed (SU), implementation fee (GV), perk DT trickle %
      { land: 200,  fee: 5000,   perk: 2 },
      { land: 400,  fee: 15000,  perk: 4 },
      { land: 800,  fee: 40000,  perk: 6 },
      { land: 1500, fee: 100000, perk: 8 },
      { land: 3000, fee: 250000, perk: 10 },
    ],
    botWinPerHour: 60,         // average CR a bot member wins per active hour (x league reward)
    recruitPerHour: 0.3,       // chance per hour a bot joins the player's guild (x HQ level +1)
  },

  COSMETICS: [
    { id: 'theme_classic', type: 'theme', name: 'Cyber Classic',   cost: 0,     hq: 0 },
    { id: 'theme_matrix',  type: 'theme', name: 'Matrix Green',    cost: 2000,  hq: 1 },
    { id: 'theme_blue',    type: 'theme', name: 'Neon Blue',       cost: 2000,  hq: 1 },
    { id: 'theme_amber',   type: 'theme', name: 'Amber Terminal',  cost: 6000,  hq: 2 },
    { id: 'theme_pink',    type: 'theme', name: 'Synthwave Pink',  cost: 6000,  hq: 2 },
    { id: 'theme_ice',     type: 'theme', name: 'Ice Chrome',      cost: 20000, hq: 3 },
    { id: 'theme_blood',   type: 'theme', name: 'Blood Protocol',  cost: 60000, hq: 4 },
    { id: 'font_default',  type: 'font',  name: 'System Mono',     cost: 0,     hq: 0 },
    { id: 'font_share',    type: 'font',  name: 'Share Tech Mono', cost: 3000,  hq: 1 },
    { id: 'font_vt',       type: 'font',  name: 'VT323 Retro',     cost: 8000,  hq: 2 },
    { id: 'font_orbit',    type: 'font',  name: 'Orbitron',        cost: 25000, hq: 3 },
    { id: 'badge_none',    type: 'badge', name: 'No badge',        cost: 0,     hq: 0 },
    { id: 'badge_chip',    type: 'badge', name: 'Silicon Chip',    cost: 1500,  hq: 1 },
    { id: 'badge_bolt',    type: 'badge', name: 'Overclock Bolt',  cost: 4000,  hq: 2 },
    { id: 'badge_eye',     type: 'badge', name: 'Watcher Eye',     cost: 12000, hq: 3 },
    { id: 'badge_crown',   type: 'badge', name: 'Neural Crown',    cost: 40000, hq: 4 },
    { id: 'badge_star',    type: 'badge', name: 'Singularity',     cost: 120000, hq: 5 },
  ],

  // ---------- marketplace ----------
  MARKET: {
    serverFee: 0.05,
    standFee: 0.02,
    listingFee: 0.01,
    maxListings: 20,
    listingTtlMs: 86400000,
    botListingsTarget: 40,
    botTradesPerHour: 150,
    fairBase: 80,
    fairGrowth: 2.6,
    botListSpread: 0.3,
    standLand: 1000,
    standCost: 250000,
    standLeague: 2,
    standLevels: [
      // traffic share of bot trades, upgrade cost CR, upkeep/h
      { share: 0.15, cost: 0,      upkeep: 400 },
      { share: 0.25, cost: 100000, upkeep: 700 },
      { share: 0.35, cost: 250000, upkeep: 1100 },
      { share: 0.45, cost: 600000, upkeep: 1700 },
      { share: 0.55, cost: 1500000, upkeep: 2600 },
    ],
    historyMax: 50,
    playerSaleChancePerHour: 1.5,  // base chance a fairly priced player listing sells per hour
  },

  // ---------- seasons, missions, prestige ----------
  SEASON: {
    lengthMs: 14 * 86400000,
    softReset: 0.5,            // new rating = 1000 + (old-1000)*0.5
    rewards: [                 // by league index: CR, shards
      { cr: 1000,   shards: 20 },
      { cr: 3000,   shards: 40 },
      { cr: 10000,  shards: 80 },
      { cr: 30000,  shards: 150 },
      { cr: 90000,  shards: 250 },
      { cr: 250000, shards: 400 },
    ],
  },
  MISSIONS_PER_DAY: 3,
  PRESTIGE: {
    league: 5,
    legacyPerPoint: 0.05,      // +5% training & CR per legacy point
    legacyCap: 0.5,            // max +50%
    statsPerPoint: 5000,
  },

  // ---------- log ----------
  LOG_MAX: 200,
};
