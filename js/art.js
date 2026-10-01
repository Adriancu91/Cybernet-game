'use strict';
/* ============================================================
   ART — procedural SVG: NFTs (deterministic from dna), pet avatar,
   guild emblems, badges, icons, land map, charts.
   Pure string builders, cached; no external images.
   ============================================================ */
const Art = (() => {
  const cache = new Map();
  const BG = '#060a10';
  const f1 = v => (Math.round(v * 10) / 10).toString();

  // ---------- card silhouettes (with dna variations) ----------
  function core(r, a, b) {
    const sides = 6 + Math.floor(r() * 3) * 2, rad = 30 + r() * 6, rot = r() * Math.PI;
    let pts = '';
    for (let i = 0; i < sides; i++) { const an = rot + i * 2 * Math.PI / sides; pts += f1(80 + Math.cos(an) * rad) + ',' + f1(80 + Math.sin(an) * rad) + ' '; }
    const inner = 12 + r() * 6;
    return `<polygon points="${pts}" fill="${BG}" stroke="${a}" stroke-width="3"/>` +
      `<circle cx="80" cy="80" r="${f1(inner)}" fill="${b}"/><circle cx="80" cy="80" r="${f1(inner * 0.45)}" fill="${BG}"/>` +
      `<circle cx="80" cy="80" r="${f1(inner * 0.2)}" fill="${a}"/>`;
  }
  function spine(r, a, b) {
    const n = 5 + Math.floor(r() * 3), h = 84 / n;
    let s = `<line x1="80" y1="36" x2="80" y2="124" stroke="${a}" stroke-width="2"/>`;
    for (let i = 0; i < n; i++) {
      const w = 22 + r() * 16 - (i % 2) * 6, y = 38 + i * h;
      s += `<rect x="${f1(80 - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h * 0.62)}" rx="2" fill="${i % 2 ? b : a}"/>`;
      if (r() < 0.6) s += `<line x1="${f1(80 - w / 2 - 8)}" y1="${f1(y + h * 0.3)}" x2="${f1(80 + w / 2 + 8)}" y2="${f1(y + h * 0.3)}" stroke="${a}" stroke-width="1" opacity=".6"/>`;
    }
    return s;
  }
  // hardware board: a chip with pins and traces
  function board(r, a, b) {
    const w = 46 + r() * 10, h = 46 + r() * 10, x = 80 - w / 2, y = 80 - h / 2, pins = 5 + Math.floor(r() * 3);
    let s = `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="5" fill="${BG}" stroke="${a}" stroke-width="3"/>`;
    for (let i = 0; i < pins; i++) {
      const px = x + 6 + i * (w - 12) / (pins - 1), py = y + 6 + i * (h - 12) / (pins - 1);
      s += `<line x1="${f1(px)}" y1="${f1(y - 9)}" x2="${f1(px)}" y2="${f1(y)}" stroke="${b}" stroke-width="2"/><line x1="${f1(px)}" y1="${f1(y + h)}" x2="${f1(px)}" y2="${f1(y + h + 9)}" stroke="${b}" stroke-width="2"/>`;
      s += `<line x1="${f1(x - 9)}" y1="${f1(py)}" x2="${f1(x)}" y2="${f1(py)}" stroke="${b}" stroke-width="2"/><line x1="${f1(x + w)}" y1="${f1(py)}" x2="${f1(x + w + 9)}" y2="${f1(py)}" stroke="${b}" stroke-width="2"/>`;
    }
    s += `<rect x="${f1(x + w * 0.28)}" y="${f1(y + h * 0.28)}" width="${f1(w * 0.44)}" height="${f1(h * 0.44)}" rx="3" fill="${a}" opacity=".85"/><circle cx="${f1(x + 9)}" cy="${f1(y + 9)}" r="2.5" fill="${b}"/>`;
    return s;
  }
  // cooler: a fan with blades
  function fan(r, a, b) {
    const blades = 5 + Math.floor(r() * 4), R = 34 + r() * 4, tw = 0.5 + r() * 0.4;
    let s = `<rect x="${f1(80 - R - 6)}" y="${f1(80 - R - 6)}" width="${f1(2 * R + 12)}" height="${f1(2 * R + 12)}" rx="10" fill="${BG}" stroke="${a}" stroke-width="2.5"/>`;
    s += `<circle cx="80" cy="80" r="${f1(R)}" fill="none" stroke="${b}" stroke-width="1.5" opacity=".6"/><g class="card-fan" style="transform-origin:80px 80px">`;
    for (let i = 0; i < blades; i++) {
      const an = i * 2 * Math.PI / blades, x1 = 80 + Math.cos(an) * 10, y1 = 80 + Math.sin(an) * 10;
      const x2 = 80 + Math.cos(an + tw) * (R - 3), y2 = 80 + Math.sin(an + tw) * (R - 3), cx = 80 + Math.cos(an + tw * 0.2) * R * 0.75, cy = 80 + Math.sin(an + tw * 0.2) * R * 0.75;
      s += `<path d="M${f1(x1)} ${f1(y1)} Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}" fill="none" stroke="${a}" stroke-width="5" stroke-linecap="round"/>`;
    }
    s += `</g><circle cx="80" cy="80" r="10" fill="${b}"/><circle cx="80" cy="80" r="4" fill="${BG}"/>`;
    return s;
  }
  const SILHOUETTE = { core: core, memory: spine, hardware: board, cooler: fan };
  const GLYPH = {
    cr: (x, y, c) => `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${c}" stroke-width="1.4"/><line x1="${x}" y1="${y - 2}" x2="${x}" y2="${y + 2}" stroke="${c}" stroke-width="1.4"/>`,
    speed: (x, y, c) => `<polyline points="${x - 2},${y - 4} ${x + 1},${y} ${x - 1},${y} ${x + 2},${y + 4}" fill="none" stroke="${c}" stroke-width="1.4"/>`,
    train: (x, y, c) => `<polyline points="${x - 4},${y + 2} ${x},${y - 3} ${x + 4},${y + 2}" fill="none" stroke="${c}" stroke-width="1.6"/>`,
    dt: (x, y, c) => `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="none" stroke="${c}" stroke-width="1.4"/>`,
    comm: (x, y, c) => `<polygon points="${x},${y - 4} ${x + 4},${y} ${x},${y + 4} ${x - 4},${y}" fill="none" stroke="${c}" stroke-width="1.4"/>`,
  };

  function card(n) {
    const k = [n.dna, n.type, n.plus, n.rarity, (n.bonus || []).map(x => x.type).join('')].join(':');
    if (cache.has(k)) return cache.get(k);
    const r = seededRng(n.dna);
    const T = CONFIG.CARDS.types.find(t => t.id === n.type) || CONFIG.CARDS.types[0];
    const R = CONFIG.CARDS.rarities[n.rarity] || CONFIG.CARDS.rarities[0];
    const uniq = n.rarity === CONFIG.CARDS.UNIQUE, legend = n.rarity >= 4;
    const [a, b] = T.c;
    const gid = 'u' + (n.dna >>> 0).toString(36);
    let s = `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" class="nft-svg ${legend ? 'legendary' : ''}"><rect width="160" height="160" fill="${BG}"/>`;
    if (uniq) s += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4fd8"/><stop offset=".35" stop-color="#ffe14d"/><stop offset=".7" stop-color="#39ff88"/><stop offset="1" stop-color="#00e5ff"/></linearGradient></defs>`;
    // background circuit traces unique to this dna
    const traces = 10 + Math.floor(r() * 6);
    for (let i = 0; i < traces; i++) {
      const x = r() * 160, y = r() * 160, x2 = x + (r() - 0.5) * 70, y2 = y + (r() - 0.5) * 70;
      const c = r() < 0.5 ? a : b;
      s += `<polyline points="${f1(x)},${f1(y)} ${f1(x2)},${f1(y)} ${f1(x2)},${f1(y2)}" fill="none" stroke="${c}" stroke-width=".8" opacity=".22"/><circle cx="${f1(x2)}" cy="${f1(y2)}" r="1.6" fill="${c}" opacity=".45"/>`;
    }
    // rarity rings (one per rarity step) and upgrade sparks (one ring of dots per +)
    for (let k2 = 0; k2 < Math.min(n.rarity + 1, 6); k2++) s += `<circle cx="80" cy="80" r="${46 + k2 * 5.5}" fill="none" stroke="${uniq ? `url(#${gid})` : R.color}" stroke-width=".9" stroke-dasharray="${2 + k2 * 2} ${3 + k2 + Math.floor(r() * 3)}" opacity=".75"/>`;
    for (let p = 0; p < (n.plus + 1) * 5; p++) {
      const an = r() * Math.PI * 2, d = 44 + r() * 32;
      s += `<circle cx="${f1(80 + Math.cos(an) * d)}" cy="${f1(80 + Math.sin(an) * d)}" r="${f1(0.8 + r() * 1.4)}" fill="${b}"/>`;
    }
    if (legend) s += `<g class="nft-spin" style="transform-origin:80px 80px"><circle cx="80" cy="80" r="76" fill="none" stroke="${uniq ? `url(#${gid})` : a}" stroke-width="1.5" stroke-dasharray="1 7"/><circle cx="80" cy="4" r="2.5" fill="${b}"/></g>`;
    const rot = (r() - 0.5) * 16;
    s += `<g transform="rotate(${f1(rot)} 80 80)">${(SILHOUETTE[n.type] || core)(r, a, b)}</g>`;
    if (uniq) s += `<g class="nft-pulse" style="transform-origin:80px 80px"><circle cx="80" cy="80" r="42" fill="none" stroke="url(#${gid})" stroke-width="2" opacity=".8"/></g>`;
    // frame, rarity tag, + badge, bonus glyphs, serial
    s += `<rect x="1.5" y="1.5" width="157" height="157" rx="8" fill="none" stroke="${uniq ? `url(#${gid})` : R.color}" stroke-width="${uniq ? 4 : 3}" class="${legend ? 'nft-glow' : ''}"/>`;
    s += `<rect x="6" y="6" width="${n.plus ? 46 : 26}" height="15" rx="2" fill="${uniq ? `url(#${gid})` : R.color}"/><text x="${n.plus ? 29 : 19}" y="17" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="${BG}">${R.name.slice(0, uniq ? 3 : 1).toUpperCase()}${n.plus ? ' +' + n.plus : ''}</text>`;
    (n.bonus || []).forEach((bn, i) => { if (GLYPH[bn.type]) s += GLYPH[bn.type](146 - i * 12, 14, uniq ? '#ffe14d' : R.color); });
    s += `<text x="154" y="154" text-anchor="end" font-family="monospace" font-size="9" fill="${a}" opacity=".85">#0x${(n.dna >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(-6)}</text></svg>`;
    cache.set(k, s);
    if (cache.size > 800) cache.delete(cache.keys().next().value);
    return s;
  }

  // ---------- pet avatar ----------
  function pet(level, colors) {
    const k = 'pet:' + level + ':' + colors.join();
    if (cache.has(k)) return cache.get(k);
    const [a, b] = colors;
    const ant = Math.min(1 + Math.floor(level / 3), 4);
    const rings = Math.min(Math.floor(level / 2), 4);
    let s = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" class="pet-svg">`;
    for (let i = 0; i < rings; i++) s += `<ellipse class="pet-ring" style="transform-origin:100px 105px;animation-delay:${i * -1.5}s" cx="100" cy="105" rx="${78 - i * 4}" ry="${22 + i * 7}" fill="none" stroke="${i % 2 ? b : a}" stroke-width="1" stroke-dasharray="3 6" opacity=".6"/>`;
    for (let i = 0; i < ant; i++) {
      const x = 100 + (i - (ant - 1) / 2) * 22, h = 22 + (i % 2) * 10;
      s += `<line x1="${x}" y1="52" x2="${x + (x - 100) * 0.3}" y2="${52 - h}" stroke="${a}" stroke-width="2"/><circle class="pet-blink" cx="${x + (x - 100) * 0.3}" cy="${52 - h}" r="4" fill="${b}"/>`;
    }
    s += `<rect x="52" y="50" width="96" height="78" rx="${level >= 8 ? 30 : 16}" fill="#0b1320" stroke="${a}" stroke-width="3"/>`;
    s += `<rect x="64" y="66" width="72" height="34" rx="8" fill="#050b12" stroke="${b}" stroke-width="1.5"/>`;
    s += `<g class="pet-eyes"><circle cx="84" cy="83" r="7" fill="${a}"/><circle cx="116" cy="83" r="7" fill="${a}"/><circle cx="86" cy="81" r="2" fill="#fff"/><circle cx="118" cy="81" r="2" fill="#fff"/></g>`;
    s += `<rect class="pet-scan" x="64" y="66" width="72" height="3" fill="${b}" opacity="0"/>`;
    s += `<rect x="84" y="108" width="32" height="5" rx="2" fill="${b}" opacity=".8"/>`;
    const lines = Math.min(level, 8);
    for (let i = 0; i < lines; i++) s += `<line x1="${58 + i * 11}" y1="122" x2="${62 + i * 11}" y2="122" stroke="${i % 2 ? a : b}" stroke-width="2"/>`;
    s += `<rect x="72" y="128" width="56" height="26" rx="6" fill="#0b1320" stroke="${a}" stroke-width="2"/>`;
    if (level >= 5) s += `<rect x="40" y="76" width="12" height="28" rx="4" fill="${b}"/><rect x="148" y="76" width="12" height="28" rx="4" fill="${b}"/>`;
    if (level >= 12) s += `<polygon points="100,158 112,176 88,176" fill="${a}"/>`;
    s += `<text x="100" y="146" text-anchor="middle" font-family="monospace" font-size="11" fill="${a}">LV ${level}</text>`;
    s += `<g class="pet-particles">${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="${20 + i * 32}" cy="190" r="2.5" fill="${i % 2 ? a : b}" style="animation-delay:${i * 0.15}s"/>`).join('')}</g>`;
    s += `</svg>`;
    cache.set(k, s);
    return s;
  }

  // ---------- guild emblem ----------
  function emblem(seed, size) {
    const k = 'em:' + seed + ':' + size;
    if (cache.has(k)) return cache.get(k);
    const r = seededRng(seed);
    const pal = CONFIG.CARDS.types[Math.floor(r() * CONFIG.CARDS.types.length)].c;
    const a = pal[0], b = pal[1];
    let s = `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><path d="M32 3 L58 12 L55 38 Q50 54 32 61 Q14 54 9 38 L6 12 Z" fill="#0b1320" stroke="${a}" stroke-width="3"/>`;
    const g = Math.floor(r() * 5);
    if (g === 0) s += `<polygon points="32,16 44,40 20,40" fill="none" stroke="${b}" stroke-width="3"/>`;
    else if (g === 1) s += `<circle cx="32" cy="30" r="10" fill="none" stroke="${b}" stroke-width="3"/><circle cx="32" cy="30" r="3" fill="${a}"/>`;
    else if (g === 2) s += `<path d="M20 20 L44 44 M44 20 L20 44" stroke="${b}" stroke-width="4"/>`;
    else if (g === 3) s += `<rect x="21" y="19" width="22" height="22" fill="none" stroke="${b}" stroke-width="3" transform="rotate(45 32 30)"/>`;
    else s += `<path d="M22 40 L28 18 L34 34 L40 22 L44 40" fill="none" stroke="${b}" stroke-width="3"/>`;
    for (let i = 0; i < 3; i++) if (r() < 0.6) s += `<circle cx="${20 + i * 12}" cy="50" r="1.8" fill="${a}"/>`;
    s += '</svg>';
    cache.set(k, s);
    return s;
  }

  // ---------- badges & icons ----------
  const BADGES = {
    badge_none: '',
    badge_chip: '<rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/><path d="M2 8h3M2 12h3M2 16h3M19 8h3M19 12h3M19 16h3" stroke="currentColor"/>',
    badge_bolt: '<polygon points="13,2 5,14 11,14 9,22 19,9 13,9" fill="currentColor"/>',
    badge_eye: '<ellipse cx="12" cy="12" rx="10" ry="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    badge_crown: '<polygon points="3,18 5,7 9,12 12,5 15,12 19,7 21,18" fill="none" stroke="currentColor" stroke-width="2"/>',
    badge_star: '<polygon points="12,2 14.5,9 22,9 16,13.5 18,21 12,16.5 6,21 8,13.5 2,9 9.5,9" fill="currentColor"/>',
  };
  function badge(id, size) { const p = BADGES[id]; return p ? `<svg viewBox="0 0 24 24" width="${size || 16}" height="${size || 16}" class="badge">${p}</svg>` : ''; }
  const ICONS = {
    cr: '<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 9a4 4 0 1 0 0 6" fill="none" stroke="currentColor" stroke-width="2"/>',
    dt: '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8v8M9 8h3a4 4 0 0 1 0 8H9" fill="none" stroke="currentColor" stroke-width="2"/>',
    land: '<path d="M3 9l9-5 9 5-9 5z M3 15l9 5 9-5" fill="none" stroke="currentColor" stroke-width="2"/>',
    shard: '<polygon points="12,2 18,10 12,22 6,10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h12" stroke="currentColor" stroke-width="1.5"/>',
    gv: '<rect x="3" y="6" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 6V4h10v2" stroke="currentColor" stroke-width="2" fill="none"/>',
    rating: '<polygon points="12,3 14.5,9 21,9.5 16,14 17.5,21 12,17.5 6.5,21 8,14 3,9.5 9.5,9" fill="none" stroke="currentColor" stroke-width="2"/>',
    math: '<path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2.5"/>',
    trivia: '<path d="M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 2.2M12 18v.5" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    speed: '<polygon points="13,2 5,14 11,14 9,22 19,9 13,9" fill="none" stroke="currentColor" stroke-width="2"/>',
    arena: '<path d="M4 20L14 10M10 4l10 10M15 3l6 6-3 3-6-6z" fill="none" stroke="currentColor" stroke-width="2"/>',
    guild: '<path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6z" fill="none" stroke="currentColor" stroke-width="2"/>',
    market: '<path d="M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="2"/>',
    alert: '<path d="M12 3l10 18H2z M12 10v5 M12 18v.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    pet: '<rect x="5" y="7" width="14" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="12" r="1.5" fill="currentColor"/><circle cx="14.5" cy="12" r="1.5" fill="currentColor"/><path d="M12 7V3" stroke="currentColor" stroke-width="2"/>',
    nft: '<rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="12,7 16,12 12,17 8,12" fill="currentColor"/>',
    ai: '<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" stroke-width="2"/>',
    season: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" fill="none"/>',
    log: '<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2"/>',
  };
  function icon(name, size) { return `<svg viewBox="0 0 24 24" width="${size || 16}" height="${size || 16}" class="ico" aria-hidden="true">${ICONS[name] || ''}</svg>`; }

  // ---------- land map ----------
  function landMap(parts, total) {
    // parts: [{value, color, label}] ; tiles filled in a spiral from the centre, so expansions add an outer ring
    const unit = Math.max(1, total / 400);
    const tiles = Math.ceil(total / unit);
    const n = Math.ceil(Math.sqrt(tiles));
    const order = spiral(n).slice(0, tiles);
    const colors = [];
    for (const p of parts) { const c = Math.max(p.value > 0 ? (p.min || 0) : 0, Math.round(p.value / unit)); for (let i = 0; i < c; i++) colors.push(p.color); }
    const cell = 10, pad = 1;
    let s = `<svg viewBox="0 0 ${n * cell} ${n * cell}" xmlns="http://www.w3.org/2000/svg" class="landmap">`;
    order.forEach(([x, y], i) => {
      const c = colors[i] || '#132033';
      s += `<rect x="${x * cell + pad}" y="${y * cell + pad}" width="${cell - pad * 2}" height="${cell - pad * 2}" rx="1.5" fill="${c}"/>`;
    });
    return s + '</svg>';
  }
  function spiral(n) {
    const out = [], c = Math.floor((n - 1) / 2);
    let x = c, y = c, dx = 1, dy = 0, len = 1;
    const seen = new Set();
    const push = () => { if (x >= 0 && y >= 0 && x < n && y < n && !seen.has(x + ',' + y)) { seen.add(x + ',' + y); out.push([x, y]); } };
    push();
    while (out.length < n * n) {
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < len; i++) { x += dx; y += dy; push(); }
        [dx, dy] = [-dy, dx];
      }
      len++;
      if (len > n * 2 + 2) break;
    }
    return out;
  }

  // ---------- line chart ----------
  function lineChart(series, opts) {
    // series: [{points:[[x,y]...], color, label, fill}]
    const W = 320, H = opts.h || 120, P = { l: 38, r: 8, t: 8, b: 16 };
    let xs = [], ys = [];
    series.forEach(sr => sr.points.forEach(p => { xs.push(p[0]); ys.push(p[1]); }));
    if (xs.length < 2) return `<div class="empty">${opts.empty || 'Not enough data yet'}</div>`;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = opts.zero ? 0 : Math.min(...ys), y1 = Math.max(...ys) * 1.05 || 1;
    const sx = x => P.l + (x - x0) / (x1 - x0 || 1) * (W - P.l - P.r);
    const sy = y => H - P.b - (y - y0) / (y1 - y0 || 1) * (H - P.t - P.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" xmlns="http://www.w3.org/2000/svg">`;
    for (let i = 0; i <= 3; i++) {
      const v = y0 + (y1 - y0) * i / 3, y = sy(v);
      s += `<line x1="${P.l}" x2="${W - P.r}" y1="${f1(y)}" y2="${f1(y)}" class="grid"/><text x="${P.l - 4}" y="${f1(y + 3)}" text-anchor="end" class="axis">${fmt(v)}</text>`;
    }
    for (const sr of series) {
      if (sr.points.length < 1) continue;
      const d = sr.points.map((p, i) => (i ? 'L' : 'M') + f1(sx(p[0])) + ' ' + f1(sy(p[1]))).join(' ');
      if (sr.fill) s += `<path d="${d} L${f1(sx(sr.points[sr.points.length - 1][0]))} ${H - P.b} L${f1(sx(sr.points[0][0]))} ${H - P.b} Z" fill="${sr.color}" opacity=".12"/>`;
      s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round"/>`;
      if (sr.dots) sr.points.forEach(p => { s += `<circle cx="${f1(sx(p[0]))}" cy="${f1(sy(p[1]))}" r="2" fill="${sr.color}"/>`; });
    }
    return s + '</svg>';
  }

  return { card, nft: card, pet, emblem, badge, icon, landMap, lineChart, cacheSize: () => cache.size, clear: () => cache.clear() };
})();
