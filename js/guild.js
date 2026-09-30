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
  log('GUILD', `[${g.tag}] Vault +${fmt(tax)} GV (10% bonus from ${who || 'your'} winnings, not deducted from you).`);
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
      log('GUILD', `[${g.tag}] Members' tournament tax: vault +${fmt(g.pending)} GV (now ${fmt(g.vault)}).`);
      g.pending = 0; g.lastLog = S.time;
    } else if (g !== pg) g.pending = 0;

    // bot guilds build their HQ on their own
    if (!g.isPlayer && g !== pg && g.hq < CONFIG.GUILD.hq.length && !serverFrozen() && chance(1 / 180)) {
      const c = hqCost(g);
      if (c && g.vault >= c.total * 1.2) {
        g.vault -= c.total; g.land += c.landNeeded; g.hq++;
        log('GUILD', `[${g.tag}] ${g.name} built Guild HQ level ${g.hq} (+${fmt(c.landNeeded)} SU of server space).`);
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
      log('GUILD', `[${pg.tag}] ${b.name} joined your guild.`);
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
  if (!g) return 'Guild not found';
  if (S.player.guildId) return 'Leave your current guild first';
  const wait = S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs - S.time;
  if (wait > 0) return 'Join cooldown: ' + fmtTime(wait);
  if (g.members.length >= CONFIG.GUILD.maxMembers) return 'Guild is full';
  return '';
}
function whyCreateGuild(name) {
  if (S.player.guildId) return 'Leave your current guild first';
  const wait = S.player.guildLeftAt + CONFIG.GUILD.leaveCooldownMs - S.time;
  if (wait > 0) return 'Join cooldown: ' + fmtTime(wait);
  if (!name || name.trim().length < 3) return 'Name must have at least 3 characters';
  if (name.trim().length > 24) return 'Name too long (max 24)';
  if (S.guilds.some(g => g.name.toLowerCase() === name.trim().toLowerCase())) return 'Name already taken';
  if (!canPayCR(CONFIG.GUILD.createCost)) return `Need ${fmt(CONFIG.GUILD.createCost - S.player.cr)} CR more`;
  return '';
}
function whyDonate(n) {
  if (!playerGuild()) return 'Join a guild first';
  if (!(n >= 1)) return 'Enter an amount';
  if (!canPayCR(n)) return `Need ${fmt(n - S.player.cr)} CR more`;
  return '';
}
function whyUpgradeHQ() {
  const g = playerGuild();
  if (!g) return 'Join a guild first';
  if (!hqNext(g)) return 'HQ is at max level';
  if (serverFrozen()) return 'Infrastructure frozen: ' + fmtTime(S.server.freezeUntil - S.time);
  const c = hqCost(g);
  if (g.vault < c.total) return `Vault needs ${fmt(c.total - g.vault)} GV more`;
  return '';
}
function whyBuyCosmetic(id) {
  const c = CONFIG.COSMETICS.find(x => x.id === id);
  if (!c) return 'Unknown item';
  if (S.player.cosmetics.owned.includes(id)) return 'Already owned';
  const g = playerGuild();
  if (!g) return 'Join a guild first';
  if (g.hq < c.hq) return `Requires Guild HQ level ${c.hq}`;
  if (g.vault < c.cost) return `Vault needs ${fmt(c.cost - g.vault)} GV more`;
  return '';
}
