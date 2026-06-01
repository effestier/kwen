import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { FeedClient } from './feed-client';

export default async function FeedPage() {
  const supabase = await createClient();

  let authUser;
  try {
    const { data } = await supabase.auth.getUser();
    authUser = data.user;
  } catch {
    redirect('/auth/login');
  }

  if (!authUser) {
    redirect('/auth/login');
  }

  // Fetch profile + following on server — eliminates 2 client round-trips
  const [profileRes, followingRes] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', authUser.id).single(),
    supabase.from('follows').select('following_id').eq('follower_id', authUser.id),
  ]);

  let profile = profileRes.data;
  if (!profile) {
    const tempUsername = `user_${authUser.id.slice(0, 8)}`;
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({ id: authUser.id, username: tempUsername, display_name: authUser.email?.split('@')[0] || 'User' }, { onConflict: 'id' })
      .select('id, username, display_name, avatar_url')
      .single();
    profile = newProfile;
  }

  if (!profile) {
    redirect('/auth/login');
  }

  const followingIds = followingRes.data?.map(f => f.following_id) || [];

  return (
    <FeedClient
      initialProfile={profile}
      initialFollowingIds={followingIds}
    />
  );
}
