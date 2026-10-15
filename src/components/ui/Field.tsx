'use client';
import {
  cloneElement, forwardRef, isValidElement, useId,
  type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/format';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Wraps a single control and wires label, hint and error to it for assistive technology. */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required && (
          <span className="text-critical-700" aria-hidden>
            {' '}*
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-xs font-medium text-critical-700">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn('input', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn('input pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

/** A filter in a toolbar row: a filled capsule sized to its options. The options say what they filter ("Any severity"). */
export const ToolbarSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label: string }>(function ToolbarSelect(
  { label, className, children, id, ...rest },
  ref,
) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <span className="min-w-0">
      <label htmlFor={sid} className="sr-only">
        {label}
      </label>
      <select
        ref={ref}
        id={sid}
        className={cn('input !min-h-[40px] w-auto max-w-full rounded-full border-transparent bg-fill py-1.5 pl-4 font-medium hover:bg-fill-2 focus:bg-white', className)}
        {...rest}
      >
        {children}
      </select>
    </span>
  );
});

/** The search field of a toolbar: the same filled capsule, with the magnifier inside. */
export const ToolbarSearch = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; icon: ReactNode }>(function ToolbarSearch(
  { label, icon, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <span className={cn('relative block min-w-0', className)}>
      <label htmlFor={sid} className="sr-only">
        {label}
      </label>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
      <input
        ref={ref}
        id={sid}
        type="search"
        className="input !min-h-[40px] rounded-full border-transparent bg-fill pl-10 hover:bg-fill-2 focus:bg-white"
        {...rest}
      />
    </span>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={3} className={cn('input', className)} {...rest} />;
});

/** Parses a numeric text field. Empty string is `null` (unknown), never zero. */
export function parseNumberInput(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
