import { cn } from '@/lib/format';

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-teal';
const variants: Record<Variant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-700 active:bg-teal-800',
  secondary: 'border border-[#9FB2BD] bg-white text-ink hover:bg-canvas',
  ghost: 'text-ink hover:bg-canvas',
  danger: 'bg-critical text-white hover:bg-critical-700',
};
const sizes: Record<Size, string> = { sm: 'min-h-[36px] px-3 text-sm', md: 'min-h-[44px] px-4 text-sm' };

/** Plain function (no 'use client') so server components such as the landing page can use it. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}
