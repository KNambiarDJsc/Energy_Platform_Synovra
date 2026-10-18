'use client';
import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Field, Select, Textarea } from './Field';
import { Modal } from './Overlay';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** What will happen, in plain words, shown above the reason field. */
  summary?: ReactNode;
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  /** Set false for confirmations that need no free-text reason. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  /** Structured reason codes. When given, choosing one is required and it is passed to `onConfirm`. */
  codes?: { value: string; label: string }[];
  codeLabel?: string;
  codeHint?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string, code: string | null) => void;
}

/** Consequential actions (approve, reject, reissue, deploy) always pass through here. */
export function ReasonDialog({
  open, onOpenChange, title, description, summary, confirmLabel, variant = 'primary',
  requireReason = true, reasonLabel = 'Reason', reasonHint, codes, codeLabel = 'Reason code', codeHint, loading, error, onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);

  // Start each opening with an empty reason (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('');
      setCode('');
      setTouched(false);
    }
  }

  const tooShort = requireReason && reason.trim().length < 5;
  const missingCode = !!codes?.length && !code;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={variant}
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (tooShort || missingCode) return;
              onConfirm(reason.trim(), codes?.length ? code : null);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {summary && <div className="text-sm text-ink">{summary}</div>}
        {!!codes?.length && (
          <Field
            label={codeLabel}
            required
            hint={codeHint ?? 'Used to count outcomes. Explain the details in the reason below.'}
            error={touched && missingCode ? 'Choose a reason code.' : null}
          >
            <Select value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">Choose…</option>
              {codes.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        )}
        {requireReason && (
          <Field
            label={reasonLabel}
            required
            hint={reasonHint ?? 'Recorded in the audit history with your name and the time.'}
            error={touched && tooShort ? 'Enter a reason of at least 5 characters.' : null}
          >
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-critical-50 p-3 text-sm text-critical-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
