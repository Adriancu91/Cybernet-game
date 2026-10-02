'use strict';
/* ============================================================
   TERR_UI — fila „Teritoriu”: harta rețelei, panoul sectorului,
   bonusurile, cartierele, activitatea boților și ecranele de duel.
   Se încarcă după ui.js (folosește btn, ic, cd, esc, HANDLERS...).
   ============================================================ */

function terrOwnerTag(i) {
  const o = S.territory.owner[i];
  if (o === 'p') return i === CONFIG.TERRITORY.home ? '⌂' : 'TU';
  const info = terrOwnerInfo(i);
  if (info.kind === 'neutral') return '·';
  return info.tag || info.name.slice(0, 3).toUpperCase();
}
function terrDefaultSel() {
  const atk = S.duel.attacks[0];
  if (atk) return atk.idx;
  const easy = terrMap().filter(c => terrAttackable(c.i)).sort((a, b) => a.tier - b.tier || ((S.territory.cd[a.i] || 0) - (S.territory.cd[b.i] || 0)))[0];
  return easy ? easy.i : CONFIG.TERRITORY.home;
}
function terrStrengthChip(tierIdx) {
  const t = CONFIG.TERRITORY.tiers[tierIdx];
  return `<span class="tchip" style="--tc:${t.color}">${t.name}</span>`;
}

// ---------- harta ----------
function htmlTerrMap() {
  const now = performance.now(), sel = UI.terrSel, fl = UI.terrFlash && UI.terrFlash.until > now ? UI.terrFlash.i : -1;
  const cells = terrMap().map(c => {
    const i = c.i, o = S.territory.owner[i], D = terrDistrict(c.district);
    const mine = o === 'p', atk = terrAttackOn(i), able = !mine && terrAttackable(i);
    const cdLeft = (S.territory.cd[i] || 0) - S.time;
    let cls = 'tcell', icon = '';
    if (mine) { cls += ' mine'; if (i === CONFIG.TERRITORY.home) cls += ' home'; }
    else if (able) cls += ' able';
    else cls += ' far';
    if (!mine && !o) cls += ' neutral';
    if (atk) { cls += ' under'; icon = '⚠'; }
    else if (able && cdLeft > 0) { cls += ' cd'; icon = '⏳'; }
    if (i === sel) cls += ' sel';
    if (i === fl) cls += ' captured';
    const who = terrOwnerInfo(i);
    const title = `${c.label} · ${D.name} · ${mine ? 'al tău' : who.name}${atk ? ' · ATACAT' : ''}`;
    return `<button type="button" class="${cls}" style="--dc:${D.color}" data-act="terrSel" data-args="${i}" title="${esc(title)}" aria-label="${esc(title)}"><span class="tc-tag">${esc(terrOwnerTag(i))}</span>${icon ? `<span class="tc-ico">${icon}</span>` : ''}</button>`;
  }).join('');
  return `<div class="tmap" style="--n:${CONFIG.TERRITORY.size}">${cells}</div>
    <div class="legend tlegend"><span><i class="lg mine"></i>Tu</span><span><i class="lg able"></i>Poți ataca</span><span><i class="lg far"></i>Prea departe</span><span><i class="lg under"></i>Atacat</span><span>⏳ Revanșă</span></div>`;
}

// ---------- panoul sectorului selectat ----------
function htmlTerrSector(i) {
  const c = terrCell(i), D = terrDistrict(c.district), tier = CONFIG.TERRITORY.tiers[c.tier];
  const mine = isPlayerSector(i), atk = terrAttackOn(i), info = terrOwnerInfo(i);
  const head = `<div class="row between"><h3 style="margin:0">Sectorul ${c.label}</h3>${terrStrengthChip(c.tier)}</div>
    <div class="small" style="margin:2px 0 8px"><span class="tdist" style="--dc:${D.color}">${esc(D.name)}</span></div>`;
  if (mine && atk) {
    const a = terrOwnerInfo(i, atk.by), why = whyDuel(i);
    return head + `<div class="tattack small">⚠ <b>${esc(a.name)}</b>${a.tag ? ` <span class="gtag">[${esc(a.tag)}]</span>` : ''} vrea acest sector. Câștigă duelul în ${cd(atk.until)} sau îl pierzi.</div>
      <div class="kv small" style="margin:8px 0"><span>Bonus la apărare</span><b class="cr">+${fmt(CONFIG.TERRITORY.attack.defendCR * CONFIG.LEAGUES[S.player.league].reward * crMultiplier())} CR · +${CONFIG.TERRITORY.attack.defendDT} DT</b><span>Dacă pierzi duelul</span><b>poți reîncerca după ${fmtTime(CONFIG.TERRITORY.cooldownMs)}</b></div>
      ${btn(`⚔️ Apără sectorul — duel cu ${esc(a.name)}`, 'terrDuel', i, why, 'block primary big')}`;
  }
  if (mine) {
    return head + `<div class="small">${i === CONFIG.TERRITORY.home ? '⌂ <b class="good">Baza ta.</b> Nu poate fi atacată niciodată.' : '<b class="good">Sector al tău.</b>'}</div>
      <div class="tiny dim" style="margin-top:6px">Fiecare sector îți dă ${CONFIG.TERRITORY.suPerSector} SU de teren (pentru standuri, Sediul breslei și standul de piață) și +${CONFIG.TERRITORY.crPctPerSector}% CR din toate jocurile.</div>`;
  }
  const opp = terrOpponent(i), rw = terrDuelReward(i), why = whyDuel(i);
  const owner = info.kind === 'neutral' ? '<span class="dim">Neutru — păzit de o sentinelă</span>' : `<b>${esc(info.name)}</b>${info.tag ? ` <span class="gtag">[${esc(info.tag)}]</span>` : ''}${info.guild ? ` <span class="tiny dim">${esc(info.guild.name)}</span>` : ''}`;
  return head + `<div class="kv small"><span>Stăpân</span><span>${owner}</span>
      <span>Adversar</span><b>~${Math.round(opp.acc * 100)}% corecte · ${Math.round(tier.tMin / 1000)}–${Math.round(tier.tMax / 1000)} s</b>
      <span>Întrebări</span><b>${CONFIG.TERRITORY.questions} · dificultate ${tier.diff[0]}–${tier.diff[1]}</b>
      <span>Dacă câștigi</span><b><span class="cr">+${fmt(rw.cr)} CR</span> · <span class="dtc">+${rw.dt} DT</span>${rw.explore ? ' · <span class="warn">explorare bonus</span>' : ''}</b></div>
    <div class="tiny dim" style="margin:6px 0 8px">Câștigă cine are mai multe răspunsuri corecte; la egalitate, cine a fost mai rapid. Duelul contează ca un joc.</div>
    ${btn(`⚔️ Duel cu ${esc(opp.name)}`, 'terrDuel', i, why, 'block primary big')}`;
}

// ---------- bonusuri ----------
function htmlTerrBonuses(h) {
  const T = CONFIG.TERRITORY, n = h.sectors;
  // doar bonusurile active: lista crește odată cu teritoriul
  const line = (on, icon, text, sub) => on ? `<li class="on"><span class="bi">${icon}</span><span>${text}${sub ? ` <span class="tiny dim">${sub}</span>` : ''}</span></li>` : '';
  const now = [
    line(h.crPct > 0, '◈', `+${h.crPct}% CR din toate jocurile`, `(${T.crPctPerSector}% pe sector, max. ${T.crPctCap}%)`),
    line(h.askExtra > 0, '🤖', `+${h.askExtra} „Întreabă AI-ul” pe joc`),
    line(h.accBonus > 0, '🎯', `+${Math.round(h.accBonus * 100)}% precizie pentru sugestia AI-ului`, `(max. ${Math.round(T.accCap * 100)}%)`),
    line(h.timeBonusSec > 0, '⏱', `+${h.timeBonusSec} s la fiecare întrebare`),
    line(h.fiftyExtra > 0, '✂', `+${h.fiftyExtra} 50/50 pe joc`, '(cartiere întregi)'),
    line(h.dtPct > 0, '▣', `+${h.dtPct}% flux DT`, '(cartiere întregi)'),
    line(true, '⬢', `${fmt(territoryLand())} SU de teren`, `(liber ${fmt(landFree())} SU)`),
  ].join('');
  const nx = h.next;
  const prev = T.milestones.filter(m => m.n <= n).reduce((a, m) => Math.max(a, m.n), 1);
  const next = nx ? `<div class="tnext"><div class="row between small"><span>La <b>${nx.n} sectoare</b>: <b class="good">${terrMilestoneText(nx)}</b></span><span class="dim">${n}/${nx.n}</span></div>
    <div class="xp" style="margin-top:5px"><i style="width:${clamp((n - prev) / (nx.n - prev), 0, 1) * 100}%"></i></div></div>` : '<div class="tnext good small">Ai toată harta — toate pragurile sunt atinse!</div>';
  const ladder = T.milestones.map(m => `<span class="tstep ${n >= m.n ? 'on' : nx === m ? 'nx' : ''}" title="${esc(terrMilestoneText(m))}">${n >= m.n ? '✓' : ''}${m.n}</span>`).join('');
  return `<div class="card"><h3>Bonusurile teritoriului</h3>
    <div class="tiny dim" style="margin-bottom:6px">AI-ul tău te ajută mai mult în Quiz Rapid, Supraviețuire și dueluri.</div>
    ${next}<ul class="tbonus">${now}</ul><div class="tladder">${ladder}</div></div>`;
}
function htmlTerrDistricts(h) {
  const T = CONFIG.TERRITORY;
  const rows = h.districts.map(d => `<div class="tdrow ${d.full ? 'full' : ''}"><span class="tdist" style="--dc:${d.color}">${esc(d.name)}</span>${terrStrengthChip(d.tier)}
    <span class="tdbar"><i style="width:${(d.owned / d.total * 100).toFixed(0)}%;background:${d.color}"></i></span><b class="small">${d.owned}/${d.total}</b>${d.full ? '<span class="good tiny">✓ bonus</span>' : ''}</div>`).join('');
  return `<div class="card"><h3>Cartiere</h3><div class="tiny dim" style="margin-bottom:6px">Un cartier întreg dă <b>+${T.district.fifty} 50/50</b> pe joc (max. +${T.district.fiftyCap}) și <b>+${T.district.dtPct}% flux DT</b>. Spre centru adversarii sunt mai puternici, dar plătesc mai mult.</div>${rows}</div>`;
}
function htmlTerrFeed() {
  const f = (S.territory.feed || []).slice().reverse();
  if (!f.length) return '';
  return `<div class="card"><h4>Activitate în rețea</h4>${f.map(e => `<div class="tiny tfeed"><span class="mute">${gameClock(e.t)}</span> ${esc(e.text)}</div>`).join('')}</div>`;
}

// ---------- fila întreagă ----------
function htmlLand() {
  if (!terrReady()) return '<div class="empty">Harta se încarcă…</div>';
  if (UI.terrSel === undefined || UI.terrSel === null || !terrMap()[UI.terrSel]) UI.terrSel = terrDefaultSel();
  const h = territoryHelp(), du = S.duel;
  const alerts = du.attacks.map(a => {
    const o = terrOwnerInfo(a.idx, a.by);
    return `<div class="talert"><span class="blink">⚠</span><div class="grow small"><b>${esc(o.name)}</b> îți atacă sectorul <b>${terrCell(a.idx).label}</b> — apără-l în ${cd(a.until)}</div>${btn('⚔️ Apără', 'terrDefend', a.idx, whyDuel(a.idx), 'sm danger')}</div>`;
  }).join('');
  return `<div class="tintro">⚔️ Câștigă <b>dueluri de quiz</b> ca să cucerești sectoarele vecine. Mai mult teritoriu = mai mult CR și un AI care te ajută mai mult.</div>
  ${alerts}
  <div class="tgrid">
    <div class="card tmapcard"><div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Harta rețelei</h3><span class="small">Sectoare <b class="good">${h.sectors}</b>/${terrMap().length} · Dueluri <b class="good">${du.wins}</b>–<b class="bad">${du.losses}</b></span></div>
      ${htmlTerrMap()}</div>
    <div class="card tside">${htmlTerrSector(UI.terrSel)}</div>
  </div>
  <div class="cards" style="margin-top:10px">${htmlTerrBonuses(h)}${htmlTerrDistricts(h)}</div>
  <div style="margin-top:10px">${htmlTerrFeed()}</div>`;
}

// ---------- duelul în fereastra Quiz Rapid ----------
function htmlDuelBits(m) {
  const d = m.duel, o = d.opp, reveal = m.phase === 'reveal';
  const label = terrCell(d.idx).label;
  const oppDone = d.plan && d.plan.done, oppLast = d.oppHist[d.oppHist.length - 1];
  const lead = m.correct > d.oppCorrect ? 'me' : m.correct < d.oppCorrect ? 'them' : '';
  const dots = (hist, n) => Array.from({ length: n }, (_, i) => `<i class="${i < hist.length ? (hist[i] ? 'ok' : 'bad') : ''}"></i>`).join('');
  const st = oppDone ? (oppLast ? '<span class="good">✓ a răspuns corect</span>' : '<span class="bad">✗ a greșit</span>') : '<span class="dim tthink">gândește…</span>';
  return {
    title: `⚔️ ${d.defense ? 'Apărare' : 'Duel'} · ${label}`,
    vs: `<div class="duel-vs ${lead}"><small>TU — ${esc(o.name).toUpperCase()}</small><b>${m.correct}<span>–</span>${d.oppCorrect}</b></div>`,
    opp: `<div class="duel-opp"><b>${esc(o.name)}</b>${o.tag ? ` <span class="gtag tiny">[${esc(o.tag)}]</span>` : ''}<div class="tiny">${st}</div><div class="qdots">${dots(d.oppHist, m.n)}</div></div>`,
    oppFb: reveal && oppDone ? `<span class="dim">· ${esc(o.name)}: ${oppLast ? '<span class="good">✓</span>' : '<span class="bad">✗</span>'}</span>` : '',
    tip: `${terrStrengthChip(o.tier)} Câștigă cine are mai multe răspunsuri corecte; la egalitate, cel mai rapid. ${territoryHelp().askExtra + territoryHelp().timeBonusSec ? '<span class="good">Teritoriul tău îți dă ajutor în plus.</span>' : ''}`,
  };
}
function htmlDuelEnd(m) {
  const r = m.result || {}, o = r.opp || m.duel.opp, h = territoryHelp();
  let big, cls;
  if (!r.answered) { big = 'DUEL ANULAT'; cls = 'dim'; }
  else if (r.win && r.defense) { big = 'APĂRARE REUȘITĂ!'; cls = 'good'; }
  else if (r.win) { big = 'SECTOR CUCERIT!'; cls = 'good'; }
  else { big = r.defense ? 'APĂRARE PIERDUTĂ' : 'DUEL PIERDUT'; cls = 'bad'; }
  const rewards = [];
  if (r.cr) rewards.push(`<span class="cr">+${fmt(r.cr)} CR</span>`);
  if (r.dt) rewards.push(`<span class="dtc">+${r.dt} DT</span>`);
  if (r.tax) rewards.push(`<span class="gvc">seiful breslei +${fmt(r.tax)} GV</span>`);
  const nx = h.next;
  return `<div class="quick-end center duel-end">
    <div class="duel-big ${cls} ${r.win && !r.defense ? 'capture' : ''}">${r.win && !r.defense ? `<span class="cap-hex">${esc(r.label)}</span>` : ''}${big}</div>
    ${r.answered ? `<div class="duel-final"><span>Tu</span><b class="${r.win ? 'good' : ''}">${r.correct}</b><span class="dim">–</span><b class="${r.win ? '' : 'bad'}">${r.oppCorrect}</b><span>${esc(o.name)}</span></div>
    ${r.tie ? `<div class="tiny dim">Egalitate la răspunsuri — timp total: tu ${(r.myTime / 1000).toFixed(1).replace('.', ',')} s, ${esc(o.name)} ${(r.oppTime / 1000).toFixed(1).replace('.', ',')} s</div>` : ''}
    ${r.abandoned ? '<div class="tiny warn">Ai renunțat — duelul se socotește pierdut.</div>' : ''}
    <div class="end-rewards">${rewards.join(' · ') || '<span class="dim">fără recompensă</span>'}</div>` : '<div class="small dim">Nu ai răspuns la nicio întrebare — nu se pune la socoteală.</div>'}
    ${r.explore ? `<div class="texplore">◆ Explorare sector: <b>${esc(r.explore.text)}</b></div>` : ''}
    ${r.explore && r.explore.card ? `<div style="margin:10px auto 0;max-width:150px">${nftCard(r.explore.card)}</div>` : ''}
    ${r.win && !r.defense ? `<div class="small" style="margin-top:8px">Ai acum <b class="good">${r.sectors} sectoare</b>${nx ? ` — la ${nx.n}: <b>${terrMilestoneText(nx)}</b>` : ''}.</div>` : ''}
    ${!r.win && r.answered ? `<div class="tiny dim" style="margin-top:6px">Revanșă pentru ${esc(r.label)} în ${fmtTime(CONFIG.TERRITORY.cooldownMs)}. Între timp poți ataca alt sector vecin.</div>` : ''}
    ${r.unlocked && r.unlocked.length ? `<div class="col" style="margin-top:12px;text-align:left">${htmlUnlocked(r.unlocked)}</div>` : ''}
    <div class="row end-btns">${btn('🗺 Înapoi la hartă', 'duelBack', undefined, '', 'primary big')}</div>
  </div>`;
}

// ---------- acțiuni ----------
function terrOpenTab(i) {
  UI.centerTab = 'land'; UI.view = 'center';
  if (i !== undefined && i !== null) UI.terrSel = i;
  if (typeof seenFeatureTab === 'function') seenFeatureTab('land');
}
Object.assign(HANDLERS, {
  terrSel(i) { UI.terrSel = Number(i); },
  terrDuel(i) {
    QUICK = QUICK && QUICK.done ? null : QUICK;
    const r = doAct(() => actStartDuel(Number(i), performance.now()), true);
    if (r && r.ok) { UI.terrSel = Number(i); openQuick(); setPetState('thinking', 1200); }
  },
  terrDefend(i) { terrOpenTab(i); HANDLERS.terrDuel(i); },
  duelBack() {
    const r = QUICK && QUICK.result;
    if (r && r.win && !r.defense) UI.terrFlash = { i: r.idx, until: performance.now() + 2600 };
    if (r) UI.terrSel = r.idx;
    QUICK = QUICK && QUICK.done ? null : QUICK;
    closeModal();
    terrOpenTab();
    renderAll();
    setTimeout(() => { const el = document.querySelector('.tmapcard'); if (el && window.innerWidth < 768) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 70), behavior: 'smooth' }); }, 30);
  },
});
