-- 059: Grant EXECUTE on get_following_feed to authenticated
-- This was missing from migrations 048, 050, and 054 which all
-- defined/replaced the function but never granted permissions.

GRANT EXECUTE ON FUNCTION public.get_following_feed(uuid, int, uuid[]) TO authenticated;
