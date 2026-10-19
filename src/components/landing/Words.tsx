import type { CSSProperties } from 'react';

/**
 * A sentence as separate words, each knowing its place (`--i`) and the total (`--n`), so the stylesheet can bring
 * them up one by one as the reader scrolls. Server-rendered and plain text to a screen reader: the words are
 * ordinary inline spans separated by spaces.
 */
export function Words({ text, className }: { text: string; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={className} style={{ ['--n' as string]: words.length } as CSSProperties}>
      {words.map((w, i) => (
        <span key={i} className="lp-w" style={{ ['--i' as string]: i } as CSSProperties}>
          {w}{i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}
