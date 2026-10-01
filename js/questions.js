'use strict';
/* ============================================================
   QUESTIONS — math generator (difficulty 1-10) + trivia picker
   ============================================================ */

function mathDistractors(ans) {
  const set = new Set([ans]);
  const spread = Math.max(3, Math.round(Math.abs(ans) * 0.15));
  const cand = [ans + 1, ans - 1, ans + 10, ans - 10, ans + 2, ans * 2, Math.round(ans / 2)];
  let guard = 0;
  while (set.size < 4 && guard++ < 60) {
    let c = guard < 8 && chance(0.5) ? pick(cand) : ans + randInt(-spread, spread);
    if (c !== ans && Number.isFinite(c)) set.add(c);
  }
  let k = 1;
  while (set.size < 4) set.add(ans + 100 * k++);
  return shuffle([...set].map(String));
}

function genMath(diff) {
  let text, ans;
  const d = clamp(Math.round(diff), 1, 10);
  switch (d) {
    case 1: { const a = randInt(1, 20), b = randInt(1, 20); text = `${a} + ${b}`; ans = a + b; break; }
    case 2: {
      if (chance(0.5)) { const a = randInt(10, 40), b = randInt(1, a); text = `${a} - ${b}`; ans = a - b; }
      else { const a = randInt(2, 9), b = randInt(2, 9); text = `${a} × ${b}`; ans = a * b; }
      break;
    }
    case 3: {
      if (chance(0.5)) { const a = randInt(3, 12), b = randInt(3, 12); text = `${a} × ${b}`; ans = a * b; }
      else { const a = randInt(25, 99), b = randInt(25, 99); text = `${a} + ${b}`; ans = a + b; }
      break;
    }
    case 4: { const a = randInt(2, 30), b = randInt(2, 9), c = randInt(2, 9); text = `${a} + ${b} × ${c}`; ans = a + b * c; break; }
    case 5: {
      if (chance(0.5)) { const b = randInt(3, 12), q = randInt(3, 15); text = `${b * q} ÷ ${b}`; ans = q; }
      else { const a = randInt(2, 15), b = randInt(2, 15), c = randInt(2, 6); text = `(${a} + ${b}) × ${c}`; ans = (a + b) * c; }
      break;
    }
    case 6: { const a = randInt(2, 9), x = randInt(1, 15), b = randInt(1, 30); text = `${a}x + ${b} = ${a * x + b}, x = ?`; ans = x; break; }
    case 7: { const p = pick([5, 10, 15, 20, 25, 30, 40, 50, 75]), n = randInt(2, 40) * 20; text = `${p}% of ${n}`; ans = Math.round(p * n / 100); break; }
    case 8: {
      if (chance(0.5)) { const a = randInt(11, 25); text = `${a}²`; ans = a * a; }
      else { const a = randInt(6, 15), b = randInt(6, 15), c = randInt(2, 9), d2 = randInt(2, 9); text = `${a} × ${b} − ${c} × ${d2}`; ans = a * b - c * d2; }
      break;
    }
    case 9: {
      if (chance(0.5)) { const x = randInt(-12, 20), a = randInt(3, 9), c = randInt(1, a - 1), b = randInt(-20, 20); const rhs = (a - c) * x + b; text = `${a}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)} = ${c}x + ${rhs}, x = ?`; ans = x; }
      else { const n = randInt(4, 40) * 10, p = pick([10, 20, 25, 50]); const up = chance(0.5); text = `${n} ${up ? 'increased' : 'decreased'} by ${p}%`; ans = Math.round(n * (up ? 1 + p / 100 : 1 - p / 100)); }
      break;
    }
    default: {
      const r = rand();
      if (r < 0.34) { const a = randInt(12, 30), b = randInt(2, a - 1); text = `${a}² − ${b}²`; ans = a * a - b * b; }
      else if (r < 0.67) { const a = randInt(4, 20), b = randInt(4, 20); text = `√${a * a} + √${b * b} × 3`; ans = a + b * 3; }
      else { const a = randInt(2, 6), b = randInt(2, 5), c = randInt(10, 99); text = `${a}^${b} + ${c}`; ans = Math.pow(a, b) + c; }
    }
  }
  return { kind: 'math', cat: 'Math', diff: d, text: text + ' = ?', answer: String(ans), options: mathDistractors(ans) };
}

function genTrivia(diff, usedInMatch) {
  const d = clamp(Math.round(diff), 1, 10);
  const recent = new Set(S.recentTrivia);
  // built-in bank + today's live questions from Wikidata (if they could be downloaded)
  const BANK = typeof LiveQuiz !== 'undefined' && LiveQuiz.pool.length ? TRIVIA.concat(LiveQuiz.pool) : TRIVIA;
  let pool = [];
  for (let spread = 0; spread <= 9 && pool.length === 0; spread++) {
    pool = BANK.filter(q => Math.abs(q.diff - d) <= spread && !usedInMatch.has(q.id) && !recent.has(q.id));
  }
  if (pool.length === 0) pool = BANK.filter(q => !usedInMatch.has(q.id));
  if (pool.length === 0) pool = BANK;
  const q = pick(pool);
  usedInMatch.add(q.id);
  S.recentTrivia.push(q.id);
  if (S.recentTrivia.length > CONFIG.RECENT_TRIVIA_MEMORY) S.recentTrivia.shift();
  return { kind: 'trivia', cat: q.cat, diff: q.diff, text: q.text, answer: q.answer, options: shuffle(q.options.slice()) };
}

// mode: 'mixed' | 'math' | 'trivia'
function genQuestion(leagueIdx, usedInMatch, mode) {
  const L = CONFIG.LEAGUES[leagueIdx];
  const diff = randInt(L.diff[0], L.diff[1]);
  const kind = mode === 'math' ? 'math' : mode === 'trivia' ? 'trivia' : (chance(0.5) ? 'math' : 'trivia');
  return kind === 'math' ? genMath(diff) : genTrivia(diff, usedInMatch);
}

function checkAnswer(q, given) {
  if (q.kind === 'math') return Number(given) === Number(q.answer);
  return String(given) === String(q.answer);
}
