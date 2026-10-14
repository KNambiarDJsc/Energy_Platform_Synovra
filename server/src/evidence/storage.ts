/**
 * Evidence file storage. Files are content-addressed (`sha256/<hex>`): the key is derived from the
 * bytes, so a stored file can never be overwritten with different content, uploading the same file
 * twice stores it once, and every read can be verified against its key.
 *
 * Two backends: a local directory (default, for a single server or a mounted volume) and any
 * S3-compatible object store (AWS S3, MinIO, Cloudflare R2, Azure via an S3 gateway). Enable
 * bucket versioning or object lock on the bucket for retention; the API never deletes evidence.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';
import type { Config } from '../config';

export interface BlobStore {
  readonly kind: 'local' | 's3';
  /** Stores bytes under their content key. Idempotent. */
  put(bytes: Uint8Array, contentType: string): Promise<{ key: string; checksum: string }>;
  /** Returns the bytes, or null when the key is not stored. */
  get(key: string): Promise<Uint8Array | null>;
  /** Cheap reachability check for /ready. */
  check(): Promise<void>;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const KEY = /^sha256\/[0-9a-f]{64}$/;

export function keyFor(checksum: string): string {
  return `sha256/${checksum}`;
}

export class IntegrityError extends Error {}

/** Reads a blob and confirms the bytes still match the key they were stored under. */
export async function readVerified(store: BlobStore, key: string): Promise<Uint8Array | null> {
  if (!KEY.test(key)) throw new IntegrityError(`Malformed evidence key: ${key}`);
  const bytes = await store.get(key);
  if (bytes && keyFor(sha256(bytes)) !== key) throw new IntegrityError(`Stored evidence ${key} does not match its checksum.`);
  return bytes;
}

export class LocalBlobStore implements BlobStore {
  readonly kind = 'local' as const;
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    const hex = key.slice('sha256/'.length);
    return path.join(this.dir, 'sha256', hex.slice(0, 2), hex);
  }

  async put(bytes: Uint8Array) {
    const checksum = sha256(bytes);
    const key = keyFor(checksum);
    const target = this.file(key);
    if (await exists(target)) return { key, checksum };
    await mkdir(path.dirname(target), { recursive: true });
    // Write to a temporary name and rename, so a crash never leaves a partial file under the real key.
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, bytes, { flag: 'wx' });
    await rename(tmp, target);
    return { key, checksum };
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async check() {
    await mkdir(this.dir, { recursive: true });
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export class S3BlobStore implements BlobStore {
  readonly kind = 's3' as const;
  private readonly client: AwsClient;
  constructor(private readonly cfg: Extract<Config['evidence']['store'], { kind: 's3' }>) {
    this.client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region, service: 's3' });
  }

  private url(key = ''): string {
    // Path-style addressing works with AWS and with MinIO/R2 without DNS setup.
    return `${this.cfg.endpoint}/${encodeURIComponent(this.cfg.bucket)}/${key}`;
  }

  async put(bytes: Uint8Array, contentType: string) {
    const checksum = sha256(bytes);
    const key = keyFor(checksum);
    const head = await this.client.fetch(this.url(key), { method: 'HEAD' });
    if (head.ok) return { key, checksum };
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body: bytes,
      headers: {
        'Content-Type': contentType,
        // The store re-checks the checksum on arrival and rejects a corrupted upload.
        'x-amz-checksum-sha256': Buffer.from(checksum, 'hex').toString('base64'),
      },
    });
    if (!res.ok) throw new Error(`Evidence storage refused the upload (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return { key, checksum };
  }

  async get(key: string) {
    const res = await this.client.fetch(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Evidence storage read failed (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async check() {
    const res = await this.client.fetch(`${this.url()}?max-keys=1`);
    if (!res.ok) throw new Error(`Evidence bucket is not reachable (${res.status}).`);
  }
}

export function createBlobStore(cfg: Config['evidence']['store']): BlobStore {
  return cfg.kind === 's3' ? new S3BlobStore(cfg) : new LocalBlobStore(cfg.dir);
}
