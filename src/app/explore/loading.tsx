import { Skeleton } from '@/components/design-system/skeleton';

export default function ExploreLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Skeleton className="h-10 w-full rounded-full mb-6" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      </div>
    </div>
  );
}
