'use strict';
/* ============================================================
   SELF-TESTS — run from the debug panel or with `node tests/run.js`
   Every test runs on a throw-away copy of the state.
   ============================================================ */

function runSelfTests(opts) {
  opts = opts || {};
  const results = [];
  const saved = S, savedArena = ARENA;
  function test(name, fn) {
    const t0 = Date.now();
    try {
      const msg = fn();
      results.push({ name, pass: true, msg: msg || '', ms: Date.now() - t0 });
    } catch (e) {
      results.push({ name, pass: false, msg: e && e.message ? e.message : String(e), ms: Date.now() - t0 });
    } finally { S = saved; ARENA = savedArena; }
  }
  function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
  function fresh(seed) { S = newState(seed); ARENA = null; return S; }
  function walkNumbers(o, path, out) {
    if (typeof o === 'number') { if (Number.isNaN(o)) out.push(path); return; }
    if (!o || typeof o !== 'object') return;
    for (const k in o) walkNumbers(o[k], path + '.' + k, out);
  }
  function invariants(tag) {
    const p = S.player;
    for (const k of ['cr', 'dt', 'shards', 'land']) {
      assert(p[k] >= 0, `${tag}: ${k} negative (${p[k]})`);
      assert(Number.isInteger(p[k]), `${tag}: ${k} not integer (${p[k]})`);
    }
    for (const g of S.guilds) assert(g.vault >= 0 && Number.isInteger(g.vault), `${tag}: guild vault invalid ${g.vault}`);
    const nan = []; walkNumbers(S, 'S', nan);
    assert(nan.length === 0, `${tag}: NaN at ${nan.slice(0, 3).join(', ')}`);
    const ids = S.inv.map(n => n.id).concat(S.market.listings.filter(l => l.card).map(l => l.card.id));
    assert(new Set(ids).size === ids.length, `${tag}: duplicate card ids`);
    assert(S.equipped.length <= CONFIG.CARDS.types.length, `${tag}: too many equipped`);
    const eqTypes = S.equipped.map(id => (S.inv.find(c => c.id === id) || {}).type);
    assert(new Set(eqTypes).size === eqTypes.length, `${tag}: two cards of the same type equipped`);
    for (const c of S.inv) {
      assert(c.plus >= 0 && c.plus <= CONFIG.CARDS.maxPlus, `${tag}: bad plus ${c.plus}`);
      assert(c.bonus.length === CONFIG.CARDS.rarities[c.rarity].bonus, `${tag}: ${cardName(c)} has ${c.bonus.length} bonus stats`);
      assert(new Set(c.bonus.map(b => b.type)).size === c.bonus.length, `${tag}: duplicate bonus stat`);
    }
    assert(S.player.recal >= 0 && Number.isInteger(S.player.recal), `${tag}: recalibrators invalid`);
    assert(S.ai.energy >= 0 && S.ai.energy <= CONFIG.AI_LAB.energyWonCap, `${tag}: AI energy ${S.ai.energy}`);
    assert(landUsed() <= p.land, `${tag}: land used ${landUsed()} > owned ${p.land}`);
    assert(petMs() >= CONFIG.PET.speedFloorMs, `${tag}: ms below floor`);
  }
  function playMatchInstant(now, useOverrides) {
    let t = now, guard = 0;
    while (arenaBusy() && guard++ < 5000) {
      t += 250;
      if (useOverrides && ARENA.phase === 'question' && chance(0.3)) {
        const r = activateOverride(ARENA, t);
        if (r.ok) humanAnswer(ARENA, pick(ARENA.q.options), t + randInt(200, 3000));
      }
      arenaUpdate(t);
    }
    assert(!arenaBusy(), 'match did not finish');
    return t;
  }

  test('10,000 random actions keep the state valid', () => {
    fresh(12345);
    S.player.cr = 5e6; S.player.dt = 50; S.player.land = 3000;
    let now = 1e6;
    const N = opts.quick ? 2000 : 10000;
    for (let i = 0; i < N; i++) {
      const r = randInt(0, 38);
      const inv = S.inv;
      const anyNft = () => inv.length ? pick(inv).id : 'none';
      switch (r) {
        case 0: actTrain(pick(['math', 'trivia', 'speed']), pick([1, 10]), bestStandId()); break;
        case 1: actBuyDT(randInt(1, 30)); break;
        case 2: actBuyLand(pick(CONFIG.LAND.plots)); break;
        case 3: actBuildStand(); break;
        case 4: if (S.stands.length) actUpgradeStand(pick(S.stands).id); break;
        case 5: if (S.stands.length && chance(0.1)) actDemolishStand(pick(S.stands).id); break;
        case 6: if (chance(0.3)) { if (actSolo(now).ok) now = playMatchInstant(now, true); } break;
        case 7: if (chance(0.3)) { if (actMulti(now).ok) now = playMatchInstant(now, true); } break;
        case 8: giveCard(mintCard({ plus: randInt(0, 2) })); break;
        case 9: actEquip(anyNft()); break;
        case 10: actUnequip(anyNft()); break;
        case 11: { const id = anyNft(); if (chance(0.6)) actUpgradeCard(id); else if (chance(0.5)) actEvolveCard(id); else actRerollCard(id); break; }
        case 12: actSalvage([anyNft()]); break;
        case 13: actForge(pick(CONFIG.CARDS.types).id); break;
        case 31: {
          if (!S.ai.consent) actAIConsent();
          if (actAIStart(null).ok) {
            while (!aiAnswer(pick(['', 'nu stiu', 'Plouă foarte tare afară acum', '8', 'albastru', 'bla bla bla bla'])).last);
            actAIFinish();
          }
          break;
        }
        case 32: if (chance(0.3)) S.player.recal += 1; addAIEnergy(1); break;
        case 33: actClaimDaily('2026-10-' + String(randInt(1, 28)).padStart(2, '0')); actRescue(); break;
        case 34: if (actStartPractice().ok) { while (!PRACTICE.done) practiceAnswer(pick(PRACTICE.qs[PRACTICE.i].options)); } break;
        case 35: {
          QUICK = null;
          if (startQuickGame(pick(['quick', 'survival']), now, '2026-10-' + String(randInt(1, 28)).padStart(2, '0')).ok) {
            let t = now, g = 0;
            while (!QUICK.done && g++ < 500) {
              if (chance(0.2)) quickAskAI(QUICK); if (chance(0.2)) quickFifty(QUICK);
              if (chance(0.05)) { finishQuick(QUICK, true); break; }
              t += randInt(500, 16000);
              if (QUICK.phase === 'question' && chance(0.8)) quickAnswer(QUICK, pick(QUICK.q.options), t);
              quickUpdate(t); quickUpdate(t + 2000); t += 2000;
            }
            if (!QUICK.done) finishQuick(QUICK, true);
            QUICK = null;
          }
          break;
        }
        case 14: actJoinGuild(pick(S.guilds).id); break;
        case 15: if (chance(0.1)) actLeaveGuild(); break;
        case 16: actDonate(randInt(1, 5000)); break;
        case 17: actUpgradeHQ(); break;
        case 18: actBuyCosmetic(pick(CONFIG.COSMETICS).id); break;
        case 19: { const l = pick(S.market.listings); if (l) actBuyListing(l.id); break; }
        case 20: actListCard(anyNft(), randInt(1, 5000), pick(['server', 'stand'])); break;
        case 21: { const l = playerListings()[0]; if (l) actCancelListing(l.id); break; }
        case 22: actBuildMarketStand(); break;
        case 23: actUpgradeMarketStand(); break;
        case 24: actClaimMission(randInt(0, 2)); break;
        case 25: if (chance(0.05)) { S.player.rating = 1750; updatePlayerLeague(); actRebirth(); } break;
        case 26: actToggleLock(anyNft()); break;
        case 27: if (chance(0.2)) actCreateGuild('Test Guild ' + randInt(1, 999)); break;
        case 29: actExplore(randInt(0, tileCount() + 2)); break;
        case 30: if (chance(0.05)) actExploreAll(20); break;
        case 28: S.player.rating = clamp(S.player.rating + randInt(-50, 80), 800, 2000); updatePlayerLeague(); break;
        default: simulate(randInt(1, 120) * 1000);
      }
      if (i % 50 === 0) invariants('action ' + i);
    }
    invariants('end');
    return `${N} actions, ${S.inv.length} cards, ${counter('upgrades')} upgrades, ${counter('evolves')} evolutions, ${S.ai.rounds} AI lessons`;
  });

  test('Cards: upgrade +0..+4, evolve, reroll, one card per type', () => {
    fresh(7);
    S.player.cr = 1e8; S.player.shards = 1e6;
    const c = giveCard(mintCard({ type: 'core', rarity: 0 }));
    assert(c.bonus.length === 1, 'Common should have 1 bonus stat');
    assert(whyEvolveCard(c.id) !== '', 'evolved below +4');
    const v0 = cardMainValue(c);
    for (let i = 0; i < 4; i++) assert(actUpgradeCard(c.id).ok, 'upgrade ' + i + ' failed');
    assert(c.plus === 4 && cardMainValue(c) > v0, 'upgrade did not raise the main stat');
    assert(!actUpgradeCard(c.id).ok, 'upgraded past +4');
    for (let r = 1; r <= CONFIG.CARDS.MAX_CRAFT_RARITY; r++) {
      assert(actEvolveCard(c.id).ok, 'evolve to ' + r + ' failed');
      assert(c.rarity === r && c.plus === 0, 'evolve result wrong');
      assert(c.bonus.length === CONFIG.CARDS.rarities[r].bonus, 'wrong bonus count after evolve: ' + c.bonus.length);
      while (c.plus < 4) assert(actUpgradeCard(c.id).ok, 'upgrade after evolve');
    }
    assert(!actEvolveCard(c.id).ok, 'Legendary evolved (into Unique?)');
    const u = giveCard(mintCard({ rarity: CONFIG.CARDS.UNIQUE }));
    assert(u.bonus.length === 5, 'Unique must have 5 bonus stats');
    while (u.plus < 4) assert(actUpgradeCard(u.id).ok, 'unique upgrade');
    assert(!actEvolveCard(u.id).ok, 'Unique evolved');
    // reroll needs a recalibrator and keeps the count of bonus stats
    S.player.recal = 0;
    assert(!actRerollCard(c.id).ok, 'reroll without recalibrator');
    S.player.recal = 1;
    assert(actRerollCard(c.id).ok && S.player.recal === 0 && c.bonus.length === 4, 'reroll failed');
    // equip: one per type
    const c2 = giveCard(mintCard({ type: 'core' }));
    assert(actEquip(c.id).ok && actEquip(c2.id).ok, 'equip failed');
    assert(S.equipped.length === 1 && S.equipped[0] === c2.id, 'two Cores equipped');
    for (const t of ['memory', 'hardware', 'cooler']) actEquip(giveCard(mintCard({ type: t, rarity: 2 })).id);
    assert(activeSet() && activeSet().rarity === Math.min(c2.rarity, 2), 'set not active / wrong rarity');
    // equipped / listed / locked cards are protected from salvage
    assert(!actSalvage([c2.id]).ok, 'salvaged an equipped card');
    actUnequip(c.id);
    c.locked = true; assert(!actSalvage([c.id]).ok, 'salvaged a locked card');
  });

  test('Heat: Core and Hardware overheat without a Cooler', () => {
    fresh(8);
    actEquip(giveCard(mintCard({ type: 'core', rarity: 4, plus: 4 })).id);
    actEquip(giveCard(mintCard({ type: 'hardware', rarity: 4, plus: 4 })).id);
    const hot = heatInfo();
    assert(hot.over && hot.mult < 1 && hot.mult >= CONFIG.CARDS.heat.minMult, 'should overheat: ' + JSON.stringify(hot));
    actEquip(giveCard(mintCard({ type: 'cooler', rarity: 4, plus: 4 })).id);
    const cool = heatInfo();
    assert(cool.mult > hot.mult, 'cooler did not help');
  });

  test('AI Lab: energy, rewards, recalibrator, Unique pity, no personal data', () => {
    fresh(9);
    assert(!actAIStart(null).ok, 'started without consent');
    actAIConsent();
    S.ai.energy = 0;
    assert(!actAIStart(null).ok, 'started without energy');
    simulate(CONFIG.AI_LAB.regenMs + 1000);
    assert(S.ai.energy === 1, 'energy did not regenerate: ' + S.ai.energy);
    assert(actAIStart(null).ok, 'start failed');
    assert(S.ai.energy === 0, 'energy not spent');
    const recal0 = S.player.recal;
    while (true) {
      const q = AILAB.qs[AILAB.i];
      const txt = q.kind === 'control' ? q.accept[0] : 'Aș spune că este o expresie veche, sună-mă la 0722 123 456 sau scrie la ion@example.com';
      if (aiAnswer(txt).last) break;
    }
    const r = actAIFinish();
    assert(r.ok && r.useful === CONFIG.AI_LAB.questions - 1, 'useful answers: ' + r.useful);
    assert(S.player.recal === recal0 + 1, 'no guaranteed recalibrator');
    const dump = JSON.stringify(S.ai.collected);
    assert(!/0722|example\.com/.test(dump), 'personal data was stored');
    // spam answers earn nothing useful and miss the attention check
    S.ai.energy = 1; actAIStart(null);
    while (!aiAnswer('bla bla bla bla').last);
    const r2 = actAIFinish();
    assert(r2.useful === 0 && !r2.controlOk && r2.cr === 0, 'spam was rewarded');
    // pity: a Unique is guaranteed after enough lessons
    S.ai.pity = CONFIG.AI_LAB.uniquePity - 1; S.ai.energy = 1;
    const u0 = counter('uniqueGot');
    actAIStart(null);
    while (true) { const q = AILAB.qs[AILAB.i]; if (aiAnswer(q.kind === 'control' ? q.accept[0] : 'Răspunsul meu complet și sincer aici').last) break; }
    actAIFinish();
    assert(counter('uniqueGot') === u0 + 1 && S.ai.pity === 0, 'pity did not give a Unique');
    assert(addAIEnergy(100) <= CONFIG.AI_LAB.energyWonCap && S.ai.energy === CONFIG.AI_LAB.energyWonCap, 'energy cap broken');
  });

  test('Income: daily streak, free practice and emergency credits', () => {
    fresh(12);
    const cr0 = S.player.cr;
    assert(actClaimDaily('2026-10-01').ok && S.player.daily.streak === 1, 'day 1');
    assert(!actClaimDaily('2026-10-01').ok, 'claimed twice the same day');
    assert(actClaimDaily('2026-10-02').ok && S.player.daily.streak === 2, 'streak did not grow');
    assert(actClaimDaily('2026-10-05').ok && S.player.daily.streak === 1, 'streak not reset after a missed day');
    assert(S.player.cr > cr0, 'no CR from daily');
    // practice: no stamina or CR needed, rewards per correct answer, cooldown
    S.player.stamina = 0; S.player.cr = 0;
    assert(actStartPractice().ok, 'practice should not need stamina or CR');
    while (!PRACTICE.done) practiceAnswer(PRACTICE.qs[PRACTICE.i].answer);
    assert(PRACTICE.correct === CONFIG.INCOME.practiceQuestions && S.player.cr === PRACTICE.cr && PRACTICE.cr > 0, 'practice rewards wrong');
    assert(!actStartPractice().ok, 'practice cooldown ignored');
    simulate(CONFIG.INCOME.practiceCooldownMs + 1000);
    assert(actStartPractice().ok, 'practice not available after cooldown');
    // rescue only when broke, then cooldown
    S.player.cr = multiFee() + 10;
    assert(!actRescue().ok, 'rescue while able to pay');
    S.player.cr = 0;
    assert(actRescue().ok && S.player.cr === rescueAmount(), 'rescue failed');
    S.player.cr = 0;
    assert(!actRescue().ok, 'rescue cooldown ignored');
    PRACTICE = null;
    invariants('income');
  });

  test('v1 NFT saves are converted to cards', () => {
    fresh(10);
    const old = JSON.parse(serialize(S));
    old.v = 1;
    delete old.album; delete old.ai; delete old.player.recal;
    old.inv = [
      { id: 'nA', dna: 123, theme: 'quantum', slot: 0, level: 3, rarity: 2, affixes: [{ type: 'cr', value: 9 }, { type: 'dt', value: 5 }, { type: 'comm', value: 3 }], q: 1.1, createdAt: 0, locked: false, listed: null, stars: 0 },
      { id: 'nB', dna: 456, theme: 'void', slot: 4, level: 1, rarity: 0, affixes: [{ type: 'speed', value: 1 }], q: 0.9, createdAt: 0, locked: true, listed: null, stars: 0 },
    ];
    old.equipped = ['nA', 'nB'];
    old.market.listings = [{ id: 'lx', nft: old.inv[0], price: 10, seller: 'b1', venue: 'server', expires: 1e9 }];
    const st = migrate(old);
    S = st;
    assert(st.inv.length === 2 && st.inv.every(c => c.type && c.bonus), 'not converted');
    assert(st.inv[0].rarity === 3 && st.inv[0].plus === 2, 'rarity/level mapping wrong');
    assert(st.inv[1].locked, 'lock lost');
    assert(st.market.listings.length === 0, 'old listings kept');
    assert(st.ai && st.album && st.player.recal === 0, 'new fields missing');
    invariants('migrated');
  });

  test('Caps and the 150 ms floor hold at extreme values', () => {
    fresh(9);
    S.player.speedPoints = 1e9;
    for (const t of CONFIG.CARDS.types) {
      const n = giveCard(mintCard({ type: t.id, rarity: CONFIG.CARDS.UNIQUE, plus: 4 }));
      n.mainRoll = 1e7; n.bonus.forEach(b => { b.roll = 1e7; });
      actEquip(n.id);
    }
    const b = bonuses();
    for (const k in CONFIG.CARDS.stats) assert(b.eff[k] <= CONFIG.CARDS.stats[k].cap + 1e-9, `${k} over cap: ${b.eff[k]}`);
    assert(petMs() === CONFIG.PET.speedFloorMs, 'ms not at floor: ' + petMs());
    assert(capValue(10, 300) < 10 && capValue(10, 300) > 9.8, 'small values should pass almost unchanged');
    assert(answerProb(1e9, 1) <= CONFIG.AI.pMax && answerProb(0, 10) >= CONFIG.AI.pMin, 'answer probability not clamped');
  });

  test('Server expansion triggers once per crossing and freezes heavy purchases', () => {
    fresh(11);
    S.player.cr = 1e8;
    const sv = S.server;
    sv.botLand = Math.floor(sv.total * 0.5) - S.player.land - S.guilds.reduce((s, g) => s + g.land, 0) - 5;
    assert(sv.state === 'NORMAL', 'should start NORMAL');
    const r = actBuyLand(10);
    assert(r.ok, 'crossing purchase should complete');
    assert(sv.state === 'CRITICAL', 'did not enter CRITICAL');
    const crit1 = counter('criticalEvents');
    checkServerCapacity(); checkServerCapacity();
    assert(counter('criticalEvents') === crit1, 'triggered twice');
    assert(whyBuyLand(500).startsWith('Infrastructură înghețată'), 'big plot not frozen');
    assert(whyBuyLand(10) === '', 'small plot should still work');
    S.player.league = 4; S.player.land = 5000;
    actBuildStand(); const s = S.stands[0]; s.tier = 1;
    assert(whyUpgradeStand(s.id).startsWith('Infrastructură înghețată'), 'x6 upgrade not frozen');
    const total = sv.total;
    simulate(CONFIG.SERVER.freezeMs + 2000);
    assert(sv.state === 'NORMAL' && sv.total === Math.floor(total * 1.5), 'no expansion after window');
    assert(sv.expansions === 1, 'expansions count ' + sv.expansions);
  });

  test('Human Override: max 2 per match, 1 per round', () => {
    fresh(13);
    let now = 1000;
    assert(actMulti(now).ok, 'match did not start');
    let used = 0, guard = 0;
    while (arenaBusy() && guard++ < 5000) {
      now += 50;
      if (ARENA.phase === 'question') {
        const a = activateOverride(ARENA, now);
        if (a.ok) {
          used++;
          assert(!activateOverride(ARENA, now).ok, 'second override in same round allowed');
          humanAnswer(ARENA, ARENA.q.answer, now + 100);
        }
      }
      arenaUpdate(now);
    }
    assert(used === CONFIG.MULTI.overrides, 'overrides used: ' + used);
    assert(!activateOverride(ARENA, now).ok, 'override after match allowed');
  });

  test('Save -> load round-trip is identical', () => {
    fresh(21);
    simulate(3600000);
    giveCard(mintCard({}));
    const a = serialize(S);
    const b = serialize(migrate(deserialize(a)));
    assert(a === b, 'state differs after round-trip');
    const c = serialize(importSave(exportSave()));
    assert(a === c, 'export/import differs');
  });

  test('Offline 8 h equals 8 h of ticks', () => {
    const hours = opts.quick ? 2 : 8;
    const s1 = fresh(33);
    for (let i = 0; i < hours * 3600; i++) step(CONFIG.TICK_MS);
    s1.realTs = s1.created = 0;
    const a = serialize(s1);
    fresh(33);
    simulate(hours * CONFIG.HOUR);
    S.realTs = S.created = 0;
    const b = serialize(S);
    assert(a === b, 'offline result differs from ticks');
    return hours + 'h simulated';
  });

  test('Card art is deterministic and unique', () => {
    fresh(44);
    const n = mintCard({});
    Art.clear();
    const s1 = Art.card(n); Art.clear();
    const s2 = Art.card(JSON.parse(JSON.stringify(n)));
    assert(s1 === s2, 'same dna gave different SVG');
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(Art.card(mintCard({})));
    assert(set.size === 1000, 'only ' + set.size + ' unique SVGs');
    for (const t of CONFIG.CARDS.types) for (let r = 0; r < CONFIG.CARDS.rarities.length; r++) assert(Art.card(mintCard({ type: t.id, rarity: r, plus: 4 })).startsWith('<svg'), 'art failed for ' + t.id + r);
  });

  test('Economy never produces negative balances when broke', () => {
    fresh(55);
    S.player.land = 2000; S.player.cr = 2e5; S.player.league = 4;
    for (let i = 0; i < 3; i++) actBuildStand();
    for (const s of S.stands) while (actUpgradeStand(s.id).ok);
    S.player.cr = 0;
    simulate(5 * CONFIG.HOUR);
    invariants('broke');
    assert(S.econ.offline, 'structures should be offline');
    addCR(1e6);
    assert(!S.econ.offline && S.econ.debt === 0, 'debt not repaid');
  });

  test('Land sectors can be explored only once', () => {
    fresh(77);
    S.player.land = 50;
    assert(tileCount() === 5, 'tile count ' + tileCount());
    assert(actExplore(0).ok, 'first explore failed');
    assert(!actExplore(0).ok, 'explored twice');
    assert(!actExplore(5).ok && !actExplore(-1).ok, 'explored outside land');
    const r = actExploreAll();
    assert(r.ok && tilesExplored() === 5, 'explore all');
    assert(!actExploreAll().ok, 'explore all repeated');
    S.player.land = 70;
    assert(tileCount() - tilesExplored() === 2, 'new land should add new sectors');
  });

  // ---------- Quiz Rapid, Supraviețuire, deblocare ----------
  // răspunde la întrebarea curentă (corect sau greșit) și trece la următoarea
  function quickStep(t, right) {
    const q = QUICK.q;
    const choice = right ? q.answer : q.options.find(o => o !== q.answer);
    assert(quickAnswer(QUICK, choice, t + 1000).ok, 'answer rejected');
    quickUpdate(t + 1000 + CONFIG.QUICK.revealBadMs + 1);
    return t + 1000 + CONFIG.QUICK.revealBadMs + 1;
  }

  test('Quiz Rapid: combo multiplier and rewards math', () => {
    fresh(101); QUICK = null;
    const Q = CONFIG.QUICK;
    assert(quickComboMult(0) === 1 && quickComboMult(Q.comboEvery) === Q.combo[1] && quickComboMult(99) === Q.combo[Q.combo.length - 1], 'combo steps wrong');
    const cr0 = S.player.cr, dt0 = S.player.dt;
    assert(startQuickGame('quick', 0, '2026-10-01').ok, 'start failed');
    assert(!startQuickGame('quick', 0, '2026-10-01').ok && !actSolo(0).ok, 'second game / solo allowed during a quiz');
    // 3 corecte, 1 greșit (resetează combo), apoi 6 corecte
    const pattern = [1, 1, 1, 0, 1, 1, 1, 1, 1, 1];
    let t = 0, streak = 0, expCR = 0, best = 0;
    for (const r of pattern) {
      if (r) { expCR += Math.round(Q.crPerCorrect * CONFIG.LEAGUES[0].reward * quickComboMult(streak)); streak++; best = Math.max(best, streak); }
      else streak = 0;
      t = quickStep(t, r);
      assert(QUICK.streak === streak, 'streak not tracked: ' + QUICK.streak + ' vs ' + streak);
    }
    assert(QUICK.done, 'quick game did not finish after 10 questions');
    const res = QUICK.result;
    assert(res.correct === 9 && res.bestStreak === best && res.bestMult === quickComboMult(best - 1), 'result counts wrong');
    assert(res.cr === expCR && S.player.cr === cr0 + expCR, `CR ${res.cr} expected ${expCR}`);
    assert(res.dt === 9 * Q.dtPerCorrect && S.player.dt === dt0 + res.dt, 'DT wrong');
    assert(!res.perfect && !res.energy, 'not a perfect game');
    assert(S.quick.played === 1 && S.quick.best === res.score && !res.record && res.firstBest, 'record not stored');
    // un joc perfect dă +1 energie (în limita plafonului) și cronometrul expirat = greșit
    S.ai.energy = 0; QUICK = null;
    startQuickGame('quick', 0, '2026-10-01');
    t = 0; for (let i = 0; i < Q.questions; i++) t = quickStep(t, true);
    assert(QUICK.result.perfect && QUICK.result.energy === Q.perfectEnergy && S.ai.energy === Q.perfectEnergy, 'perfect bonus missing');
    S.ai.energy = CONFIG.AI_LAB.energyWonCap; QUICK = null;
    startQuickGame('quick', 0, '2026-10-01');
    quickUpdate(Q.timeMs + 1);
    assert(QUICK.last && QUICK.last.timeout && !QUICK.last.right && QUICK.streak === 0, 'timeout should count as wrong');
    // ajutoare: o singură folosire, +1 cu o carte Nucleu
    assert(QUICK.phase === 'reveal', 'should be revealing');
    quickUpdate(Q.timeMs + 1 + Q.revealBadMs + 1);
    assert(quickFifty(QUICK).ok && QUICK.removed.length === 2 && !QUICK.removed.includes(QUICK.q.answer), '50/50 removed the answer');
    assert(!quickFifty(QUICK).ok, '50/50 used twice');
    assert(quickAskAI(QUICK).ok && QUICK.q.options.includes(QUICK.aiHint.option), 'ask AI failed');
    assert(QUICK.aiHint.conf === Math.round(answerProb(QUICK.q.kind === 'math' ? S.player.math : S.player.trivia, QUICK.q.diff) * 100), 'AI confidence is not answerProb');
    assert(!quickAskAI(QUICK).ok, 'ask AI used twice without a Core card');
    finishQuick(QUICK, true);
    assert(QUICK.result.abandoned && S.ai.energy <= CONFIG.AI_LAB.energyWonCap, 'abandon failed');
    const core = giveCard(mintCard({ type: 'core' })); actEquip(core.id);
    QUICK = null; startQuickGame('quick', 0, '2026-10-01');
    assert(QUICK.aiLeft === Q.aiUses + Q.coreBonusAI, 'Core card should give an extra Ask AI');
    QUICK = null;
    invariants('quick');
  });

  test('Quiz Rapid: daily full-reward limit, then 25%', () => {
    fresh(102); QUICK = null;
    const Q = CONFIG.QUICK, day = '2026-10-03';
    const play = () => { startQuickGame('quick', 0, day); let t = 0; while (!QUICK.done) t = quickStep(t, true); const r = QUICK.result; QUICK = null; return r; };
    const first = play();
    assert(first.full && quickDay(day).used === 1, 'first game should be full');
    for (let i = 1; i < Q.dailyFull; i++) assert(play().full, 'game ' + (i + 1) + ' should be full');
    assert(quickDay(day).used === Q.dailyFull && !quickDay(day).full, 'limit not reached');
    const red = play();
    assert(!red.full && red.cr < first.cr && Math.abs(red.cr - first.cr * Q.reducedMult) <= Q.questions, `reduced CR ${red.cr} vs ${first.cr}`);
    assert(red.dt === Math.floor(Q.questions * Q.dtPerCorrect * Q.reducedMult) && !red.energy && !red.card, 'reduced DT / perfect bonus wrong');
    assert(quickDay('2026-10-04').full && quickDay('2026-10-04').used === 0, 'limit did not reset the next day');
    // abandonat fără niciun răspuns: nu consumă un joc
    startQuickGame('quick', 0, '2026-10-04'); finishQuick(QUICK, true); QUICK = null;
    assert(quickDay('2026-10-04').used === 0, 'empty abandoned game consumed the daily limit');
    // Supraviețuirea se numără în aceeași limită
    startQuickGame('survival', 0, '2026-10-04');
    assert(quickDay('2026-10-04').used === 1, 'survival not counted');
    QUICK = null;
    invariants('daily');
  });

  test('Supraviețuire: 3 lives, difficulty +1 every 5 correct (max 10)', () => {
    fresh(103); QUICK = null;
    const SV = CONFIG.QUICK.survival;
    S.player.rating = 1800; updatePlayerLeague();
    assert(startQuickGame('survival', 0, '2026-10-05').ok, 'start failed');
    const lo = CONFIG.LEAGUES[S.player.league].diff[0];
    assert(QUICK.lives === SV.lives && QUICK.q.level === lo, 'start lives/difficulty wrong');
    let t = 0;
    for (let i = 0; i < 40; i++) {
      assert(QUICK.q.level === Math.min(SV.maxDiff, lo + Math.floor(QUICK.correct / SV.diffEvery)), `level ${QUICK.q.level} after ${QUICK.correct}`);
      t = quickStep(t, true);
    }
    assert(QUICK.q.level === SV.maxDiff, 'difficulty not capped at 10');
    for (let i = 0; i < SV.lives - 1; i++) { t = quickStep(t, false); assert(!QUICK.done, 'ended with lives left'); }
    assert(QUICK.lives === 1, 'lives ' + QUICK.lives);
    t = quickStep(t, false);
    assert(QUICK.done && QUICK.result.correct === 40 && S.quick.survBest === 40 && QUICK.result.firstBest, 'survival end / record wrong');
    assert(S.quick.survPlayed === 1 && QUICK.result.cr > 0 && QUICK.result.dt === 40 * SV.dtPerCorrect, 'survival rewards wrong');
    QUICK = null;
    invariants('survival');
  });

  test('Unlocks: by games played, announced once; old saves unlock all', () => {
    fresh(104); QUICK = null;
    assert(gamesPlayed() === 0 && !isUnlocked('multi') && !isUnlocked('guild') && isUnlocked('cards'), 'new player state wrong');
    assert(lockReason('market').indexOf(String(CONFIG.UNLOCK.market)) >= 0, 'lock reason should name the game count');
    const ids = Object.keys(CONFIG.UNLOCK).sort((a, b) => CONFIG.UNLOCK[a] - CONFIG.UNLOCK[b]);
    let announced = [];
    for (let g = 1; g <= Math.max(...Object.values(CONFIG.UNLOCK)); g++) {
      startQuickGame('quick', 0, '2026-10-06');
      let t = 0; while (!QUICK.done) t = quickStep(t, g % 2 === 0);
      announced = announced.concat(QUICK.result.unlocked.map(f => f.id));
      QUICK = null;
      for (const id of ids) assert(isUnlocked(id) === (g >= CONFIG.UNLOCK[id]), `${id} after ${g} games`);
    }
    assert(announced.length === ids.length && new Set(announced).size === ids.length, 'each feature should be announced exactly once: ' + announced.join(','));
    assert(checkUnlocks().length === 0, 'announced again');
    // solo și multiplayer se numără și ele
    fresh(105);
    actSolo(0); playMatchInstant(0);
    assert(gamesPlayed() === 1, 'solo not counted');
    // salvare veche cu progres -> totul deblocat; salvare veche goală -> rămâne blocată
    fresh(106);
    const old = JSON.parse(serialize(S)); delete old.unlock; delete old.quick;
    old.inv = []; old.player.rating = 1080;
    const m1 = migrate(old);
    S = m1;
    assert(m1.unlock.all && isUnlocked('guild') && checkUnlocks().length === 0, 'old save with progress should unlock all silently');
    fresh(107);
    const old2 = JSON.parse(serialize(S)); delete old2.unlock;
    S = migrate(old2);
    assert(!S.unlock.all && !isUnlocked('market'), 'old empty save should not unlock all');
    fresh(108);
    const rt = serialize(S);
    assert(serialize(migrate(deserialize(rt))) === rt, 'new save changed by migration');
    unlockAll();
    assert(FEATURES.every(f => isUnlocked(f.id)), 'unlockAll failed');
  });

  test('Next step suggestion follows the player\'s state', () => {
    fresh(109); QUICK = null;
    const day = '2026-10-07';
    assert(nextStep(day).id === 'daily', 'daily first');
    actClaimDaily(day);
    assert(nextStep(day).id === 'firstQuick', 'first quick second');
    startQuickGame('quick', 0, day); let t = 0; while (!QUICK.done) t = quickStep(t, true); QUICK = null;
    S.player.dt = 20;
    assert(nextStep(day).id === 'train', 'train with DT');
    S.player.dt = 0; S.inv = []; S.equipped = [];
    const c = giveCard(mintCard({ type: 'cooler' }));
    assert(nextStep(day).id === 'equip' && nextStep(day).args === c.id, 'equip');
    actEquip(c.id);
    assert(nextStep(day).id === 'solo', 'solo');
    count('soloPlayed');
    S.unlock.fresh = 'market';
    assert(nextStep(day).id === 'fresh', 'fresh feature');
    S.unlock.fresh = null;
    assert(nextStep(day).id === 'survival', 'fallback survival');
  });

  QUICK = null;
  return results;
}
