'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import Link from 'next/link';

interface TrendingTag {
  hashtag: string;
  post_count: number;
}

export function TrendingTags() {
  const [tags, setTags] = useState<TrendingTag[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('get_trending_hashtags', { p_limit: 10 });
      if (data) setTags(data);
    }
    load();
  }, []);

  if (tags.length === 0) return null;

  return (
    <div className="py-3 border-b border-[var(--border-subtle)]">
      <h3 className="text-sm font-semibold text-[var(--text-muted)] px-4 mb-2">Trending</h3>
      <div className="flex gap-2 px-4 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {tags.map((tag) => (
          <Link
            key={tag.hashtag}
            href={`/explore/tags/${tag.hashtag}`}
            className="flex-shrink-0 px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-soft)] transition-colors"
          >
            <span className="text-sm font-medium text-[var(--text-primary)]">#{tag.hashtag}</span>
            <span className="text-xs text-[var(--text-muted)] ml-1.5">{formatNumber(Number(tag.post_count))}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
