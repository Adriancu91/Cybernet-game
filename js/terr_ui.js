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
    const who = terrOwnerInfo(i), bld = incomeAt(i), rich = terrIsRich(i);
    let tag = esc(terrOwnerTag(i)), extra = '';
    if (bld && mine) {
      tag = `<span class="tc-bld">${incomeType(bld.type).icon}</span>`;
      if (!atk) { const ex = terrExposed(i); cls += ex ? ' exposed' : ' safe'; icon = ex ? '⚠' : '🛡'; }
    } else if (bld) extra += `<span class="tc-off" title="clădire inactivă">${incomeType(bld.type).icon}</span>`;
    if (rich) extra += '<span class="tc-rich">💎</span>';
    const title = `${c.label} · ${D.name} · ${mine ? 'al tău' : who.name}${rich ? ' · sector bogat ×2' : ''}${bld ? ' · ' + incomeType(bld.type).name + (mine ? (terrExposed(i) ? ' (expusă)' : ' (protejată)') : ' (inactivă)') : ''}${atk ? ' · ATACAT' : ''}`;
    return `<button type="button" class="${cls}" style="--dc:${D.color}" data-act="terrSel" data-args="${i}" title="${esc(title)}" aria-label="${esc(title)}"><span class="tc-tag">${tag}</span>${icon ? `<span class="tc-ico">${icon}</span>` : ''}${extra}</button>`;
  }).join('');
  return `<div class="tmap" style="--n:${CONFIG.TERRITORY.size}">${cells}</div>
    <div class="legend tlegend"><span><i class="lg mine"></i>Tu</span><span><i class="lg able"></i>Poți ataca</span><span><i class="lg far"></i>Prea departe</span><span><i class="lg under"></i>Atacat</span><span>⏳ Revanșă</span><span>💎 Bogat (×2)</span><span>🛡 Protejat</span><span class="warn">⚠ La margine</span></div>`;
}

// ---------- panoul sectorului selectat ----------
function htmlTerrSector(i) {
  const c = terrCell(i), D = terrDistrict(c.district), tier = CONFIG.TERRITORY.tiers[c.tier];
  const mine = isPlayerSector(i), atk = terrAttackOn(i), info = terrOwnerInfo(i);
  const head = `<div class="row between"><h3 style="margin:0">Sectorul ${c.label}</h3>${terrStrengthChip(c.tier)}</div>
    <div class="small" style="margin:2px 0 8px"><span class="tdist" style="--dc:${D.color}">${esc(D.name)}</span></div>`;
  if (mine && atk) {
    const a = terrOwnerInfo(i, atk.by), why = whyDuel(i);
    return head + `<div class="tattack small">⚠ <b>${esc(a.name)}</b>${a.tag ? ` <span class="gtag">[${esc(a.tag)}]</span>` : ''} vrea acest sector${incomeAt(i) ? ` și clădirea ta <b>${incomeType(incomeAt(i).type).name}</b>` : ''}. Câștigă duelul în ${cd(atk.until)} sau îl pierzi${incomeAt(i) ? ' (clădirea se oprește până îl recucerești)' : ''}.</div>
      <div class="kv small" style="margin:8px 0"><span>Bonus la apărare</span><b class="cr">+${fmt(CONFIG.TERRITORY.attack.defendCR * CONFIG.LEAGUES[S.player.league].reward * crMultiplier())} CR · +${CONFIG.TERRITORY.attack.defendDT} DT</b><span>Dacă pierzi duelul</span><b>poți reîncerca după ${fmtTime(CONFIG.TERRITORY.cooldownMs)}</b></div>
      ${btn(`⚔️ Apără sectorul — duel cu ${esc(a.name)}`, 'terrDuel', i, why, 'block primary big')}`;
  }
  const richNote = terrIsRich(i) ? `<div class="trich small">💎 <b>Sector bogat</b> — o clădire de venit produce aici ×${incomeCfg().richMult}.</div>` : '';
  if (mine) {
    const exposed = terrExposed(i);
    return head + richNote + `<div class="small">${i === CONFIG.TERRITORY.home ? '⌂ <b class="good">Baza ta.</b> Nu poate fi atacată niciodată.' : exposed ? '<b class="warn">⚠ La margine</b> — vecin cu sectoare străine, poate fi atacat.' : '<b class="good">🛡 În interior</b> — înconjurat de sectoarele tale (sau de marginea hărții), nu poate fi atacat.'}</div>
      ${htmlIncomeSector(i)}
      <div class="tiny dim" style="margin-top:8px">Fiecare sector îți dă ${CONFIG.TERRITORY.suPerSector} SU de teren (pentru standuri, Sediul breslei și standul de piață) și +${CONFIG.TERRITORY.crPctPerSector}% CR din toate jocurile.</div>`;
  }
  const lostB = incomeAt(i);
  const lostNote = lostB ? `<div class="toff small">💤 Clădirea ta <b>${incomeType(lostB.type).name}</b> e <b>inactivă</b> aici. Recucerește sectorul ca s-o repornești.</div>` : '';
  const opp = terrOpponent(i), rw = terrDuelReward(i), why = whyDuel(i);
  const owner = info.kind === 'neutral' ? '<span class="dim">Neutru — păzit de o sentinelă</span>' : `<b>${esc(info.name)}</b>${info.tag ? ` <span class="gtag">[${esc(info.tag)}]</span>` : ''}${info.guild ? ` <span class="tiny dim">${esc(info.guild.name)}</span>` : ''}`;
  return head + richNote + lostNote + `<div class="kv small"><span>Stăpân</span><span>${owner}</span>
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
    const bld = incomeAt(a.idx);
    return `<div class="talert"><span class="blink">⚠</span><div class="grow small"><b>${esc(o.name)}</b> îți atacă sectorul <b>${terrCell(a.idx).label}</b>${bld ? ` — atacă clădirea ta: <b>${incomeType(bld.type).icon} ${incomeType(bld.type).name}</b>` : ''} — apără-l în ${cd(a.until)}</div>${btn('⚔️ Apără', 'terrDefend', a.idx, whyDuel(a.idx), 'sm danger')}</div>`;
  }).join('');
  return `<div class="tintro">⚔️ Câștigă <b>dueluri de quiz</b> ca să cucerești sectoarele vecine. Mai mult teritoriu = mai mult CR și un AI care te ajută mai mult.</div>
  ${alerts}
  <div class="tgrid">
    <div class="card tmapcard"><div class="row between" style="margin-bottom:8px"><h3 style="margin:0">Harta rețelei</h3><span class="small">Sectoare <b class="good">${h.sectors}</b>/${terrMap().length} · Dueluri <b class="good">${du.wins}</b>–<b class="bad">${du.losses}</b></span></div>
      ${htmlTerrMap()}</div>
    <div class="card tside">${htmlTerrSector(UI.terrSel)}</div>
  </div>
  <div style="margin-top:10px">${htmlIncomeCard()}</div>
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

// ---------- clădiri de venit ----------
function incRateText(res, v) { return `+${fmt(v)} ${incomeResName(res)}/h`; }
function htmlIncomeSector(i) {
  const I = incomeCfg(), b = incomeAt(i), rich = terrIsRich(i), exposed = terrExposed(i);
  if (b) {
    const T = incomeType(b.type), nx = T.levels[b.level + 1];
    return `<div class="tbld"><div class="row between"><b>${T.icon} ${T.name} <span class="dim">· nivel ${b.level + 1}/${T.levels.length}</span></b><span class="${T.res === 'cr' ? 'cr' : T.res === 'dt' ? 'dtc' : 'shardc'}">${incRateText(T.res, incomeRate(b))}</span></div>
      <div class="tiny ${exposed ? 'warn' : 'good'}" style="margin:4px 0 8px">${exposed ? '⚠ Expusă: dacă pierzi sectorul, clădirea se oprește. Mut-o în interior ca s-o protejezi.' : '🛡 Protejată: sectorul nu poate fi atacat.'}${b.made ? ` <span class="dim">· a produs ${fmt(b.made)} ${incomeResName(T.res)}</span>` : ''}</div>
      <div class="row">${nx ? btn(`Nivel ${b.level + 2}: ${incRateText(T.res, nx.rate * (rich ? I.richMult : 1))} <span class="cost">${fmt(nx.cost)} CR</span>`, 'incUpgrade', b.id, whyUpgradeIncome(b.id), 'sm primary') : '<span class="good small">NIVEL MAXIM</span>'}
      ${btn(`Mută <span class="cost">${fmt(incomeMoveFee(b))} CR</span>`, 'incMove', b.id, '', 'sm')}${btn(`Demontează <span class="cost">+${fmt(incomeRefund(b))} CR</span>`, 'incDismantle', b.id, '', 'sm danger')}</div></div>`;
  }
  const mv = UI.incomeMove && incomeList().find(x => x.id === UI.incomeMove);
  if (mv) {
    return `<div class="tbld"><div class="small">Muți <b>${incomeType(mv.type).icon} ${incomeType(mv.type).name}</b> de pe ${terrCell(mv.idx).label}.</div>
      ${exposed ? '<div class="tiny warn" style="margin:4px 0">⚠ Atenție: e la margine, poate fi atacat.</div>' : '<div class="tiny good" style="margin:4px 0">🛡 Aici e protejată.</div>'}
      <div class="row">${btn(`Mută aici <span class="cost">${fmt(incomeMoveFee(mv))} CR</span>`, 'incMoveHere', i, whyMoveIncome(mv.id, i), 'sm primary')}${btn('Anulează', 'incMoveCancel', undefined, '', 'sm')}</div></div>`;
  }
  const used = incomeList().length, slots = incomeSlots(), nxs = incomeNextSlotAt();
  const opts = I.types.map(T => btn(`${T.icon} ${T.name} <span class="cost">${fmt(T.levels[0].cost)} CR · ${incRateText(T.res, T.levels[0].rate * (rich ? I.richMult : 1))}</span>`, 'incBuild', { i, type: T.id }, whyBuildIncome(i, T.id), 'block sm')).join('');
  return `<div class="tbld"><div class="row between"><b class="small">Construiește o clădire de venit</b><span class="tiny dim">locuri ${used}/${slots}${nxs ? ` · următorul la ${nxs} sectoare` : ''}</span></div>
    ${exposed ? '<div class="tiny warn" style="margin:4px 0">⚠ Atenție: e la margine, poate fi atacat. Mai sigur: un sector din interior.</div>' : '<div class="tiny good" style="margin:4px 0">🛡 Sector protejat — loc bun pentru o clădire.</div>'}
    <div class="col tbld-opts">${opts}</div></div>`;
}
function htmlIncomeCard() {
  const I = incomeCfg(), tot = incomeTotals(), list = incomeList(), slots = incomeSlots(), nxs = incomeNextSlotAt();
  const parts = [];
  if (tot.cr) parts.push(`<span class="cr">+${fmt(tot.cr)} CR/h</span>`);
  if (tot.dt) parts.push(`<span class="dtc">+${fmt(tot.dt)} DT/h</span>`);
  if (tot.shards) parts.push(`<span class="shardc">+${fmt(tot.shards)} fragmente/h</span>`);
  const rows = list.map(b => {
    const T = incomeType(b.type), act = incomeActive(b), ex = act && terrExposed(b.idx);
    const st = !act ? '<span class="tst off">💤 inactivă</span>' : ex ? '<span class="tst ex">⚠ expusă</span>' : '<span class="tst ok">🛡 protejată</span>';
    return `<button type="button" class="tbrow" data-act="terrSel" data-args="${b.idx}"><span>${T.icon}</span><span class="tbname">${T.name} <span class="dim">nv ${b.level + 1} · ${terrCell(b.idx).label}${terrIsRich(b.idx) ? ' 💎' : ''}</span></span><span class="tiny ${act ? '' : 'mute'}">${incRateText(T.res, incomeRate(b))}</span>${st}</button>`;
  }).join('');
  return `<div class="card"><div class="row between"><h3 style="margin:0">🏗 Venit pasiv</h3><span class="small">${parts.length ? parts.join(' · ') : '<span class="dim">+0/h</span>'}</span></div>
    <div class="tiny dim" style="margin:6px 0">Construiești clădiri pe sectoarele tale; produc continuu, și când nu ești în joc (cel mult ${CONFIG.OFFLINE_CAP_HOURS} h). Boții pot ataca <b>doar marginea</b> teritoriului tău (sectoarele vecine cu unele străine; marginea hărții e sigură) — ține clădirile în interior. Dacă pierzi un sector, clădirea de pe el se oprește până îl recucerești.</div>
    <div class="small" style="margin-bottom:6px">Locuri de construcție: <b class="${list.length > slots ? 'warn' : 'good'}">${list.length}/${slots}</b>${list.length > slots ? ' <span class="warn tiny">— ai pierdut sectoare: clădirile rămân, dar nu poți construi altele până recâștigi teritoriu</span>' : nxs ? ` <span class="dim">· următorul la ${nxs} sectoare</span>` : ''}${slots === 0 && !list.length ? ` <span class="dim">— primul loc la ${I.slotsFirstAt} sectoare</span>` : ''}</div>
    ${rows ? `<div class="tblist">${rows}</div>` : `<div class="tiny dim">${slots ? 'Atinge un sector al tău pe hartă și alege o clădire.' : 'Cucerește sectoare ca să deblochezi primul loc.'}</div>`}</div>`;
}
Object.assign(HANDLERS, {
  incBuild(a) { const r = doAct(() => actBuildIncome(a.i, a.type)); if (r && r.ok) UI.terrFlash = { i: a.i, until: performance.now() + 1500 }; },
  incUpgrade(id) { doAct(() => actUpgradeIncome(id)); },
  incMove(id) { UI.incomeMove = id; toast('Alege pe hartă un sector al tău fără clădire, apoi „Mută aici”'); },
  incMoveCancel() { UI.incomeMove = null; },
  incMoveHere(i) { const r = doAct(() => actMoveIncome(UI.incomeMove, i)); if (r && r.ok) UI.incomeMove = null; },
  incDismantle(id) {
    const b = incomeList().find(x => x.id === id); if (!b) return;
    confirmBox('Demontezi clădirea?', `${incomeType(b.type).name} dispare și primești înapoi <b class="cr">${fmt(incomeRefund(b))} CR</b> (${Math.round(incomeCfg().dismantleRefund * 100)}% din investiție).`, 'Demontează', () => doAct(() => actDismantleIncome(id)), true);
  },
});
