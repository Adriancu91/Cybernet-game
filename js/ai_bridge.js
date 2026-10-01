'use strict';
/* ============================================================
   AI BRIDGE — the socket where the real AI (AiSynApps) plugs in.

   While `endpoint` is empty the game runs OFFLINE: the AI Lab uses
   the local question bank (ailab.js) and keeps every answer in the
   save (S.ai.collected), ready to export as JSON.

   To connect the AI later, set `endpoint` (or open the game with
   ?ai=http://host:port) and implement two HTTP routes on the AI side.
   Full protocol: docs/AI_BRIDGE.md
     POST {endpoint}/questions  {count, player}        -> {questions:[{id, text, kind:'open'|'control', accept?:[...]}]}
     POST {endpoint}/answers    {player, answers:[...]} -> {ok:true, useful?:[ids]}
   The AI decides what it asks (its UNKNOWN list) and what it keeps:
   it should only memorise an answer once several players agree.
   ============================================================ */
const AI_BRIDGE = {
  endpoint: '',
  timeoutMs: 6000,

  init() {
    try {
      const m = typeof location !== 'undefined' && /[?&]ai=([^&]+)/.exec(location.search);
      if (m) this.endpoint = decodeURIComponent(m[1]).replace(/\/$/, '');
      else if (typeof localStorage !== 'undefined') this.endpoint = localStorage.getItem('cybernet_ai_endpoint') || '';
    } catch (e) { this.endpoint = ''; }
  },
  connected() { return !!this.endpoint; },
  setEndpoint(url) {
    this.endpoint = String(url || '').trim().replace(/\/$/, '');
    try { localStorage.setItem('cybernet_ai_endpoint', this.endpoint); } catch (e) { }
  },
  async post(path, body) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), this.timeoutMs) : null;
    try {
      const r = await fetch(this.endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (timer) clearTimeout(timer); }
  },
  // returns questions from the real AI, or null to fall back to the local bank
  async fetchQuestions(count, player) {
    if (!this.connected()) return null;
    try {
      const res = await this.post('/questions', { count, player });
      const qs = (res && res.questions || []).filter(q => q && q.text).slice(0, count)
        .map(q => ({ id: String(q.id || ''), text: String(q.text).slice(0, 400), kind: q.kind === 'control' ? 'control' : 'open', accept: Array.isArray(q.accept) ? q.accept.map(String) : [] }));
      return qs.length ? qs : null;
    } catch (e) { return null; }
  },
  async submitAnswers(player, answers) {
    if (!this.connected()) return false;
    try { await this.post('/answers', { player, answers }); return true; } catch (e) { return false; }
  },
};
