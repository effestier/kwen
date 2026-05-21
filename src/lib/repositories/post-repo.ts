import { createClient } from '@/lib/supabase/server'

export interface Post {
  id: string
  user_id: string
  content: string | null
  location: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PostWithDetails extends Post {
  user_display_name: string
  user_username: string
  user_avatar_url: string | null
  user_is_verified: boolean
  like_count: number
  comment_count: number
  is_liked: boolean
  is_saved: boolean
  media?: PostMedia[]
}

export interface PostMedia {
  id: string
  post_id: string
  storage_path: string
  media_type: 'image' | 'video'
  sort_order: number
}

export class PostRepository {
  private supabase = createClient

  async create(userId: string, content: string | null, location?: string): Promise<Post | null> {
    const supabase = await this.supabase()

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content,
        location: location || null,
      })
      .select()
      .single()

    if (error) return null
    return data as Post
  }

  async getById(id: string): Promise<Post | null> {
    const supabase = await this.supabase()
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) return null
    return data as Post
  }

  async getByIdWithDetails(id: string, currentUserId?: string): Promise<PostWithDetails | null> {
    const supabase = await this.supabase()

    const { data: post, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error || !post) return null

    // Get user info
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url, is_verified')
      .eq('id', post.user_id)
      .single()

    // Get counts and states
    const [{ count: likeCount }, { count: commentCount }, isLiked, isSaved] = await Promise.all([
      supabase.from('post_likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
      currentUserId ? supabase.from('post_likes').select('id').eq('post_id', post.id).eq('user_id', currentUserId).single() : Promise.resolve({ data: null }),
      currentUserId ? supabase.from('saved_posts').select('id').eq('post_id', post.id).eq('user_id', currentUserId).single() : Promise.resolve({ data: null }),
    ])

    // Get media
    const { data: media } = await supabase
      .from('post_media')
      .select('*')
      .eq('post_id', post.id)
      .order('sort_order')

    return {
      ...post,
      user_display_name: profile?.display_name || '',
      user_username: profile?.username || '',
      user_avatar_url: profile?.avatar_url || null,
      user_is_verified: profile?.is_verified || false,
      like_count: likeCount || 0,
      comment_count: commentCount || 0,
      is_liked: !!isLiked?.data,
      is_saved: !!isSaved?.data,
      media: (media as PostMedia[]) || undefined,
    }
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const supabase = await this.supabase()

    const { error } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)

    return !error
  }

  async getByUserId(userId: string, currentUserId?: string, limit = 20, cursor?: string): Promise<PostWithDetails[]> {
    const supabase = await this.supabase()

    let query = supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: posts, error } = await query
    if (error || !posts) return []

    return this.enrichPostsWithDetails(posts as Post[], currentUserId)
  }

  async getFeed(userId: string, limit = 20, cursor?: string): Promise<PostWithDetails[]> {
    const supabase = await this.supabase()

    // Use RPC function for feed
    const { data: posts, error } = await supabase.rpc('get_timeline', {
      p_user_id: userId,
      p_limit: limit,
      p_cursor: cursor ? new Date(cursor) : null,
    })

    if (error || !posts) return []
    return posts as PostWithDetails[]
  }

  async getExplore(userId: string, limit = 20, cursor?: string): Promise<PostWithDetails[]> {
    const supabase = await this.supabase()

    const { data: posts, error } = await supabase.rpc('get_explore_posts', {
      p_user_id: userId,
      p_limit: limit,
      p_cursor: cursor ? new Date(cursor) : null,
    })

    if (error || !posts) return []
    return posts as PostWithDetails[]
  }

  async getSaved(userId: string, limit = 20, cursor?: string): Promise<PostWithDetails[]> {
    const supabase = await this.supabase()

    let query = supabase
      .from('saved_posts')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: saved, error } = await query
    if (error || !saved) return []

    const postIds = saved.map(s => s.post_id)
    if (postIds.length === 0) return []

    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds)
      .is('deleted_at', null)

    if (!posts) return []

    // Preserve order from saved_posts
    const postsMap = new Map(posts.map(p => [p.id, p]))
    const orderedPosts = saved.map(s => postsMap.get(s.post_id)).filter(Boolean) as Post[]

    return this.enrichPostsWithDetails(orderedPosts, userId)
  }

  async addMedia(postId: string, storagePath: string, mediaType: 'image' | 'video', sortOrder = 0): Promise<PostMedia | null> {
    const supabase = await this.supabase()

    const { data, error } = await supabase
      .from('post_media')
      .insert({
        post_id: postId,
        storage_path: storagePath,
        media_type: mediaType,
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) return null
    return data as PostMedia
  }

  private async enrichPostsWithDetails(posts: Post[], currentUserId?: string): Promise<PostWithDetails[]> {
    if (posts.length === 0) return []

    const supabase = await this.supabase()
    const userIds = [...new Set(posts.map(p => p.user_id))]

    // Get profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url, is_verified')
      .in('id', userIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

    // Get counts and states in batch
    const postIds = posts.map(p => p.id)
    const [{ data: likes }, { data: saved }, { data: allComments }] = await Promise.all([
      currentUserId ? supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds).eq('user_id', currentUserId) : Promise.resolve({ data: [] }),
      currentUserId ? supabase.from('saved_posts').select('post_id, user_id').in('post_id', postIds).eq('user_id', currentUserId) : Promise.resolve({ data: [] }),
      supabase.from('post_likes').select('post_id').in('post_id', postIds),
    ])

    const likedSet = new Set(likes?.map(l => l.post_id) || [])
    const savedSet = new Set(saved?.map(s => s.post_id) || [])
    const likeCounts = new Map<string, number>()
    allComments?.forEach(l => {
      likeCounts.set(l.post_id, (likeCounts.get(l.post_id) || 0) + 1)
    })

    const { data: allCommentCounts } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds)
      .is('deleted_at', null)
    const commentCounts = new Map<string, number>()
    allCommentCounts?.forEach(c => {
      commentCounts.set(c.post_id, (commentCounts.get(c.post_id) || 0) + 1)
    })

    // Get media
    const { data: allMedia } = await supabase
      .from('post_media')
      .select('*')
      .in('post_id', postIds)
      .order('sort_order')

    const mediaMap = new Map<string, PostMedia[]>()
    allMedia?.forEach(m => {
      const existing = mediaMap.get(m.post_id) || []
      mediaMap.set(m.post_id, [...existing, m as PostMedia])
    })

    return posts.map(post => {
      const profile = profileMap.get(post.user_id)
      return {
        ...post,
        user_display_name: profile?.display_name || '',
        user_username: profile?.username || '',
        user_avatar_url: profile?.avatar_url || null,
        user_is_verified: profile?.is_verified || false,
        like_count: likeCounts.get(post.id) || 0,
        comment_count: commentCounts.get(post.id) || 0,
        is_liked: likedSet.has(post.id),
        is_saved: savedSet.has(post.id),
        media: mediaMap.get(post.id),
      }
    })
  }
}