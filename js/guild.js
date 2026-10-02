'use strict';
/* ============================================================
   GUILDS — bot guild simulation, tax, HQ, cosmetics
   ============================================================ */

function guildTax(amount, who) {
  const g = playerGuild();
  if (!g || amount <= 0) return 0;
  const tax = Math.floor(amount * CONFIG.GUILD.taxRate);
  if (tax <= 0) return 0;
  g.vault += tax;
  g.contrib.player = (g.contrib.player || 0) + tax;
  count('guildTax', tax);
  const whoTxt = !who || who === 'your' ? 'tale' : who;
  log('GUILD', `[${g.tag}] Seif +${fmt(tax)} GV (bonus de 10% din câștigurile ${whoTxt}, nu ți se scade nimic).`);
  return tax;
}

function hqNext(g) { return g.hq < CONFIG.GUILD.hq.length ? CONFIG.GUILD.hq[g.hq] : null; }
function hqCost(g) {
  const nx = hqNext(g);
  if (!nx) return null;
  const landNeeded = Math.max(0, nx.land - g.land);
  const landCost = landNeeded * landPrice();
  return { landNeeded, landCost, fee: nx.fee, total: landCost + nx.fee };
}

function guildMinute(ms) {
  const hourFrac = ms / CONFIG.HOUR;
  const pg = playerGuild();
  for (const g of S.guilds) {
    let income = 0;
    for (const id of g.members) {
      const b = botById(id);
      if (!b) continue;
      const win = CONFIG.GUILD.botWinPerHour * CONFIG.LEAGUES[leagueOf(b.rating)].reward * b.activity * hourFrac;
      const tax = win * CONFIG.GUILD.taxRate;
      income += tax;
      g.contrib[b.id] = (g.contrib[b.id] || 0) + tax;
    }
    g.acc = (g.acc || 0) + income;
    const whole = Math.floor(g.acc);
    if (whole > 0) { g.vault += whole; g.acc -= whole; g.pending = (g.pending || 0) + whole; }
    if (g === pg && g.pending >= 1 && S.time - (g.lastLog || 0) >= 30 * 60000) {
      log('GUILD', `[${g.tag}] Taxa de turneu a membrilor: seif +${fmt(g.pending)} GV (acum ${fmt(g.vault)}).`);
      g.pending = 0; g.lastLog = S.time;
    } else if (g !== pg) g.pending = 0;

    // bot guilds build their HQ on their own
    if (!g.isPlayer && g !== pg && g.hq < CONFIG.GUILD.hq.length && !serverFrozen() && chance(1 / 180)) {
      const c = hqCost(g);
      if (c && g.vault >= c.total * 1.2) {
        g.vault -= c.total; g.land += c.landNeeded; g.hq++;
        log('GUILD', `[${g.tag}] ${g.name} a construit Sediul breslei nivelul ${g.hq} (+${fmt(c.landNeeded)} SU de spațiu pe server).`);
        checkServerCapacity();
      }
    }
  }
  // recruiting into the player's guild
  if (pg && pg.members.length < CONFIG.GUILD.maxMembers && chance(CONFIG.GUILD.recruitPerHour * (pg.hq + 1) * hourFrac)) {
    const free = S.bots.filter(b => !b.guildId);
    if (free.length) {
      const b = pick(free);
      b.guildId = pg.id; pg.members.push(b.id); pg.contrib[b.id] = pg.contrib[b.id] || 0;
      log('GUILD', `[${pg.tag}] ${b.name} s-a alăturat breslei tale.`);
    }
  }
  // churn between bot guilds keeps the world alive
  if (chance(0.02)) {
    const guilded = S.bots.filter(b => b.guildId && (!pg || b.guildId !== pg.id));
    if (guilded.length) {
      const b = pick(guilded), g = guildById(b.guildId);
      g.members = g.members.filter(x => x !== b.id); b.guildId = null;
    }
  }
  if (chance(0.02)) {
    const free = S.bots.filter(b => !b.guildId);
    const targets = S.guilds.filter(g => g !== pg && g.members.length < CONFIG.GUILD.maxMembers);
    if (free.length > 4 && targets.length) {
      const b = pick(free), g = pick(targets);
      b.guildId = g.id; g.members.push(b.id);
    }
  }
  // bots keep competing: small rating drift
  for (let i = 0; i < 3; i++) {
    const b = pick(S.bots);
    b.rating = Math.round(clamp(b.rating + randRange(-10, 10) + (1150 - b.rating) * 0.002, 800, 2100));
  }
}

function guildStep(dtMs) {
  S.guildAcc = (S.guildAcc || 0) + dtMs;
  while (S.guildAcc >= 60000) { S.guildAcc -= 60000; guildMinute(60000); }
}

// ---------- player guild actions: reasons ----------
function whyJoinGuild(gid) {
  const g = guildById(gid);
  if (!g) return 'Breasla nu a fost găsită';
  if (S.player.guildId) return 'Părăsește mai întâi breasla actuală';
  const wait = S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs - S.time;
  if (wait > 0) return 'Pauză până la o nouă alăturare: ' + fmtTime(wait);
  if (g.members.length >= CONFIG.GUILD.maxMembers) return 'Breasla este plină';
  return '';
}
function whyCreateGuild(name) {
  if (S.player.guildId) return 'Părăsește mai întâi breasla actuală';
  const wait = S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs - S.time;
  if (wait > 0) return 'Pauză până la o nouă alăturare: ' + fmtTime(wait);
  if (!name || name.trim().length < 3) return 'Numele trebuie să aibă cel puțin 3 caractere';
  if (name.trim().length > 24) return 'Nume prea lung (maximum 24)';
  if (S.guilds.some(g => g.name.toLowerCase() === name.trim().toLowerCase())) return 'Numele este deja folosit';
  if (!canPayCR(CONFIG.GUILD.createCost)) return `Îți mai trebuie ${fmt(CONFIG.GUILD.createCost - S.player.cr)} CR`;
  return '';
}
function whyDonate(n) {
  if (!playerGuild()) return 'Alătură-te mai întâi unei bresle';
  if (!(n >= 1)) return 'Introdu o sumă';
  if (!canPayCR(n)) return `Îți mai trebuie ${fmt(n - S.player.cr)} CR`;
  return '';
}
function whyUpgradeHQ() {
  const g = playerGuild();
  if (!g) return 'Alătură-te mai întâi unei bresle';
  if (!hqNext(g)) return 'Sediul breslei este la nivel maxim';
  if (serverFrozen()) return 'Infrastructură înghețată: ' + fmtTime(S.server.freezeUntil - S.time);
  const c = hqCost(g);
  if (g.vault < c.total) return `Seiful mai are nevoie de ${fmt(c.total - g.vault)} GV`;
  return '';
}
function whyBuyCosmetic(id) {
  const c = CONFIG.COSMETICS.find(x => x.id === id);
  if (!c) return 'Obiect necunoscut';
  if (S.player.cosmetics.owned.includes(id)) return 'Deținut deja';
  const g = playerGuild();
  if (!g) return 'Alătură-te mai întâi unei bresle';
  if (g.hq < c.hq) return `Necesită Sediul breslei nivelul ${c.hq}`;
  if (g.vault < c.cost) return `Seiful mai are nevoie de ${fmt(c.cost - g.vault)} GV`;
  return '';
}
