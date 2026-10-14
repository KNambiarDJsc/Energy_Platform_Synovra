/** Shown instantly while a route segment loads, so a sidebar click always gives immediate feedback. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="animate-pulse space-y-3">
      <div className="h-10 w-1/2 rounded-md bg-[#DDE5EA]" />
      <div className="h-24 rounded-lg bg-[#E4EBEF]" />
      <div className="h-64 rounded-lg bg-[#E4EBEF]" />
    </div>
  );
}
