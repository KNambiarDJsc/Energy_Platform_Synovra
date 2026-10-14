'use client';
import { Download } from 'lucide-react';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { EvidenceFile } from '@/domain/types';
import { errorMessage } from '@/lib/hooks';
import { DATA_SOURCE } from '@/lib/runtime';
import { getServices } from '@/services';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.csv,.xlsx';
const MAX_BYTES = 20 * 1024 * 1024;
const EXT = /\.(pdf|png|jpe?g|csv|xlsx)$/i;

export const EVIDENCE_HINT = DATA_SOURCE === 'http'
  ? 'PDF, image, CSV or XLSX, up to 20 MB. The server checks the file type, scans it where configured, and stores it with a SHA-256 checksum.'
  : 'PDF, image, CSV or XLSX, up to 20 MB. In this demonstration only the file name and size are recorded.';

/** A file picker that checks type and size before anything is sent. The server checks again. */
export function EvidenceFileInput({ label = 'Evidence file', required, file, onChange }: {
  label?: string; required?: boolean; file: File | null; onChange: (f: File | null) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-critical-700" aria-hidden> *</span>}
      </label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        aria-describedby={`${id}-hint${error ? ` ${id}-err` : ''}`}
        aria-invalid={error ? true : undefined}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy hover:file:border-teal"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && !EXT.test(f.name)) { setError('Choose a PDF, PNG, JPG, CSV or XLSX file.'); onChange(null); return; }
          if (f && f.size > MAX_BYTES) { setError('The file is larger than 20 MB.'); onChange(null); return; }
          setError(null);
          onChange(f);
        }}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{file ? `${file.name} · ${Math.max(1, Math.ceil(file.size / 1024))} KB. ` : ''}{EVIDENCE_HINT}</p>
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs font-medium text-critical-700">{error}</p>}
    </div>
  );
}

export const fileSizeKb = (f: File) => Math.max(1, Math.ceil(f.size / 1024));

export function StorageBadge({ e }: { e: EvidenceFile }) {
  if (!e.storageKey) return <Badge>File name only</Badge>;
  return e.scanStatus === 'clean' ? <Badge tone="green">Stored · scanned</Badge> : <Badge tone="amber">Stored · not scanned</Badge>;
}

/** Downloads a stored evidence file with the signed-in user's permissions. */
export function EvidenceDownload({ e }: { e: EvidenceFile }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const svc = getServices();
  if (!e.storageKey || !svc.batteries.downloadEvidence) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      icon={<Download className="h-3.5 w-3.5" aria-hidden />}
      aria-label={`Download ${e.fileName}`}
      onClick={async () => {
        setBusy(true);
        try {
          const { blob, fileName } = await svc.batteries.downloadEvidence!(e.id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      Download
    </Button>
  );
}
