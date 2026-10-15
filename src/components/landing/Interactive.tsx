'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DATA_SOURCE } from '@/lib/runtime';
import { DEMO_USER_FOR_ROLE, setSessionUserId } from '@/services/session';
import { B0002, STAGES, pct } from './b0002';
import { PassportObject } from './Fragments';

/**
 * Calls `pick(i)` with the index of the element that holds the middle of the viewport, on wide screens only,
 * and only when that index changes, so a choice made with a control holds until the reader scrolls on.
 */
function useMiddle(items: { current: (HTMLElement | null)[] }, pick: (i: number) => void, rule: 'nearest' | 'contains') {
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 901px)');
    let frame = 0;
    let last = -1;
    const update = () => {
      frame = 0;
      if (!wide.matches) return;
      const mid = window.innerHeight / 2;
      let best = -1;
      let dist = Infinity;
      items.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (rule === 'contains') {
          if (mid >= r.top && mid < r.bottom) best = i;
        } else {
          const d = Math.abs((r.top + r.bottom) / 2 - mid);
          if (d < dist) { dist = d; best = i; }
        }
      });
      if (best >= 0 && best !== last) { last = best; pick(best); }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [items, pick, rule]);
}

/**
 * The first screens: the sheet on the left, B-0002's passport held still on the right while its
 * four stages pass on the left. Scrolling or the slider moves the stage; neither moves the other.
 */
export function Lifecycle({ sheet }: { sheet: ReactNode }) {
  const [stage, setStage] = useState(0);
  const blocks = useRef<(HTMLElement | null)[]>([]);
  useMiddle(blocks, setStage, 'nearest');
  const s = STAGES[stage];

  return (
    <div className="lp-duo">
      {sheet}
      <div className="lp-life-intro" id="lifecycle">
        <h2 data-reveal>One battery, four stages</h2>
        <p data-reveal style={{ ['--i' as string]: 1 }}>
          {B0002.label} is synthetic, like every record here. Scroll, or move the slider under its passport, and the passport fills in.
        </p>
      </div>
      <div className="lp-stage" role="region" aria-label={`Passport of synthetic battery ${B0002.label}`}>
        <div className="lp-stage-body" data-rise style={{ ['--i' as string]: 2 }}>
          <PassportObject stage={stage} />
          <div className="lp-slider">
            <span className="lp-track" aria-hidden>
              <span style={{ transform: `scaleX(${stage / (STAGES.length - 1)})` }} />
            </span>
            <input
              type="range" min={0} max={STAGES.length - 1} step={1} value={stage}
              aria-label="Lifecycle stage" aria-valuetext={s.name}
              onChange={(e) => setStage(Number(e.target.value))}
            />
            <ol className="lp-stops">
              {STAGES.map((st, n) => (
                <li key={st.key} aria-current={n === stage ? 'step' : undefined}>
                  <button type="button" onClick={() => setStage(n)}>{st.name}</button>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="lp-stage-bar">
          <span>{B0002.label} · synthetic record</span>
          <span>{B0002.model} · {B0002.spec}</span>
        </p>
      </div>
      <ol className="lp-life" aria-label="Stages of the record">
        {STAGES.map((st, n) => (
          <li key={st.key} ref={(el) => { blocks.current[n] = el; }} className={n === stage ? 'lp-statement is-on' : 'lp-statement'}>
            <h3 data-reveal>{st.clause}</h3>
            <p data-reveal style={{ ['--i' as string]: 1 }}>{st.proof}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Viewer = 'engineer' | 'technician' | 'customer';
const VIEWERS: { key: Viewer; name: string }[] = [
  { key: 'engineer', name: 'Battery engineer' },
  { key: 'technician', name: 'Lab technician' },
  { key: 'customer', name: 'Customer auditor' },
];
type Decision = { tone: 'no' | 'ok'; text: string } | null;

/** Try the rules: the controls on the dark field change the record on the light one, and the changes stay. */
export function RulesDemo() {
  const [viewer, setViewer] = useState<Viewer>('engineer');
  const [inputs, setInputs] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [label, setLabel] = useState('');
  const customer = viewer === 'customer';
  const looked = label.trim().toUpperCase();
  const viewerName = VIEWERS.find((v) => v.key === viewer)!.name;

  const approve = (by: 'rule' | 'person') => {
    if (by === 'rule') setDecision({ tone: 'no', text: 'Refused. A rule check informs the decision; it cannot make it. The refusal is written to the audit log.' });
    else if (viewer !== 'engineer') setDecision({ tone: 'no', text: `Refused. A ${viewerName.toLowerCase()} cannot qualify a battery. The refusal is written to the audit log.` });
    else setDecision({ tone: 'ok', text: 'Approved by a battery engineer. Reason: result matches bench log; conditions per protocol.' });
  };

  return (
    <section className="lp-rules" id="rules" aria-labelledby="rules-h">
      <h2 id="rules-h" className="lp-rules-h">
        <span data-reveal>Try the</span> <span data-reveal style={{ ['--i' as string]: 1 }}>rules</span>
      </h2>
      <div className="lp-rules-out">
        <div data-ui className="ui ui-record" aria-live="polite" data-reveal style={{ ['--i' as string]: 2 }}>
          <div className="ui-head">
            <span>
              <span className="ui-big">{B0002.label}</span>
              <span className="ui-dim">Seen as: {viewerName}</span>
            </span>
            <span className={`ui-chip ${decision?.tone === 'ok' ? 'ui-chip-ok' : 'ui-chip-wait'}`}>{decision?.tone === 'ok' ? 'Qualified' : 'Awaiting review'}</span>
          </div>
          <dl className="ui-rows">
            <div className="ui-row"><dt>Final test</dt><dd>{B0002.finalAh} Ah, {pct(B0002.finalAh)}% of rated</dd></div>
            <div className="ui-row"><dt>Protocol</dt><dd>{customer ? 'Summary only (controlled detail removed)' : B0002.protocol}</dd></div>
            <div className="ui-row"><dt>Instrument</dt><dd>{customer ? 'Summary only (controlled detail removed)' : `${B0002.instrument} · ${B0002.calibration}`}</dd></div>
            <div className="ui-row">
              <dt>Restoration cost</dt>
              {customer ? <dd>Internal costs are not shown to customers</dd> : <dd className={inputs ? undefined : 'ui-unknown'}>{inputs ? 'AED 144 (bench 48 + inputs 96)' : 'Unknown: inputs not yet allocated'}</dd>}
            </div>
          </dl>
          {decision && <p key={decision.text} className={`ui-event ui-event-${decision.tone}`}>{decision.text}</p>}
          {looked && (
            <p className="ui-event ui-event-info">
              {looked === B0002.label ? `Label ${looked} found. Signing in decides what you may see of it.` : `No battery with label ${looked} in this example.`}
            </p>
          )}
        </div>
      </div>
      <div className="lp-rules-in">
        <div className="lp-block" data-reveal>
          <h3>One record, three readers.</h3>
          <p>Access is enforced where the data is read, not in the screen. A customer sees their own battery without internal costs or controlled detail.</p>
          <div className="lp-seg" role="group" aria-label="View the record as">
            {VIEWERS.map((v) => (
              <button key={v.key} type="button" aria-pressed={viewer === v.key} onClick={() => setViewer(v.key)}>{v.name}</button>
            ))}
          </div>
        </div>
        <div className="lp-block" data-reveal>
          <h3>Missing stays missing.</h3>
          <p>A cost nobody entered is listed as unknown, never counted as zero, so a total is either complete or says it is not.</p>
          <label className="lp-switch">
            <input type="checkbox" role="switch" checked={inputs} onChange={(e) => setInputs(e.target.checked)} />
            Input cost has been allocated
          </label>
        </div>
        <div className="lp-block" data-reveal>
          <h3>A person decides.</h3>
          <p>The rule check reports whether the result meets the demonstration threshold. Only a battery engineer can qualify a battery, and only with a reason.</p>
          <div className="lp-actions">
            <button type="button" className="lp-ghost" onClick={() => approve('rule')}>Let the rule check approve</button>
            <button type="button" className="lp-ghost" onClick={() => approve('person')}>Approve as the current reader</button>
          </div>
        </div>
        <div className="lp-block" data-reveal>
          <h3>A label finds; it never opens.</h3>
          <p>The QR code on a battery is a lookup reference. It finds the record; your sign-in decides what you see.</p>
          <label className="lp-type">
            Type a label
            <input className="lp-field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={B0002.label} autoComplete="off" spellCheck={false} />
          </label>
        </div>
      </div>
    </section>
  );
}

export type Question = { q: string; where: string; more: string; pic: number };
export type Picture = {
  src: string; alt: string; width: number; height: number; caption: string;
  title: string; by: string; licence: string; licenceUrl?: string; url: string; focus?: string;
};

/**
 * Questions it answers: the photograph holds still while the list passes it. The row in the middle of the
 * screen (or under the pointer, or focused) is the open one, and the photograph turns to its world.
 */
export function QuestionList({ rows, pictures }: { rows: Question[]; pictures: Picture[] }) {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLElement | null)[]>([]);
  useMiddle(items, setActive, 'contains');
  const pic = rows[active].pic;

  return (
    <section className="lp-q" id="questions" aria-labelledby="q-h">
      <h2 id="q-h" className="lp-q-h" data-reveal>Questions it answers</h2>
      <figure className="lp-q-fig" data-reveal style={{ ['--i' as string]: 1 }}>
        <div className="lp-q-pics">
          {pictures.map((p, n) => (
            <Image
              key={p.src} src={p.src} alt={p.alt} width={p.width} height={p.height}
              sizes="(max-width: 900px) 100vw, 34vw"
              className={n === pic ? 'is-on' : undefined}
              style={p.focus ? { objectPosition: p.focus } : undefined}
              aria-hidden={n !== pic}
            />
          ))}
        </div>
        <figcaption className="lp-q-caps">
          {pictures.map((p, n) => (
            <span key={p.src} className={n === pic ? 'lp-cap is-on' : 'lp-cap'}>
              {p.caption}{' '}
              <a href={p.url} rel="noopener noreferrer" target="_blank">{p.title}</a>, {p.by},{' '}
              {p.licenceUrl ? <a href={p.licenceUrl} rel="noopener noreferrer" target="_blank">{p.licence}</a> : p.licence}, via Wikimedia Commons.
            </span>
          ))}
        </figcaption>
      </figure>
      <ul className="lp-q-list">
        {rows.map((r, i) => (
          <li
            key={r.q}
            ref={(el) => { items.current[i] = el; }}
            className={i === active ? 'lp-qrow is-on' : 'lp-qrow'}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            data-reveal
            style={{ ['--i' as string]: i }}
          >
            <button type="button" aria-expanded={i === active} aria-controls={`q-more-${i}`} onClick={() => setActive(i)}>
              <span className="lp-qrow-q">{r.q}</span>
              <span className="lp-qrow-where">{r.where}</span>
            </button>
            <div id={`q-more-${i}`} className="lp-qrow-more" aria-hidden={i !== active}>
              <div><p>{r.more}</p></div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Reader = 'battery_engineer' | 'customer_auditor';
const READERS: { key: Reader; name: string; example: string }[] = [
  { key: 'battery_engineer', name: 'Battery engineer', example: B0002.label },
  { key: 'customer_auditor', name: 'Customer auditor', example: 'B-0004' },
];

/**
 * The close: the product's own first step, already open. Its button signs in to the demonstration as the
 * chosen reader and opens that passport. Against the API it goes through sign-in first.
 */
export function OpenPassport() {
  const router = useRouter();
  const [reader, setReader] = useState<Reader>('battery_engineer');
  const [label, setLabel] = useState<string>(B0002.label);
  const [typed, setTyped] = useState(false);
  const dest = `/app/scan?label=${encodeURIComponent((label.trim() || B0002.label).toUpperCase())}`;

  const choose = (r: Reader) => {
    setReader(r);
    if (!typed) setLabel(READERS.find((x) => x.key === r)!.example);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (DATA_SOURCE === 'mock') {
      setSessionUserId(DEMO_USER_FOR_ROLE[reader]);
      router.push(dest);
    } else router.push(`/signin?next=${encodeURIComponent(dest)}`);
  };

  return (
    <form data-ui className="dlg" onSubmit={submit} action="/signin" method="get" aria-labelledby="open-title" data-reveal style={{ ['--i' as string]: 2 }}>
      <input type="hidden" name="next" value={dest} />
      <p id="open-title" className="dlg-title">Open a battery passport</p>
      <label className="dlg-label" htmlFor="open-label">Battery label</label>
      <input
        id="open-label" className="dlg-input" value={label} autoComplete="off" spellCheck={false}
        onChange={(e) => { setLabel(e.target.value); setTyped(true); }}
      />
      <p className="dlg-hint">
        {reader === 'customer_auditor' ? 'A customer sees the batteries at its own sites, such as B-0004 and B-0005.' : 'B-0001 to B-0006 each tell one walkthrough story.'}
      </p>
      <fieldset className="dlg-set">
        <legend className="dlg-label">Read it as</legend>
        <div className="dlg-seg">
          {READERS.map((r) => (
            <label key={r.key}>
              <input type="radio" name="as" value={r.key} checked={reader === r.key} onChange={() => choose(r.key)} />
              <span>{r.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="dlg-go">Show the passport</button>
      <p className="dlg-note">Demonstration sign-in. No password.</p>
    </form>
  );
}

/** Reveals each [data-reveal] / [data-open] once as it enters. Without script everything is already visible. */
export function Reveals() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.lp [data-reveal], .lp [data-open]');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
