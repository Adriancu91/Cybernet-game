'use strict';
/* ============================================================
   CLOUD SAVE — accounts with just an ID + PIN (no e-mail).
   Progress is kept on the server, so it survives clearing the
   browser and follows the player to any device.

   Server: Supabase (free plan). Setup: supabase/setup.sql and
   docs/CLOUD_SETUP.md. Fill CLOUD_CONFIG below with the project's
   URL and its public "anon" key (safe to publish: the database
   only answers through the PIN-checked cn_* functions).
   With an empty config the game simply saves on the device.
   ============================================================ */
const CLOUD_CONFIG = {
  url: '',        // e.g. 'https://abcdefgh.supabase.co'
  anonKey: '',    // Project Settings -> API -> anon public key
};

const CLOUD = {
  KEY: 'cybernet_account_v1',
  SYNC_MS: 60000,
  acct: null,          // { user, pin, version, lastSync }
  status: 'idle',      // idle | syncing | ok | error | conflict
  lastError: '',
  conflict: null,      // { version, updated }
  lastSavedTime: -1,

  init() {
    try { const raw = localStorage.getItem(this.KEY); this.acct = raw ? JSON.parse(raw) : null; } catch (e) { this.acct = null; }
    // ask the browser not to wipe this site's data on its own (Safari/Chrome storage pressure)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  },
  enabled() { return !!(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey); },
  loggedIn() { return !!(this.enabled() && this.acct && this.acct.user); },
  store() { try { if (this.acct) localStorage.setItem(this.KEY, JSON.stringify(this.acct)); else localStorage.removeItem(this.KEY); } catch (e) { } },

  ERRORS: {
    taken: 'Acest ID este deja folosit - alege altul.',
    bad_id: 'ID: 3-20 caractere, doar litere, cifre și . _ -',
    bad_pin: 'PIN: între 4 și 8 cifre.',
    badpin: 'PIN greșit.',
    locked: 'Prea multe PIN-uri greșite - încearcă din nou peste 15 minute.',
    nouser: 'Nu există niciun cont cu acest ID.',
    conflict: 'Alt dispozitiv a salvat un progres mai nou.',
    too_big: 'Salvarea este prea mare.',
    not_logged_in: 'Nu ești autentificat.',
    network: 'Nu există conexiune cu serverul - progresul tău rămâne salvat pe acest dispozitiv.',
  },
  errText(code) { return this.ERRORS[code] || (/^bad save on server/.test(code) ? 'Salvarea de pe server este coruptă: ' + code.replace(/^bad save on server: /, '') : 'Eroare de server: ' + code); },

  async rpc(fn, args) {
    const base = CLOUD_CONFIG.url.replace(/\/$/, '');
    let r;
    try {
      r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CLOUD_CONFIG.anonKey, Authorization: 'Bearer ' + CLOUD_CONFIG.anonKey },
        body: JSON.stringify(args),
      });
    } catch (e) { return { ok: false, error: 'network' }; }
    if (!r.ok) return { ok: false, error: 'network' };
    try { return await r.json(); } catch (e) { return { ok: false, error: 'network' }; }
  },
  payload() { return JSON.parse(serialize(S)); },

  // create a new account and upload the progress of this device to it
  async register(user, pin) {
    user = String(user || '').trim(); pin = String(pin || '').trim();
    const res = await this.rpc('cn_register', { p_user: user, p_pin: pin });
    if (!res.ok) return res;
    this.acct = { user, pin, version: 0, lastSync: 0 };
    this.store();
    S.player.name = (S.player.name === 'You' || S.player.name === 'Tu') ? user.slice(0, 16) : S.player.name;
    return this.sync(true);
  },
  // log in; returns { ok, save } where save is the cloud progress (or null for an empty account)
  async login(user, pin) {
    user = String(user || '').trim(); pin = String(pin || '').trim();
    const res = await this.rpc('cn_load', { p_user: user, p_pin: pin });
    if (!res.ok) return res;
    this.acct = { user: res.username || user, pin, version: res.version || 0, lastSync: Date.now() };
    this.conflict = null;
    this.store();
    let save = null;
    if (res.save) { try { save = migrate(deserialize(JSON.stringify(res.save))); } catch (e) { return { ok: false, error: 'bad save on server: ' + e.message }; } }
    return { ok: true, save, updated: res.updated };
  },
  logout() { this.acct = null; this.status = 'idle'; this.conflict = null; this.store(); },

  // upload progress; force=true overwrites newer progress from another device
  async sync(force) {
    if (!this.loggedIn() || !S) return { ok: false, error: 'not_logged_in' };
    if (this.conflict && !force) return { ok: false, error: 'conflict' };
    this.status = 'syncing';
    const res = await this.rpc('cn_save', { p_user: this.acct.user, p_pin: this.acct.pin, p_save: this.payload(), p_base: this.acct.version || 0, p_force: !!force });
    if (res.ok) {
      this.acct.version = res.version; this.acct.lastSync = Date.now(); this.store();
      this.status = 'ok'; this.lastError = ''; this.conflict = null; this.lastSavedTime = S.time;
    } else if (res.error === 'conflict') {
      this.status = 'conflict'; this.conflict = { version: res.version, updated: res.updated };
    } else {
      this.status = 'error'; this.lastError = res.error;
      if (res.error === 'badpin' || res.error === 'nouser') { this.lastError = res.error; }
    }
    return res;
  },
  // called by the game loop: only uploads when something changed
  autoSync() {
    if (!this.loggedIn() || this.conflict || this.status === 'syncing' || !S) return;
    if (S.time === this.lastSavedTime) return;
    if (Date.now() - (this.acct.lastSync || 0) < this.SYNC_MS) return;
    this.sync(false);
  },
  async sendAIAnswers(batch) {
    if (!this.loggedIn() || !batch || !batch.length) return false;
    const res = await this.rpc('cn_ai_answers_add', { p_user: this.acct.user, p_pin: this.acct.pin, p_answers: batch });
    return !!res.ok;
  },
  async changePin(oldPin, newPin) {
    if (!this.loggedIn()) return { ok: false, error: 'not_logged_in' };
    const res = await this.rpc('cn_change_pin', { p_user: this.acct.user, p_pin: oldPin, p_new: newPin });
    if (res.ok) { this.acct.pin = newPin; this.store(); }
    return res;
  },
  async deleteAccount(pin) {
    if (!this.loggedIn()) return { ok: false, error: 'not_logged_in' };
    const res = await this.rpc('cn_delete', { p_user: this.acct.user, p_pin: pin });
    if (res.ok) this.logout();
    return res;
  },
};
