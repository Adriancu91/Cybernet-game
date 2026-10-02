'use strict';
/* ============================================================
   QUICK — Quiz Rapid & Supraviețuire (JUCĂTORUL răspunde),
   deblocare progresivă a sistemelor și „Următorul pas”.
   Logica nu atinge DOM-ul; ui.js o afișează.
   ============================================================ */

let QUICK = null; // jocul curent (nu se salvează)

// ---------- ziua de joc (limita de recompense întregi) ----------
function quickDay(today) {
  today = today || todayStr();
  const q = S.quick;
  if (q.day !== today) { q.day = today; q.dayGames = 0; }
  const limit = CONFIG.QUICK.dailyFull;
  return { used: Math.min(q.dayGames, limit), limit, full: q.dayGames < limit };
}

// ---------- combo & recompense ----------
// streak = răspunsuri corecte la rând ÎNAINTE de răspunsul curent
function quickComboMult(streak) {
  const Q = CONFIG.QUICK, i = Math.min(Q.combo.length - 1, Math.floor(Math.max(0, streak) / Q.comboEvery));
  return Q.combo[i];
}
function quickCRFor(mode, streak, league, full) {
  const Q = CONFIG.QUICK;
  const base = mode === 'survival' ? Q.survival.crPerCorrect : Q.crPerCorrect;
  return Math.round(base * CONFIG.LEAGUES[league].reward * quickComboMult(streak) * crMultiplier() * (full ? 1 : Q.reducedMult));
}
function quickDTFor(mode, correct, full) {
  const Q = CONFIG.QUICK;
  const per = mode === 'survival' ? Q.survival.dtPerCorrect : Q.dtPerCorrect;
  return Math.floor(correct * per * (full ? 1 : Q.reducedMult));
}
function quickAIUses() { return CONFIG.QUICK.aiUses + (equippedOfType('core') ? CONFIG.QUICK.coreBonusAI : 0); }

// ---------- dificultate ----------
function quickDiff(m) {
  const [lo, hi] = CONFIG.LEAGUES[m.league].diff;
  if (m.mode === 'survival') return clamp(lo + Math.floor(m.correct / CONFIG.QUICK.survival.diffEvery), 1, CONFIG.QUICK.survival.maxDiff);
  return clamp(lo + Math.floor((hi - lo + 1) * m.i / m.n), lo, hi); // crește ușor pe parcursul jocului
}

// ---------- start ----------
function whyQuick() {
  if (QUICK && !QUICK.done) return 'Un joc este deja în desfășurare';
  if (typeof arenaBusy === 'function' && arenaBusy()) return 'Termină mai întâi meciul din Arenă';
  return '';
}
function startQuickGame(mode, now, today) {
  mode = mode === 'survival' ? 'survival' : 'quick';
  const r = whyQuick(); if (r) return fail(r);
  const d = quickDay(today);
  S.quick.dayGames++;
  const Q = CONFIG.QUICK;
  QUICK = {
    mode, league: S.player.league, full: d.full,
    n: mode === 'quick' ? Q.questions : Infinity,
    lives: mode === 'survival' ? Q.survival.lives : 0,
    i: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, bestMult: 1, score: 0, cr: 0,
    aiLeft: quickAIUses(), fiftyLeft: Q.fiftyUses,
    used: new Set(), q: null, qStart: now, phase: 'question', revealUntil: 0,
    removed: [], aiHint: null, last: null, done: false, result: null, day: S.quick.day, hist: [],
  };
  quickNextQuestion(QUICK, now);
  return ok(mode === 'quick' ? 'Quiz Rapid început' : 'Supraviețuire începută');
}
function quickNextQuestion(m, now) {
  const d = quickDiff(m);
  const mode = questionMode();
  const kind = mode === 'math' ? 'math' : mode === 'trivia' ? 'trivia' : (chance(0.5) ? 'math' : 'trivia');
  m.q = kind === 'math' ? genMath(d) : genTrivia(d, m.used);
  m.q.level = d;
  m.qStart = now;
  m.phase = 'question';
  m.removed = []; m.aiHint = null; m.last = null;
}

// ---------- ajutoare ----------
function quickAskAI(m) {
  if (!m || m.done || m.phase !== 'question') return fail('Nicio întrebare activă');
  if (m.aiHint) return fail('AI-ul ți-a sugerat deja un răspuns');
  if (m.aiLeft <= 0) return fail('Ai folosit deja „Întreabă AI-ul” în acest joc');
  const q = m.q, P = S.player;
  const prob = answerProb(q.kind === 'math' ? P.math : P.trivia, q.diff);
  const right = rand() < prob;
  const wrongs = q.options.filter(o => o !== q.answer && !m.removed.includes(o));
  const pickOpt = right || !wrongs.length ? q.answer : pick(wrongs);
  m.aiLeft--;
  m.aiHint = { option: pickOpt, conf: Math.round(prob * 100), right };
  count('quickAskAI');
  return ok(`AI-ul tău crede că e „${pickOpt}” (încredere ${m.aiHint.conf}%)`);
}
function quickFifty(m) {
  if (!m || m.done || m.phase !== 'question') return fail('Nicio întrebare activă');
  if (m.fiftyLeft <= 0) return fail('Ai folosit deja 50/50 în acest joc');
  if (m.removed.length) return fail('50/50 este deja folosit la această întrebare');
  const wrongs = shuffle(m.q.options.filter(o => o !== m.q.answer));
  m.removed = wrongs.slice(0, 2);
  m.fiftyLeft--;
  return ok('Două răspunsuri greșite au fost eliminate');
}

// ---------- răspuns ----------
// choice: textul opțiunii sau null (timp expirat)
function quickAnswer(m, choice, now) {
  if (!m || m.done || m.phase !== 'question') return fail('Nicio întrebare activă');
  const Q = CONFIG.QUICK;
  const t = now - m.qStart;
  const timeout = choice === null || t >= Q.timeMs;
  const right = !timeout && checkAnswer(m.q, choice);
  m.answered++; m.i++;
  m.hist.push(right);
  let pts = 0, cr = 0, mult = quickComboMult(m.streak);
  if (right) {
    const speed = 1 - clamp(t / Q.timeMs, 0, 1);
    pts = Math.round((Q.pointsBase + Q.pointsSpeed * speed) * mult);
    cr = quickCRFor(m.mode, m.streak, m.league, m.full);
    m.correct++; m.streak++; m.score += pts; m.cr += cr;
    m.bestStreak = Math.max(m.bestStreak, m.streak);
    m.bestMult = Math.max(m.bestMult, mult);
  } else {
    m.streak = 0;
    if (m.mode === 'survival') m.lives--;
  }
  const comboUp = right && quickComboMult(m.streak) > mult;
  m.last = { choice, right, timeout, answer: m.q.answer, pts, cr, mult, comboUp, aiWasRight: m.aiHint ? m.aiHint.right : null };
  m.phase = 'reveal';
  m.revealUntil = now + (right ? Q.revealOkMs : Q.revealBadMs);
  return ok(right ? 'Corect!' : timeout ? 'Timp expirat' : 'Greșit');
}
function quickOver(m) { return m.mode === 'survival' ? m.lives <= 0 : m.i >= m.n; }

// avansează jocul la „now”; întoarce true dacă s-a schimbat ceva
function quickUpdate(now) {
  const m = QUICK;
  if (!m || m.done) return false;
  if (m.phase === 'question' && now - m.qStart >= CONFIG.QUICK.timeMs) { quickAnswer(m, null, now); return true; }
  if (m.phase === 'reveal' && now >= m.revealUntil) {
    if (quickOver(m)) finishQuick(m, false);
    else quickNextQuestion(m, now);
    return true;
  }
  return false;
}

// ---------- final ----------
function finishQuick(m, abandoned) {
  if (!m || m.done) return m ? m.result : null;
  m.done = true; m.phase = 'done';
  const Q = CONFIG.QUICK, sq = S.quick;
  const res = { mode: m.mode, abandoned: !!abandoned, correct: m.correct, answered: m.answered, total: m.mode === 'quick' ? m.n : m.answered,
    score: m.score, bestStreak: m.bestStreak, bestMult: m.bestMult, full: m.full, cr: 0, dt: 0, card: null, energy: 0, tax: 0, record: false, perfect: false, unlocked: [] };
  if (m.answered === 0) {
    // abandonat fără niciun răspuns: nu consumă un joc din limita zilnică
    if (sq.day === m.day) sq.dayGames = Math.max(0, sq.dayGames - 1);
    m.result = res;
    return res;
  }
  res.cr = addCR(m.cr, m.mode === 'quick' ? 'quick' : 'survival');
  res.dt = addDT(quickDTFor(m.mode, m.correct, m.full));
  res.tax = guildTax(res.cr, 'your');
  count('quickCorrect', m.correct);
  missionProgress('quick_play', 1);
  if (m.mode === 'quick') {
    sq.played++;
    count('quickPlayed');
    if (!abandoned && m.correct === m.n) {
      res.perfect = true;
      count('quickPerfect');
      if (m.full) {
        res.energy = addAIEnergy(Q.perfectEnergy);
        res.card = rollDrop(Q.perfectCard, 'Quiz Rapid perfect');
      }
    }
    if (m.score > sq.best) { res.record = sq.best > 0; res.firstBest = sq.best === 0; res.prevBest = sq.best; sq.best = m.score; } // „Record nou!” doar când bați un record existent
  } else {
    sq.survPlayed++;
    count('survivalPlayed');
    if (m.correct > sq.survBest) { res.record = sq.survBest > 0; res.firstBest = sq.survBest === 0; res.prevBest = sq.survBest; sq.survBest = m.correct; }
  }
  res.unlocked = checkUnlocks();
  log('ARENA', `${m.mode === 'quick' ? 'Quiz Rapid' : 'Supraviețuire'}: ${m.correct} corecte, scor ${fmt(m.score)}, +${fmt(res.cr)} CR, +${res.dt} DT${m.full ? '' : ' (recompensă redusă)'}${res.record ? ' — RECORD NOU!' : ''}.`);
  m.result = res;
  if (typeof saveGame === 'function' && typeof window !== 'undefined') saveGame();
  return res;
}

// ============================================================
// DEBLOCARE PROGRESIVĂ
// ============================================================
const FEATURES = [
  { id: 'multi',  name: 'Arena Multiplayer', desc: 'Concurezi live cu alți jucători pentru un fond de premii și urci în ligi.', panel: 'center', tab: 'arena' },
  { id: 'market', name: 'Piața', desc: 'Cumperi și vinzi cărți cu ceilalți jucători.', panel: 'center', tab: 'market' },
  { id: 'ai',     name: 'Laboratorul AI', desc: 'AI-ul tău îți pune întrebări; primești Recalibratoare și șanse la cărți Unice.', panel: 'center', tab: 'ai' },
  { id: 'album',  name: 'Albumul de cărți', desc: 'Colecționezi toate tipurile și raritățile pentru fragmente bonus.', panel: 'right', tab: 'album' },
  { id: 'stands', name: 'Standuri de antrenament', desc: 'Construiești standuri care multiplică antrenamentul AI-ului per DT.', panel: 'left', tab: null },
  { id: 'land',   name: 'Terenul', desc: 'Cumperi teren pe serverul global și explorezi sectoare pentru recompense.', panel: 'center', tab: 'land' },
  { id: 'season', name: 'Sezonul', desc: 'Misiuni zilnice, clasamente, realizări și recompense de sezon.', panel: 'center', tab: 'season' },
  { id: 'guild',  name: 'Breasla', desc: 'Intri într-o breaslă: bonus de 10% la câștiguri, sediu și cosmetice.', panel: 'right', tab: 'guild' },
];
function featureById(id) { return FEATURES.find(f => f.id === id) || null; }
function gamesPlayed() {
  return (S.quick.played || 0) + (S.quick.survPlayed || 0) + counter('soloPlayed') + counter('multiPlayed');
}
function unlockAt(id) { const n = CONFIG.UNLOCK[id]; return n === undefined ? 0 : n; }
function isUnlocked(id) { return !!(S.unlock && S.unlock.all) || gamesPlayed() >= unlockAt(id); }
function lockReason(id) {
  if (isUnlocked(id)) return '';
  const n = unlockAt(id), left = n - gamesPlayed();
  return `Se deblochează după ${n} jocuri — mai ai ${left === 1 ? 'un joc' : left + ' jocuri'} (Quiz Rapid, Supraviețuire sau Arenă)`;
}
// marchează și întoarce funcțiile deblocate de curând (neanunțate încă)
function checkUnlocks() {
  const out = [];
  for (const f of FEATURES) {
    if (S.unlock.seen.includes(f.id) || !isUnlocked(f.id)) continue;
    S.unlock.seen.push(f.id);
    S.unlock.fresh = f.id;
    out.push(f);
    log('SYSTEM', `NOU DEBLOCAT: ${f.name} — ${f.desc}`);
  }
  return out;
}
function unlockAll(st) {
  st = st || S;
  st.unlock.all = true;
  st.unlock.seen = FEATURES.map(f => f.id);
  st.unlock.fresh = null;
}
// o salvare veche (dinainte de deblocare) cu progres real primește totul deblocat
function saveHasProgress(d) {
  const c = d.counters || {}, p = d.player || {};
  return (d.inv && d.inv.length > 0) || p.rating !== CONFIG.START.rating || (p.peakLeague || 0) > 0
    || ['multiPlayed', 'soloWins', 'soloPlayed', 'practiceRuns', 'trains', 'dailyClaims', 'cardGot', 'nftGot'].some(k => (c[k] || 0) > 0)
    || (d.stands && d.stands.length > 0) || (d.ai && d.ai.rounds > 0) || !!p.guildId || (p.rebirths || 0) > 0;
}

// ============================================================
// URMĂTORUL PAS — o singură sugestie concretă
// ============================================================
function nextStep(today) {
  const p = S.player;
  const dly = dailyInfo(today || todayStr());
  if (!dly.claimed) return { id: 'daily', text: `Revendică bonusul zilnic: +${fmt(dly.cr)} CR și +${dly.dt} DT.`, label: 'Revendică', act: 'claimDaily' };
  if (!S.quick.played) return { id: 'firstQuick', text: 'Joacă primul tău Quiz Rapid: răspunzi tu la 10 întrebări și câștigi CR și DT.', label: '▶ Joacă', act: 'startQuick' };
  if (p.dt >= 10) {
    const stat = p.math <= p.trivia ? 'math' : 'trivia';
    return { id: 'train', text: `Ai ${p.dt} DT: antrenează-ți AI-ul (${stat === 'math' ? 'IQ matematic' : 'cultură generală'}) ca să te ajute la întrebări.`, label: 'Antrenează ×10', act: 'train', args: { stat, n: 10 }, why: whyTrain(10) };
  }
  const free = S.inv.find(c => !isEquipped(c.id) && !c.listed && !equippedOfType(c.type));
  if (free) return { id: 'equip', text: `Ai o carte ${cardType(free.type).name} neechipată — echipeaz-o ca să primești bonusul ei.`, label: 'Echipează', act: 'equip', args: free.id };
  if (!counter('soloPlayed') && p.stamina > 0) return { id: 'solo', text: 'Încearcă Arena Solo: AI-ul tău răspunde singur, tu doar îl urmărești.', label: 'Pornește Solo', act: 'startSolo', why: whySolo() };
  const f = S.unlock.fresh && featureById(S.unlock.fresh);
  if (f) return { id: 'fresh', text: `Nou deblocat: ${f.name} — ${f.desc}`, label: 'Deschide', act: 'gotoFeature', args: f.id };
  return { id: 'survival', text: S.quick.survBest ? `Bate-ți recordul la Supraviețuire (record ${S.quick.survBest}).` : 'Încearcă Supraviețuirea: 3 vieți, întrebări tot mai grele.', label: '♥ Supraviețuire', act: 'startSurvival' };
}
