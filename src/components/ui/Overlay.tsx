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
      <button type="button" aria-label="Close" className="-m-2 rounded-md p-2 text-muted hover:bg-canvas hover:text-ink">
        <X className="h-5 w-5" aria-hidden />
      </button>
    </Dialog.Close>
  );
}

/** Centered dialog on desktop, bottom sheet on phones. Focus is trapped and returned by Radix. */
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md' }: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="no-print fixed inset-0 z-50 bg-navy/50" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'no-print fixed z-50 flex max-h-[92vh] w-full flex-col bg-white shadow-pop',
            'bottom-0 left-0 rounded-t-lg md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg',
            sizes[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-navy">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
              ) : null}
            </div>
            <CloseButton />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({ open, onOpenChange, title, description, children, footer }: Omit<OverlayProps, 'size'>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="no-print fixed inset-0 z-50 bg-navy/40" />
        <Dialog.Content {...(description ? {} : { 'aria-describedby': undefined })} className="no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-pop">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-navy">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
              ) : null}
            </div>
            <CloseButton />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
