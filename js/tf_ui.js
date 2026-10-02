'use strict';
/* ============================================================
   TF UI — fereastra „Adevărat sau Fals”, butonul din Arenă și
   cardul „🏆 Top realizări umane”. Logica e în tf.js și top.js.
   Se încarcă după ui.js (folosește HANDLERS, btn, openModal…).
   ============================================================ */

UI.topCat = UI.topCat || 'tf';

// ---------- butonul din Arenă (lângă Quiz Rapid și Supraviețuire) ----------
function htmlTFHeroBtn(why) {
  why = why || whyTF();
  const a = why ? ` data-reason="${esc(why)}" title="${esc(why)}" aria-disabled="true"` : '';
  const best = topTFBest();
  return `<button type="button" class="btn hero-tf ${why ? 'is-disabled' : ''}" data-act="startTF"${a}><span>✓✗ Adevărat sau Fals</span><small>${best ? 'Record: ' + fmt(best) : `sprint de ${CONFIG.TF.durationMs / 1000} s`}</small></button>`;
}

// ---------- fereastra de joc ----------
function tfModalOpen() { return !!(UI.modalOpen && UI.modalKind && UI.modalKind.type === 'tf'); }
function tfBox() { const b = $('#modal .modal-box'); return b && b.classList.contains('tf-box') ? b : null; }
function tfStmtHtml(st) {
  if (st.src === 'bank') return `<span class="tf-q">«${esc(st.q)}»</span><span class="tf-a">${esc(st.a)}</span>`;
  return esc(st.text);
}
function htmlTFGame(m) {
  const T = CONFIG.TF;
  const head = `<div class="modal-head"><h2>✓✗ Adevărat sau Fals</h2><button class="iconbtn" data-act="tfQuit" aria-label="${m.done ? 'Închide' : 'Renunță'}" title="${m.done ? 'Închide' : 'Renunță (păstrezi recompensele de până acum)'}">✕</button></div>`;
  if (m.done) return head + htmlTFEnd(m);
  const now = performance.now(), last = m.last, fb = m.phase === 'feedback';
  const mult = tfComboMult(m.streak);
  const pen = last && !last.right && now - last.at < 900;
  const left = `<div><div class="tiny dim qlabel">TIMP</div><b id="tfsec" class="tf-clock">${Math.ceil(tfTimeLeft(m, now) / 1000)}</b><span class="dim small"> s</span>${pen ? '<span class="tf-pen">−' + T.penaltyMs / 1000 + ' s</span>' : ''}<div class="tiny dim">corecte ${m.correct}/${m.answered}</div></div>`;
  const combo = `<div class="qcombo ${mult > 1 ? 'on' : ''} ${last && last.comboUp && now - last.at < 600 ? 'bump' : ''}">×${String(mult).replace('.', ',')}<small>ȘIR ${m.streak}</small></div>`;
  const right = `<div class="qscore"><b>${fmt(m.score)}</b> <span class="tiny dim">puncte</span><div class="cr small">+${fmt(m.cr)} CR</div></div>`;
  const st = fb ? last.st : m.st;
  const stCls = fb ? 'bad' : (last && last.right && now - last.at < 450 ? 'ok' : '');
  let line = '';
  if (fb) {
    const verdict = st.answer ? 'Adevărat' : 'Fals';
    line = `<span class="bad">✗ ${verdict} — ${esc(st.answer ? (st.src === 'bank' ? `răspunsul „${st.a}” este corect.` : st.text) : st.expl)}</span>`;
  } else if (last && last.right && now - last.at < 700) {
    line = `<span class="good">✓ Corect! +${last.pts} puncte · +${fmt(last.cr)} CR${last.comboUp ? ` · <b class="warn">ȘIR ×${String(tfComboMult(m.streak)).replace('.', ',')}!</b>` : ''}</span>`;
  }
  const hint = !fb && m.hint ? `🤖 AI-ul crede: <b>${m.hint.say ? 'Adevărat' : 'Fals'}</b> (${m.hint.conf}%)` : '';
  const dis = fb ? ' disabled' : '';
  return head + `<div class="qhead">${left}${combo}${right}</div>
    <div class="qtimer-row"><div class="timer"><i id="tfbar"></i></div></div>
    <div class="tiny dim">${esc(st.cat).toUpperCase()} · ${['', 'ușor', 'mediu', 'greu'][st.diff] || ''}${st.src === 'bank' ? ' · este acesta răspunsul corect?' : ''}</div>
    <div class="tf-stmt ${stCls}">${tfStmtHtml(st)}</div>
    <div class="tf-hint">${hint}</div>
    <div class="tf-btns">
      <button type="button" class="btn tf-btn tf-yes" data-act="tfAns" data-args="true"${dis}><span>✓ Adevărat</span><small>← sau A</small></button>
      <button type="button" class="btn tf-btn tf-no" data-act="tfAns" data-args="false"${dis}><span>✗ Fals</span><small>→ sau F</small></button>
    </div>
    <div class="qfb tf-fb">${line}</div>
    <div class="tiny dim qtip">Corect = puncte și CR, cu multiplicator la fiecare ${T.comboEvery} corecte la rând · greșit = −${T.penaltyMs / 1000} secunde și șirul se resetează.</div>
    ${m.full ? '' : `<div class="tiny warn" style="margin-top:4px">Ai jucat deja ${CONFIG.QUICK.dailyFull} jocuri azi: acum primești ${Math.round(CONFIG.QUICK.reducedMult * 100)}% din recompense.</div>`}`;
}
function htmlTFEnd(m) {
  const r = m.result || {}, d = quickDay(), st = tfState();
  const rewards = [`<span class="cr">+${fmt(r.cr)} CR</span>`, `<span class="dtc">+${r.dt} DT</span>`];
  if (r.tax) rewards.push(`<span class="gvc">seiful breslei +${fmt(r.tax)} GV</span>`);
  const rank = r.answered ? topRanking('tf').find(x => x.isPlayer).rank : 0;
  const acc = r.answered ? Math.round(r.correct / r.answered * 100) : 0;
  return `<div class="quick-end center">
    ${r.record ? '<div class="record">RECORD NOU!</div>' : r.firstBest ? '<div class="tiny dim" style="letter-spacing:.1em">PRIMUL TĂU RECORD</div>' : ''}
    <div class="result-big">${fmt(r.score)} <span class="small dim">puncte</span></div>
    ${r.abandoned ? '<div class="tiny warn">Sprint întrerupt — ai păstrat recompensele de până acum.</div>' : '<div class="tiny dim">Timpul a expirat!</div>'}
    <div class="kv end-kv"><span>Răspunsuri corecte</span><b>${r.correct}/${r.answered} <span class="dim">(${acc}%)</span></b>
      <span>Cel mai lung șir</span><b class="warn">${nRo(r.bestStreak || 0, 'corect', 'corecte')} la rând <span class="dim">(×${String(r.bestMult || 1).replace('.', ',')})</span></b>
      <span>Penalizări</span><b>${r.penalties ? '−' + r.penalties * CONFIG.TF.penaltyMs / 1000 + ' s' : 'niciuna'}</b>
      <span>Recordul tău</span><b>${fmt(st.best)}</b>
      ${rank ? `<span>Locul în 🏆 Top</span><b class="good">#${rank}</b>` : ''}</div>
    <div class="end-rewards">${rewards.join(' · ')}</div>
    <div class="tiny ${d.full ? 'dim' : 'warn'}" style="margin-top:6px">Jocuri cu recompensă întreagă azi: ${d.used}/${d.limit}${r.full ? '' : ' · acest joc: 25% din recompense'}</div>
    ${r.unlocked && r.unlocked.length ? `<div class="col" style="margin-top:12px;text-align:left">${htmlUnlocked(r.unlocked)}</div>` : ''}
    <div class="row end-btns">${btn('↻ Joacă din nou', 'tfAgain', undefined, '', 'primary big')}${btn('Închide', 'tfClose', undefined, '', 'big')}</div>
  </div>`;
}
function openTF() {
  openModal('', true);
  UI.modalKind = { type: 'tf' };
  UI.lastTFHtml = null;
  const box = $('#modal .modal-box');
  if (box) box.classList.add('quick-box', 'tf-box');
  renderTF();
}
function renderTF() {
  if (!TFG || !tfModalOpen()) return;
  const box = tfBox(); if (!box) return;
  const html = htmlTFGame(TFG);
  if (html !== UI.lastTFHtml) { UI.lastTFHtml = html; box.innerHTML = html; }
  updateTFTimer();
}
function updateTFTimer() {
  const m = TFG, bar = document.getElementById('tfbar'), sec = document.getElementById('tfsec');
  if (!m || m.done || !bar) return;
  const ms = tfTimeLeft(m, performance.now()), left = clamp(ms / CONFIG.TF.durationMs, 0, 1);
  bar.style.transform = `scaleX(${left.toFixed(3)})`;
  bar.style.background = ms < 10000 ? 'var(--bad)' : ms < 20000 ? 'var(--warn)' : 'var(--b)';
  if (sec) { const s = String(Math.ceil(ms / 1000)); if (sec.textContent !== s) sec.textContent = s; sec.classList.toggle('low', ms < 10000); }
}
let TF_LOOP = false;
function tfLoop() {
  if (TF_LOOP) return;
  TF_LOOP = true;
  const frame = () => {
    const m = TFG;
    if (!m || m.done) { TF_LOOP = false; return; }
    const now = performance.now(), was = m.phase;
    if (tfUpdate(now)) {
      if (m.done) { afterTFDone(); TF_LOOP = false; return; }
      if (was === 'feedback') setPetState('thinking', 400);
    }
    renderTF();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function afterTFDone() {
  const m = TFG, r = m && m.result;
  if (!r) return;
  if (r.answered) {
    UI.lastResult = `Adevărat sau Fals — ${r.correct}/${r.answered} corecte, ${fmt(r.score)} puncte, <span class="cr">+${fmt(r.cr)} CR</span> · <span class="dtc">+${r.dt} DT</span>${r.record ? ' · <b class="warn">record nou!</b>' : ''}`;
    setPetState(r.record ? 'correct' : 'idle', 1500);
    if (!tfModalOpen()) toast('Adevărat sau Fals: ' + r.correct + ' corecte, ' + fmt(r.score) + ' puncte' + (r.unlocked && r.unlocked.length ? ' · nou deblocat: ' + r.unlocked.map(f => f.name).join(', ') : ''), r.record ? 'warn' : '');
  }
  renderTF();
  renderAll();
}
function startTFUI() {
  if (TFG && TFG.done) TFG = null;
  const r = doAct(() => startTF(performance.now()), true);
  if (r && r.ok) { openTF(); tfLoop(); }
}

// ---------- cardul „🏆 Top realizări umane” (fila Arenă, vizibil de la început) ----------
function htmlTopCard() {
  const v = topView(UI.topCat), cat = v.cat, cloud = TOP_CLOUD.on();
  if (cloud) { TOP_CLOUD.fetch(cat.id).then(ch => { if (ch) renderAll(); }); TOP_CLOUD.submit(); }
  const chips = TOP_CATS.map(c => `<button class="chip ${c.id === cat.id ? 'on' : ''}" data-act="topCat" data-args='"${c.id}"'>${esc(c.name)}</button>`).join('');
  const row = e => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e.rank}</td><td>${esc(e.name)}${e.isPlayer && e.name !== 'Tu' ? ' <span class="tiny dim">(tu)</span>' : ''}${e.tag ? ` <span class="gtag">[${esc(e.tag)}]</span>` : ''}${e.real ? ' <span class="real-badge" title="Jucător real, din topul global">👤 real</span>' : ''}</td><td class="num">${fmt(e.value)}</td></tr>`;
  const rows = v.rows.map(row).join('') + (v.outside ? `<tr class="top-sep"><td colspan="3">⋯</td></tr>${row(v.me)}` : '');
  const mine = v.me.value;
  const status = cloud
    ? (typeof CLOUD !== 'undefined' && CLOUD.loggedIn() ? `☁ Topul include jucători reali (👤 real)${TOP_CLOUD.status === 'error' ? ' · serverul nu răspunde acum, vezi doar topul local' : ''}.` : '☁ Topul include jucători reali (👤 real). Conectează-te cu ID + PIN ca să apari și tu în topul global.')
    : 'Concurezi cu ceilalți operatori ai rețelei. Contează doar ce faci tu, nu AI-ul tău.';
  return `<div class="card top-card" id="topcard" style="margin-top:10px">
    <div class="row between"><h3 style="margin:0">🏆 Top realizări umane</h3><span class="tiny dim">locul tău: <b class="${v.me.rank <= 10 ? 'good' : ''}">#${v.me.rank}</b> din ${v.total}</span></div>
    <div class="tiny dim" style="margin:4px 0 8px">Clasamente cu ce ai realizat tu, fără ajutorul AI-ului de companie.</div>
    <div class="row top-chips">${chips}</div>
    <div class="small" style="margin:8px 0 6px">${esc(cat.name)}: <b class="good">${fmt(mine)}</b> <span class="dim">${esc(cat.unit)}</span>${mine ? '' : ` <span class="tiny dim">— ${cat.id === 'duels' || cat.id === 'territory' ? 'câștigă dueluri de Teritoriu ca să urci' : 'joacă o dată ca să intri în clasament'}</span>`}</div>
    <div class="top-scroll"><table class="lb"><tr><th>#</th><th>Nume</th><th class="num">${esc(cat.name)}</th></tr>${rows}</table></div>
    <div class="tiny mute" style="margin-top:6px">${status}</div>
  </div>`;
}

// ---------- handlere ----------
Object.assign(HANDLERS, {
  startTF() { startTFUI(); },
  tfAns(v) {
    const m = TFG;
    if (!m || m.done || m.phase !== 'question') return;
    const r = tfAnswer(m, v === true || v === 'true', performance.now());
    if (m.done) { afterTFDone(); return; }
    if (r.ok) setPetState(m.last.right ? 'correct' : 'wrong', 600);
    renderTF();
  },
  tfQuit() {
    if (TFG && !TFG.done) { finishTF(TFG, true); afterTFDone(); if (!TFG.result.answered) { TFG = null; closeModal(); } }
    else closeModal();
  },
  tfClose() { closeModal(); },
  tfAgain() { TFG = null; closeModal(); startTFUI(); },
  topCat(id) { if (TOP_CATS.some(c => c.id === id)) UI.topCat = id; },
});

// ---------- tastatură și fundalul ferestrei (faza de captură, înaintea handlerelor din ui.js) ----------
document.addEventListener('keydown', e => {
  if (!tfModalOpen()) return;
  const running = TFG && !TFG.done;
  if (e.key === 'Escape') {
    if (running) { e.stopPropagation(); e.preventDefault(); } // nu închide fereastra în mijlocul sprintului
    return;
  }
  if (!running || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  let v = null;
  if (k === 'ArrowLeft' || k === 'A') v = true;
  else if (k === 'ArrowRight' || k === 'F') v = false;
  if (v === null) return;
  e.stopPropagation(); e.preventDefault();
  if (!e.repeat) HANDLERS.tfAns(v);
}, true);
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'modal' && tfModalOpen() && TFG && !TFG.done) e.stopPropagation(); // clic pe fundal nu oprește sprintul
}, true);
