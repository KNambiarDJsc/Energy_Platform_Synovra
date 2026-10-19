import type { CSSProperties, ReactNode } from 'react';

/**
 * A place reserved for a picture, drawing, video or component that has not been supplied yet. Each slot has a name
 * and a stated shape, so it can be filled without touching the layout: pass `src` (an image or, for kind="video", a
 * muted looping video) or children. With neither, it draws a hatched placeholder that says what belongs there.
 * Every slot is listed in docs/landing-slots.md.
 */
export type SlotKind = 'video' | 'illustration' | 'image' | 'component';

export function Slot({
  name, kind, ratio = '16 / 9', note, src, alt, children, className, dark = false,
}: {
  name: string; kind: SlotKind; ratio?: string; note: string; src?: string; alt?: string; children?: ReactNode; className?: string; dark?: boolean;
}) {
  const style = { ['--ratio' as string]: ratio } as CSSProperties;
  let body: ReactNode = children;
  if (!body && src) {
    body = kind === 'video'
      ? <video className="slot-fill" src={src} muted loop playsInline autoPlay aria-hidden />
      // eslint-disable-next-line @next/next/no-img-element -- supplied later, any size
      : <img className="slot-fill" src={src} alt={alt ?? ''} />;
  }
  return (
    <figure className={['slot', dark ? 'slot-dark' : '', className ?? ''].filter(Boolean).join(' ')} data-slot={name} data-filled={body ? '' : undefined} style={style}>
      {body ?? (
        <div className="slot-empty" role="img" aria-label={`Placeholder for ${kind}: ${note}`}>
          <span className="slot-tag">{kind}</span>
          <span className="slot-name">{name}</span>
          <span className="slot-note">{note}</span>
          <span className="slot-spec">{ratio.replace(/\s/g, '')} · public/landing/slots/{name}</span>
        </div>
      )}
    </figure>
  );
}
