/**
 * Evidence file storage: uploads are checked, scanned and stored content-addressed; downloads follow
 * passport visibility, are audited and verified against their checksum.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server as NetServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/permissions';
import * as s from '../src/db/schema';
import { inspectUpload } from '../src/evidence/inspect';
import { createScanner, ScannerUnavailableError, type Scanner } from '../src/evidence/scan';
import { LocalBlobStore } from '../src/evidence/storage';
import { goodTest, startServer, USERS, type Client, type Server } from './helpers';

const PDF = new TextEncoder().encode('%PDF-1.7\n% synthetic test report\n1 0 obj << >> endobj\n%%EOF\n');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** A scanner whose verdict each test can set. */
let verdict: 'clean' | 'infected' | 'down' = 'clean';
const fakeScanner: Scanner = {
  kind: 'clamd',
  async scan() {
    if (verdict === 'infected') throw new ValidationError('The file was rejected by the malware scan and has not been stored.', ['Eicar-Signature FOUND']);
    if (verdict === 'down') throw new ScannerUnavailableError('down');
    return 'clean';
  },
  async check() {},
};

let server: Server;
let dir: string;
let lab: Client;
let testId: string;

async function storedFiles(): Promise<string[]> {
  try {
    const shards = await readdir(path.join(dir, 'sha256'));
    return (await Promise.all(shards.map((d) => readdir(path.join(dir, 'sha256', d))))).flat();
  } catch {
    return [];
  }
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'synovra-evidence-'));
  server = await startServer({ evidence: { store: new LocalBlobStore(dir), scanner: fakeScanner } });
  lab = await server.as(USERS.lab);
  const battery = (await lab.get('/batteries?state=received')).body[0];
  testId = (await lab.post('/tests', goodTest(battery.id, { evidenceFileName: null }))).body.id;
});
afterAll(async () => {
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('evidence upload', () => {
  it('stores the file under its SHA-256, records the facts, and serves identical bytes to an authorised reader', async () => {
    verdict = 'clean';
    const res = await lab.upload(`/tests/${testId}/evidence`, 'discharge-curve.pdf', PDF);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fileName: 'discharge-curve.pdf', checksum: sha(PDF), storageKey: `sha256/${sha(PDF)}`, contentType: 'application/pdf', scanStatus: 'clean', sizeKb: 1,
    });
    expect(await storedFiles()).toEqual([sha(PDF)]);

    const eng = await server.as(USERS.eng);
    const dl = await eng.fetch(`/evidence/${res.body.id}/content`);
    expect(dl.status).toBe(200);
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(PDF);
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment; filename="discharge-curve.pdf"/);
    expect(dl.headers.get('x-content-type-options')).toBe('nosniff');
    const audit = await server.handle.db.select().from(s.auditEvents).where(eq(s.auditEvents.entityId, res.body.id));
    expect(audit.map((a) => [a.action, a.actorId])).toContainEqual(['evidence.open', USERS.eng]);
  });

  it('stores a repeated upload once (content-addressed) but records each attachment', async () => {
    const again = await lab.upload(`/tests/${testId}/evidence`, 'copy.pdf', PDF);
    expect(again.status).toBe(200);
    expect(await storedFiles()).toEqual([sha(PDF)]);
    expect((await lab.get(`/tests/${testId}`)).body.evidence.length).toBe(2);
  });

  it('refuses a file whose content does not match its name, a disallowed type, and an empty file', async () => {
    const before = await storedFiles();
    expect((await lab.upload(`/tests/${testId}/evidence`, 'report.pdf', '<html><script>alert(1)</script></html>')).status).toBe(422);
    expect((await lab.upload(`/tests/${testId}/evidence`, 'photo.png', PDF)).status).toBe(422);
    expect((await lab.upload(`/tests/${testId}/evidence`, 'tool.exe', 'MZ...')).status).toBe(422);
    expect((await lab.upload(`/tests/${testId}/evidence`, 'empty.csv', '')).status).toBe(422);
    expect(await storedFiles()).toEqual(before);
  });

  it('refuses a file over 20 MB before reading it into storage', async () => {
    const big = new Uint8Array(21 * 1024 * 1024);
    big.set(PDF);
    expect((await lab.upload(`/tests/${testId}/evidence`, 'big.pdf', big)).status).toBe(413);
  });

  it('stores nothing for a caller who may not attach evidence, and audits the refusal', async () => {
    const before = await storedFiles();
    const field = await server.as(USERS.field1);
    const res = await field.upload(`/tests/${testId}/evidence`, 'site-photo.png', PNG);
    expect(res.status).toBe(403);
    expect(await storedFiles()).toEqual(before);
    const denied = await server.handle.db.select().from(s.auditEvents).where(eq(s.auditEvents.actorId, USERS.field1));
    expect(denied.some((a) => a.outcome === 'denied' && a.entityId === 'test.create')).toBe(true);
  });

  it('rejects an infected file and fails closed when the scanner is down', async () => {
    const before = await storedFiles();
    verdict = 'infected';
    const infected = await lab.upload(`/tests/${testId}/evidence`, 'invoice.pdf', PDF.slice(0, 20));
    expect(infected.status).toBe(422);
    expect(infected.body.error.details).toEqual(['Eicar-Signature FOUND']);
    verdict = 'down';
    const down = await lab.upload(`/tests/${testId}/evidence`, 'invoice.pdf', PDF.slice(0, 21));
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('UNAVAILABLE');
    verdict = 'clean';
    expect(await storedFiles()).toEqual(before);
  });
});

describe('evidence download', () => {
  it('hides internal evidence from a customer and audits the attempt', async () => {
    const up = await lab.upload(`/tests/${testId}/evidence`, 'internal-note.csv', 'cell,voltage\n1,2.10\n');
    const cust = await server.as(USERS.cust);
    expect((await cust.fetch(`/evidence/${up.body.id}/content`)).status).toBe(404);
    const audit = await server.handle.db.select().from(s.auditEvents).where(eq(s.auditEvents.actorId, USERS.cust));
    expect(audit.some((a) => a.action === 'evidence.open' && a.outcome === 'denied')).toBe(true);
  });

  it('answers 409 for a metadata-only record and refuses to serve a file that was altered in storage', async () => {
    const [metaOnly] = await server.handle.db.select().from(s.evidenceFiles).where(eq(s.evidenceFiles.checksum, 'metadata-only-demo'.padEnd(64, '0'))).limit(1);
    const eng = await server.as(USERS.eng);
    if (metaOnly) expect((await eng.fetch(`/evidence/${metaOnly.id}/content`)).status).toBe(409);

    const bytes = new TextEncoder().encode('%PDF-1.4 tamper target');
    const up = await lab.upload(`/tests/${testId}/evidence`, 'target.pdf', bytes);
    const hex = sha(bytes);
    await writeFile(path.join(dir, 'sha256', hex.slice(0, 2), hex), '%PDF-1.4 altered');
    expect((await eng.fetch(`/evidence/${up.body.id}/content`)).status).toBe(500);
  });

  it('keeps the database rule: a stored file is addressed by its own checksum', async () => {
    const [row] = await server.handle.db.select().from(s.evidenceFiles).where(eq(s.evidenceFiles.scanStatus, 'clean')).limit(1);
    await expect(server.handle.db.update(s.evidenceFiles).set({ storageKey: `sha256/${'0'.repeat(64)}` }).where(eq(s.evidenceFiles.id, row.id)))
      .rejects.toMatchObject({ code: '23514' });
  });
});

describe('upload inspection and the ClamAV client', () => {
  it('cleans file names and derives the content type from the bytes', () => {
    expect(inspectUpload('C:\\fakepath\\..\\Report "final".PDF', PDF)).toMatchObject({ fileName: 'Report final.PDF', contentType: 'application/pdf' });
    expect(() => inspectUpload('data.csv', new Uint8Array([0x41, 0, 0x42]))).toThrow(/not a valid CSV/);
  });

  it('speaks INSTREAM to clamd: clean, infected and unreachable', async () => {
    let answer = 'stream: OK';
    const received: Buffer[] = [];
    const clamd: NetServer = createServer((sock) => {
      sock.on('data', (d) => {
        received.push(d);
        // The stream ends with a zero-length chunk.
        if (Buffer.concat(received).subarray(-4).equals(Buffer.alloc(4))) sock.end(`${answer}\0`);
      });
    });
    await new Promise<void>((r) => clamd.listen(0, '127.0.0.1', () => r()));
    const port = (clamd.address() as { port: number }).port;
    const scanner = createScanner({ kind: 'clamd', host: '127.0.0.1', port, timeoutMs: 2000 });
    expect(await scanner.scan(PDF)).toBe('clean');
    expect(Buffer.concat(received).subarray(0, 10).toString()).toBe('zINSTREAM\0');
    answer = 'stream: Win.Test.EICAR_HDB-1 FOUND';
    await expect(scanner.scan(PDF)).rejects.toBeInstanceOf(ValidationError);
    await new Promise<void>((r) => clamd.close(() => r()));
    await expect(createScanner({ kind: 'clamd', host: '127.0.0.1', port, timeoutMs: 500 }).scan(PDF)).rejects.toBeInstanceOf(ScannerUnavailableError);
  });
});
