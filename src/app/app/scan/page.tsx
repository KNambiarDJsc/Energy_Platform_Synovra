'use client';
import { QrCode } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { LinkButton } from '@/components/ui/Button';
import { Notice, PageHeader } from '@/components/ui/Layout';
import { ErrorState, LoadingBlock } from '@/components/ui/States';
import { useSvcQuery } from '@/lib/hooks';

/**
 * QR / label lookup. A reference only *finds* a record. Access is decided by the signed-in
 * role and site scope, so an unknown or out-of-scope reference reveals nothing.
 */
function ScanInner() {
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get('ref');
  const label = params.get('label');

  const result = useSvcQuery(['scan', ref, label], async (s) => {
    if (ref) return s.batteries.lookupByPublicRef(ref);
    if (label) {
      const rows = await s.batteries.list({ q: label });
      const hit = rows.find((r) => r.label.toLowerCase() === label.toLowerCase());
      return hit
        ? { status: 'active' as const, batteryId: hit.id, message: 'Found' }
        : { status: 'unknown' as const, batteryId: null, message: `No visible battery has the label ${label}.` };
    }
    return { status: 'unknown' as const, batteryId: null, message: 'No reference was supplied.' };
  });

  useEffect(() => {
    if (result.data?.status === 'active' && result.data.batteryId) router.replace(`/app/batteries/${result.data.batteryId}`);
  }, [result.data, router]);

  return (
    <>
      <PageHeader title="Battery lookup" description="Resolve a QR reference or printed label to a battery record." />
      {result.isLoading || result.data?.status === 'active' ? (
        <LoadingBlock label="Looking up the battery" rows={2} />
      ) : result.isError ? (
        <ErrorState error={result.error} onRetry={() => void result.refetch()} />
      ) : result.data ? (
        <div className="max-w-xl space-y-4">
          <Notice
            tone={result.data.status === 'retired' ? 'warn' : 'danger'}
            title={
              result.data.status === 'retired'
                ? 'This QR reference has been retired'
                : result.data.status === 'forbidden'
                  ? 'You do not have access to this record'
                  : 'No matching battery'
            }
          >
            {result.data.message}
          </Notice>
          <p className="text-sm text-muted">
            A QR code is a lookup key only. Seeing a valid code never grants access; your role and site scope decide what you can open.
          </p>
          <LinkButton href="/app/batteries" icon={<QrCode className="h-4 w-4" aria-hidden />} variant="secondary">
            Search batteries
          </LinkButton>
        </div>
      ) : null}
    </>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ScanInner />
    </Suspense>
  );
}
