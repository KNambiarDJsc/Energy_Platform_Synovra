'use client';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Overlay';
import { ROLE_LABELS } from '@/domain/permissions';
import type { Role } from '@/domain/types';
import {
  addDemoRequest, REQUEST_KIND_LABELS, REQUEST_WINDOW_LABELS, type DemoRequest, type RequestKind, type RequestWindow,
} from '@/lib/customer/requests';

/**
 * A clickable maintenance or replacement request. It is a demonstration: the request is kept in this browser and
 * nothing is sent to Synovra or to a service team, which the form and the confirmation both say.
 */
export function RequestDialog({ open, onOpenChange, kind, battery, site, role, suggestion }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: RequestKind;
  battery: { id: string; label: string };
  site: { id: string; name: string };
  role: Role | null;
  /** What the record's own next step says, offered as the starting note. */
  suggestion: string;
}) {
  const [window, setWindow] = useState<RequestWindow>('within_30_days');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<DemoRequest | null>(null);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(() => { setDone(null); setNote(''); }, 200);
  };
  const submit = () => {
    setDone(addDemoRequest({
      kind, batteryId: battery.id, batteryLabel: battery.label, siteId: site.id, siteName: site.name, window, note: note.trim(),
      requestedByRole: role ? ROLE_LABELS[role] : 'Unknown role',
    }));
  };

  const title = `${REQUEST_KIND_LABELS[kind]} for ${battery.label}`;
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={done ? 'Request recorded (demo)' : title}
      description={done ? undefined : `${site.name}. Demonstration only: nothing is sent to a service team.`}
      footer={done
        ? <Button onClick={() => close(false)}>Done</Button>
        : (<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button><Button onClick={submit}>{kind === 'maintenance' ? 'Submit request (demo)' : 'Save plan (demo)'}</Button></>)}
    >
      {done ? (
        <div role="status" data-testid="request-confirmation">
          <p className="flex items-start gap-2 text-[15px] text-ink"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-approved" aria-hidden />
            <span><strong className="font-semibold">{done.id}</strong>: {REQUEST_KIND_LABELS[done.kind].toLowerCase()} for {done.batteryLabel}, {REQUEST_WINDOW_LABELS[done.window].toLowerCase()}.</span>
          </p>
          <Notice tone="synthetic" className="mt-4" title="This was a demonstration">
            The request is saved in this browser only. No service request was created, no one was notified, and nothing was scheduled.
          </Notice>
        </div>
      ) : (
        <div className="space-y-4">
          <Notice tone="synthetic">A locally simulated request. A real workflow would route it to your service team and schedule a visit.</Notice>
          <Field label="When would you like this done?">
            <Select value={window} onChange={(e) => setWindow(e.target.value as RequestWindow)}>
              {(Object.keys(REQUEST_WINDOW_LABELS) as RequestWindow[]).map((w) => <option key={w} value={w}>{REQUEST_WINDOW_LABELS[w]}</option>)}
            </Select>
          </Field>
          <Field label="Note" hint={`The record suggests: ${suggestion}`}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the technician should know" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
