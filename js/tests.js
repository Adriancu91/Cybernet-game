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
    const ids = S.inv.map(n => n.id).concat(S.market.listings.filter(l => l.nft).map(l => l.nft.id));
    assert(new Set(ids).size === ids.length, `${tag}: duplicate NFT ids`);
    assert(S.equipped.length <= CONFIG.NFT.equipSlots, `${tag}: too many equipped`);
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
      const r = randInt(0, 34);
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
        case 8: giveNFT(mintNFT({ level: randInt(1, 3) })); break;
        case 9: actEquip(anyNft()); break;
        case 10: actUnequip(anyNft()); break;
        case 11: {
          const t = pick(CONFIG.NFT.themes).id, l = randInt(1, 2);
          const ids = [0, 1, 2, 3, 4].map(s => { const n = S.inv.find(x => x.theme === t && x.level === l && x.slot === s && !isEquipped(x.id) && !x.listed && !x.locked); return n ? n.id : null; });
          if (ids.every(Boolean)) actFuse(ids); else actFuse(inv.slice(0, 5).map(n => n.id));
          break;
        }
        case 12: actSalvage([anyNft()]); break;
        case 13: actShardBuy(pick(CONFIG.NFT.themes).id, randInt(0, 4)); break;
        case 14: actJoinGuild(pick(S.guilds).id); break;
        case 15: if (chance(0.1)) actLeaveGuild(); break;
        case 16: actDonate(randInt(1, 5000)); break;
        case 17: actUpgradeHQ(); break;
        case 18: actBuyCosmetic(pick(CONFIG.COSMETICS).id); break;
        case 19: { const l = pick(S.market.listings); if (l) actBuyListing(l.id); break; }
        case 20: actListNFT(anyNft(), randInt(1, 5000), pick(['server', 'stand'])); break;
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
    return `${N} actions, ${S.inv.length} NFTs, ${counter('fusions')} fusions`;
  });

  test('Fusion accepts only 5 valid items', () => {
    fresh(7);
    const mk = (slot, level, theme) => giveNFT(mintNFT({ theme: theme || 'quantum', slot, level: level || 1 }));
    const set = [0, 1, 2, 3, 4].map(s => mk(s));
    S.player.cr = 1e6;
    assert(whyFuse(set.slice(0, 4).map(n => n.id)) !== '', '4 items accepted');
    assert(whyFuse([set[0].id, set[0].id, set[1].id, set[2].id, set[3].id]) !== '', 'duplicate accepted');
    const wrongSlot = mk(0);
    assert(whyFuse([wrongSlot.id, set[0].id, set[1].id, set[2].id, set[3].id]) !== '', 'two Cores accepted');
    const other = mk(4, 1, 'void');
    assert(whyFuse([set[0].id, set[1].id, set[2].id, set[3].id, other.id]) !== '', 'mixed themes accepted');
    const l2 = mk(4, 2);
    assert(whyFuse([set[0].id, set[1].id, set[2].id, set[3].id, l2.id]) !== '', 'mixed levels accepted');
    actEquip(set[0].id);
    assert(whyFuse(set.map(n => n.id)) !== '', 'equipped item accepted');
    actUnequip(set[0].id);
    assert(actListNFT(set[1].id, 100, 'server').ok, 'list failed');
    assert(whyFuse(set.map(n => n.id)) !== '', 'listed item accepted');
    actCancelListing(playerListings()[0].id);
    const before = S.inv.length;
    const r = actFuse(set.map(n => n.id));
    assert(r.ok, 'valid fusion rejected: ' + r.msg);
    assert(r.nft.level === 2 && r.nft.theme === 'quantum', 'wrong output');
    assert(S.inv.length === before - 4, 'inventory count wrong');
    const top = [0, 1, 2, 3, 4].map(s => mk(s, CONFIG.NFT.maxLevel));
    assert(whyFuse(top.map(n => n.id)) !== '', 'fused past max level');
  });

  test('Caps and the 150 ms floor hold at extreme values', () => {
    fresh(9);
    S.player.speedPoints = 1e9;
    for (let i = 0; i < 10; i++) {
      const n = giveNFT(mintNFT({ theme: 'quantum', slot: i % 5, level: 10, rarity: 3 }));
      n.affixes = Object.keys(CONFIG.NFT.affixes).map(t => ({ type: t, value: 1e7 }));
      actEquip(n.id);
    }
    const b = bonuses();
    for (const k in CONFIG.NFT.affixes) assert(b.eff[k] <= CONFIG.NFT.affixes[k].cap + 1e-9, `${k} over cap: ${b.eff[k]}`);
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
    assert(whyBuyLand(500).startsWith('Infrastructure frozen'), 'big plot not frozen');
    assert(whyBuyLand(10) === '', 'small plot should still work');
    S.player.league = 4; S.player.land = 5000;
    actBuildStand(); const s = S.stands[0]; s.tier = 1;
    assert(whyUpgradeStand(s.id).startsWith('Infrastructure frozen'), 'x6 upgrade not frozen');
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
    giveNFT(mintNFT({}));
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

  test('NFT art is deterministic and unique', () => {
    fresh(44);
    const n = mintNFT({});
    Art.clear();
    const s1 = Art.nft(n); Art.clear();
    const s2 = Art.nft(JSON.parse(JSON.stringify(n)));
    assert(s1 === s2, 'same dna gave different SVG');
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(Art.nft(mintNFT({})));
    assert(set.size === 1000, 'only ' + set.size + ' unique SVGs');
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

  return results;
}
