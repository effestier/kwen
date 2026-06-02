import { GridSkeleton } from '@/components/design-system/skeleton';

export default function SavedLoading() {
  return (
    <div className="p-0.5">
      <GridSkeleton columns={3} rows={4} gap={0.5} />
    </div>
  );
}
