import { ProfileClient } from '@/components/profile/profile-client';

export function generateStaticParams() {
  return [{ username: 'placeholder' }];
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfileClient username={username} />;
}
