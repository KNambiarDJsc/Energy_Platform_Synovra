import { cn } from '@/lib/format';

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
export type Size = 'sm' | 'md';

/** Buttons are fully round, decided once for the whole product. */
const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-[transform,background-color,color,opacity] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';
const variants: Record<Variant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-600 active:bg-teal-700',
  secondary: 'bg-fill text-ink hover:bg-fill-2 active:bg-fill-3',
  ghost: 'text-teal-700 hover:bg-fill active:bg-fill-2',
  danger: 'bg-critical text-white hover:bg-critical-700',
  // On the navy passport: a translucent white fill, so the button belongs to the surface it sits on.
  inverse: 'bg-white/[0.14] text-white hover:bg-white/[0.22] active:bg-white/[0.3]',
};
const sizes: Record<Size, string> = { sm: 'min-h-[36px] px-4 text-sm', md: 'min-h-[44px] px-5 text-sm' };

/** Plain function (no 'use client') so server components such as the landing page can use it. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

/** A choice among a few options (filters, viewers, strings): the chosen one is filled with ink. */
export function chipClass(active: boolean, extra?: string) {
  return cn(
    'inline-flex min-h-[36px] select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97]',
    active ? 'bg-ink text-white' : 'bg-fill text-ink hover:bg-fill-2',
    extra,
  );
}
