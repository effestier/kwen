import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Simple in-memory cache for Supabase queries.
// Cache entries are keyed by the query signature and live for 30 seconds.
// This prevents re-fetching the same data when navigating between pages.
const queryCache = new Map<string, { data: unknown; expiry: number }>()
const CACHE_TTL = 30_000 // 30 seconds

function getCacheKey(query: string, params?: Record<string, unknown>): string {
  return params ? `${query}:${JSON.stringify(params)}` : query
}

function getCached<T>(key: string): T | null {
  const entry = queryCache.get(key)
  if (entry && entry.expiry > Date.now()) {
    return entry.data as T
  }
  if (entry) queryCache.delete(key)
  return null
}

function setCache<T>(key: string, data: T): void {
  queryCache.set(key, { data, expiry: Date.now() + CACHE_TTL })
}

// Clear cache on auth state changes (login/logout)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.includes('supabase')) queryCache.clear()
  })
}

let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

/**
 * Cached query helper — wraps a Supabase query with in-memory caching.
 * Use for data that doesn't change frequently (profiles, posts, etc.).
 * Set cacheTTL to 0 to skip caching for realtime-sensitive data.
 */
export async function cachedQuery<T>(
  key: string,
  fn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  cacheTTL = CACHE_TTL
): Promise<{ data: T | null; error: { message: string } | null }> {
  const cached = getCached<T>(key)
  if (cached !== null) {
    return { data: cached, error: null }
  }
  const result = await fn()
  if (result.data && !result.error) {
    queryCache.set(key, { data: result.data, expiry: Date.now() + cacheTTL })
  }
  return result
}

/** Invalidate a specific cache entry or clear the entire cache. */
export function invalidateCache(key?: string): void {
  if (key) {
    queryCache.delete(key)
  } else {
    queryCache.clear()
  }
}
