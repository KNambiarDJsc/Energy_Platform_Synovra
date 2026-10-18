import Link from 'next/link';
import { cn } from '@/lib/format';

/** The mark alone, linking home: a battery with a pulse through it. */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Link href="/" className={cn('inline-flex rounded-md', className)} aria-label="Synovra Battery Intelligence, home">
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
        <rect x="1" y="5" width="26" height="20" rx="5" fill="#231E19" />
        <rect x="6" y="2" width="5" height="4" rx="1" fill="#6B6359" />
        <rect x="17" y="2" width="5" height="4" rx="1" fill="#C2652F" />
        <path d="M7 16.5h4l2.2-5 3 8 2.2-3H21" stroke="#F2A877" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/** Wordmark built from text and a simple mark. No external image or font required. */
export function Brand({ href = '/', tone = 'dark', className }: { href?: string; tone?: 'dark' | 'light'; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 rounded-md', className)} aria-label="Synovra Battery Intelligence, home">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect x="1" y="5" width="26" height="20" rx="5" fill={tone === 'dark' ? '#231E19' : '#FFFFFF'} />
        <rect x="6" y="2" width="5" height="4" rx="1" fill="#6B6359" />
        <rect x="17" y="2" width="5" height="4" rx="1" fill="#C2652F" />
        <path d="M7 16.5h4l2.2-5 3 8 2.2-3H21" stroke={tone === 'dark' ? '#F2A877' : '#A34D1F'} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="leading-tight">
        <span className={cn('block font-display text-[19px] leading-[22px] tracking-[-0.01em]', tone === 'dark' ? 'text-ink' : 'text-white')}>Synovra</span>
        <span className={cn('block text-[13px] font-medium', tone === 'dark' ? 'text-muted' : 'text-[#D9D0C4]')}>Battery Intelligence</span>
      </span>
    </Link>
  );
}
