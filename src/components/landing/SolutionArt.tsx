import type { ReactNode } from 'react';

/**
 * Four drawings for the "What you get" row, made for this page in the page's own language: flat, hard-edged, charcoal
 * on paper with signal orange for the one thing to look at, mono capitals for labels. Each is an illustration with
 * invented numbers and says so. They fill the Slots that were placeholders; a supplied picture can still replace them.
 */

const W = 400;
const H = 300;

function Frame({ label, children, caption }: { label: string; children: ReactNode; caption: string }) {
  return (
    <svg className="sa" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <text x="16" y="24" className="sa-t">ILLUSTRATION · SYNTHETIC</text>
      {children}
      <text x="16" y="286" className="sa-t">{caption}</text>
    </svg>
  );
}

/** Hatching for "watching" and "not recorded": a pattern, so it never relies on colour alone. */
function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#202020" strokeWidth="1.6" />
    </pattern>
  );
}

type Status = 'g' | 'w' | 'a';
const fill = (s: Status, hatch: string) => (s === 'g' ? '#202020' : s === 'w' ? `url(#${hatch})` : '#ff5841');

/** 1. The fleet at a glance: one ring, three counts, and the same batteries by site. */
export function FleetArt() {
  const seg = (len: number, start: number, stroke: string) => (
    <circle cx="118" cy="150" r="58" fill="none" stroke={stroke} strokeWidth="26" pathLength={100} strokeDasharray={`${len - 1.6} ${101.6 - len}`} strokeDashoffset={-start} transform="rotate(-90 118 150)" />
  );
  const sites: { name: string; y: number; items: Status[] }[] = [
    { name: 'SITE A', y: 178, items: ['a', 'g', 'a', 'g', 'w', 'g', 'w'] },
    { name: 'SITE B', y: 224, items: ['a', 'a', 'g', 'w'] },
  ];
  const legend: [Status, string, number][] = [['g', 'GOOD', 4], ['w', 'WATCHING', 3], ['a', 'NEEDS ATTENTION', 4]];
  return (
    <Frame label="Illustration with invented numbers: a status ring of eleven batteries, four good, three watching and four needing attention, with the same batteries drawn row by row for two sites." caption="STATUS FROM FIXED RULES · NOT A SCORE">
      <defs><Hatch id="sa-h-fleet" /></defs>
      <circle cx="118" cy="150" r="58" fill="none" stroke="#e0e0dd" strokeWidth="26" />
      {seg(36.36, 0, '#202020')}
      {seg(27.27, 36.36, 'url(#sa-h-fleet)')}
      {seg(36.37, 63.63, '#ff5841')}
      <text x="118" y="160" textAnchor="middle" className="sa-num" fontSize="46">11</text>
      <text x="118" y="178" textAnchor="middle" className="sa-t">BATTERIES</text>
      {legend.map(([s, name, n], i) => (
        <g key={name}>
          <rect x="206" y={58 + i * 26} width="14" height="14" fill={fill(s, 'sa-h-fleet')} stroke="#202020" strokeWidth="1" />
          <text x="228" y={70 + i * 26} className="sa-t sa-tb">{name}</text>
          <text x="384" y={70 + i * 26} textAnchor="end" className="sa-t sa-tb">{n}</text>
          <line x1="206" x2="384" y1={78 + i * 26} y2={78 + i * 26} stroke="#202020" strokeOpacity="0.3" />
        </g>
      ))}
      {sites.map((site) => (
        <g key={site.name}>
          <text x="206" y={site.y} className="sa-t">{site.name}</text>
          {site.items.map((s, i) => (
            <g key={i} className={s === 'a' ? 'sa-lift' : undefined}>
              <rect x={206 + i * 25} y={site.y + 10} width="20" height="13" fill={fill(s, 'sa-h-fleet')} stroke="#202020" strokeWidth="1" />
              <rect x={208 + i * 25} y={site.y + 7} width="4" height="3" fill="#202020" />
              <rect x={214 + i * 25} y={site.y + 7} width="4" height="3" fill="#202020" />
            </g>
          ))}
        </g>
      ))}
    </Frame>
  );
}

/** 2. Every battery, opened up: a modelled cutaway beside its record. */
export function RecordArt() {
  const cells = 6;
  const x0 = 24;
  const w = 172;
  const cw = w / cells;
  return (
    <Frame label="Illustration: a battery shown as a modelled cutaway with six cells, one tinted orange, joined by a dashed line to a record card with its label, status, capacity, evidence and an outlook that is not yet estimated." caption="MODELLED CUTAWAY · NOT A SCAN">
      <g className="sa-lift">
        <rect x="58" y="72" width="24" height="14" fill="#202020" />
        <rect x="138" y="72" width="24" height="14" fill="#ff5841" stroke="#202020" strokeWidth="1" />
        <rect x="18" y="84" width="184" height="16" fill="#202020" />
        <rect x={x0} y="100" width={w} height="136" fill="#ffffff" stroke="#202020" strokeWidth="1.5" />
        <rect x={x0 + cw * 3} y="101" width={cw} height="134" fill="#ff5841" fillOpacity="0.32" />
        {Array.from({ length: cells }, (_, c) => (
          <g key={c}>
            {c > 0 && <line x1={x0 + cw * c} x2={x0 + cw * c} y1="100" y2="236" stroke="#202020" strokeWidth="1.5" />}
            {[0, 1, 2, 3, 4].map((p) => (
              <line key={p} x1={x0 + cw * c + 4 + p * 4.6} x2={x0 + cw * c + 4 + p * 4.6} y1="114" y2="226" stroke="#202020" strokeWidth={p % 2 ? 1 : 2.4} strokeOpacity={p % 2 ? 0.55 : 0.9} />
            ))}
          </g>
        ))}
      </g>
      <circle cx={x0 + cw * 3.5} cy="168" r="4.5" fill="#ffffff" stroke="#b73a1c" strokeWidth="2" />
      <line x1={x0 + cw * 3.5 + 5} x2="216" y1="168" y2="168" stroke="#202020" strokeWidth="1.2" strokeDasharray="4 3" />
      <rect x="216" y="56" width="168" height="190" fill="#ffffff" stroke="#202020" strokeWidth="1.5" />
      <text x="230" y="84" className="sa-t sa-tb" fontSize="15">B-0005</text>
      <rect x="230" y="94" width="116" height="18" fill="none" stroke="#b73a1c" strokeWidth="1.2" />
      <text x="237" y="107" className="sa-t" style={{ fill: "#b73a1c" }}>NEEDS ATTENTION</text>
      {[
        ['CAPACITY', '90% of rated, 29 Jun'],
        ['EVIDENCE', '2 files · SHA-256'],
        ['OUTLOOK', 'Not yet estimated'],
      ].map(([k, v], i) => (
        <g key={k}>
          <line x1="230" x2="370" y1={126 + i * 38} y2={126 + i * 38} stroke="#202020" strokeOpacity="0.25" />
          <text x="230" y={140 + i * 38} className="sa-t">{k}</text>
          <text x="230" y={156 + i * 38} className="sa-v">{v}</text>
        </g>
      ))}
    </Frame>
  );
}

/** 3. Maintenance and replacement: two approved tests either side of a service visit. */
export function ActionsArt() {
  const top = 78;
  const base = 232;
  const span = base - top;
  const bar = (pct: number) => ({ h: (span * pct) / 100, y: base - (span * pct) / 100 });
  const before = bar(58);
  const after = bar(90);
  return (
    <Frame label="Illustration with invented numbers: two bars for capacity at two approved tests, 58 and 90 percent of rated, either side of a service visit approved by an engineer, with a demo request button above." caption="TWO APPROVED TESTS · NOT A FORECAST">
      <defs><Hatch id="sa-h-act" /></defs>
      <rect x="276" y="12" width="108" height="22" fill="#202020" />
      <text x="330" y="27" textAnchor="middle" className="sa-t" style={{ fill: '#ececea' }}>REQUEST · DEMO</text>
      <line x1="36" x2="364" y1={top} y2={top} stroke="#202020" strokeWidth="1.2" strokeDasharray="5 4" />
      <text x="36" y={top - 7} className="sa-t">RATED CAPACITY</text>
      <rect x="64" y={before.y} width="64" height={before.h} fill="url(#sa-h-act)" stroke="#202020" strokeWidth="1.5" />
      <g className="sa-rise">
        <rect x="272" y={after.y} width="64" height={after.h} fill="#202020" />
        <text x="304" y={after.y + 34} textAnchor="middle" className="sa-num" fontSize="24" style={{ fill: "#ececea" }}>90%</text>
      </g>
      <text x="96" y={before.y - 8} textAnchor="middle" className="sa-num" fontSize="24">58%</text>
      <line x1="28" x2="372" y1={base} y2={base} stroke="#202020" strokeWidth="1.5" />
      <text x="96" y="250" textAnchor="middle" className="sa-t">TEST · 18 JUN</text>
      <text x="304" y="250" textAnchor="middle" className="sa-t">TEST · 29 JUN</text>
      <line x1="200" x2="200" y1={top} y2={base} stroke="#202020" strokeWidth="1.2" strokeDasharray="3 4" />
      <circle cx="200" cy="126" r="24" fill="#ff5841" stroke="#202020" strokeWidth="1.5" className="sa-spin" />
      <g transform="translate(200 126) rotate(-40)">
        <rect x="-2.6" y="-3" width="5.2" height="19" fill="#202020" />
        <circle cy="-8" r="7" fill="#202020" />
        <rect x="-2.4" y="-17" width="4.8" height="9" fill="#ff5841" />
      </g>
      <rect x="146" y="166" width="108" height="34" fill="#f5f5f3" />
      <text x="200" y="180" textAnchor="middle" className="sa-t sa-tb">SERVICE VISIT</text>
      <text x="200" y="194" textAnchor="middle" className="sa-t">ENGINEER APPROVED</text>
    </Frame>
  );
}

/** 4. Reports for your paperwork: a data report assembling from battery records, and what it is not. */
export function ReportsArt() {
  const rows: [string, string, boolean][] = [
    ['INVENTORY', 'POPULATED', false],
    ['OPERATIONS', 'PARTLY', false],
    ['LIFECYCLE', 'PARTLY', false],
    ['ENERGY', 'NOT RECORDED', true],
  ];
  return (
    <Frame label="Illustration: a stack of report sheets, the top one with a table of sections marked populated, partly populated or not recorded, a stamp saying it is not a certificate, and chips for CSV, JSON and PDF export." caption="EVIDENCE-BACKED · GAPS LISTED">
      <defs><Hatch id="sa-h-rep" /></defs>
      <rect x="92" y="40" width="240" height="212" fill="#d3d3d0" stroke="#202020" strokeWidth="1.5" />
      <rect x="78" y="50" width="240" height="212" fill="#e4e4e1" stroke="#202020" strokeWidth="1.5" />
      <g className="sa-lift">
        <rect x="64" y="60" width="240" height="212" fill="#ffffff" stroke="#202020" strokeWidth="1.5" />
        <rect x="64" y="60" width="240" height="24" fill="#ff5841" stroke="#202020" strokeWidth="1.5" />
        <text x="76" y="76" className="sa-t sa-tb">DATA REPORT · PERIOD</text>
        <text x="78" y="112" className="sa-num" fontSize="22">Battery operations</text>
        <text x="78" y="128" className="sa-t">DEMO CUSTOMER A · ALL SITES</text>
        <rect x="78" y="138" width="212" height="18" fill="#202020" />
        <text x="86" y="151" className="sa-t" style={{ fill: '#ececea' }}>SECTION</text>
        <text x="208" y="151" className="sa-t" style={{ fill: '#ececea' }}>STATUS</text>
        {rows.map(([a, b, gap], i) => (
          <g key={a}>
            {gap && <rect x="200" y={156 + i * 20} width="90" height="20" fill="url(#sa-h-rep)" fillOpacity="0.22" />}
            <line x1="78" x2="290" y1={176 + i * 20} y2={176 + i * 20} stroke="#202020" strokeOpacity="0.35" />
            <line x1="200" x2="200" y1={156 + i * 20} y2={176 + i * 20} stroke="#202020" strokeOpacity="0.35" />
            <text x="86" y={170 + i * 20} className="sa-t sa-tb">{a}</text>
            <text x="206" y={170 + i * 20} className="sa-t" style={gap ? { fill: '#202020', letterSpacing: '0.03em' } : undefined}>{b}</text>
          </g>
        ))}
        <rect x="78" y="246" width="136" height="18" fill="#ffffff" stroke="#b73a1c" strokeWidth="1.2" />
        <text x="86" y="259" className="sa-t" style={{ fill: '#b73a1c' }}>NOT A CERTIFICATE</text>
      </g>
      {['CSV', 'JSON', 'PDF'].map((c, i) => (
        <g key={c}>
          <rect x="342" y={92 + i * 32} width="46" height="22" fill="#202020" />
          <text x="365" y={107 + i * 32} textAnchor="middle" className="sa-t" style={{ fill: '#ececea' }}>{c}</text>
        </g>
      ))}
    </Frame>
  );
}
