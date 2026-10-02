'use strict';
/* ============================================================
   TF — „Adevărat sau Fals”: sprint de 60 de secunde în care
   JUCĂTORUL decide dacă afirmațiile sunt adevărate sau false.
   Logica nu atinge DOM-ul; js/tf_ui.js o afișează.
   Folosește aceeași limită zilnică de recompense întregi ca
   Quiz Rapid (S.quick.dayGames) și contează la deblocări.
   ============================================================ */

let TFG = null; // sprintul curent (nu se salvează)

// ---------- banca de afirmații ----------
// id stabil derivat din text, ca memoria „văzute recent” să rămână valabilă între versiuni
function tfHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
// întrebări din banca de trivia care nu se potrivesc formatului „«întrebare» — răspuns”
// (negații, „care dintre acestea”, răspunsuri greșite care ar putea fi totuși adevărate, informații care se schimbă)
const TF_BANK_SKIP = /\bNU\b|dintre aceste|dintre acestea|Ce gaz absorb|cea mai mare populație|Ce animal mare din Carpați|Care este cel mai mare satelit natural/;
function tfFromBank(list) {
  const out = [];
  for (const q of list) {
    if (!q || q.kind === 'math' || TF_BANK_SKIP.test(q.text)) continue;
    const wrong = q.options.find(o => o !== q.answer && !/^Doar /.test(o));
    const diff = clamp(Math.ceil(q.diff / 4), 1, 3); // banca are 1-10, afirmațiile 1-3
    const base = `«${q.text}» — ${q.answer}`;
    out.push({ id: 'b' + tfHash(base), cat: q.cat, diff, text: base, q: q.text, a: q.answer, answer: true, expl: '', src: 'bank' });
    if (wrong) {
      const t = `«${q.text}» — ${wrong}`;
      out.push({ id: 'b' + tfHash(t), cat: q.cat, diff, text: t, q: q.text, a: wrong, answer: false, expl: `Răspunsul corect este „${q.answer}”.`, src: 'bank' });
    }
  }
  return out;
}
const TF_STATEMENTS = TF_RAW.map(r => ({ id: 't' + tfHash(r[2]), cat: r[0], diff: r[1], text: r[2], answer: r[3] === 1, expl: r[4] || '', src: 'tf' }));
const TF_BANK = typeof TRIVIA !== 'undefined' ? tfFromBank(TRIVIA) : [];
function tfAll() { return TF_STATEMENTS.concat(TF_BANK); }

// ---------- starea salvată (se creează la nevoie, salvările vechi nu se schimbă) ----------
function tfState() {
  if (!S.tf) S.tf = { played: 0, best: 0, bestCorrect: 0, bestStreak: 0, correct: 0, answered: 0, recent: [] };
  return S.tf;
}
function tfRemember(id) {
  const st = tfState();
  st.recent.push(id);
  const max = CONFIG.TF.recentMemory;
  if (st.recent.length > max) st.recent.splice(0, st.recent.length - max);
}

// ---------- ajutorul AI-ului de companie ----------
// multiplicator suplimentar pentru șansa de indiciu; teritoriul îl poate crește mai târziu
function tfPetHelpBonus() { return 0; }
function tfHintChance() {
  const H = CONFIG.TF.petHint, t = S.player.trivia;
  if (t < H.minStat) return 0;
  const k = clamp((t - H.minStat) / (H.fullStat - H.minStat), 0, 1);
  return clamp(H.maxChance * k * (1 + tfPetHelpBonus()), 0, 0.9);
}
// AI-ul „crede” ceva despre afirmație; precizia vine din modelul arenei (answerProb)
function tfMakeHint(st) {
  if (!chance(tfHintChance())) return null;
  const p = answerProb(S.player.trivia, st.diff * 3 - 1);  // dificultate 1/2/3 -> 2/5/8
  const acc = 0.5 + 0.5 * p;                               // la Adevărat/Fals, ghicitul dă deja 50%
  const right = rand() < acc;
  return { say: right ? st.answer : !st.answer, conf: Math.round(acc * 100), right };
}

// ---------- alegerea afirmației ----------
function tfPick(m) {
  const recent = new Set(tfState().recent);
  const cap = clamp(1 + Math.floor(m.answered / CONFIG.TF.diffEvery), 1, 3);
  const useBank = TF_BANK.length && chance(CONFIG.TF.bankShare);
  const src = useBank ? TF_BANK : TF_STATEMENTS;
  const want = chance(0.5); // jumătate adevărate, jumătate false, indiferent de proporția din bancă
  const ok = s => !m.used.has(s.id) && !recent.has(s.id);
  let pool = src.filter(s => ok(s) && s.diff <= cap && s.answer === want);
  if (!pool.length) pool = src.filter(s => ok(s) && s.diff <= cap);
  if (!pool.length) pool = src.filter(ok);
  if (!pool.length) pool = tfAll().filter(ok);
  if (!pool.length) pool = tfAll().filter(s => !m.used.has(s.id));
  if (!pool.length) pool = tfAll();
  const st = pick(pool);
  m.used.add(st.id);
  tfRemember(st.id);
  return st;
}

// ---------- combo & recompense ----------
function tfComboMult(streak) {
  const T = CONFIG.TF, i = Math.min(T.combo.length - 1, Math.floor(Math.max(0, streak) / T.comboEvery));
  return T.combo[i];
}
function tfCRFor(streak, league, full) {
  const T = CONFIG.TF;
  return Math.round(T.crPerCorrect * CONFIG.LEAGUES[league].reward * tfComboMult(streak) * crMultiplier() * (full ? 1 : CONFIG.QUICK.reducedMult));
}
function tfDTFor(correct, full) { return Math.floor(correct * CONFIG.TF.dtPerCorrect * (full ? 1 : CONFIG.QUICK.reducedMult)); }

// ---------- start ----------
function whyTF() {
  if (TFG && !TFG.done) return 'Un sprint Adevărat sau Fals este deja în desfășurare';
  return typeof whyQuick === 'function' ? whyQuick() : '';
}
function startTF(now, today) {
  const r = whyTF(); if (r) return fail(r);
  const d = quickDay(today);
  S.quick.dayGames++;
  tfState();
  TFG = {
    mode: 'tf', league: S.player.league, full: d.full, day: S.quick.day,
    start: now, endAt: now + CONFIG.TF.durationMs, penalties: 0,
    answered: 0, correct: 0, streak: 0, bestStreak: 0, bestMult: 1, score: 0, cr: 0,
    used: new Set(), st: null, hint: null, last: null, phase: 'question', feedbackUntil: 0, shownAt: now,
    hist: [], done: false, result: null,
  };
  tfNext(TFG, now);
  return ok('Sprint Adevărat sau Fals început');
}
function tfNext(m, now) {
  m.st = tfPick(m);
  m.hint = tfMakeHint(m.st);
  m.phase = 'question';
  m.shownAt = now;
}
// în timpul explicației ceasul stă pe loc
function tfTimeLeft(m, now) { return Math.max(0, m.phase === 'feedback' ? m.endAt - m.feedbackUntil : m.endAt - now); }

// ---------- răspuns ----------
// choice: true (Adevărat) / false (Fals)
function tfAnswer(m, choice, now) {
  if (!m || m.done || m.phase !== 'question') return fail('Nicio afirmație activă');
  if (now >= m.endAt) { finishTF(m, false); return fail('Timpul a expirat'); }
  const T = CONFIG.TF, st = m.st;
  const right = !!choice === st.answer;
  const mult = tfComboMult(m.streak);
  let pts = 0, cr = 0;
  m.answered++;
  m.hist.push(right);
  if (right) {
    pts = Math.round(T.pointsBase * mult);
    cr = tfCRFor(m.streak, m.league, m.full);
    m.correct++; m.streak++; m.score += pts; m.cr += cr;
    m.bestStreak = Math.max(m.bestStreak, m.streak);
    m.bestMult = Math.max(m.bestMult, mult);
  } else {
    m.streak = 0;
    m.endAt -= T.penaltyMs;
    m.penalties++;
  }
  const comboUp = right && tfComboMult(m.streak) > mult;
  m.last = { choice: !!choice, right, st, pts, cr, mult, comboUp, at: now, hintRight: m.hint ? m.hint.right : null };
  if (right) {
    if (now >= m.endAt) finishTF(m, false); else tfNext(m, now);
  } else {
    // explicația stă afișată ~1 s; ceasul e oprit cât timp o citești (penalizarea rămâne)
    m.phase = 'feedback';
    m.feedbackUntil = now + T.explainMs;
    m.endAt += T.explainMs;
  }
  return ok(right ? 'Corect!' : 'Greșit');
}

// avansează sprintul la „now”; întoarce true dacă s-a schimbat ceva
function tfUpdate(now) {
  const m = TFG;
  if (!m || m.done) return false;
  if (m.phase === 'feedback' && now >= m.feedbackUntil) {
    if (now >= m.endAt) finishTF(m, false); else tfNext(m, now);
    return true;
  }
  if (m.phase === 'question' && now >= m.endAt) { finishTF(m, false); return true; }
  return false;
}

// ---------- final ----------
function finishTF(m, abandoned) {
  if (!m || m.done) return m ? m.result : null;
  m.done = true; m.phase = 'done';
  const T = CONFIG.TF, sq = S.quick, st = tfState();
  const res = { mode: 'tf', abandoned: !!abandoned, correct: m.correct, answered: m.answered, score: m.score, bestStreak: m.bestStreak, bestMult: m.bestMult,
    penalties: m.penalties, full: m.full, cr: 0, dt: 0, tax: 0, record: false, firstBest: false, prevBest: st.best, unlocked: [] };
  if (m.answered === 0) {
    // abandonat fără niciun răspuns: nu consumă un joc din limita zilnică
    if (sq.day === m.day) sq.dayGames = Math.max(0, sq.dayGames - 1);
    m.result = res;
    return res;
  }
  res.cr = addCR(m.cr, 'tf');
  res.dt = addDT(tfDTFor(m.correct, m.full));
  res.tax = typeof guildTax === 'function' ? guildTax(res.cr, 'your') : 0;
  st.played++; st.correct += m.correct; st.answered += m.answered;
  st.bestStreak = Math.max(st.bestStreak, m.bestStreak);
  st.bestCorrect = Math.max(st.bestCorrect, m.correct);
  count('tfPlayed'); count('tfCorrect', m.correct);
  if (m.score > st.best) { res.record = st.best > 0; res.firstBest = st.best === 0; st.best = m.score; }
  res.unlocked = typeof checkUnlocks === 'function' ? checkUnlocks() : [];
  log('ARENA', `Adevărat sau Fals: ${m.correct}/${m.answered} corecte, scor ${fmt(m.score)}, +${fmt(res.cr)} CR, +${res.dt} DT${m.full ? '' : ' (recompensă redusă)'}${res.record ? ' — RECORD NOU!' : ''}.`);
  m.result = res;
  if (typeof topAfterGame === 'function') topAfterGame();
  if (typeof saveGame === 'function' && typeof window !== 'undefined') saveGame();
  return res;
}

// ---------- realizări ----------
if (typeof ACHIEVEMENTS !== 'undefined') {
  ACHIEVEMENTS.push(
    ['tf_1', 'Detector de minciuni', 'Joacă un sprint Adevărat sau Fals', () => !!(S.tf && S.tf.played >= 1)],
    ['tf_25', 'Radar de fapte', 'Răspunde corect la 25 de afirmații într-un singur sprint Adevărat sau Fals', () => !!(S.tf && S.tf.bestCorrect >= 25)],
    ['tf_streak15', 'Fără ezitare', 'Prinde 15 afirmații corecte la rând în Adevărat sau Fals', () => !!(S.tf && S.tf.bestStreak >= 15)],
  );
}
