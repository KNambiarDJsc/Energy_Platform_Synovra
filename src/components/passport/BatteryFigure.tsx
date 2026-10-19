'use client';
import { useId, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/format';

export type Lens = 'overview' | 'temperature' | 'capacity' | 'voltage' | 'outlook';

interface Props {
  unitType: '12V block' | '2V cell';
  chemistry: string;
  lens: Lens;
  onLens: (lens: Lens) => void;
  /** The one measured block temperature, if there is one. Drives the tint; nothing per cell is implied. */
  temperatureC: number | null;
  label: string;
}

const W = 600;
const H = 420;

/** Heat tint strength: none below 22 °C, strongest from 40 °C. */
function heatAlpha(t: number | null): number {
  if (t === null) return 0;
  return Math.min(0.62, Math.max(0, (t - 22) / 18) * 0.62);
}

interface Geometry {
  /** The part of the 600-wide drawing that is shown: a single tall cell is cropped closer than a wide block. */
  view: { x: number; w: number };
  caseX: number; caseY: number; caseW: number; caseH: number;
  lidX: number; lidW: number;
  cells: number;
  negX: number; posX: number;
  plateTop: number; plateBottom: number;
  hot: { voltage: [number, number]; temperature: [number, number]; capacity: [number, number] };
  detail: [number, number];
}

const BLOCK: Geometry = {
  view: { x: 0, w: 600 },
  caseX: 60, caseY: 96, caseW: 480, caseH: 280, lidX: 48, lidW: 504, cells: 6, negX: 116, posX: 484,
  plateTop: 136, plateBottom: 352,
  hot: { voltage: [484, 50], temperature: [300, 250], capacity: [174, 300] },
  detail: [432, 214],
};
const CELL: Geometry = {
  view: { x: 70, w: 460 },
  caseX: 196, caseY: 80, caseW: 208, caseH: 296, lidX: 184, lidW: 232, cells: 1, negX: 252, posX: 348,
  plateTop: 128, plateBottom: 352,
  hot: { voltage: [348, 36], temperature: [300, 300], capacity: [262, 200] },
  detail: [372, 232],
};

function Plates({ x0, x1, top, bottom, tubular, id }: { x0: number; x1: number; top: number; bottom: number; tubular: boolean; id: string }) {
  // Alternating negative (lead grey) and positive (lead dioxide brown) plates with separators between.
  const n = tubular ? 7 : 9;
  const span = x1 - x0;
  const plateW = tubular ? 13 : 3.6;
  const gap = (span - n * plateW) / (n - 1);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const x = x0 + i * (plateW + gap);
        const positive = i % 2 === 1;
        if (tubular && positive) {
          return (
            <g key={i}>
              <rect x={x} y={top} width={plateW} height={bottom - top} rx={plateW / 2} fill={`url(#${id}-pos)`} />
              {Array.from({ length: 14 }, (_, k) => (
                <line key={k} x1={x + 1.5} x2={x + plateW - 1.5} y1={top + 10 + k * ((bottom - top - 20) / 13)} y2={top + 10 + k * ((bottom - top - 20) / 13)} stroke="rgba(255,236,214,0.18)" strokeWidth="1" />
              ))}
            </g>
          );
        }
        return <rect key={i} x={x} y={top} width={plateW} height={bottom - top} rx={1.2} fill={positive ? `url(#${id}-pos)` : `url(#${id}-neg)`} />;
      })}
      {/* separators (absorbent glass mat or envelope) as soft light bands */}
      {!tubular &&
        Array.from({ length: n - 1 }, (_, i) => {
          const x = x0 + (i + 1) * (plateW + gap) - gap + 0.6;
          return <rect key={`s${i}`} x={x} y={top + 4} width={Math.max(gap - 1.2, 1)} height={bottom - top - 8} rx={1} fill={`url(#${id}-sep)`} />;
        })}
    </g>
  );
}

/**
 * An illustration of the battery's unit type, not a scan of this battery. The lens decides what is emphasised:
 * the case warms with the one measured temperature, the plates for capacity, the terminals for voltage.
 */
export function BatteryFigure({ unitType, chemistry, lens, onLens, temperatureC, label }: Props) {
  const id = useId().replace(/:/g, '');
  const g = unitType === '2V cell' ? CELL : BLOCK;
  const tubular = /OPzS/i.test(chemistry);
  const agm = /AGM/i.test(chemistry);
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -3, y: ((e.clientX - r.left) / r.width - 0.5) * 4 });
  };

  const heat = lens === 'temperature' || lens === 'overview' ? heatAlpha(temperatureC) * (lens === 'temperature' ? 1 : 0.45) : 0;
  const innerX = g.caseX + 16;
  const innerW = g.caseW - 32;
  const cellW = innerW / g.cells;

  const hotspots: { key: Exclude<Lens, 'overview' | 'outlook'>; at: [number, number]; text: string }[] = [
    { key: 'voltage', at: g.hot.voltage, text: 'Positive terminal: voltage' },
    { key: 'temperature', at: g.hot.temperature, text: 'Case: temperature' },
    { key: 'capacity', at: g.hot.capacity, text: 'Plates: capacity and resistance' },
  ];

  return (
    <div className="relative select-none">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="figure-tilt relative mx-auto w-full max-w-[600px]"
        style={{ transform: `perspective(1400px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <svg viewBox={`${g.view.x} 0 ${g.view.w} ${H}`} className="block h-auto w-full" role="img" aria-label={`Illustration of a ${unitType} ${chemistry} battery, standing in for ${label}. Not a photograph or scan of this unit.`}>
          <defs>
            <linearGradient id={`${id}-case`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.72" />
              <stop offset="1" stopColor="#E8DCCB" stopOpacity="0.62" />
            </linearGradient>
            <linearGradient id={`${id}-lid`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F4EEE5" />
              <stop offset="1" stopColor="#D9CDBC" />
            </linearGradient>
            <linearGradient id={`${id}-neg`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8A8177" />
              <stop offset="1" stopColor="#5E564D" />
            </linearGradient>
            <linearGradient id={`${id}-pos`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7A452A" />
              <stop offset="1" stopColor="#4C2C1B" />
            </linearGradient>
            <linearGradient id={`${id}-sep`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity={agm ? 0.85 : 0.55} />
              <stop offset="1" stopColor="#F3EADF" stopOpacity={agm ? 0.7 : 0.4} />
            </linearGradient>
            <linearGradient id={`${id}-copper`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7E3A15" />
              <stop offset="0.45" stopColor="#E2A06F" />
              <stop offset="1" stopColor="#8F4219" />
            </linearGradient>
            <linearGradient id={`${id}-night`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1A1612" />
              <stop offset="0.45" stopColor="#5A5148" />
              <stop offset="1" stopColor="#231E19" />
            </linearGradient>
            <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.08" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`${id}-heat`} cx="0.5" cy="0.58" r="0.62">
              <stop offset="0" stopColor="#F07A3A" stopOpacity="1" />
              <stop offset="0.55" stopColor="#E0682C" stopOpacity="0.55" />
              <stop offset="1" stopColor="#E0682C" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#3C2814" stopOpacity="0.26" />
              <stop offset="1" stopColor="#3C2814" stopOpacity="0" />
            </radialGradient>
            <filter id={`${id}-blur`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="22" />
            </filter>
            <clipPath id={`${id}-inner`}>
              <rect x={g.caseX + 6} y={g.caseY + 6} width={g.caseW - 12} height={g.caseH - 12} rx={14} />
            </clipPath>
          </defs>

          {/* ground */}
          <ellipse cx={W / 2} cy={392} rx={g.caseW * 0.58} ry={18} fill={`url(#${id}-shadow)`} />

          {/* outer warmth, only as strong as the measured temperature */}
          <rect x={g.caseX} y={g.caseY + 20} width={g.caseW} height={g.caseH - 30} rx={30} fill="#E8743A"
            filter={`url(#${id}-blur)`} className="figure-fade" style={{ opacity: heat * 0.55 }} />

          {/* case */}
          <rect x={g.caseX} y={g.caseY} width={g.caseW} height={g.caseH} rx={18} fill={`url(#${id}-case)`} stroke="rgba(110,90,64,0.38)" strokeWidth="1.5" />

          <g clipPath={`url(#${id}-inner)`}>
            {/* electrolyte in a flooded cell: a light band; its level is checked on site, not recorded here */}
            {!agm && tubular && <rect x={g.caseX} y={g.plateTop - 12} width={g.caseW} height={g.caseH} fill="#E9D9B8" opacity="0.28" />}
            <g className="figure-fade" style={{ opacity: lens === 'temperature' ? 0.55 : lens === 'voltage' ? 0.75 : 1 }}>
              {Array.from({ length: g.cells }, (_, c) => (
                <Plates key={c} id={id} tubular={tubular} x0={innerX + c * cellW + 9} x1={innerX + (c + 1) * cellW - 9} top={g.plateTop} bottom={g.plateBottom} />
              ))}
            </g>
            {/* plate emphasis for the capacity lens */}
            <rect x={innerX} y={g.plateTop - 6} width={innerW} height={g.plateBottom - g.plateTop + 12} rx={8}
              fill="none" stroke="#A34D1F" strokeWidth="2" strokeDasharray="6 6" className="figure-fade" style={{ opacity: lens === 'capacity' ? 0.9 : 0 }} />
            {/* cell partitions */}
            {Array.from({ length: g.cells - 1 }, (_, i) => (
              <rect key={i} x={innerX + (i + 1) * cellW - 1.5} y={g.caseY + 18} width={3} height={g.caseH - 30} fill="rgba(110,90,64,0.22)" />
            ))}
            {/* straps over each cell, and the connectors between cells */}
            {Array.from({ length: g.cells }, (_, c) => (
              <g key={c}>
                <rect x={innerX + c * cellW + 10} y={g.plateTop - 16} width={cellW / 2 - 14} height={9} rx={3} fill={`url(#${id}-neg)`} />
                <rect x={innerX + c * cellW + cellW / 2 + 4} y={g.plateTop - 16} width={cellW / 2 - 14} height={9} rx={3} fill={`url(#${id}-copper)`} />
              </g>
            ))}
            {/* temperature tint over the case interior */}
            {/* The tint's strength is set by the reading alone; the breathing wrapper only ever dims it slightly. */}
            <g className="figure-breathe">
              <rect x={g.caseX} y={g.caseY} width={g.caseW} height={g.caseH} fill={`url(#${id}-heat)`} className="figure-fade" style={{ opacity: heat }} />
            </g>
            {/* glass sheen */}
            <path d={`M${g.caseX} ${g.caseY} h${g.caseW * 0.42} L${g.caseX + g.caseW * 0.16} ${g.caseY + g.caseH} H${g.caseX} Z`} fill={`url(#${id}-sheen)`} />
          </g>

          {/* lid */}
          <rect x={g.lidX} y={g.caseY - 30} width={g.lidW} height={38} rx={12} fill={`url(#${id}-lid)`} stroke="rgba(110,90,64,0.38)" strokeWidth="1.5" />
          {Array.from({ length: g.cells }, (_, c) => (
            <rect key={c} x={innerX + c * cellW + cellW / 2 - 13} y={g.caseY - 20} width={26} height={8} rx={4} fill="#CDBFAC" />
          ))}

          {/* terminals: negative in night, positive in copper */}
          {[{ x: g.negX, fill: `url(#${id}-night)`, sign: '−' }, { x: g.posX, fill: `url(#${id}-copper)`, sign: '+' }].map((t) => (
            <g key={t.sign}>
              <circle cx={t.x} cy={g.caseY - 52} r={30} fill="#F2A877" className="figure-fade" style={{ opacity: lens === 'voltage' ? 0.35 : 0 }} />
              <rect x={t.x - 19} y={g.caseY - 58} width={38} height={34} rx={6} fill={t.fill} />
              <ellipse cx={t.x} cy={g.caseY - 58} rx={19} ry={5.5} fill={t.sign === '+' ? '#F0B98E' : '#6E655B'} />
              <text x={t.x} y={g.caseY - 64} textAnchor="middle" fontSize="15" fontWeight="600" fill="#4A433B" aria-hidden>{t.sign}</text>
            </g>
          ))}

          {/* leader to the detail inset */}
          <g className="figure-fade" style={{ opacity: lens === 'capacity' || lens === 'overview' ? 1 : 0.35 }}>
            <circle cx={g.hot.capacity[0]} cy={g.hot.capacity[1] - 40} r={4} fill="#FFFFFF" stroke="#A34D1F" strokeWidth="1.5" />
            <path d={`M${g.hot.capacity[0] + 4} ${g.hot.capacity[1] - 40} L${g.detail[0] - 60} ${g.detail[1]} H${g.view.x + g.view.w - 70}`} stroke="#FFFFFF" strokeWidth="1.5" fill="none" opacity="0.9" />
          </g>
        </svg>

        {/* hotspots: real buttons, positioned over the drawing */}
        {hotspots.map((h) => (
          <button
            key={h.key}
            type="button"
            onClick={() => onLens(h.key)}
            aria-pressed={lens === h.key}
            aria-label={h.text}
            title={h.text}
            className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-2"
            style={{ left: `${((h.at[0] - g.view.x) / g.view.w) * 100}%`, top: `${(h.at[1] / H) * 100}%` }}
          >
            <span className={cn(
              'relative flex h-4 w-4 items-center justify-center rounded-full ring-2 transition-transform duration-200 ease-out group-hover:scale-125',
              lens === h.key ? 'bg-copper ring-white' : 'bg-white/90 ring-copper/70',
            )}>
              <span className="figure-ping absolute inset-0 rounded-full bg-copper/40" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      {/* plate detail, drawn larger: an illustration of the construction, not a view into this unit */}
      <figure className="pointer-events-none absolute bottom-2 right-0 hidden w-[132px] text-right sm:block">
        <div className="ml-auto h-[112px] w-[112px] overflow-hidden rounded-full bg-[#2A221B] ring-4 ring-white/80">
          <svg viewBox="0 0 112 112" className="h-full w-full" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i}>
                <rect x={6 + i * 15} y={-4} width={tubular ? 11 : 6} height={120} rx={tubular ? 5.5 : 1.5} fill={i % 2 ? '#6E3F25' : '#7D756B'} />
                {!tubular && <rect x={13 + i * 15} y={-4} width={7} height={120} fill={agm ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.45)'} />}
                {!tubular && agm && Array.from({ length: 9 }, (_, k) => (
                  <circle key={k} cx={15 + i * 15 + (k % 2) * 3} cy={8 + k * 12} r={1.4} fill="rgba(200,190,175,0.9)" />
                ))}
              </g>
            ))}
          </svg>
        </div>
        <figcaption className="mt-2 text-[13px] leading-4 text-muted">
          Plate detail · illustration
          <span className="block">{tubular ? 'Tubular positive plates' : agm ? 'Glass-mat separators between plates' : 'Plates and separators'}</span>
        </figcaption>
      </figure>
    </div>
  );
}
