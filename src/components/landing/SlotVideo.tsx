'use client';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * A decorative looping video for a Slot. It starts on its own only for people who have not asked for reduced motion,
 * stays muted, and always has a pause control, so moving content never has to be put up with.
 */
export function SlotVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    v.play().then(() => setPlaying(true), () => setPlaying(false));
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  return (
    <>
      <video ref={ref} className="slot-fill" src={src} poster={poster} muted loop playsInline preload="auto" aria-hidden="true" tabIndex={-1} />
      <button type="button" className="slot-toggle" onClick={toggle} aria-label={playing ? 'Pause the background video' : 'Play the background video'}>
        {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
      </button>
    </>
  );
}
