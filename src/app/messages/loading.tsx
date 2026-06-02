import { ListSkeleton } from '@/components/design-system/skeleton';

export default function MessagesLoading() {
  return (
    <div className="p-3">
      <ListSkeleton items={6} />
    </div>
  );
}
