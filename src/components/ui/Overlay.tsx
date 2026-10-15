'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

interface OverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'md:max-w-md', md: 'md:max-w-xl', lg: 'md:max-w-3xl' };

function CloseButton() {
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        aria-label="Close"
        className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-ink-2 transition-[background-color,transform] duration-150 hover:bg-fill-2 active:scale-95"
      >
        <X className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
      </button>
    </Dialog.Close>
  );
}

function Header({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pb-1 pt-6">
      <div className="min-w-0">
        <Dialog.Title className="text-xl font-semibold text-ink">{title}</Dialog.Title>
        {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : null}
      </div>
      <CloseButton />
    </div>
  );
}

/** A sheet that rises from the bottom on phones and a centred panel on larger screens. Focus is trapped and returned by Radix. */
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md' }: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay no-print fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'anim-sheet no-print fixed z-50 flex max-h-[92dvh] w-full flex-col bg-white shadow-pop',
            'bottom-0 left-0 rounded-t-2xl md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl',
            sizes[size],
          )}
        >
          <Header title={title} description={description} />
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 px-6 pb-6 pt-3 sm:flex-row sm:justify-end">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A panel from the side: full height on phones, floating inside the window on larger screens. */
export function Drawer({ open, onOpenChange, title, description, children, footer }: Omit<OverlayProps, 'size'>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay no-print fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="anim-drawer no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-pop md:inset-y-3 md:right-3 md:rounded-2xl"
        >
          <Header title={title} description={description} />
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="flex gap-2 px-6 pb-6 pt-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
