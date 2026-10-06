import { Skeleton } from './Feedback';

/** Skeletons that mirror each page's final layout so content doesn't jump. */
export function PageSkeleton({ variant = 'dashboard' }: { variant?: 'dashboard' | 'list' | 'calendar' | 'charts' }) {
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-2 h-4 w-28" />
      <Skeleton className="mb-6 h-9 w-72 max-w-full" />
      {variant === 'dashboard' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-6 xl:grid-cols-12">
          <Skeleton className="h-[380px] rounded-3xl md:col-span-6 xl:col-span-8 xl:row-span-2" />
          <Skeleton className="h-[180px] rounded-3xl md:col-span-3 xl:col-span-4" />
          <Skeleton className="h-[180px] rounded-3xl md:col-span-3 xl:col-span-4" />
          <Skeleton className="h-[240px] rounded-3xl md:col-span-3 xl:col-span-4" />
          <Skeleton className="h-[240px] rounded-3xl md:col-span-3 xl:col-span-4" />
          <Skeleton className="h-[240px] rounded-3xl md:col-span-6 xl:col-span-4" />
        </div>
      )}
      {variant === 'list' && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-3xl" />
          ))}
        </div>
      )}
      {variant === 'calendar' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <Skeleton className="h-[620px] rounded-3xl" />
          <Skeleton className="h-[620px] rounded-3xl" />
        </div>
      )}
      {variant === 'charts' && (
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-3xl" />
          ))}
        </div>
      )}
    </div>
  );
}
