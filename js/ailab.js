'use strict';
/* ============================================================
   LABORATOR AI — runde de antrenament cu AI-ul. AI-ul întreabă,
   jucătorul răspunde cu propriile cuvinte (în română) și primește
   recompense: CR, fragmente, un Recalibrator neural garantat, o
   șansă la o carte și o șansă mică la o carte UNICĂ (cu garanție
   după un număr de lecții). Energie: +1 pe oră (max 3), plus din
   victoriile la quiz. Offline folosește banca locală de mai jos;
   vezi ai_bridge.js.
   ============================================================ */

// kind 'open': AI-ul vrea să învețe (nu există un singur răspuns corect)
// kind 'control': răspuns cunoscut, verifică atenția (anti-spam)
const AI_LOCAL_QUESTIONS = [
  ['o01', 'open', 'Cum ai spune altfel: „Mi-e foarte foame”?'],
  ['o02', 'open', 'Ce înseamnă când cineva spune că „a tras chiulul”?'],
  ['o03', 'open', 'De ce cade un măr în jos și nu în sus?'],
  ['o04', 'open', 'Explică-mi pe scurt ce face un frigider.'],
  ['o05', 'open', 'Cum saluți politicos pe cineva pe care nu-l cunoști?'],
  ['o06', 'open', 'Ce înseamnă cuvântul „zăpușeală”?'],
  ['o07', 'open', 'Spune aceeași idee în alte cuvinte: „Plouă cu găleata.”'],
  ['o08', 'open', 'De ce ne îmbrăcăm mai gros iarna?'],
  ['o09', 'open', 'Cum i-ai explica unui copil ce este banul?'],
  ['o10', 'open', 'Ce faci dacă îți pierzi cheile de la casă?'],
  ['o11', 'open', 'Care e diferența dintre „a auzi” și „a asculta”?'],
  ['o12', 'open', 'Descrie în două propoziții cum arată o zi de vară.'],
  ['o13', 'open', 'Ce înseamnă expresia „a-și lua inima în dinți”?'],
  ['o14', 'open', 'Cum ceri scuze cuiva pe care l-ai supărat?'],
  ['o15', 'open', 'De ce e bine să bei apă când e cald?'],
  ['o16', 'open', 'Ce înseamnă „a face economie”?'],
  ['o17', 'open', 'Scrie o propoziție care conține cuvântul „totuși”.'],
  ['o18', 'open', 'Cum ai explica ce este internetul cuiva care nu l-a folosit niciodată?'],
  ['o19', 'open', 'Ce înseamnă când spui că cineva „are mână bună”?'],
  ['o20', 'open', 'Cum spui „la revedere” în trei feluri diferite?'],
  ['o21', 'open', 'De ce se topește gheața la soare?'],
  ['o22', 'open', 'Ce ar trebui să conțină un e-mail prin care ceri o ofertă de preț?'],
  ['o23', 'open', 'Care e diferența dintre „a împrumuta” și „a da”?'],
  ['o24', 'open', 'Ce înseamnă „a se da peste cap” pentru cineva?'],
  ['o25', 'open', 'Cum îți dai seama că o informație de pe internet poate fi falsă?'],
  ['o26', 'open', 'Spune altfel: „Nu am timp acum, revin mai târziu.”'],
  ['o27', 'open', 'Ce este un vecin? Explică în cuvintele tale.'],
  ['o28', 'open', 'De ce crezi că oamenii țin animale de companie?'],
  ['o29', 'open', 'Ce înseamnă „a fi cu capul în nori”?'],
  ['o30', 'open', 'Cum explici cuiva drumul de la tine de acasă până la cel mai apropiat magazin?'],
  ['o31', 'open', 'Care e diferența dintre o glumă și o minciună?'],
  ['o32', 'open', 'Ce înseamnă când un preț este „negociabil”?'],
  ['o33', 'open', 'Cum ai descrie mirosul pâinii calde?'],
  ['o34', 'open', 'Ce sfat i-ai da cuiva care începe un loc de muncă nou?'],
  ['o35', 'open', 'Ce înseamnă „a pune la cale ceva”?'],
  ['o36', 'open', 'De ce avem nevoie de somn?'],
  ['o37', 'open', 'Spune altfel: „Mulțumesc frumos pentru ajutor!”'],
  ['o38', 'open', 'Ce diferență este între „ieftin” și „avantajos”?'],
  ['o39', 'open', 'Cum se face un ceai, pas cu pas?'],
  ['o40', 'open', 'Ce înseamnă „a avea răbdare”? Dă un exemplu.'],
  ['c01', 'control', 'Câte picioare are un păianjen? (scrie un număr)', ['8', 'opt']],
  ['c02', 'control', 'Ce culoare are cerul senin ziua?', ['albastru', 'albastra', 'albastră', 'bleu']],
  ['c03', 'control', 'Cât face 7 + 5?', ['12', 'doisprezece']],
  ['c04', 'control', 'Care este capitala României?', ['bucuresti', 'bucurești']],
  ['c05', 'control', 'Câte zile are o săptămână?', ['7', 'sapte', 'șapte']],
  ['c06', 'control', 'Ce animal face „miau”?', ['pisica', 'pisică', 'pisicuta', 'pisicuța', 'motan']],
  ['c07', 'control', 'În ce anotimp cade zăpada de obicei?', ['iarna', 'iarnă']],
  ['c08', 'control', 'Cât face 3 × 4?', ['12', 'doisprezece']],
  ['c09', 'control', 'Ce bem când ne este sete? (un cuvânt)', ['apa', 'apă']],
  ['c10', 'control', 'Câte luni are un an?', ['12', 'douasprezece', 'douăsprezece']],
  ['c11', 'control', 'Ce culoare are iarba?', ['verde', 'verzi']],
  ['c12', 'control', 'Care este opusul cuvântului „cald”?', ['rece', 'frig']],
  ['c13', 'control', 'Câte roți are o bicicletă obișnuită?', ['2', 'doua', 'două']],
  ['c14', 'control', 'Ce vine după luni?', ['marti', 'marți']],
  ['c15', 'control', 'Cât face 20 − 8?', ['12', 'doisprezece']],
];

let AILAB = null; // runda curentă (nu se salvează)

function addAIEnergy(n) {
  const ai = S.ai, cap = CONFIG.AI_LAB.energyWonCap;
  const before = ai.energy;
  ai.energy = Math.min(cap, ai.energy + n);
  return ai.energy - before;
}
function aiNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
// nu păstra niciodată date personale: e-mailuri, linkuri, numere de telefon, șiruri lungi de cifre
function aiSanitize(text) {
  return String(text || '').slice(0, 600)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[ascuns]')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[ascuns]')
    .replace(/(\+?\d[\d\s.-]{6,}\d)/g, '[ascuns]')
    .trim();
}
function aiLocalQuestions(n) {
  const recent = new Set((S.ai.recent || []).slice(-30));
  const open = AI_LOCAL_QUESTIONS.filter(q => q[1] === 'open');
  const ctrl = AI_LOCAL_QUESTIONS.filter(q => q[1] === 'control');
  let pool = shuffle(open.filter(q => !recent.has(q[0])));
  if (pool.length < n) pool = shuffle(open.slice());
  const picked = pool.slice(0, n - 1).concat([pick(ctrl)]);
  return shuffle(picked).map(q => ({ id: q[0], text: q[2], kind: q[1], accept: q[3] || [] }));
}

// ---------- reasons ----------
function whyAIStart() {
  if (AILAB && !AILAB.done) return 'O lecție este deja în desfășurare';
  if (!S.ai.consent) return 'Citește și acceptă mai întâi informarea Laboratorului AI';
  if (S.ai.energy < 1) return 'Nu ai energie AI - următoarea peste ' + fmtTime(CONFIG.AI_LAB.regenMs - S.ai.acc) + ' (sau câștigă un meci de quiz)';
  return '';
}
function actAIConsent() { S.ai.consent = true; return { ok: true, msg: 'Mulțumim! Laboratorul AI este deschis.' }; }

// întrebări: de la AI_BRIDGE când e conectat, altfel din banca locală
function actAIStart(questions, source) {
  const r = whyAIStart(); if (r) return { ok: false, msg: r };
  S.ai.energy--;
  if (S.ai.energy === CONFIG.AI_LAB.energyMax - 1) S.ai.acc = 0;
  const qs = (questions && questions.length ? questions : aiLocalQuestions(CONFIG.AI_LAB.questions)).slice(0, CONFIG.AI_LAB.questions);
  AILAB = { qs, i: 0, answers: [], source: source || 'local', done: false, result: null };
  S.ai.recent = (S.ai.recent || []).concat(qs.map(q => q.id)).slice(-60);
  return { ok: true };
}
function aiAnswer(text) {
  const m = AILAB;
  if (!m || m.done || m.i >= m.qs.length) return { ok: false };
  const q = m.qs[m.i];
  m.answers.push({ id: q.id, kind: q.kind, q: q.text, a: aiSanitize(text) });
  m.i++;
  return { ok: true, last: m.i >= m.qs.length };
}
function aiUseful(ans, q) {
  if (q.kind === 'control') {
    const a = aiNorm(ans.a);
    return (q.accept || []).some(x => { const n = aiNorm(x); return a === n || a.split(' ').includes(n); });
  }
  const words = aiNorm(ans.a).split(' ').filter(w => w.length > 1);
  if (words.length < CONFIG.AI_LAB.minWords) return false;
  if (new Set(words).size < Math.ceil(words.length / 2)) return false;      // "bla bla bla bla"
  const letters = (ans.a.match(/[a-zăâîșțA-ZĂÂÎȘȚ]/g) || []).length;
  if (letters < ans.a.replace(/\s/g, '').length * 0.6) return false;       // mostly symbols / digits
  return aiNorm(ans.a) !== aiNorm(q.text);
}
function actAIFinish() {
  const m = AILAB;
  if (!m || m.done) return { ok: false, msg: 'Nicio lecție în desfășurare' };
  if (m.answers.length < m.qs.length) return { ok: false, msg: 'Răspunde mai întâi la toate întrebările' };
  const A = CONFIG.AI_LAB, L = CONFIG.LEAGUES[S.player.league], ai = S.ai;
  let useful = 0, controlOk = true;
  const batch = [];
  m.answers.forEach((ans, i) => {
    const q = m.qs[i], u = aiUseful(ans, q);
    if (q.kind === 'control') { if (!u) controlOk = false; }
    else if (u) useful++;
    const entry = { id: q.id, kind: q.kind, q: q.text, a: ans.a, ok: u, t: S.time, src: m.source };
    batch.push(entry);
    if (ans.a) ai.collected.push(entry);
  });
  if (ai.collected.length > A.collectedMax) ai.collected.splice(0, ai.collected.length - A.collectedMax);
  // recompense: verificarea atenției ratată le înjumătățește (anti-spam); Recalibratorul se dă mereu
  const k = controlOk ? 1 : 0.5;
  const res = { useful, controlOk, cr: 0, shards: 0, recal: 1, card: null, unique: null, milestone: false };
  res.cr = addCR(Math.round(useful * A.crPerUseful * L.reward * k), 'ailab');
  res.shards = addShards(Math.round(useful * A.shardsPerUseful * k));
  S.player.recal += 1;
  ai.rounds++;
  ai.useful += controlOk ? useful : 0;
  ai.pity++;
  if (useful > 0 && controlOk) {
    if (chance(A.uniqueChance) || ai.pity >= A.uniquePity) {
      res.unique = giveCard(mintCard({ rarity: CONFIG.CARDS.UNIQUE }), 'Laborator AI - UNICĂ');
      if (res.unique) ai.pity = 0;
    }
    if (!res.unique && chance(A.cardChance)) res.card = giveCard(mintCard({}), 'Laborator AI');
  }
  while (ai.useful >= (ai.milestone + 1) * A.milestoneEvery) {
    ai.milestone++;
    addShards(A.milestoneShards); S.player.recal++;
    res.milestone = true;
    log('SYSTEM', `REPER AI ${ai.milestone}: AI-ul tău a învățat din ${ai.milestone * A.milestoneEvery} răspunsuri (+${A.milestoneShards} fragmente, +1 Recalibrator neural).`);
  }
  count('aiRounds');
  if (typeof missionProgress === 'function') missionProgress('ai_round', 1);
  log('SYSTEM', `Laborator AI: ${useful}/${m.qs.filter(q => q.kind !== 'control').length} răspunsuri utile${controlOk ? '' : ' (verificarea atenției ratată: recompense înjumătățite)'}, +${fmt(res.cr)} CR, +${res.shards} fragmente, +1 Recalibrator neural${res.card ? ', carte: ' + cardLabel(res.card) : ''}${res.unique ? ', UNICĂ: ' + cardLabel(res.unique) : ''}.`);
  m.done = true; m.result = res; m.batch = batch;
  return Object.assign({ ok: true, msg: 'Lecție încheiată' }, res);
}
function aiExportJSON() {
  return JSON.stringify({ game: 'CyberNet', version: CONFIG.VERSION, player: S.player.name, exported: new Date().toISOString(), answers: S.ai.collected }, null, 1);
}
