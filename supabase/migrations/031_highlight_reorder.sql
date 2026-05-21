-- =============================================
-- Migration 031: Highlight Reorder + Cover Update
-- =============================================

-- =============================================
-- RPC: reorder stories within a highlight
-- =============================================
CREATE OR REPLACE FUNCTION public.reorder_highlight_stories(
  p_highlight_id uuid,
  p_story_ids uuid[]
)
RETURNS void AS $$
DECLARE
  i int;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM story_highlights
    WHERE id = p_highlight_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Update sort_order for each story
  FOR i IN 1..array_length(p_story_ids, 1) LOOP
    UPDATE highlight_stories
    SET sort_order = i
    WHERE highlight_id = p_highlight_id AND story_id = p_story_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: update highlight cover
-- =============================================
CREATE OR REPLACE FUNCTION public.update_highlight_cover(
  p_highlight_id uuid,
  p_cover_url text
)
RETURNS void AS $$
BEGIN
  UPDATE story_highlights
  SET cover_url = p_cover_url, updated_at = now()
  WHERE id = p_highlight_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
