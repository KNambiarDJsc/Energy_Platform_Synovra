'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { B0002, STAGES, pct, type StageKey } from './b0002';
import { DecisionFragment, IdentityFragment, RestoreFragment, StageFragment, TestFragment } from './Fragments';

const REEL = [
  { key: 'intake', name: 'Received', node: <IdentityFragment /> },
  { key: 'initial', name: 'Initial test', node: <TestFragment kind="initial" /> },
  { key: 'restore', name: 'Restoration', node: <RestoreFragment /> },
  { key: 'final', name: 'Final test', node: <TestFragment kind="final" /> },
  { key: 'decision', name: 'Decision', node: <DecisionFragment /> },
];

/**
 * The hero: the two halves of the headline hold still while B-0002's record passes between them.
 * The stage is sticky; ordinary scrolling advances the reel (nothing is hijacked). Phones get a swipe row.
 */
export function HeroReel() {
  const hero = useRef<HTMLElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Wide screens: scroll to the point where that frame is centred. Phones: show that frame.
  const go = (i: number) => {
    const el = hero.current;
    if (el && window.matchMedia('(min-width: 901px)').matches) {
      const travel = el.offsetHeight - window.innerHeight;
      window.scrollTo({ top: el.offsetTop + (travel * i) / (REEL.length - 1), behavior: 'smooth' });
    } else setActive(i);
  };

  useEffect(() => {
    const el = hero.current;
    const strip = reel.current;
    if (!el || !strip) return;
    const wide = window.matchMedia('(min-width: 901px)');
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!wide.matches) { strip.style.transform = ''; return; }
      const rect = el.getBoundingClientRect();
      const travel = Math.max(1, el.offsetHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / travel));
      const first = strip.children[0] as HTMLElement | undefined;
      const step = first ? first.offsetHeight + 24 : 0;
      const pos = p * (REEL.length - 1);
      strip.style.transform = `translateY(${(((REEL.length - 1) * step) / 2) - pos * step}px)`;
      setActive(Math.round(pos));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    wide.addEventListener('change', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      wide.removeEventListener('change', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={hero} className="lp-hero" aria-labelledby="hero-h">
      <div className="lp-stage">
        <h1 id="hero-h">
          <span className="lp-half" data-rise style={{ ['--i' as string]: 0 }}>Every battery,</span>{' '}
          <span className="lp-half lp-half-b" data-rise style={{ ['--i' as string]: 1 }}>on the record.</span>
        </h1>
        <div className="lp-reel-window" style={{ gridColumn: 2, gridRow: '1 / 4' }} aria-label="The passport of synthetic battery B-0002, stage by stage" role="region">
          <div ref={reel} className="lp-reel">
            {REEL.map((r, i) => (
              <div key={r.key} className={`lp-frame${i === active ? ' is-on' : ''}`} aria-label={r.name} role="group">
                {r.node}
              </div>
            ))}
          </div>
        </div>
        <div className="lp-hero-foot" data-rise style={{ ['--i' as string]: 2 }}>
          <p>One passport for each lead-acid battery, from intake to recycling. Every claim on it points to the record behind it.</p>
          <a className="lp-btn" href="/signin">Open the demo</a>
        </div>
        <ol className="lp-steps" aria-label="Stages of the record">
          {REEL.map((r, i) => (
            <li key={r.key} aria-current={i === active ? 'step' : undefined}>
              <button type="button" onClick={() => go(i)}>{r.name}</button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Drag through the stages: one slider drives the clause and the fragment. */
export function StageSlider() {
  const [i, setI] = useState(0);
  const s = STAGES[i];
  return (
    <section className="lp-split" id="lifecycle" aria-labelledby="stage-h">
      <div className="lp-split-a">
        <h2 id="stage-h" key={`h-${s.key}`} className="lp-swap" aria-live="polite">{s.clause}</h2>
        <p key={`p-${s.key}`} className="lp-swap">{s.proof}</p>
      </div>
      <div className="lp-split-b">
        <div key={s.key} className="lp-swap" style={{ width: '100%', display: 'grid', placeItems: 'center' }}>
          <StageFragment stage={s.key as StageKey} />
        </div>
      </div>
      <div className="lp-slider">
        <div className="lp-track">
          <span style={{ width: `${(i / (STAGES.length - 1)) * 100}%` }} />
          <input
            type="range" min={0} max={STAGES.length - 1} step={1} value={i}
            aria-label="Lifecycle stage" aria-valuetext={s.name}
            onChange={(e) => setI(Number(e.target.value))}
          />
        </div>
        <ol>
          {STAGES.map((st, n) => (
            <li key={st.key} aria-current={n === i ? 'step' : undefined}>
              <button type="button" onClick={() => setI(n)}>{st.name}</button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type Viewer = 'engineer' | 'technician' | 'customer';
const VIEWERS: { key: Viewer; name: string }[] = [
  { key: 'engineer', name: 'Battery engineer' },
  { key: 'technician', name: 'Lab technician' },
  { key: 'customer', name: 'Customer auditor' },
];
type Decision = { tone: 'no' | 'ok'; text: string } | null;

/** Try the rules: controls on the right change the record on the left, and the changes stay. */
export function RulesDemo() {
  const [viewer, setViewer] = useState<Viewer>('engineer');
  const [inputs, setInputs] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [label, setLabel] = useState('');
  const customer = viewer === 'customer';
  const looked = label.trim().toUpperCase();

  const approve = (by: 'rule' | 'person') => {
    if (by === 'rule') setDecision({ tone: 'no', text: 'Refused. A rule check informs the decision; it cannot make it. The refusal is written to the audit log.' });
    else if (viewer !== 'engineer') setDecision({ tone: 'no', text: `Refused. A ${VIEWERS.find((v) => v.key === viewer)!.name.toLowerCase()} cannot qualify a battery. The refusal is written to the audit log.` });
    else setDecision({ tone: 'ok', text: 'Approved by a battery engineer. Reason: result matches bench log; conditions per protocol.' });
  };

  return (
    <section className="lp-rules" id="rules" aria-labelledby="rules-h">
      <div className="lp-rules-out">
        <div data-ui className="ui-frag" aria-live="polite">
          <div className="ui-head">
            <div>
              <p className="ui-label">{B0002.label}</p>
              <p className="ui-sub">Seen as: {VIEWERS.find((v) => v.key === viewer)!.name}</p>
            </div>
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
          {decision && <p className={`ui-event ui-event-${decision.tone}`}>{decision.text}</p>}
          {looked && (
            <p className="ui-event ui-event-info">
              {looked === B0002.label ? `Label ${looked} found. Signing in decides what you may see of it.` : `No battery with label ${looked} in this example.`}
            </p>
          )}
        </div>
      </div>
      <div className="lp-rules-in">
        <h2 id="rules-h" data-reveal>Try the rules</h2>
        <div className="lp-block" data-reveal>
          <h3>One record, three readers.</h3>
          <p>Access is enforced where the data is read, not hidden in the screen. A customer sees their own battery without internal costs or controlled process detail.</p>
          <div className="lp-seg" role="group" aria-label="View the record as">
            {VIEWERS.map((v) => (
              <button key={v.key} type="button" aria-pressed={viewer === v.key} onClick={() => setViewer(v.key)}>{v.name}</button>
            ))}
          </div>
        </div>
        <div className="lp-block" data-reveal>
          <h3>Missing stays missing.</h3>
          <p>A cost nobody entered is listed as unknown. It is never counted as zero, so a total is either complete or says it is not.</p>
          <label className="lp-switch">
            <input type="checkbox" checked={inputs} onChange={(e) => setInputs(e.target.checked)} />
            Input cost has been allocated
          </label>
        </div>
        <div className="lp-block" data-reveal>
          <h3>A person decides.</h3>
          <p>The rule check reports whether the result meets the demonstration threshold. Only a battery engineer can qualify the battery, and only with a reason.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="lp-ghost" onClick={() => approve('rule')}>Let the rule check approve</button>
            <button type="button" className="lp-ghost" onClick={() => approve('person')}>Approve as the current reader</button>
          </div>
        </div>
        <div className="lp-block" data-reveal>
          <h3>A label finds; it never opens.</h3>
          <p>The QR code on a battery is a lookup reference. Scanning it finds the record; your sign-in decides what you see.</p>
          <label style={{ display: 'grid', gap: 6, fontSize: 15, fontWeight: 500 }}>
            Type a label
            <input className="lp-field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="B-0002" autoComplete="off" spellCheck={false} />
          </label>
        </div>
      </div>
    </section>
  );
}

/** The closing sentence: its blank is the label lookup. */
export function LookupSentence() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const l = (label.trim() || B0002.label).toUpperCase();
    router.push(`/signin?next=${encodeURIComponent(`/app/scan?label=${l}`)}`);
  };
  return (
    <section className="lp-cta" aria-labelledby="cta-h">
      <form onSubmit={submit} action="/signin" method="get">
        <input type="hidden" name="next" value={`/app/scan?label=${(label.trim() || B0002.label).toUpperCase()}`} />
        <h2 id="cta-h" data-reveal>
          Show me the<br />
          <input aria-label="Battery label" className="lp-blank" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={B0002.label} autoComplete="off" spellCheck={false} />{' '}
          <button type="submit" className="lp-go">passport</button>
        </h2>
      </form>
      <p data-reveal style={{ ['--i' as string]: 1 }}>Opens the demo sign-in, then that battery&apos;s passport. Labels B-0001 to B-0006 tell the walkthrough stories. Everything in it is synthetic.</p>
    </section>
  );
}

/** Reveals each [data-reveal] / [data-open] once as it enters. Without script everything is already visible. */
export function Reveals() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.lp [data-reveal], .lp [data-open]');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
