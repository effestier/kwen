import { ListSkeleton } from '@/components/design-system/skeleton';

export default function NotificationsLoading() {
  return (
    <div className="p-3">
      <ListSkeleton items={8} />
    </div>
  );
}
