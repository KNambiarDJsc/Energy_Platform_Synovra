'use client';
import { Coins, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, parseNumberInput } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Overlay';
import type { ValueRecord } from '@/domain/types';
import { formatAed, formatDate } from '@/lib/format';
import { errorMessage, useAction, useSession } from '@/lib/hooks';
import type { BatteryPassport } from '@/services/types';

const KIND: Record<ValueRecord['kind'], string> = {
  sale: 'Sale', swap_fee: 'Swap fee', restoration_fee: 'Restoration fee', recycling_settlement: 'Recycler settlement',
};

function RecordValue({ p, open, onOpenChange }: { p: BatteryPassport; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [kind, setKind] = useState<ValueRecord['kind']>(p.recycling ? 'recycling_settlement' : 'sale');
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [who, setWho] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const amt = parseNumberInput(amount);
  const act = useAction<void, ValueRecord>(
    (s) => s.values.record({ batteryId: p.battery.id, kind, amountAed: amt, recordedOn: on, counterparty: who, reference: ref || null, note }),
    { success: 'Recorded. It cannot be edited; a correction is a new record with a note.', onSuccess: () => { onOpenChange(false); setAmount(''); setWho(''); setRef(''); setNote(''); }, toastError: false },
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Record money in for ${p.battery.label}`}
      description="Sales, fees and recycler settlements. Leave the amount empty if it is agreed but not yet known."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={act.isPending} disabled={Number.isNaN(amt as number)} onClick={() => act.mutate()}>Record</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ValueRecord['kind'])}>
            {(Object.keys(KIND) as ValueRecord['kind'][]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
          </Select>
        </Field>
        <Field label="Amount (AED)" hint="Empty means not yet known, never zero." error={Number.isNaN(amt as number) ? 'Enter a number.' : null}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Not yet known" />
        </Field>
        <Field label="Date" required><Input type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        <Field label="Paid by" required><Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Customer or recycler" /></Field>
        <Field label="Reference" hint="Invoice or consignment number."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="Note" className="sm:col-span-2"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      </div>
      {act.error && <p role="alert" className="mt-3 text-sm font-medium text-critical-700">{errorMessage(act.error)}</p>}
    </Modal>
  );
}

/** Money in for one battery: the other half of the cost ledger, needed to tell whether reviving it paid. */
export function ValuesPanel({ p }: { p: BatteryPassport }) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  if (p.values === null) return null;
  const known = p.values.filter((v) => v.amountAed !== null);
  const total = known.reduce((n, v) => n + (v.amountAed ?? 0), 0);
  return (
    <Section
      title="Money in"
      description="Sales, fees and recycler settlements recorded for this battery. Each record is permanent."
      actions={session.can('value.write') ? <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>Record money in</Button> : undefined}
      className="mt-5"
    >
      {p.values.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Coins className="h-4 w-4" aria-hidden />Nothing recorded. Whether reviving this battery paid cannot be told yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {p.values.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{KIND[v.kind]} · {v.counterparty}</span>
                  <span className="block text-[13px] text-muted">{formatDate(v.recordedOn)}{v.reference ? ` · ${v.reference}` : ''} · {v.source}{v.note ? ` · ${v.note}` : ''}</span>
                </span>
                {v.amountAed === null ? <Badge tone="amber">Not yet known</Badge> : <span className="num font-display text-[22px] text-ink">{formatAed(v.amountAed)}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2">
            Known total {formatAed(total)}{known.length < p.values.length ? `, a minimum: ${p.values.length - known.length} not yet known` : ''}.
          </p>
        </>
      )}
      <RecordValue p={p} open={open} onOpenChange={setOpen} />
    </Section>
  );
}
