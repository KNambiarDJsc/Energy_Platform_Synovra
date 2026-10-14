'use client';
import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Field, Textarea } from './Field';
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
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
}

/** Consequential actions (approve, reject, reissue, deploy) always pass through here. */
export function ReasonDialog({
  open, onOpenChange, title, description, summary, confirmLabel, variant = 'primary',
  requireReason = true, reasonLabel = 'Reason', reasonHint, loading, error, onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  // Start each opening with an empty reason (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('');
      setTouched(false);
    }
  }

  const tooShort = requireReason && reason.trim().length < 5;

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
              if (tooShort) return;
              onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {summary && <div className="text-sm text-ink">{summary}</div>}
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
          <p role="alert" className="rounded-md border border-[#EBC4C4] bg-critical-50 p-3 text-sm text-critical-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
