'use strict';
/* ============================================================
   LIVE QUIZ — fresh trivia every day, generated from Wikidata
   (free, CC0). Questions are cached on this device for 24 h and
   mixed into the built-in bank; if the network is unavailable the
   game simply keeps using the local bank.
   Stored OUTSIDE the save on purpose: it never affects the save,
   offline simulation or the self-tests.
   ============================================================ */
const LiveQuiz = {
  KEY: 'cybernet_live_quiz_v1',
  TTL: 24 * 3600 * 1000,
  PER_DAY: 120,
  pool: [],
  updated: 0,
  loading: false,

  load() {
    try {
      const raw = typeof localStorage !== 'undefined' && localStorage.getItem(this.KEY);
      if (raw) { const d = JSON.parse(raw); this.pool = d.pool || []; this.updated = d.updated || 0; }
    } catch (e) { this.pool = []; }
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify({ pool: this.pool, updated: this.updated })); } catch (e) { } },
  stale() { return Date.now() - this.updated > this.TTL || this.pool.length < 20; },

  async sparql(q) {
    const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).results.bindings;
  },
  // difficulty 1-10 from how famous the subject is (rank among results)
  diffByRank(i, n) { return clamp(2 + Math.floor(i / Math.max(1, n) * 8), 2, 10); },
  // random generator independent from the game RNG
  rng: Math.random,
  pickN(arr, n, not) { const out = new Set(); let g = 0; while (out.size < n && g++ < 200) { const v = arr[Math.floor(this.rng() * arr.length)]; if (v !== not) out.add(v); } return [...out]; },
  shuffleOwn(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },

  async capitals() {
    const rows = await this.sparql(`SELECT ?cLabel ?capLabel ?sl WHERE { ?c wdt:P31 wd:Q6256; wdt:P36 ?cap; wikibase:sitelinks ?sl. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sl)`);
    const seen = new Set(), list = [];
    for (const r of rows) {
      const c = r.cLabel && r.cLabel.value, cap = r.capLabel && r.capLabel.value;
      if (!c || !cap || seen.has(c) || /^Q\d+$/.test(cap)) continue;
      seen.add(c); list.push([c, cap]);
    }
    const caps = list.map(x => x[1]), countries = list.map(x => x[0]);
    const out = [];
    list.forEach(([c, cap], i) => {
      const d = this.diffByRank(i, list.length);
      out.push({ id: 'wcap:' + c, cat: 'Geography', diff: d, text: `What is the capital of ${c}?`, answer: cap, options: [cap].concat(this.pickN(caps, 3, cap)) });
      if (i < 120) out.push({ id: 'wcty:' + cap, cat: 'Geography', diff: Math.min(10, d + 1), text: `${cap} is the capital of which country?`, answer: c, options: [c].concat(this.pickN(countries, 3, c)) });
    });
    return out;
  },
  async elements() {
    const rows = await this.sparql(`SELECT ?eLabel ?sym ?num WHERE { ?e wdt:P31 wd:Q11344; wdt:P246 ?sym; wdt:P1086 ?num. FILTER(?num <= 92) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY ?num`);
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    const list = rows.map(r => [cap(r.eLabel.value), r.sym.value, Number(r.num.value)]).filter(x => x[0] && x[1] && !/^Q\d+$/.test(x[0]));
    const names = list.map(x => x[0]), syms = list.map(x => x[1]);
    const out = [];
    for (const [name, sym, num] of list) {
      const d = clamp(3 + Math.floor(num / 12), 3, 10);
      out.push({ id: 'wsym:' + sym, cat: 'Science', diff: d, text: `Which chemical element has the symbol ${sym}?`, answer: name, options: [name].concat(this.pickN(names, 3, name)) });
      out.push({ id: 'wel:' + sym, cat: 'Science', diff: Math.min(10, d + 1), text: `What is the chemical symbol of ${name}?`, answer: sym, options: [sym].concat(this.pickN(syms, 3, sym)) });
    }
    return out;
  },

  // pull fresh questions (at most once a day), keep a random daily selection
  async refresh(force) {
    if (this.loading || typeof fetch === 'undefined') return;
    if (!force && !this.stale()) return;
    this.loading = true;
    try {
      const parts = await Promise.allSettled([this.capitals(), this.elements()]);
      let all = [];
      for (const p of parts) if (p.status === 'fulfilled') all = all.concat(p.value);
      all = all.filter(q => q.options.length === 4 && new Set(q.options).size === 4);
      if (all.length) {
        this.pool = this.shuffleOwn(all).slice(0, this.PER_DAY).map(q => Object.assign(q, { options: this.shuffleOwn(q.options) }));
        this.updated = Date.now();
        this.save();
        if (typeof log === 'function' && S) log('SYSTEM', `Live quiz updated: ${this.pool.length} fresh questions from Wikidata.`);
      }
    } catch (e) { /* offline: keep the local bank */ }
    this.loading = false;
  },
};
