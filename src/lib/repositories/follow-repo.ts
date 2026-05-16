import { createClient } from '@/lib/supabase/server'

export class FollowRepository {
  private supabase = createClient

  async follow(followerId: string, followingId: string): Promise<boolean> {
    const supabase = await this.supabase()

    const { error } = await supabase
      .from('follows')
      .insert({
        follower_id: followerId,
        following_id: followingId,
      })

    if (error) return false
    return true
  }

  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    const supabase = await this.supabase()

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId)

    if (error) return false
    return true
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const supabase = await this.supabase()

    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .single()

    return !!data && !error
  }

  async getFollowers(userId: string, limit = 20, cursor?: string) {
    const supabase = await this.supabase()

    let query = supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: follows, error } = await query
    if (error || !follows) return { followers: [], nextCursor: undefined }

    const followerIds = follows.map(f => f.follower_id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_verified, created_at')
      .in('id', followerIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
    const followers = follows.map(f => profileMap.get(f.follower_id)).filter(Boolean)

    const nextCursor = follows.length === limit ? follows[limit - 1].created_at : undefined

    return { followers, nextCursor }
  }

  async getFollowing(userId: string, limit = 20, cursor?: string) {
    const supabase = await this.supabase()

    let query = supabase
      .from('follows')
      .select('following_id, created_at')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: follows, error } = await query
    if (error || !follows) return { following: [], nextCursor: undefined }

    const followingIds = follows.map(f => f.following_id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_verified, created_at')
      .in('id', followingIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
    const following = follows.map(f => profileMap.get(f.following_id)).filter(Boolean)

    const nextCursor = follows.length === limit ? follows[limit - 1].created_at : undefined

    return { following, nextCursor }
  }

  async getFollowersCount(userId: string): Promise<number> {
    const supabase = await this.supabase()
    const { count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId)

    return count || 0
  }

  async getFollowingCount(userId: string): Promise<number> {
    const supabase = await this.supabase()
    const { count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId)

    return count || 0
  }
}