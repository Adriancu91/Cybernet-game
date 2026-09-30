'use strict';
/* ============================================================
   ARENA — Solo & Multiplayer matches, AI answer model,
   Human Override, rewards, rating
   Matches run on real time (independent from the sim step).
   ============================================================ */

let ARENA = null; // current match (not saved)

function statForRating(r) {
  const c = CONFIG.BOTS.statCurve;
  if (r <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (r <= c[i][0]) { const [x0, y0] = c[i - 1], [x1, y1] = c[i]; return y0 + (y1 - y0) * (r - x0) / (x1 - x0); }
  }
  const last = c[c.length - 1];
  return last[1] + (r - last[0]) * CONFIG.BOTS.statPerRatingAfter;
}
function botStats(b) {
  const B = CONFIG.BOTS;
  const base = Math.max(100, statForRating(b.rating) * b.noise);
  return {
    math: base * b.bias,
    trivia: base * (2 - b.bias),
    ms: Math.max(CONFIG.PET.speedFloorMs, (B.msStart - (b.rating - 900) * B.msPerRating) * b.noiseMs),
  };
}
function answerProb(stat, diff) {
  const A = CONFIG.AI;
  const req = A.reqBase * Math.pow(diff, A.reqExp);
  const scale = A.scaleFrac * req + A.scaleAdd;
  return clamp(sigmoid((stat - req) / scale), A.pMin, A.pMax);
}
function arenaBusy() { return !!(ARENA && ARENA.phase !== 'done'); }

// ---------- reasons ----------
function whySolo() {
  if (arenaBusy()) return 'A match is already running';
  if (S.player.stamina < 1) return 'No stamina - next in ' + fmtTime(CONFIG.SOLO.staminaRegenMs - S.player.staminaAcc);
  return '';
}
function multiFee() { return CONFIG.LEAGUES[S.player.league].fee; }
function whyMulti() {
  if (arenaBusy()) return 'A match is already running';
  if (!canPayCR(multiFee())) return `Entry fee ${fmt(multiFee())} CR - need ${fmt(multiFee() - S.player.cr)} more`;
  return '';
}

// ---------- match creation ----------
function playerParticipant() {
  const p = S.player, g = playerGuild();
  return { id: 'player', name: p.name, tag: g ? g.tag : '', isPlayer: true, rating: p.rating, math: p.math, trivia: p.trivia, ms: petMs(), seed: 7, score: 0, correct: 0 };
}
function pickLobby(n) {
  const pr = S.player.rating, W = CONFIG.MULTI.ratingWindow;
  let pool = shuffle(S.bots.filter(b => Math.abs(b.rating - pr) <= W));
  const chosen = pool.slice(0, n);
  const used = new Set(S.bots.map(b => b.name));
  while (chosen.length < n) {
    const g = chance(0.6) ? pick(S.guilds) : null;
    const tmp = makeBot(pr + randInt(-W, W), used);
    tmp.guest = true; tmp.guildId = g ? g.id : null;
    chosen.push(tmp);
  }
  return chosen.map(b => {
    const st = botStats(b);
    const g = b.guildId ? guildById(b.guildId) : null;
    return { id: b.id, bot: b.guest ? null : b.id, name: b.name, tag: g ? g.tag : '', isPlayer: false, rating: b.rating, math: st.math, trivia: st.trivia, ms: st.ms, seed: b.seed, score: 0, correct: 0 };
  });
}
function createMatch(type, now) {
  const L = CONFIG.LEAGUES[S.player.league];
  const m = {
    type, league: S.player.league, rounds: type === 'solo' ? CONFIG.SOLO.rounds : CONFIG.MULTI.rounds,
    round: 0, roundMs: L.roundMs, lives: CONFIG.SOLO.lives, used: new Set(),
    overridesLeft: CONFIG.MULTI.overrides, override: false, overrideRound: -1, overridesUsed: 0,
    phase: 'intro', phaseUntil: now + 1500, parts: [playerParticipant()], q: null, fee: 0, pool: 0, result: null, mode: questionMode(),
  };
  if (type === 'multi') {
    const n = randInt(CONFIG.MULTI.minBots, CONFIG.MULTI.maxBots);
    m.parts = m.parts.concat(pickLobby(n));
    m.fee = multiFee();
    m.pool = m.fee * m.parts.length + L.house;
  }
  return m;
}
function startSolo(now) {
  const r = whySolo(); if (r) return { ok: false, msg: r };
  S.player.stamina--;
  if (S.player.stamina === CONFIG.SOLO.staminaMax - 1) S.player.staminaAcc = 0;
  ARENA = createMatch('solo', now);
  log('ARENA', `Solo Arena started (${CONFIG.LEAGUES[ARENA.league].name}). ${CONFIG.SOLO.lives} lives, ${ARENA.rounds} rounds.`);
  return { ok: true };
}
function startMulti(now) {
  const r = whyMulti(); if (r) return { ok: false, msg: r };
  spendCR(multiFee(), 'entryFee');
  ARENA = createMatch('multi', now);
  count('multiPlayed');
  missionProgress('multi_play', 1);
  log('ARENA', `Multiplayer lobby: ${ARENA.parts.length} players, prize pool ${fmt(ARENA.pool)} CR (entry ${fmt(ARENA.fee)} CR).`);
  return { ok: true };
}

// ---------- rounds ----------
function startRound(m, now) {
  m.round++;
  m.q = genQuestion(m.league, m.used, m.mode);
  m.roundStart = now;
  m.override = false;
  m.phase = 'question';
  const A = CONFIG.AI;
  for (const p of m.parts) {
    const stat = m.q.kind === 'math' ? p.math : p.trivia;
    const prob = answerProb(stat, m.q.diff);
    const correct = rand() < prob;
    let t = p.ms * randRange(A.jitterMin, A.jitterMax) + A.thinkPerDiffMs * m.q.diff;
    const timeout = t >= m.roundMs;
    const wrongs = m.q.options.filter(o => o !== m.q.answer);
    p.plan = { correct: correct && !timeout, t: Math.min(t, m.roundMs), timeout, pickWrong: pick(wrongs), prob };
    p.answered = false; p.last = null;
  }
}
function scoreFor(correct, t, roundMs) { return correct ? Math.round(1000 * (1 - 0.5 * clamp(t / roundMs, 0, 1))) : 0; }
function applyAnswer(m, p, correct, t, timeout, choice, human) {
  p.answered = true;
  const pts = m.type === 'multi' ? scoreFor(correct, t, m.roundMs) : (correct ? 100 : 0);
  p.last = { correct, t, timeout, choice, pts, human: !!human };
  p.score += pts;
  if (correct) p.correct++;
}
function canOverride(m, now) {
  if (!m || m.phase !== 'question') return 'No active question';
  if (m.overridesLeft <= 0) return 'No overrides left';
  if (m.override) return 'Override already active';
  if (m.overrideRound === m.round) return 'Max 1 override per round';
  const me = m.parts[0];
  if (me.answered) return 'Your AI already answered this round';
  return '';
}
function activateOverride(m, now) {
  const r = canOverride(m, now);
  if (r) return { ok: false, msg: r };
  m.override = true; m.overridesLeft--; m.overridesUsed++; m.overrideRound = m.round;
  return { ok: true };
}
function humanAnswer(m, choice, now) {
  if (!m || m.phase !== 'question' || !m.override) return { ok: false };
  const me = m.parts[0];
  if (me.answered) return { ok: false };
  const t = now - m.roundStart;
  const timeout = t >= m.roundMs;
  const correct = !timeout && checkAnswer(m.q, choice);
  applyAnswer(m, me, correct, Math.min(t, m.roundMs), timeout, choice, true);
  if (correct) { count('overrideOk'); missionProgress('override', 1); }
  return { ok: true, correct };
}
function endRound(m, now) {
  m.phase = 'reveal';
  m.phaseUntil = now + CONFIG.MULTI.revealMs;
  if (m.type === 'solo') {
    const me = m.parts[0];
    if (!me.last.correct) m.lives--;
  }
}
// advance the match to "now"; returns list of events for the UI
function arenaUpdate(now) {
  const m = ARENA;
  if (!m || m.phase === 'done') return;
  if (m.phase === 'intro') { if (now >= m.phaseUntil) startRound(m, now); return; }
  if (m.phase === 'question') {
    const el = now - m.roundStart;
    for (const p of m.parts) {
      if (p.answered) continue;
      if (p.isPlayer && m.override) {
        if (el >= m.roundMs) applyAnswer(m, p, false, m.roundMs, true, null, true);
        continue;
      }
      if (el >= p.plan.t) applyAnswer(m, p, p.plan.correct, p.plan.t, p.plan.timeout, p.plan.correct ? m.q.answer : p.plan.pickWrong);
    }
    if (m.parts.every(p => p.answered)) endRound(m, now);
    return;
  }
  if (m.phase === 'reveal' && now >= m.phaseUntil) {
    const soloDead = m.type === 'solo' && m.lives <= 0;
    if (m.round >= m.rounds || soloDead) finishMatch(m);
    else startRound(m, now);
  }
}

// ---------- results ----------
function finishMatch(m) {
  m.phase = 'done';
  const me = m.parts[0], L = CONFIG.LEAGUES[m.league];
  const res = { type: m.type, correct: me.correct, rounds: m.round, cr: 0, dt: 0, nft: null, bonus: 0, tax: 0 };
  if (m.type === 'solo') {
    const win = m.lives > 0 && m.round >= m.rounds;
    res.win = win;
    if (win) {
      const base = CONFIG.SOLO.winCR * L.reward;
      res.bonus = Math.floor(base * (crMultiplier() - 1));
      res.cr = addCR(base + res.bonus, 'solo');
      res.dt = addDT(CONFIG.SOLO.winDT);
      count('soloWins'); missionProgress('solo_win', 1);
      if (me.correct === m.rounds) { count('soloPerfect'); res.nft = rollDrop(CONFIG.SOLO.nftDropPerfect, 'perfect solo run'); }
    } else {
      res.cr = addCR(me.correct * CONFIG.SOLO.failCRPerCorrect, 'solo');
    }
    res.tax = guildTax(res.cr, 'your');
    log('ARENA', `Solo ${win ? 'WON' : 'failed'}: ${me.correct}/${m.round} correct, +${fmt(res.cr)} CR${res.dt ? ', +' + res.dt + ' DT' : ''}.`);
  } else {
    const sorted = m.parts.slice().sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const place = sorted.indexOf(me) + 1;
    res.place = place; res.of = m.parts.length;
    const sum = m.parts.reduce((s, p) => s + p.score, 0);
    if (sum === 0) {
      res.refund = addCR(m.fee, 'refund');
      log('ARENA', 'Nobody scored - entry fees refunded.');
    } else {
      const share = Math.floor(m.pool * me.score / sum);
      res.bonus = Math.floor(share * (crMultiplier() - 1));
      res.cr = addCR(share + res.bonus, 'multi');
      res.tax = guildTax(res.cr, 'your');
      // bots' guilds get their 10% too
      for (const p of m.parts) {
        if (p.isPlayer || !p.bot) continue;
        const b = botById(p.bot); const g = b && b.guildId ? guildById(b.guildId) : null;
        if (g) { const t = Math.floor(m.pool * p.score / sum * CONFIG.GUILD.taxRate); g.vault += t; g.contrib[b.id] = (g.contrib[b.id] || 0) + t; }
      }
    }
    // rating (pairwise Elo)
    const old = S.player.rating;
    const delta = eloDelta(me, m.parts);
    S.player.rating = Math.max(0, S.player.rating + delta);
    res.ratingDelta = delta;
    for (const p of m.parts) {
      if (p.isPlayer || !p.bot) continue;
      const b = botById(p.bot);
      if (b) b.rating = Math.max(0, b.rating + Math.round(eloDelta(p, m.parts) / 2));
    }
    updatePlayerLeague();
    const dts = [10, 6, 3];
    if (place <= 3) {
      res.dt = addDT(dts[place - 1]);
      missionProgress('multi_top3', 1);
      res.nft = rollDrop(CONFIG.MULTI.drop[place - 1], `Multiplayer #${place}`);
    }
    if (place === 1) count('multiWins');
    log('ARENA', `Multiplayer finished #${place}/${m.parts.length}: ${me.correct}/${m.rounds} correct, +${fmt(res.cr)} CR, rating ${old} -> ${S.player.rating} (${delta >= 0 ? '+' : ''}${delta}).`);
  }
  m.result = res;
  if (typeof saveGame === 'function' && typeof window !== 'undefined') saveGame();
  return res;
}
function eloDelta(me, parts) {
  let sum = 0, n = 0;
  for (const o of parts) {
    if (o === me) continue;
    const s = me.score > o.score ? 1 : me.score === o.score ? 0.5 : 0;
    const e = 1 / (1 + Math.pow(10, (o.rating - me.rating) / 400));
    sum += s - e; n++;
  }
  return n ? Math.round(CONFIG.MULTI.K * sum / n) : 0;
}
