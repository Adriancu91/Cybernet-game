'use strict';
/* ============================================================
   MAIN — boot, game loop, offline catch-up, autosave
   ============================================================ */
(function () {
  let acc = 0, lastReal = performance.now(), lastSave = Date.now(), hiddenAt = null;

  function snapshot() {
    const g = playerGuild();
    return { cr: S.player.cr, dt: S.player.dt, sold: counter('cardSold') + counter('nftSold'), comm: S.market.standEarned, exp: S.server.expansions, vault: g ? g.vault : null };
  }
  function catchUp(ms, showSummary) {
    ms = Math.min(ms, CONFIG.OFFLINE_CAP_HOURS * CONFIG.HOUR);
    if (ms < CONFIG.TICK_MS) return;
    const before = snapshot();
    onLog = null; // don't flood the DOM while simulating
    simulate(ms);
    onLog = appendLog;
    renderLog(true);
    if (showSummary && ms >= 60000) showAwaySummary(before, ms);
    saveGame();
  }

  function boot() {
    if (typeof AI_BRIDGE !== 'undefined') AI_BRIDGE.init();
    if (typeof CLOUD !== 'undefined') CLOUD.init();
    if (typeof LiveQuiz !== 'undefined') LiveQuiz.load();
    const loaded = loadGame();
    let isNew = false;
    if (loaded) { S = loaded; }
    else { S = newState(); isNew = true; }
    bindEvents();
    renderLogShell();
    if (isNew) {
      log('SYSTEM', 'Welcome, operator. Your AI pet is online. Train it, then enter the Arena.');
      log('SERVER', `Global Net online: ${fmt(S.server.total)} SU capacity, ${fmtPct(usedRatio() * 100)} used.`);
      saveGame();
    } else {
      const away = Date.now() - (S.realTs || Date.now());
      catchUp(away, true);
    }
    UI.view = window.innerWidth < 768 ? 'left' : UI.view;
    renderAll();
    if (isNew && CLOUD.enabled() && !CLOUD.loggedIn()) showWelcome();
    else if (S.tutorialStep < TUTORIAL.length && !UI.modalOpen) showTutorial(S.tutorialStep || 0);
    if (!isNew && CLOUD.loggedIn()) CLOUD.sync(false).then(() => renderAll());
    if (/[?&]debug=1/.test(location.search)) openDebug();
    requestAnimationFrame(frame);
    setInterval(tick, 250);
    // fresh quiz questions from Wikidata once a day (silently keeps the local bank if offline)
    if (typeof LiveQuiz !== 'undefined') { LiveQuiz.refresh(); setInterval(() => LiveQuiz.refresh(), 3600000); }
  }

  // simulation: fixed 1 s steps, driven by real time x debug speed
  function tick() {
    if (document.hidden) return;
    const now = performance.now();
    let dt = Math.min(now - lastReal, 5000);
    lastReal = now;
    acc += dt * UI.speed;
    let steps = 0;
    while (acc >= CONFIG.TICK_MS && steps < 400) { step(CONFIG.TICK_MS); acc -= CONFIG.TICK_MS; steps++; }
    if (steps >= 400) acc = 0;
    if (steps > 0) renderAll();
    else updateCountdowns();
    if (Date.now() - lastSave >= CONFIG.AUTOSAVE_MS) { saveGame(); lastSave = Date.now(); CLOUD.autoSync(); }
  }

  // arena runs on animation frames for a smooth timer
  let lastPhase = null;
  function frame() {
    requestAnimationFrame(frame);
    if (!ARENA) return;
    const m = ARENA, now = performance.now();
    const before = m.parts.map(p => p.answered);
    const round = m.round;
    arenaUpdate(now);
    m.parts.forEach((p, i) => {
      if (m.round === round && !before[i] && p.answered) {
        UI.lastAnswerFlash[p.id + ':' + m.round] = now;
        if (p.isPlayer) setPetState(p.last.correct ? 'correct' : 'wrong', 900);
      }
    });
    if (m.phase === 'question' && lastPhase !== 'question' && UI.petState !== 'override') setPetState('thinking');
    const justDone = m.phase === 'done' && lastPhase !== 'done';
    if (justDone) {
      const r = m.result || {};
      UI.lastResult = m.type === 'solo'
        ? `Solo ${r.win ? '<span class="good">WON</span>' : '<span class="bad">failed</span>'} — ${r.correct}/${r.rounds} correct, <span class="cr">+${fmt(r.cr)} CR</span>`
        : `Multiplayer #${r.place}/${r.of} — <span class="cr">+${fmt(r.cr)} CR</span>, rating ${r.ratingDelta >= 0 ? '+' : ''}${r.ratingDelta}`;
      if (r.loot && r.loot.length) UI.lastResult += ` · loot: ${r.loot.map(l => esc(l.text)).join(', ')}`;
      setPetState(r.win || r.place === 1 ? 'correct' : 'idle', 1500);
      if (UI.centerTab !== 'arena') toast('Match finished: ' + UI.lastResult.replace(/<[^>]+>/g, ''));
    }
    lastPhase = m.phase;
    if (m.phase !== 'done') {
      if (UI.centerTab === 'arena') setHtml('#center', htmlCenter());
      updateTimerBar();
    } else if (justDone) renderAll();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); saveGame(); if (CLOUD.loggedIn() && !CLOUD.conflict) CLOUD.sync(false); }
    else if (hiddenAt) {
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      lastReal = performance.now();
      catchUp(away * UI.speed, away > 60000);
      renderAll();
    }
  });
  window.addEventListener('pagehide', () => saveGame());
  window.addEventListener('beforeunload', () => saveGame());

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
