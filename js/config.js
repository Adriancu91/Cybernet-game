'use strict';
/* ============================================================
   CONFIG — every balance number of the game lives here.
   Change a value, reload the page, and the game uses it.
   ============================================================ */
const CONFIG = {
  VERSION: '2.0.0',
  SAVE_VERSION: 2,
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
    land: 100,                 // derivat din teritoriu: CONFIG.TERRITORY.baseSU + suPerSector × sectoare
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
  DEMOLISH_REFUND: 0.5,

  // ---------- land & global server ----------
  LAND: {
    basePrice: 20,             // GV per SU de teren de breaslă (preț fix; terenul jucătorului vine din Teritoriu)
  },
  // ---------- explorarea unui sector: recompensă unică la prima cucerire în Teritoriu ----------
  EXPLORE: {
    table: [
      { kind: 'dt',     weight: 40, min: 2,  max: 8 },
      { kind: 'cr',     weight: 35, min: 15, max: 90 },
      { kind: 'shards', weight: 17, min: 1,  max: 5 },
      { kind: 'card',   weight: 4 },
      { kind: 'jackpot', weight: 4, min: 200, max: 600 },
    ],
  },
  // ---------- TERITORIU: sectoare cucerite prin dueluri de quiz ----------
  TERRITORY: {
    size: 7,                   // harta = 7 × 7 = 49 de sectoare
    home: 45,                  // sectorul de start (x 3, y 6 — marginea de jos, Cartierul Neon)
    baseSU: 50,                // teren (SU) = baseSU + suPerSector × sectoare deținute
    suPerSector: 50,           //   → 1 sector = 100 SU, 49 de sectoare = 2.500 SU (ajunge pentru 3 standuri x10 + standul de piață)
    neutralShare: 0.25,        // cât din hartă e neutru la început
    questions: 7,              // întrebări într-un duel
    cooldownMs: 10 * 60000,    // după un duel pierdut, sectorul se poate ataca din nou după 10 min
    loseCRPerCorrect: 5,       // consolare la înfrângere: CR per răspuns corect x recompensa ligii
    // puterea adversarului după inelul hărții (exterior → centru)
    tiers: [
      { name: 'Ușor',  diff: [1, 3], acc: 0.55, tMin: 5000, tMax: 11000, winCR: 60,  winDT: 6,  color: '#39d98a' },
      { name: 'Mediu', diff: [3, 5], acc: 0.65, tMin: 4500, tMax: 10000, winCR: 120, winDT: 10, color: '#ffb020' },
      { name: 'Greu',  diff: [5, 7], acc: 0.75, tMin: 4000, tMax: 9000,  winCR: 250, winDT: 15, color: '#ff7a2f' },
      { name: 'Boss',  diff: [7, 9], acc: 0.85, tMin: 3500, tMax: 8000,  winCR: 600, winDT: 25, color: '#ff3b5c' },
    ],
    crPctPerSector: 1,         // +1% CR din toate jocurile pentru fiecare sector în afară de bază
    crPctCap: 30,
    accCap: 0.97,              // precizia sugestiei AI-ului nu trece de 97%
    // praguri: cumulative, se adună
    milestones: [
      { n: 3,  timeSec: 2 },
      { n: 6,  acc: 0.05 },
      { n: 10, ask: 1 },
      { n: 15, timeSec: 3 },
      { n: 20, acc: 0.05 },
      { n: 25, ask: 1 },
      { n: 32, acc: 0.05 },
      { n: 40, ask: 1 },
      { n: 49, timeSec: 5 },
    ],
    district: { fifty: 1, fiftyCap: 3, dtPct: 10 },   // fiecare cartier întreg: +1 50/50 (max +3) și +10% flux DT
    attack: {
      firstAfterMs: 2 * 3600000,   // primul atac vine la cel puțin 2 h după ce ai 3 sectoare
      minGapMs: 3 * 3600000,       // apoi la 3–6 h (timp de joc)
      maxGapMs: 6 * 3600000,
      timerMs: 12 * 3600000,       // ai 12 h să aperi sectorul
      maxActive: 2,                // niciodată mai mult de 2 atacuri deodată (și după o absență lungă)
      minSectors: 3,
      defendCR: 80,                // bonus la apărare reușită x recompensa ligii
      defendDT: 8,
    },
    botMovesPerHour: 4,        // cât de des își schimbă boții sectoarele între ei
    // ---------- clădiri de venit pasiv pe sectoarele tale ----------
    income: {
      types: [
        // levels: cost în CR al nivelului (cumulativ = suma), rate = producție pe oră la acel nivel
        { id: 'farm', name: 'Fermă de servere',       icon: '🖥️', res: 'cr',     levels: [{ cost: 1500, rate: 60 }, { cost: 2500, rate: 120 }, { cost: 6000, rate: 220 }] },
        { id: 'mine', name: 'Mină de date',           icon: '⛏️', res: 'dt',     levels: [{ cost: 1000, rate: 2 },  { cost: 3000, rate: 4 },   { cost: 8000, rate: 7 }] },
        { id: 'lab',  name: 'Laborator de fragmente', icon: '💠', res: 'shards', levels: [{ cost: 2000, rate: 1 },  { cost: 5000, rate: 2 },   { cost: 12000, rate: 4 }] },
      ],
      slotsFirstAt: 3,         // primul loc de construcție la 3 sectoare
      slotsEvery: 5,           // apoi +1 loc la fiecare 5 sectoare (8, 13, 18...)
      slotsMax: 6,
      richMult: 2,             // „💎 Sector bogat”: producție ×2
      richPerDistrict: { 0: 1, 1: 2, 2: 3, 3: 1 },   // câte sectoare bogate are un cartier, după inel (spre centru mai multe)
      dismantleRefund: 0.5,    // demontare: primești înapoi 50% din CR investiți
      moveFee: 0.2,            // mutare: 20% din CR investiți
    },
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
    { name: 'Bronz',    min: 0,    diff: [1, 3],  roundMs: 10000, reward: 1,  fee: 50,   house: 300,   color: '#cd7f32' },
    { name: 'Argint',   min: 1100, diff: [2, 4],  roundMs: 9500,  reward: 2,  fee: 100,  house: 600,   color: '#c0c8d4' },
    { name: 'Aur',      min: 1250, diff: [3, 6],  roundMs: 9000,  reward: 4,  fee: 200,  house: 1200,  color: '#f5c542' },
    { name: 'Platină',  min: 1400, diff: [4, 7],  roundMs: 8500,  reward: 8,  fee: 400,  house: 2400,  color: '#7fe3d8' },
    { name: 'Diamant',  min: 1550, diff: [6, 9],  roundMs: 8000,  reward: 15, fee: 800,  house: 4800,  color: '#6ab8ff' },
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
    cardDropPerfect: 0.08,
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
    drop: [0.35, 0.20, 0.10],  // card drop chance for place 1..3
  },

  // ---------- random arena loot ----------
  LOOT: {
    perCorrect: 0.07,          // chance of a Data Cache each time YOUR side answers correctly
    crateSolo: 0.40,           // chance of a loot crate at the end of a Solo run (win or lose)
    crateMulti: 0.50,          // chance of a loot crate at the end of a Multiplayer match
    crateWinBonus: 0.25,       // extra crate chance for a solo win / multiplayer top 3
    // crate contents: weight, and amounts (CR scales with league reward)
    table: [
      { kind: 'dt',     weight: 40, min: 5,  max: 15 },
      { kind: 'cr',     weight: 25, min: 30, max: 120 },
      { kind: 'shards', weight: 20, min: 5,  max: 15 },
      { kind: 'card',   weight: 12 },
      { kind: 'stamina', weight: 3 },
    ],
    cache: [
      { kind: 'dt',     weight: 60, min: 1, max: 4 },
      { kind: 'cr',     weight: 30, min: 5, max: 25 },
      { kind: 'shards', weight: 10, min: 1, max: 4 },
    ],
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

  // ---------- cards (replaced NFTs in v2) ----------
  // 4 fair types, each with a fixed main stat; 5 craftable rarities + Unique (AI Lab only)
  CARDS: {
    types: [
      { id: 'core',     name: 'Nucleu',         main: 'speed', c: ['#39ff88', '#00e5ff'], heat: 3 },
      { id: 'memory',   name: 'Memorie virtuală', main: 'train', c: ['#ff4fd8', '#7b61ff'], heat: 1 },
      { id: 'hardware', name: 'Hardware',       main: 'cr',    c: ['#ffb020', '#ff7a2f'], heat: 3 },
      { id: 'cooler',   name: 'Răcitor',        main: 'dt',    c: ['#6ab8ff', '#bfefff'], cool: 5.5 },
    ],
    rarities: [
      { name: 'Comună',    color: '#8b95a5', weight: 55, bonus: 1, mult: 1.0,  shards: 1 },
      { name: 'Neobișnuită',  color: '#39d98a', weight: 27, bonus: 1, mult: 1.25, shards: 2 },
      { name: 'Rară',      color: '#3b82f6', weight: 12, bonus: 2, mult: 1.6,  shards: 4 },
      { name: 'Epică',     color: '#a855f7', weight: 5,  bonus: 3, mult: 2.1,  shards: 8 },
      { name: 'Legendară', color: '#f5b400', weight: 1,  bonus: 4, mult: 2.8,  shards: 16 },
      { name: 'Unică',     color: '#ff4fd8', weight: 0,  bonus: 5, mult: 3.6,  shards: 40 },
    ],
    UNIQUE: 5,                 // rarity index of Unique: never crafted, never evolved into, AI Lab only
    MAX_CRAFT_RARITY: 4,       // evolving stops at Legendary
    stats: {
      cr:    { name: 'CR din turnee',    unit: '%', base: 4,   cap: 300, sign: '+' },
      speed: { name: 'Timp de procesare', unit: '%', base: 1.5, cap: 40,  sign: '-' },
      train: { name: 'Câștig antrenament', unit: '%', base: 5,   cap: 300, sign: '+' },
      dt:    { name: 'Flux DT',          unit: '%', base: 5,   cap: 200, sign: '+' },
      comm:  { name: 'Comision',         unit: '%', base: 3,   cap: 100, sign: '+' },
    },
    mainFactor: 2.5,           // fixed main stat = base x mainFactor x rarity mult x (1 + plusGrowth x plus) x roll
    plusGrowth: 0.25,
    bonusPlusGrowth: 0.10,     // random bonus stats grow 10% per +
    maxPlus: 4,
    rollMin: 0.7,
    rollMax: 1.3,
    upgrade: { cr: 150, crGrowth: 1.8, shards: 6, shardGrowth: 1.55 },     // cost of +p -> +p+1 = base x growth^rarity x (p+1)
    evolve: [                  // cost to evolve a +4 card to the next rarity
      { cr: 1500,   shards: 40 },
      { cr: 6000,   shards: 100 },
      { cr: 25000,  shards: 250 },
      { cr: 100000, shards: 600 },
    ],
    heat: { rarityGrowth: 0.5, plusGrowth: 0.15, baseCooling: 3, coolRarityGrowth: 0.6, coolPlusGrowth: 0.2, minMult: 0.5 },
    setBonus: [5, 8, 12, 18, 25, 35],   // % boost to all card stats with all 4 types equipped, by the lowest equipped rarity
    inventoryMax: 200,
    shardBase: 5,
    forgeCost: 60,             // shards for a Common card of the type you choose
    album: { entryShards: 5, columnShards: [20, 40, 80, 160, 320, 640], columnRecal: 1 },
  },

  // ---------- always-available income (nobody gets stuck without CR) ----------
  INCOME: {
    daily: [100, 150, 200, 250, 300, 400, 600],     // CR x league reward, by streak day 1..7 (then repeats)
    dailyShards: [0, 0, 5, 0, 10, 0, 25],
    dailyDT: [5, 5, 10, 10, 15, 15, 25],
    practiceQuestions: 5,
    practiceCRPerCorrect: 15,                        // x league reward; you answer yourself, no stamina, no fee
    practiceCooldownMs: 10 * 60000,
    rescueMult: 2,                                   // emergency credits = 2 x Multiplayer entry fee
    rescueCooldownMs: 4 * 3600000,
  },

  // ---------- Quiz Rapid & Supraviețuire (JUCĂTORUL răspunde) ----------
  QUICK: {
    questions: 10,             // întrebări într-un Quiz Rapid
    timeMs: 15000,             // timp per întrebare; expirat = greșit
    revealOkMs: 900,           // cât stă afișat feedbackul după un răspuns corect
    revealBadMs: 1700,         // ... și după unul greșit (să vezi răspunsul corect)
    crPerCorrect: 10,          // CR per răspuns corect = bază x recompensa ligii x combo (x bonusul cărților)
    dtPerCorrect: 1,
    combo: [1, 1.5, 2, 3],     // multiplicator combo; crește la fiecare `comboEvery` răspunsuri corecte la rând
    comboEvery: 2,
    pointsBase: 100,           // scor per răspuns corect (x combo), plus bonus de viteză
    pointsSpeed: 50,
    aiUses: 1,                 // „Întreabă AI-ul” pe joc
    coreBonusAI: 1,            // +1 folosire dacă ai o carte Nucleu echipată
    fiftyUses: 1,              // „50/50” pe joc
    perfectCard: 0.08,         // 10/10: șansă de carte
    perfectEnergy: 1,          // 10/10: +1 energie Laborator AI (respectă plafonul)
    dailyFull: 10,             // primele 10 jocuri pe zi dau recompense întregi
    reducedMult: 0.25,         // după aceea: 25%
    survival: { lives: 3, crPerCorrect: 8, dtPerCorrect: 1, diffEvery: 5, maxDiff: 10 },
  },

  // ---------- Adevărat sau Fals (sprint de 60 s, JUCĂTORUL răspunde) — js/tf.js ----------
  TF: {
    durationMs: 60000,         // durata sprintului
    penaltyMs: 3000,           // răspuns greșit = −3 secunde
    explainMs: 1100,           // explicația după un răspuns greșit (ceasul stă pe loc)
    pointsBase: 100,           // scor per răspuns corect x combo
    combo: [1, 1.5, 2, 3],     // multiplicator; crește la fiecare `comboEvery` corecte la rând
    comboEvery: 3,
    crPerCorrect: 3,           // CR per corect = bază x recompensa ligii x combo (x bonusul cărților); limita zilnică e cea de la QUICK
    dtPerCorrect: 0.35,        // DT = corecte x 0,35 (rotunjit în jos)
    diffEvery: 6,              // dificultatea maximă a afirmațiilor crește la fiecare 6 răspunsuri
    bankShare: 0.25,           // cât din afirmații vin din banca de întrebări („«întrebare» — răspuns”)
    recentMemory: 200,         // câte afirmații văzute recent sunt evitate (se păstrează în salvare)
    petHint: { minStat: 400, fullStat: 4000, maxChance: 0.35 }, // indiciul „🤖 AI-ul crede…”
  },

  // ---------- Top realizări umane — js/top.js ----------
  TOP: {
    show: 20,                  // câte rânduri se afișează
    cloudLimit: 50,            // câți jucători reali se cer de la server
    cloudCacheMs: 60000,       // topul global se reîmprospătează cel mult o dată pe minut
  },

  // ---------- deblocare progresivă: câte jocuri (Quiz Rapid + Supraviețuire + Solo + Multiplayer) ----------
  UNLOCK: {
    multi: 2,                  // Arena Multiplayer
    market: 3,                 // Piața
    ai: 4,                     // Laboratorul AI
    album: 5,                  // Albumul de cărți
    stands: 6,                 // Standuri de antrenament (și economia lor)
    land: 1,                   // Teritoriul (dueluri pentru sectoare) — bucla principală, deschis devreme
    season: 9,                 // Sezon, misiuni, clasamente, realizări
    guild: 12,                 // Breasla
  },

  // ---------- AI Lab (training rounds with the real AI) ----------
  AI_LAB: {
    energyMax: 3,
    regenMs: 3600000,          // +1 energy per hour (stacks to 3)
    energyWonCap: 6,           // energy won in quiz matches can stack higher
    questions: 5,
    winEnergySolo: 1,          // energy won from a Solo win
    winEnergyMulti: 1,         // energy won from a Multiplayer top-3
    crPerUseful: 40,           // x league reward
    shardsPerUseful: 3,
    cardChance: 0.35,
    uniqueChance: 0.005,
    uniquePity: 100,           // guaranteed Unique after this many rounds without one
    minWords: 2,
    collectedMax: 2000,
    milestoneEvery: 25,        // every 25 useful answers -> milestone reward
    milestoneShards: 50,
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
    { id: 'theme_classic', type: 'theme', name: 'Cyber Clasic',    cost: 0,     hq: 0 },
    { id: 'theme_matrix',  type: 'theme', name: 'Verde Matrix',    cost: 2000,  hq: 1 },
    { id: 'theme_blue',    type: 'theme', name: 'Albastru neon',   cost: 2000,  hq: 1 },
    { id: 'theme_amber',   type: 'theme', name: 'Terminal chihlimbar', cost: 6000,  hq: 2 },
    { id: 'theme_pink',    type: 'theme', name: 'Roz Synthwave',   cost: 6000,  hq: 2 },
    { id: 'theme_ice',     type: 'theme', name: 'Crom de gheață',  cost: 20000, hq: 3 },
    { id: 'theme_blood',   type: 'theme', name: 'Protocol Sânge',  cost: 60000, hq: 4 },
    { id: 'font_default',  type: 'font',  name: 'Mono de sistem',  cost: 0,     hq: 0 },
    { id: 'font_share',    type: 'font',  name: 'Share Tech Mono', cost: 3000,  hq: 1 },
    { id: 'font_vt',       type: 'font',  name: 'VT323 Retro',     cost: 8000,  hq: 2 },
    { id: 'font_orbit',    type: 'font',  name: 'Orbitron',        cost: 25000, hq: 3 },
    { id: 'badge_none',    type: 'badge', name: 'Fără insignă',    cost: 0,     hq: 0 },
    { id: 'badge_chip',    type: 'badge', name: 'Cip de siliciu',  cost: 1500,  hq: 1 },
    { id: 'badge_bolt',    type: 'badge', name: 'Fulger Overclock', cost: 4000,  hq: 2 },
    { id: 'badge_eye',     type: 'badge', name: 'Ochiul Veghetor', cost: 12000, hq: 3 },
    { id: 'badge_crown',   type: 'badge', name: 'Coroana neurală', cost: 40000, hq: 4 },
    { id: 'badge_star',    type: 'badge', name: 'Singularitate',   cost: 120000, hq: 5 },
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
