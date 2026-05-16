-- Add media_url column to posts table
ALTER TABLE public.posts ADD COLUMN media_url text;

-- Index for efficient media queries
CREATE INDEX idx_posts_media_url ON posts(media_url) WHERE media_url IS NOT NULL;