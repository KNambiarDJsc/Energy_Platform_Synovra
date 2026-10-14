/**
 * Upload checks that do not trust the client: the declared file name decides nothing on its own.
 * The extension must be on the allow-list AND the first bytes must match that type, so a renamed
 * executable or HTML page is refused. Content types are set by the server, never taken from the client.
 */
import { ValidationError } from '../../../src/domain/permissions';
import { EVIDENCE_MAX_KB } from '../../../src/services/core';

export const MAX_BYTES = EVIDENCE_MAX_KB * 1024;

interface Kind { ext: RegExp; contentType: string; matches(b: Uint8Array): boolean }

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);

const KINDS: Kind[] = [
  { ext: /\.pdf$/i, contentType: 'application/pdf', matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { ext: /\.png$/i, contentType: 'image/png', matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { ext: /\.jpe?g$/i, contentType: 'image/jpeg', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  // XLSX is a ZIP container.
  { ext: /\.xlsx$/i, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  { ext: /\.csv$/i, contentType: 'text/csv; charset=utf-8', matches: isPlainText },
];

function isPlainText(b: Uint8Array): boolean {
  const head = b.subarray(0, 64 * 1024);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.length === b.length ? head : trimPartialUtf8(head));
    return true;
  } catch {
    return false;
  }
}

/** Drops an incomplete multi-byte character at the end of a sample. */
function trimPartialUtf8(b: Uint8Array): Uint8Array {
  let end = b.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const byte = b[end - i];
    if ((byte & 0xc0) === 0x80) continue;
    if ((byte & 0xc0) === 0xc0) end -= i;
    break;
  }
  return b.subarray(0, end);
}

/** A display-safe file name: no path, no control characters, bounded length. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new ValidationError('The file has no usable name.');
  if (cleaned.length <= 120) return cleaned;
  const ext = /\.[a-z0-9]{1,5}$/i.exec(cleaned)?.[0] ?? '';
  return cleaned.slice(0, 120 - ext.length) + ext;
}

export function inspectUpload(fileName: string, bytes: Uint8Array): { fileName: string; contentType: string; sizeKb: number } {
  const name = cleanFileName(fileName);
  if (bytes.length === 0) throw new ValidationError('The file is empty.');
  if (bytes.length > MAX_BYTES) throw new ValidationError('Evidence file is larger than 20 MB.');
  const kind = KINDS.find((k) => k.ext.test(name));
  if (!kind) throw new ValidationError('Evidence file type is not accepted (pdf, png, jpg, csv, xlsx).');
  if (!kind.matches(bytes)) throw new ValidationError(`The file content is not a valid ${name.split('.').pop()!.toUpperCase()} file.`);
  return { fileName: name, contentType: kind.contentType, sizeKb: Math.max(1, Math.ceil(bytes.length / 1024)) };
}
