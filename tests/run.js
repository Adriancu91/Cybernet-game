// Run the game's self-tests in Node:  node tests/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = ['config', 'core', 'data', 'questions', 'sim', 'cards', 'ai_bridge', 'ailab', 'guild', 'market', 'meta', 'arena', 'actions', 'quick', 'tf_data', 'tf', 'top', 'territory', 'art', 'tests'];
const ctx = { console, Date, Math, JSON, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'), escape, unescape, encodeURIComponent, decodeURIComponent, localStorage: undefined };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
vm.runInContext('S = newState(1);', ctx);
const res = vm.runInContext('runSelfTests(' + JSON.stringify({ quick: process.argv.includes('--quick') }) + ')', ctx);
let failed = 0;
for (const r of res) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)${r.msg ? ' - ' + r.msg : ''}`);
  if (!r.pass) failed++;
}
console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
