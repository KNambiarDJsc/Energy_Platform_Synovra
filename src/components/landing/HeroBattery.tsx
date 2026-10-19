'use client';
import { useEffect, useRef } from 'react';

const CELLS = 6;
const PLATES = 7;
// The cutaway window: six cells side by side, each 140 wide.
const WX = 180;
const WY = 296;
const CW = 140;
const WH = 292;
const BOTTOM = WY + WH - 18;

/** Plate heights vary a little, deterministically, so the rows read as made things and not as a pattern. */
const height = (c: number, p: number) => 196 + ((c * 7 + p * 13) % 5) * 6;

/**
 * An original illustration of a 12 V lead-acid battery in cutaway: six cells, each with alternating brown
 * (positive) and grey (negative) plates, lit from within. It is drawn, not photographed or scanned, and the
 * page says so beside it. The layers move a little against the pointer; at rest it only breathes.
 */
export function HeroBattery() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const hero = el?.closest<HTMLElement>('[data-hero]');
    if (!el || !hero) return;
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const svg = el.querySelector<SVGSVGElement>('.hb-svg');
    const glows = Array.from(el.querySelectorAll<SVGRectElement>('.hb-cellglow'));
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      hero.style.setProperty('--mx', cx.toFixed(4));
      hero.style.setProperty('--my', cy.toFixed(4));
      raf = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      hero.style.setProperty('--lx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      hero.style.setProperty('--ly', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      // The cell nearest the pointer glows, and its neighbours a little: a wave that follows the cursor across the six.
      if (svg) {
        const s = svg.getBoundingClientRect();
        const over = e.clientX > s.left - 40 && e.clientX < s.right + 40 && e.clientY > s.top - 40 && e.clientY < s.bottom + 40;
        const at = ((e.clientX - s.left) / s.width) * 1200;
        const f = (at - WX) / CW - 0.5;
        glows.forEach((g, c) => g.style.setProperty('--k', over ? Math.pow(Math.max(0, 1 - Math.abs(c - f) / 1.6), 1.4).toFixed(3) : '0'));
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => {
      tx = 0; ty = 0;
      glows.forEach((g) => g.style.setProperty('--k', '0'));
      if (!raf) raf = requestAnimationFrame(tick);
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => {
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="hb" ref={root}>
      <svg viewBox="0 0 1200 760" className="hb-svg" role="img" aria-label="Illustration of a 12 volt lead-acid battery in cutaway, showing six cells of lead plates lit from within.">
        <defs>
          <radialGradient id="hb-halo" cx="50%" cy="58%" r="55%">
            <stop offset="0" stopColor="#C2652F" stopOpacity="0.34" />
            <stop offset="0.55" stopColor="#C2652F" stopOpacity="0.08" />
            <stop offset="1" stopColor="#C2652F" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hb-face" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#38312b" />
            <stop offset="0.5" stopColor="#201c18" />
            <stop offset="1" stopColor="#14110e" />
          </linearGradient>
          <linearGradient id="hb-top" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#2c2621" />
            <stop offset="1" stopColor="#4a4038" />
          </linearGradient>
          <linearGradient id="hb-side" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1d1914" />
            <stop offset="1" stopColor="#0a0807" />
          </linearGradient>
          <linearGradient id="hb-window" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d0b09" />
            <stop offset="1" stopColor="#1a120c" />
          </linearGradient>
          {/* negative plate: grey lead; positive plate: brown lead dioxide. Both glow from the foot. */}
          <linearGradient id="hb-neg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bdb4a9" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#6b625a" />
            <stop offset="1" stopColor="#e08a52" />
          </linearGradient>
          <linearGradient id="hb-pos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b9794c" stopOpacity="0.95" />
            <stop offset="0.5" stopColor="#7a4a2c" />
            <stop offset="1" stopColor="#f2a877" />
          </linearGradient>
          <linearGradient id="hb-post-pos" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8c4119" />
            <stop offset="0.45" stopColor="#f2a877" />
            <stop offset="1" stopColor="#a34d1f" />
          </linearGradient>
          <linearGradient id="hb-post-neg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2a2520" />
            <stop offset="0.45" stopColor="#8a8176" />
            <stop offset="1" stopColor="#38312b" />
          </linearGradient>
          <linearGradient id="hb-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.2" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hb-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hb-rim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="hb-cellglow" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#f2a877" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f2a877" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hb-acid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8FCFC4" stopOpacity="0.16" />
            <stop offset="1" stopColor="#8FCFC4" stopOpacity="0.02" />
          </linearGradient>
          <pattern id="hb-mesh" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 0.5H6M0.5 0V6" stroke="#000" strokeOpacity="0.28" strokeWidth="0.7" />
          </pattern>
          <filter id="hb-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="26" /></filter>
          <clipPath id="hb-window-clip"><rect x={WX} y={WY} width={CELLS * CW} height={WH} rx="10" /></clipPath>
        </defs>

        {/* far: the light behind and under the battery */}
        <g className="hb-far">
          <circle cx="600" cy="430" r="520" fill="url(#hb-halo)" />
          <ellipse cx="600" cy="652" rx="430" ry="26" fill="#C2652F" opacity="0.4" filter="url(#hb-blur)" />
          <ellipse cx="600" cy="654" rx="520" ry="20" fill="#000" opacity="0.55" filter="url(#hb-blur)" />
        </g>

        {/* the body */}
        <g className="hb-body">
          <polygon points="1050,262 1092,214 1092,586 1050,634" fill="url(#hb-side)" />
          <rect x="150" y="262" width="900" height="372" rx="28" fill="url(#hb-face)" />
          <rect x="150.5" y="262.5" width="899" height="371" rx="27.5" fill="none" stroke="url(#hb-rim)" strokeWidth="1.2" />
          <polygon points="150,262 1050,262 1092,214 192,214" fill="url(#hb-top)" />
          <path d="M150 262H1050" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.2" />
          <path d="M192 214H1092" stroke="#fff" strokeOpacity="0.08" strokeWidth="1" />
          {Array.from({ length: CELLS }, (_, c) => (
            <ellipse key={c} cx={WX + c * CW + 70 + 21} cy={238} rx="19" ry="5.6" fill="#120f0c" stroke="#fff" strokeOpacity="0.1" />
          ))}

          {/* the window into the cells */}
          <rect x={WX - 6} y={WY - 6} width={CELLS * CW + 12} height={WH + 12} rx="14" fill="#0a0807" />
          <rect x={WX} y={WY} width={CELLS * CW} height={WH} rx="10" fill="url(#hb-window)" />
          <g clipPath="url(#hb-window-clip)">
            <rect x={WX} y="352" width={CELLS * CW} height={WH - 56} fill="url(#hb-acid)" />
            <rect x={WX} y="352" width={CELLS * CW} height="1.5" fill="#8FCFC4" opacity="0.45" />
            {Array.from({ length: CELLS }, (_, c) => (
              <g key={c} className="hb-cell" style={{ ['--c' as string]: c }}>
                {/* the strap that joins this cell's plates */}
                <rect x={WX + c * CW + 14} y={BOTTOM - 236} width={CW - 28} height="9" rx="3.5" fill="#3a332d" />
                <rect x={WX + c * CW + 14} y={BOTTOM - 236} width={CW - 28} height="2" rx="1" fill="#f2a877" opacity="0.5" />
                {Array.from({ length: PLATES }, (_, p) => {
                  const h = height(c, p);
                  return (
                    <rect
                      key={p}
                      x={WX + c * CW + 22 + p * 15}
                      y={BOTTOM - h}
                      width="8"
                      height={h}
                      rx="2.5"
                      fill={p % 2 === 0 ? 'url(#hb-neg)' : 'url(#hb-pos)'}
                    />
                  );
                })}
              </g>
            ))}
            <rect x={WX} y={WY} width={CELLS * CW} height={WH} fill="url(#hb-mesh)" opacity="0.55" />
            {Array.from({ length: CELLS + 1 }, (_, c) => (
              <rect key={c} x={WX + c * CW - 1.5} y={WY} width="3" height={WH} fill="#fff" opacity="0.07" />
            ))}
            {Array.from({ length: CELLS }, (_, c) => (
              <rect key={c} className="hb-cellglow" x={WX + c * CW} y={WY} width={CW} height={WH} fill="url(#hb-cellglow)" />
            ))}
            <rect className="hb-sweep" x="-260" y={WY} width="260" height={WH} fill="url(#hb-sweep)" transform="skewX(-18)" />
            <polygon points={`${WX},${WY} ${WX + 560},${WY} ${WX + 240},${WY + WH} ${WX},${WY + WH}`} fill="url(#hb-glass)" />
          </g>
        </g>

        {/* near: the posts, which move most against the pointer */}
        <g className="hb-near">
          <g>
            <ellipse cx="250" cy="224" rx="32" ry="8.5" fill="#0c0a08" opacity="0.8" />
            <rect x="232" y="186" width="36" height="38" fill="url(#hb-post-pos)" />
            <ellipse cx="250" cy="224" rx="18" ry="5.5" fill="#a34d1f" />
            <ellipse cx="250" cy="186" rx="18" ry="5.5" fill="#f9c9a4" />
          </g>
          <g>
            <ellipse cx="1000" cy="224" rx="32" ry="8.5" fill="#0c0a08" opacity="0.8" />
            <rect x="982" y="186" width="36" height="38" fill="url(#hb-post-neg)" />
            <ellipse cx="1000" cy="224" rx="18" ry="5.5" fill="#2a2520" />
            <ellipse cx="1000" cy="186" rx="18" ry="5.5" fill="#a69d92" />
          </g>
        </g>
      </svg>

      {/* callouts: the three things worth naming, as Apple names the parts of an object */}
      <ul className="hb-notes" aria-hidden>
        <li style={{ ['--x' as string]: '66%', ['--y' as string]: '15%', ['--d' as string]: 0 }}>
          <i /><span>01</span> Terminals
        </li>
        <li style={{ ['--x' as string]: '52%', ['--y' as string]: '41%', ['--d' as string]: 1 }}>
          <i /><span>02</span> Six cells, 2 V each
        </li>
        <li style={{ ['--x' as string]: '28%', ['--y' as string]: '78%', ['--d' as string]: 2 }}>
          <i /><span>03</span> Brown positive, grey negative plates
        </li>
      </ul>
    </div>
  );
}
