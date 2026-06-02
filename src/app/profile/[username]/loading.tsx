import { ProfileSkeleton, GridSkeleton } from '@/components/design-system/skeleton';

export default function ProfileLoading() {
  return (
    <div className="p-4 space-y-6">
      <ProfileSkeleton />
      <GridSkeleton columns={3} rows={3} gap={0.5} />
    </div>
  );
}
