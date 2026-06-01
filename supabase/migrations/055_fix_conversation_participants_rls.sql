-- ============================================================
-- 055: Fix conversation_participants SELECT — self-referential policy causes zero rows
--
-- The policy from 054 queries conversation_participants from within its own
-- SELECT policy (self-referential). PostgreSQL can silently return zero rows
-- for this pattern. Fix: use a SECURITY DEFINER function to get the user's
-- conversation IDs, then use that in the policy.
-- ============================================================

-- Step 1: Create a helper function that bypasses RLS
CREATE OR REPLACE FUNCTION public.get_my_conversation_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_conversation_ids() TO authenticated;

-- Step 2: Replace the self-referential policy with one that uses the function
DROP POLICY IF EXISTS "conversation_participants_select" ON public.conversation_participants;

CREATE POLICY "conversation_participants_select" ON public.conversation_participants
  FOR SELECT
  USING (
    conversation_id IN (SELECT public.get_my_conversation_ids())
  );
