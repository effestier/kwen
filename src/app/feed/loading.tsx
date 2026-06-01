export default function FeedLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Mobile Header skeleton */}
      <div className="lg:hidden sticky top-0 z-20 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5">
        <div className="flex items-center justify-between">
          <div className="h-6 w-16 bg-[var(--bg-tertiary)] rounded animate-pulse" />
          <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
        </div>
      </div>

      {/* Desktop Header skeleton */}
      <div className="hidden lg:block sticky top-0 z-20 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
        <div className="max-w-[600px] mx-auto py-3 px-4">
          <div className="h-6 w-20 bg-[var(--bg-tertiary)] rounded animate-pulse" />
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4">
        {/* Composer skeleton */}
        <div className="py-2.5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="flex-1 h-10 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
        </div>

        {/* Stories skeleton */}
        <div className="py-3 border-b border-[var(--border-subtle)] flex gap-3 overflow-hidden">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
              <div className="h-3 w-12 bg-[var(--bg-tertiary)] rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Post skeletons */}
        {[1, 2, 3].map(i => (
          <div key={i} className="py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 bg-[var(--bg-tertiary)] rounded animate-pulse" />
                <div className="h-3 w-16 bg-[var(--bg-tertiary)] rounded animate-pulse" />
              </div>
            </div>
            <div className="space-y-2 mb-3">
              <div className="h-3.5 w-full bg-[var(--bg-tertiary)] rounded animate-pulse" />
              <div className="h-3.5 w-3/4 bg-[var(--bg-tertiary)] rounded animate-pulse" />
            </div>
            <div className="aspect-square bg-[var(--bg-tertiary)] rounded-xl animate-pulse mb-3" />
            <div className="flex gap-6">
              <div className="h-4 w-12 bg-[var(--bg-tertiary)] rounded animate-pulse" />
              <div className="h-4 w-12 bg-[var(--bg-tertiary)] rounded animate-pulse" />
              <div className="h-4 w-12 bg-[var(--bg-tertiary)] rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
