import { GridSkeleton } from '@/components/design-system/skeleton';

export default function ExploreLoading() {
  return (
    <div className="p-0.5">
      <GridSkeleton columns={3} rows={6} gap={0.5} />
    </div>
  );
}
