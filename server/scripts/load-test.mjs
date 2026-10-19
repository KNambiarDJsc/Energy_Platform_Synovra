// Times the API's main endpoints. Needs Node 20+ and a running API.
//
//   node server/scripts/load-test.mjs http://localhost:4100 [rounds]
//
// For each endpoint: sequential requests (one user at a time), then 8 at once. Reports the median and the
// 95th percentile in milliseconds and the response size. The server logs a per-phase breakdown (load, run,
// save) for every request; read it next to these numbers.
const base = (process.argv[2] ?? 'http://localhost:4000').replace(/\/$/, '');
const rounds = Number(process.argv[3] ?? 12);

async function login(userId) {
  const r = await fetch(`${base}/api/v1/dev/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
  return (await r.json()).token;
}
const eng = await login('u_eng1');
const fin = await login('u_fin');
const q = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];

async function time(label, path, token, init = {}) {
  const run = async () => {
    const t = performance.now();
    const res = await fetch(`${base}/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    const body = await res.text();
    return { ms: performance.now() - t, status: res.status, bytes: body.length };
  };
  const one = [];
  let last;
  for (let i = 0; i < rounds; i++) { last = await run(); one.push(last.ms); }
  const par = [];
  for (let i = 0; i < Math.max(2, Math.floor(rounds / 4)); i++) par.push(...(await Promise.all(Array.from({ length: 8 }, run))).map((r) => r.ms));
  console.log(`${label.padEnd(34)} ${String(last.status).padEnd(4)} ${(last.bytes / 1024).toFixed(0).padStart(6)} KB  one: p50 ${q(one, 0.5).toFixed(0).padStart(5)} p95 ${q(one, 0.95).toFixed(0).padStart(5)}   8 at once: p50 ${q(par, 0.5).toFixed(0).padStart(5)} p95 ${q(par, 0.95).toFixed(0).padStart(5)}`);
  return last.status;
}

const list = await (await fetch(`${base}/api/v1/batteries`, { headers: { Authorization: `Bearer ${eng}` } })).json();
const id = list[Math.floor(list.length / 2)].id;
console.log(`${list.length} batteries visible. Times in ms.\n`);
await time('GET /batteries (register)', '/batteries', eng);
await time('GET /batteries/:id/passport', `/batteries/${id}/passport`, eng);
await time('GET /overview', '/overview', eng);
await time('GET /insights/collection', '/insights/collection', eng);
await time('GET /insights/learning', '/insights/learning', eng);
await time('GET /insights/recovery (finance)', '/insights/recovery', fin);
await time('GET /restoration/batches/:id/results', '/restoration/batches/RB-2026-09/results', eng);
const labToken = await login('u_lab1');
let n = 0;
const create = () => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ familyId: 'f1', manufacturerSerial: `LOAD-${Date.now()}-${n++}-${Math.random()}`, manufacturedOn: null, physicalLocation: 'Load bay', legacyId: null, acquisitionCostAed: null }) });
// Writes serialise on a lock, so only the one-at-a-time figure is a fair latency.
const w = [];
for (let i = 0; i < Math.min(rounds, 8); i++) { const t = performance.now(); const r = await fetch(`${base}/api/v1/batteries`, { ...create(), headers: { Authorization: `Bearer ${labToken}`, 'Content-Type': 'application/json' } }); await r.text(); w.push(performance.now() - t); }
console.log(`${'POST /batteries (a write)'.padEnd(34)} 200        -  KB  one: p50 ${q(w, 0.5).toFixed(0).padStart(5)} p95 ${q(w, 0.95).toFixed(0).padStart(5)}`);
