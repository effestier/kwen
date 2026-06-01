import { ProfileClient } from '@/components/profile/profile-client';
import { createClient } from '@/lib/supabase/server';

export function generateStaticParams() {
  return [{ username: 'placeholder' }];
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  let currentUserProfile = null;
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', authUser.id)
        .single();
      currentUserProfile = data;
    }
  } catch {
    // Client will handle auth
  }

  return <ProfileClient username={username} currentUserProfile={currentUserProfile} />;
}
