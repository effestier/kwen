-- =============================================
-- Fix highlight stories query to handle expired/deleted stories
-- =============================================

-- Use LEFT JOIN so highlights still show even if the story row is missing
CREATE OR REPLACE FUNCTION public.get_highlight_with_stories(p_highlight_id uuid)
RETURNS TABLE (
  highlight_id uuid,
  highlight_title text,
  highlight_cover text,
  story_id uuid,
  story_media_url text,
  story_media_type text,
  story_created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sh.id as highlight_id,
    sh.title as highlight_title,
    sh.cover_url as highlight_cover,
    s.id as story_id,
    s.media_url as story_media_url,
    s.media_type as story_media_type,
    s.created_at as story_created_at
  FROM story_highlights sh
  JOIN highlight_stories hs ON hs.highlight_id = sh.id
  LEFT JOIN stories s ON s.id = hs.story_id
  WHERE sh.id = p_highlight_id
  ORDER BY hs.sort_order, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
