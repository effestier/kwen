import { createClient } from '@/lib/supabase/server'

export interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  website: string | null
  is_verified: boolean
  created_at: string
  updated_at: string
}

export interface ProfileWithCounts extends Profile {
  posts_count: number
  followers_count: number
  following_count: number
  is_following: boolean
}

export class UserRepository {
  private supabase = createClient

  async getById(id: string): Promise<Profile | null> {
    const supabase = await this.supabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return null
    return data as Profile
  }

  async getByUsername(username: string): Promise<Profile | null> {
    const supabase = await this.supabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (error) return null
    return data as Profile
  }

  async getByUsernameWithCounts(username: string, currentUserId?: string): Promise<ProfileWithCounts | null> {
    const supabase = await this.supabase()

    // Get profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (error || !profile) return null

    // Get counts in parallel
    const [postsResult, followersResult, followingResult] = await Promise.all([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).is('deleted_at', null),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profile.id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id),
    ])

    // Check if current user is following
    let isFollowing = false
    if (currentUserId && currentUserId !== profile.id) {
      const { data: follow } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', profile.id)
        .single()
      isFollowing = !!follow
    }

    return {
      ...profile,
      posts_count: postsResult.count || 0,
      followers_count: followersResult.count || 0,
      following_count: followingResult.count || 0,
      is_following: isFollowing,
    }
  }

  async update(id: string, data: Partial<Pick<Profile, 'display_name' | 'bio' | 'website' | 'avatar_url'>>): Promise<Profile | null> {
    const supabase = await this.supabase()

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return null
    return profile as Profile
  }

  async updateAvatar(id: string, avatarUrl: string): Promise<Profile | null> {
    return this.update(id, { avatar_url: avatarUrl })
  }

  async checkUsernameAvailable(username: string): Promise<boolean> {
    const supabase = await this.supabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase())
      .single()

    return !data && !error
  }

  async search(query: string, limit = 20): Promise<Profile[]> {
    const supabase = await this.supabase()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(limit)

    if (error) return []
    return data as Profile[]
  }

  async getFollowers(userId: string, limit = 20, cursor?: string): Promise<Profile[]> {
    const supabase = await this.supabase()
    const followsData = (
      await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userId)
        .limit(limit)
    ).data

    if (!followsData) return []

    let query = supabase
      .from('profiles')
      .select('*')
      .in('id', followsData.map(f => f.follower_id))

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data, error } = await query
    if (error) return []
    return data as Profile[]
  }

  async getFollowing(userId: string, limit = 20, cursor?: string): Promise<Profile[]> {
    const supabase = await this.supabase()
    const followsData = (
      await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
        .limit(limit)
    ).data

    if (!followsData) return []

    let query = supabase
      .from('profiles')
      .select('*')
      .in('id', followsData.map(f => f.following_id))

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data, error } = await query
    if (error) return []
    return data as Profile[]
  }
}