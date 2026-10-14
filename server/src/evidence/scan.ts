/**
 * Malware scanning of uploads. `clamd` speaks ClamAV's INSTREAM protocol over TCP (the
 * clamav/clamav container listens on 3310). Scanning fails closed: if the scanner cannot be
 * reached, the upload is refused rather than stored unscanned.
 */
import { Socket } from 'node:net';
import { ValidationError } from '../../../src/domain/permissions';
import type { Config } from '../config';

export class ScannerUnavailableError extends Error {}

export interface Scanner {
  readonly kind: 'none' | 'clamd';
  /** Resolves `clean` or `not_scanned`; throws ValidationError for an infected file. */
  scan(bytes: Uint8Array): Promise<'clean' | 'not_scanned'>;
  check(): Promise<void>;
}

const CHUNK = 64 * 1024;

export function clamdScan(host: string, port: number, bytes: Uint8Array, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let reply = '';
    const fail = (e: Error) => { socket.destroy(); reject(new ScannerUnavailableError(`Malware scanner unavailable: ${e.message}`)); };
    socket.setTimeout(timeoutMs, () => fail(new Error('timed out')));
    socket.on('error', fail);
    socket.on('data', (d) => { reply += d.toString('utf8'); });
    socket.on('end', () => resolve(reply.replace(/\0/g, '').trim()));
    socket.connect(port, host, () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        socket.write(len);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4)); // zero-length chunk ends the stream
    });
  });
}

function clamdPing(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let reply = '';
    socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new ScannerUnavailableError('Malware scanner did not answer.')); });
    socket.on('error', (e) => reject(new ScannerUnavailableError(`Malware scanner unavailable: ${e.message}`)));
    socket.on('data', (d) => { reply += d.toString('utf8'); });
    socket.on('end', () => (reply.includes('PONG') ? resolve() : reject(new ScannerUnavailableError('Malware scanner gave an unexpected answer.'))));
    socket.connect(port, host, () => socket.end('zPING\0'));
  });
}

export function createScanner(cfg: Config['evidence']['scan']): Scanner {
  if (cfg.kind === 'none') {
    return { kind: 'none', scan: async () => 'not_scanned', check: async () => {} };
  }
  return {
    kind: 'clamd',
    async scan(bytes) {
      const reply = await clamdScan(cfg.host, cfg.port, bytes, cfg.timeoutMs);
      if (/: OK$/.test(reply)) return 'clean';
      if (/FOUND$/.test(reply)) throw new ValidationError('The file was rejected by the malware scan and has not been stored.', [reply.replace(/^stream: /, '')]);
      throw new ScannerUnavailableError(`Malware scanner returned an error: ${reply.slice(0, 120)}`);
    },
    check: () => clamdPing(cfg.host, cfg.port, Math.min(cfg.timeoutMs, 5000)),
  };
}
