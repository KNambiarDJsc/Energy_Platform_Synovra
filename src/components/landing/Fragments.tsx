/**
 * Working pieces of the product's interface, built in HTML at true size.
 * Each root carries `data-ui`: inside it the product's own conventions apply (its chips, its row rules, its field outlines).
 */
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { B0002, STAGES, pct } from './b0002';

function Bar({ value }: { value: number }) {
  return (
    <span className="ui-bar" role="img" aria-label={`${value}% of rated capacity. The demonstration threshold is ${B0002.thresholdPct}%.`}>
      <span style={{ width: `${value}%` }} />
      <i style={{ left: `${B0002.thresholdPct}%` }} aria-hidden />
    </span>
  );
}

const ENTRIES: { name: string; todo: string; done: ReactNode }[] = [
  {
    name: 'Received at intake',
    todo: 'Not yet recorded.',
    done: <>Internal ID bat_0002, for life. Label {B0002.label} and QR reference {B0002.lookupRef} only point to it.</>,
  },
  {
    name: 'Initial test',
    todo: 'Not yet recorded. The measured capacity, the instrument and its calibration go here.',
    done: (
      <>
        <b className="ui-num">{B0002.initialAh} Ah</b>, {pct(B0002.initialAh)}% of rated
        <Bar value={pct(B0002.initialAh)} />
        <span className="ui-dim">{B0002.instrument}, {B0002.calibration}</span>
      </>
    ),
  },
  {
    name: 'Restoration attempt 1',
    todo: 'Not yet recorded. The work, its lots and what it cost go here.',
    done: <>Bench time AED 48. Inputs <span className="ui-unknown">unknown, not yet allocated</span>, so the attempt cost is <span className="ui-unknown">unknown</span>.</>,
  },
  {
    name: 'Final test and decision',
    todo: 'Not yet recorded. The final capacity, the rule check and an engineer’s decision go here.',
    done: (
      <>
        <b className="ui-num">{B0002.finalAh} Ah</b>, {pct(B0002.finalAh)}% of rated
        <Bar value={pct(B0002.finalAh)} />
        Approved by a battery engineer: result matches bench log.
      </>
    ),
  },
];

/** B-0002's passport. Entries fill in as the stage advances; what has not happened yet says so. */
export function PassportObject({ stage }: { stage: number }) {
  const s = STAGES[stage];
  return (
    <div data-ui className="pp">
      <div className="pp-head">
        <span>
          <span className="pp-label">{B0002.label}</span>
          <span className="pp-sub">{B0002.model} · {B0002.spec}</span>
        </span>
        <span key={s.key} className={`ui-chip ui-chip-${s.tone} pp-chip`}>{s.chip}</span>
      </div>
      <ol className="pp-list" aria-label="Passport entries">
        {ENTRIES.map((e, n) => {
          const done = n <= stage;
          return (
            <li key={e.name} className={done ? 'pp-entry is-done' : 'pp-entry'} aria-current={n === stage ? 'step' : undefined}>
              <span className="pp-dot" aria-hidden />
              <span className="pp-name">{e.name}</span>
              <span className="pp-cell">
                <span className="pp-done" aria-hidden={!done}>{e.done}</span>
                <span className="pp-todo" aria-hidden={done}>{e.todo}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Small proofs for "What it enforces": each shows one rule the way the product shows it. */
export function AuditProof() {
  return (
    <div data-ui className="ui ui-w">
      <p className="ui-title">Audit history, B-0002</p>
      <ul className="ui-log">
        <li>
          <span className="ui-time ui-num">14:02 GST</span>
          <span>
            <span className="ui-chip ui-chip-no">Refused</span> Qualify battery
            <span className="ui-dim">Lab technician. This role cannot qualify a battery.</span>
          </span>
        </li>
        <li>
          <span className="ui-time ui-num">13:47 GST</span>
          <span>
            Final test recorded
            <span className="ui-dim">Lab technician. 174 Ah on discharge bench DB-2.</span>
          </span>
        </li>
      </ul>
    </div>
  );
}

export function EvidenceProof() {
  return (
    <div data-ui className="ui ui-w">
      <div className="ui-file">
        <span className="ui-file-icon" aria-hidden><FileText size={20} strokeWidth={1.75} /></span>
        <span>
          <span className="ui-strong">final-test-B-0002.pdf</span>
          <span className="ui-dim">Test report · 212 KB · lab technician</span>
        </span>
      </div>
      <dl className="ui-rows">
        <div className="ui-row"><dt>SHA-256</dt><dd className="ui-num">9c41e0a7b3f2…5d18</dd></div>
        <div className="ui-row"><dt>Classification</dt><dd><span className="ui-chip">Internal</span></dd></div>
        <div className="ui-row"><dt>Customer view</dt><dd>Not shown</dd></div>
      </dl>
    </div>
  );
}

export function ReadingProof() {
  return (
    <div data-ui className="ui ui-w">
      <p className="ui-title">Demo Site C, string 2</p>
      <ul className="ui-slots">
        <li><span>Position 1 · B-0031</span><span className="ui-num">13.41 V, 4 min ago</span></li>
        <li><span>Position 2 · B-0032</span><span className="ui-chip ui-chip-wait">Unverified mapping</span></li>
        <li><span>Position 3</span><span className="ui-dim">Not mapped</span></li>
      </ul>
    </div>
  );
}

export function RecyclingProof() {
  return (
    <div data-ui className="ui ui-w">
      <div className="ui-head">
        <span className="ui-strong">B-0118</span>
        <span className="ui-chip">Recycled</span>
      </div>
      <dl className="ui-rows">
        <div className="ui-row"><dt>Recycler</dt><dd>Licensed recycler (placeholder)</dd></div>
        <div className="ui-row"><dt>Consignment</dt><dd className="ui-num">CN-DEMO-0418, 61.5 kg</dd></div>
        <div className="ui-row"><dt>Certificate</dt><dd className="ui-unknown">Not received</dd></div>
      </dl>
    </div>
  );
}
