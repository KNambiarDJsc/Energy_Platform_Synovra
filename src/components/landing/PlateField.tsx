/**
 * A drawing of lead plates standing in a row, lit from the foot. It stands for a battery's insides in general and
 * is not a picture of any battery. `tone` picks the light: copper for the physical battery, teal for evidence
 * (the product uses teal for information and copper for action).
 */
export function PlateField({ tone, seed = 0 }: { tone: 'copper' | 'teal'; seed?: number }) {
  const c = tone === 'copper'
    ? { glow: '#C2652F', foot: '#f2a877', mid: '#8a5a3a', top: '#c9bfb3' }
    : { glow: '#2C6B66', foot: '#8FCFC4', mid: '#3f7e78', top: '#c9d6d2' };
  const id = `pf-${tone}-${seed}`;
  const bars = Array.from({ length: 21 }, (_, i) => {
    const h = 380 + ((i * 37 + seed * 53) % 9) * 46;
    return { x: 36 + i * 36, h };
  });
  return (
    <svg viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice" className="lp-plates" aria-hidden>
      <defs>
        <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.top} stopOpacity="0.85" />
          <stop offset="0.55" stopColor={c.mid} />
          <stop offset="1" stopColor={c.foot} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="100%" r="75%">
          <stop offset="0" stopColor={c.glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={c.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c0a09" stopOpacity="1" />
          <stop offset="0.5" stopColor="#0c0a09" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="800" height="1000" fill="#0c0a09" />
      <rect width="800" height="1000" fill={`url(#${id}-glow)`} />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={940 - b.h} width="16" height={b.h} rx="4" fill={`url(#${id}-bar)`} opacity={0.5 + ((i * 7) % 5) * 0.1} />
      ))}
      <rect width="800" height="1000" fill={`url(#${id}-fade)`} />
      <rect x="0" y="936" width="800" height="64" fill="#0c0a09" opacity="0.8" />
    </svg>
  );
}
