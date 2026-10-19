'use client';
import { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ isometric geometry
   Screen x = (x − y)·cos30°, screen y = (x + y)·sin30° − z. The viewer sees the +x, +y and +z faces of every box,
   so drawing in order of increasing x (and z) paints nearer parts over farther ones. Units are millimetre-like. */
const C = Math.cos(Math.PI / 6);
const S = 0.5;
const iso = (x: number, y: number, z: number) => [(x - y) * C, (x + y) * S - z] as const;
const pts = (...p: (readonly [number, number])[]) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');

const L = 720; // length, along x
const W = 220; // depth, along y
const H = 150; // case height
const WALL = 10;
const LID_Z = 300; // the lid floats above the case: an exploded view
const LID_H = 26;
const CELLS = 6;
const CELL = (L - WALL * 2) / CELLS;
const PLATES = 7;
const VIEW = { x: -700, y: -360, w: 1700, h: 850 };

/** The three visible faces of a box, light from the top-left: top lightest, right darkest. */
function Box({ x, y, z, dx, dy, dz, top = '#FFFFFF', front = '#F3F3F1', side = '#E6E6E3', className }: {
  x: number; y: number; z: number; dx: number; dy: number; dz: number; top?: string; front?: string; side?: string; className?: string;
}) {
  const t = [iso(x, y, z + dz), iso(x + dx, y, z + dz), iso(x + dx, y + dy, z + dz), iso(x, y + dy, z + dz)];
  const f = [iso(x, y + dy, z + dz), iso(x + dx, y + dy, z + dz), iso(x + dx, y + dy, z), iso(x, y + dy, z)];
  const r = [iso(x + dx, y, z + dz), iso(x + dx, y + dy, z + dz), iso(x + dx, y + dy, z), iso(x + dx, y, z)];
  return (
    <g className={className}>
      <polygon points={pts(...f)} fill={front} />
      <polygon points={pts(...r)} fill={side} />
      <polygon points={pts(...t)} fill={top} />
    </g>
  );
}

/** An upright cylinder (terminal post, vent cap): its top is an ellipse 1.22r wide and 0.71r tall. */
function Post({ x, y, z, r, h, top = '#FFFFFF', body = '#ECECE9' }: { x: number; y: number; z: number; r: number; h: number; top?: string; body?: string }) {
  const [cx, cyBottom] = iso(x, y, z);
  const cyTop = cyBottom - h;
  const rx = r * 1.2247;
  const ry = r * 0.7071;
  return (
    <g>
      <path d={`M${cx - rx} ${cyTop} L${cx - rx} ${cyBottom} A${rx} ${ry} 0 0 0 ${cx + rx} ${cyBottom} L${cx + rx} ${cyTop} Z`} fill={body} />
      <ellipse cx={cx} cy={cyTop} rx={rx} ry={ry} fill={top} />
    </g>
  );
}

/** Where each cell sits across the drawing, in view units, for the pointer to find. */
const CELL_SX = Array.from({ length: CELLS }, (_, i) => iso(WALL + CELL * (i + 0.5), W / 2, H)[0]);

/**
 * An exploded line drawing of a 12 V lead-acid battery: the lid and terminals lifted off an open case, six cells of
 * plates inside, positive plates tinted. Drawn for this page from general battery construction; not a drawing of any
 * Synovra battery or of a specific product. The cell under the pointer lights; the lid lifts a little further.
 */
export function ExplodedBattery() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const svg = el?.querySelector<SVGSVGElement>('.hb-svg');
    if (!el || !svg) return;
    const hero = el; // the drawing answers the pointer over its own frame
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const glows = Array.from(el.querySelectorAll<SVGElement>('.hb-cellglow'));
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      hero.style.setProperty('--mx', cx.toFixed(4));
      hero.style.setProperty('--my', cy.toFixed(4));
      raf = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      // The drawing is letterboxed inside its frame, so map the pointer through the drawing's own transform.
      const ctm = svg.getScreenCTM();
      const pt = ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null;
      const at = pt?.x ?? Number.NaN;
      const over = !!pt && pt.x > VIEW.x && pt.x < VIEW.x + VIEW.w && pt.y > VIEW.y && pt.y < VIEW.y + VIEW.h;
      glows.forEach((g, i) => {
        const d = Math.abs(at - CELL_SX[i]) / (CELL * C);
        g.style.setProperty('--k', over ? Math.pow(Math.max(0, 1 - d / 1.4), 1.3).toFixed(3) : '0');
      });
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const leave = () => {
      tx = 0; ty = 0;
      glows.forEach((g) => g.style.setProperty('--k', '0'));
      if (!raf) raf = requestAnimationFrame(tick);
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => { hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, []);

  // the case: floor and inner back walls first, then cells and plates, then the near walls and the rim
  const floor = [iso(WALL, WALL, 4), iso(L - WALL, WALL, 4), iso(L - WALL, W - WALL, 4), iso(WALL, W - WALL, 4)];
  const backWall = [iso(WALL, WALL, 4), iso(L - WALL, WALL, 4), iso(L - WALL, WALL, H), iso(WALL, WALL, H)];
  const leftWall = [iso(WALL, WALL, 4), iso(WALL, W - WALL, 4), iso(WALL, W - WALL, H), iso(WALL, WALL, H)];
  const front = [iso(0, W, H), iso(L, W, H), iso(L, W, 0), iso(0, W, 0)];
  const right = [iso(L, 0, H), iso(L, W, H), iso(L, W, 0), iso(L, 0, 0)];
  const rimOuter = [iso(0, 0, H), iso(L, 0, H), iso(L, W, H), iso(0, W, H)];
  const rimInner = [iso(WALL, WALL, H), iso(L - WALL, WALL, H), iso(L - WALL, W - WALL, H), iso(WALL, W - WALL, H)];
  const poly = (p: (readonly [number, number])[]) => `M${pts(...p).replace(/ /g, ' L')} Z`;

  const plates: { x: number; positive: boolean }[] = [];
  for (let c = 0; c < CELLS; c++) {
    for (let i = 0; i < PLATES; i++) plates.push({ x: WALL + c * CELL + 16 + i * ((CELL - 32) / (PLATES - 1)) - 2, positive: i % 2 === 1 });
  }
  const PLATE_Y = WALL + 14;
  const PLATE_D = W - WALL * 2 - 28;
  const PLATE_H = 118;

  // callout anchors and label positions, in view units
  const callouts = [
    { n: '01', text: 'Terminals', at: iso(L - 70, W * 0.7, LID_Z + LID_H + 30), to: [560, -300] as const },
    { n: '02', text: 'Lid, vent caps', at: iso(0, W, LID_Z + LID_H / 2), to: [-300, -150] as const },
    { n: '03', text: 'Six cells, 2 V each', at: iso(L - WALL - CELL * 0.5, W - WALL - 20, PLATE_H + 6), to: [640, 150] as const },
    { n: '04', text: 'Plates, + and −', at: iso(WALL + 8, W - WALL - 30, PLATE_H - 10), to: [-300, 200] as const },
    { n: '05', text: 'Case', at: iso(L * 0.5, W, H * 0.4), to: [600, 420] as const },
  ];

  return (
    <div className="xb" ref={root}>
      <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="hb-svg" role="img"
        aria-label="Illustration of a 12 volt lead-acid battery in an exploded view: the lid and terminals lifted off an open case, six cells of lead plates inside.">
        <g className="xb-lines" fill="none" stroke="#141414" strokeWidth="1.15" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
          {/* case interior */}
          <g className="xb-case">
            <polygon points={pts(...floor)} fill="#F1F1EE" />
            <polygon points={pts(...backWall)} fill="#EDEDEA" />
            <polygon points={pts(...leftWall)} fill="#F6F6F3" />
            {Array.from({ length: CELLS - 1 }, (_, i) => (
              <Box key={`w${i}`} x={WALL + CELL * (i + 1) - 2} y={WALL} z={4} dx={4} dy={W - WALL * 2} dz={H - 8} />
            ))}
          </g>
          {/* plates, far to near */}
          {plates.map((p, i) => (
            <Box key={i} x={p.x} y={PLATE_Y} z={6} dx={4} dy={PLATE_D} dz={PLATE_H} top={p.positive ? '#FFE1D2' : '#FFFFFF'} front={p.positive ? '#FFD3BE' : '#F3F3F1'} side={p.positive ? '#F7C4AC' : '#E6E6E3'} />
          ))}
          {/* the cell under the pointer: a soft orange wash over its plates */}
          {Array.from({ length: CELLS }, (_, i) => (
            <polygon key={`g${i}`} className="hb-cellglow" stroke="none" fill="#F2541B"
              points={pts(iso(WALL + CELL * i + 6, PLATE_Y, PLATE_H + 6), iso(WALL + CELL * (i + 1) - 6, PLATE_Y, PLATE_H + 6), iso(WALL + CELL * (i + 1) - 6, PLATE_Y + PLATE_D, PLATE_H + 6), iso(WALL + CELL * i + 6, PLATE_Y + PLATE_D, PLATE_H + 6))} />
          ))}
          {/* the near walls and the rim close the case */}
          <polygon points={pts(...front)} fill="#F3F3F1" />
          <polygon points={pts(...right)} fill="#E6E6E3" />
          <path d={`${poly(rimOuter)} ${poly(rimInner)}`} fill="#FFFFFF" fillRule="evenodd" />
          {[0.2, 0.4, 0.6, 0.8].map((f) => (
            <line key={f} x1={iso(L * f, W, H - 22)[0]} y1={iso(L * f, W, H - 22)[1]} x2={iso(L * f, W, 18)[0]} y2={iso(L * f, W, 18)[1]} strokeOpacity="0.25" />
          ))}

          {/* assembly lines: where the lid comes down */}
          <g className="xb-assembly" strokeDasharray="3 5" strokeOpacity="0.45">
            {[[0, W], [L, W], [L, 0]].map(([x, y]) => {
              const a = iso(x, y, H + 4);
              const b = iso(x, y, LID_Z - 4);
              return <line key={`${x}${y}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
            })}
          </g>

          {/* the lid, its vent caps and terminals: lifted, and lifting a little more toward the pointer */}
          <g className="xb-lid">
            <Box x={0} y={0} z={LID_Z} dx={L} dy={W} dz={LID_H} />
            {Array.from({ length: CELLS }, (_, i) => (
              <Post key={`v${i}`} x={WALL + CELL * (i + 0.5)} y={W * 0.42} z={LID_Z + LID_H} r={13} h={7} />
            ))}
            <Post x={70} y={W * 0.7} z={LID_Z + LID_H} r={20} h={30} top="#FFE1D2" body="#FFD3BE" />
            <Post x={L - 70} y={W * 0.7} z={LID_Z + LID_H} r={20} h={30} />
            {(() => { const [x, y] = iso(70, W * 0.7, LID_Z + LID_H + 46); return <text x={x} y={y} className="xb-sign" stroke="none" fill="#141414">+</text>; })()}
            {(() => { const [x, y] = iso(L - 70, W * 0.7, LID_Z + LID_H + 46); return <text x={x} y={y} className="xb-sign" stroke="none" fill="#141414">−</text>; })()}
          </g>

          {/* callouts */}
          <g className="xb-callouts">
            {callouts.map((c, i) => {
              const left = c.to[0] < c.at[0];
              return (
                <g key={c.n} className="xb-callout" style={{ ['--d' as string]: i }}>
                  <polyline points={pts(c.at, [c.to[0] + (left ? 18 : -18), c.to[1]], c.to)} strokeOpacity="0.55" />
                  <circle cx={c.at[0]} cy={c.at[1]} r="4" fill="#FFFFFF" />
                  <text x={c.to[0] + (left ? -8 : 8)} y={c.to[1] + 4} textAnchor={left ? 'end' : 'start'} stroke="none" className="xb-label">
                    <tspan className="xb-n">{c.n}</tspan>{'  '}{c.text.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
