import Link from 'next/link';
import { cn } from '@/lib/format';

/** Wordmark built from text and a simple mark. No external image or font required. */
export function Brand({ href = '/', tone = 'dark', className }: { href?: string; tone?: 'dark' | 'light'; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 rounded-md', className)} aria-label="Synovra Battery Intelligence, home">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect x="1" y="5" width="26" height="20" rx="4" fill={tone === 'dark' ? '#112B40' : '#FFFFFF'} />
        <rect x="8" y="2" width="4" height="4" rx="1" fill="#007E83" />
        <rect x="16" y="2" width="4" height="4" rx="1" fill="#007E83" />
        <path d="M7 16.5h4l2.2-5 3 8 2.2-3H21" stroke="#2DB8BD" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="leading-tight">
        <span className={cn('block text-[15px] font-semibold tracking-tight', tone === 'dark' ? 'text-navy' : 'text-white')}>Synovra</span>
        <span className={cn('block text-[11px] font-medium', tone === 'dark' ? 'text-muted' : 'text-[#B9CBD5]')}>Battery Intelligence</span>
      </span>
    </Link>
  );
}
