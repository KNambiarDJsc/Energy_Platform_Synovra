// End-to-end smoke test of a running stack, through its public origin. Needs only Node 20+.
//
//   node deploy/smoke.mjs http://localhost:8088
//
// It checks the seams a deployment depends on: the proxy routes web and API, the database answers, the
// identity provider issues a session, and evidence goes into object storage and comes back byte for byte.
// Exits non-zero on the first failure, so it can run in CI or after a deploy.
import { createHash } from 'node:crypto';

const base = (process.argv[2] ?? 'http://localhost:8088').replace(/\/$/, '');
let n = 0;
const ok = (msg) => console.log(`ok ${++n} ${msg}`);
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };
const need = (cond, msg) => (cond ? ok(msg) : fail(msg));

async function json(path, init = {}, token) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body, text };
}

// 1. The proxy sends pages to the web app and /api, /ready to the API.
const page = await fetch(`${base}/signin`);
need(page.status === 200 && (await page.text()).includes('Synovra'), 'web app is served on the public origin');
const ready = await json('/ready');
need(ready.status === 200, 'API reports ready (database reachable) through the same origin');
const meta = await json('/api/v1/meta');
need(meta.body?.apiVersion === '1', `API meta answers (data mode ${meta.body?.dataMode}, auth mode ${meta.body?.authMode})`);

// 2. A session.
const login = await json('/api/v1/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'u_lab1' }) });
need(login.status === 200 && login.body?.token, 'dev sign-in issues a session (replace with OIDC in a real deployment)');
const token = login.body.token;

// 3. A record and its evidence: write, store, read back.
const created = await json('/api/v1/batteries', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ familyId: 'f1', manufacturerSerial: `SMOKE-${Date.now()}`, manufacturedOn: null, physicalLocation: 'Smoke bay', legacyId: null, acquisitionCostAed: null }),
}, token);
need(created.status === 200 && created.body?.battery?.id, 'a battery can be registered');
const batteryId = created.body.battery.id;

const t = await json('/api/v1/tests', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    batteryId, kind: 'initial', protocolId: 'proto_c10', voltageV: 12.4, resistanceMOhm: 4.1, temperatureC: 25, capacityAh: 140, ambientTempC: 25,
    loadCurrentA: 20, cutoffVoltageV: 10.8, durationH: 7, instrument: 'Smoke bench', calibrationRef: 'CAL-SMOKE', witnessName: null, evidenceFileName: null, notes: '',
  }),
}, token);
need(t.status === 200 && t.body?.id, 'a test can be recorded');

const bytes = Buffer.from(`%PDF-1.7\nsmoke evidence ${Date.now()} ${Math.random()}\n`);
const sha = createHash('sha256').update(bytes).digest('hex');
const form = new FormData();
form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'smoke-report.pdf');
const up = await json(`/api/v1/tests/${t.body.id}/evidence`, { method: 'POST', body: form }, token);
need(up.status === 200 && up.body?.storageKey === `sha256/${sha}`, `evidence is stored under its own checksum (sha256/${sha.slice(0, 12)}…)`);

const back = await fetch(`${base}/api/v1/evidence/${up.body.id}/content`, { headers: { Authorization: `Bearer ${token}` } });
const got = Buffer.from(await back.arrayBuffer());
need(back.status === 200 && createHash('sha256').update(got).digest('hex') === sha, 'the file comes back from object storage byte for byte');

// 4. Permissions still hold at the edge: no token, no data.
const anon = await json('/api/v1/batteries');
need(anon.status === 401, 'an unauthenticated request is refused');

console.log(`\n${n} checks passed against ${base}`);
