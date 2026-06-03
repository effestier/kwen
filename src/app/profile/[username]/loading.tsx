import { Skeleton } from '@/components/design-system/skeleton';

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-start gap-4 mb-6">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="flex-1 space-y-3 pt-2">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-6">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      </div>
    </div>
  );
}
