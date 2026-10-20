'use client';
import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { B0002, STAGES } from './b0002';
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
 * The lifecycle chapter: B-0002's passport is held still on the right while its four stages pass on the left.
 * Scrolling or the slider moves the stage; neither moves the other.
 */
export function Lifecycle() {
  const [stage, setStage] = useState(0);
  const blocks = useRef<(HTMLElement | null)[]>([]);
  useMiddle(blocks, setStage, 'nearest');
  const s = STAGES[stage];

  return (
    <section className="lp-lifesec" id="lifecycle" aria-labelledby="life-h">
      <div className="lp-lifegrid">
        <div className="lp-lifetext">
          <p className="lp-eyebrow" data-reveal>The record</p>
          <h2 id="life-h" className="lp-h2" data-reveal style={{ ['--i' as string]: 1 }}>
            One battery, <em>four stages</em>
          </h2>
          <p className="lp-lead" data-reveal style={{ ['--i' as string]: 2 }}>
            {B0002.label} is synthetic, like every record here. Scroll, or move the slider under its passport, and the passport fills in.
          </p>
          <ol className="lp-life" aria-label="Stages of the record">
            {STAGES.map((st, n) => (
              <li key={st.key} ref={(el) => { blocks.current[n] = el; }} className={n === stage ? 'lp-statement is-on' : 'lp-statement'}>
                <span className="lp-num" aria-hidden>0{n + 1}</span>
                <h3 data-reveal>{st.clause}</h3>
                <p data-reveal style={{ ['--i' as string]: 1 }}>{st.proof}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="lp-stage" data-spot role="region" aria-label={`Passport of synthetic battery ${B0002.label}`}>
          <div className="lp-stage-glow" aria-hidden />
          <div className="lp-stage-body">
            <div className="lp-tilt" data-tilt>
              <PassportObject stage={stage} />
            </div>
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
      </div>
    </section>
  );
}

export type Question = { q: string; where: string; more: string; pic: number };
/** A photograph (with its credit) or a drawing (`art`). A drawing is always captioned as an illustration. */
export type Picture = {
  alt: string; caption: string;
  src?: string; width?: number; height?: number; focus?: string;
  title?: string; by?: string; licence?: string; licenceUrl?: string; url?: string;
  art?: ReactNode;
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
      <div className="lp-q-head">
        <p className="lp-eyebrow" data-reveal>What it is for</p>
        <h2 id="q-h" className="lp-h2" data-reveal style={{ ['--i' as string]: 1 }}>Questions it answers</h2>
      </div>
      <figure className="lp-q-fig" data-reveal style={{ ['--i' as string]: 1 }}>
        <div className="lp-q-pics">
          {pictures.map((p, n) =>
            p.art ? (
              <div key={n} role="img" aria-label={p.alt} aria-hidden={n !== pic} className={n === pic ? 'lp-art is-on' : 'lp-art'}>{p.art}</div>
            ) : (
              <Image
                key={p.src} src={p.src!} alt={p.alt} width={p.width!} height={p.height!}
                sizes="(max-width: 900px) 100vw, 34vw"
                className={n === pic ? 'is-on' : undefined}
                style={p.focus ? { objectPosition: p.focus } : undefined}
                aria-hidden={n !== pic}
              />
            ),
          )}
        </div>
        <figcaption className="lp-q-caps">
          {pictures.map((p, n) => (
            <span key={n} className={n === pic ? 'lp-cap is-on' : 'lp-cap'}>
              {p.caption}{' '}
              {p.art ? (
                <>Illustration, drawn for this page.</>
              ) : (
                <>
                  <a href={p.url} rel="noopener noreferrer" target="_blank">{p.title}</a>, {p.by},{' '}
                  {p.licenceUrl ? <a href={p.licenceUrl} rel="noopener noreferrer" target="_blank">{p.licence}</a> : p.licence}, via Wikimedia Commons.
                </>
              )}
            </span>
          ))}
        </figcaption>
      </figure>
      <ul className="lp-q-list">
        {rows.map((r, i) => (
          <li
            key={r.q}
            data-spot
            ref={(el) => { items.current[i] = el; }}
            className={i === active ? 'lp-qrow is-on' : 'lp-qrow'}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
          >
            <button type="button" data-reveal style={{ ['--i' as string]: i }} aria-expanded={i === active} aria-controls={`q-more-${i}`} onClick={() => setActive(i)}>
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

/**
 * Reveals each [data-reveal] / [data-open] once as it enters, by setting `data-in`. It is an attribute and not a class on
 * purpose: React rewrites a managed className on re-render, which would hide the element again.
 * Without script everything is already visible.
 */
export function Reveals() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.lp [data-reveal], .lp [data-open]');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.setAttribute('data-in', '')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
