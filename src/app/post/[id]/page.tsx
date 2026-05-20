import { PostDetailClient } from '@/components/post/post-detail-client';

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostDetailClient postId={id} />;
}
