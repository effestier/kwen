import { TagPageClient } from './tag-client';

export function generateStaticParams() {
  return [{ tag: 'placeholder' }];
}

export default function TagPage() {
  return <TagPageClient />;
}
