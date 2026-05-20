-- Migration 025: Interactive Stickers (Polls, Questions, Countdown)
-- Run this in Supabase SQL Editor

-- =============================================
-- STORY POLLS TABLE
-- =============================================
CREATE TABLE public.story_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  question text NOT NULL,
  option_1 text NOT NULL,
  option_2 text NOT NULL,
  option_1_count int DEFAULT 0,
  option_2_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_story_polls_story_id ON story_polls(story_id);

-- =============================================
-- STORY POLL VOTES TABLE
-- =============================================
CREATE TABLE public.story_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES story_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_number int NOT NULL CHECK (option_number IN (1, 2)),
  created_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

CREATE INDEX idx_story_poll_votes_poll_id ON story_poll_votes(poll_id);

-- =============================================
-- STORY QUESTIONS TABLE
-- =============================================
CREATE TABLE public.story_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  question text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_story_questions_story_id ON story_questions(story_id);

-- =============================================
-- STORY QUESTION RESPONSES TABLE
-- =============================================
CREATE TABLE public.story_question_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES story_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  response text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_story_question_responses_question_id ON story_question_responses(question_id);

-- =============================================
-- STORY COUNTDOWNS TABLE
-- =============================================
CREATE TABLE public.story_countdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  title text NOT NULL,
  end_time timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_story_countdowns_story_id ON story_countdowns(story_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Polls
ALTER TABLE public.story_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "polls_select_public" ON public.story_polls FOR SELECT USING (true);
CREATE POLICY "polls_insert_own" ON public.story_polls FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM stories WHERE id = story_id AND user_id = auth.uid())
);

CREATE POLICY "poll_votes_select_public" ON public.story_poll_votes FOR SELECT USING (true);
CREATE POLICY "poll_votes_insert_own" ON public.story_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Questions
ALTER TABLE public.story_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_question_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_select_public" ON public.story_questions FOR SELECT USING (true);
CREATE POLICY "questions_insert_own" ON public.story_questions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM stories WHERE id = story_id AND user_id = auth.uid())
);

CREATE POLICY "question_responses_select_owner" ON public.story_question_responses FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM story_questions sq
    JOIN stories s ON s.id = sq.story_id
    WHERE sq.id = question_id AND s.user_id = auth.uid()
  )
);
CREATE POLICY "question_responses_insert_own" ON public.story_question_responses FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Countdowns
ALTER TABLE public.story_countdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "countdowns_select_public" ON public.story_countdowns FOR SELECT USING (true);
CREATE POLICY "countdowns_insert_own" ON public.story_countdowns FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM stories WHERE id = story_id AND user_id = auth.uid())
);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Vote on a poll
CREATE OR REPLACE FUNCTION public.vote_on_poll(
  p_poll_id uuid,
  p_option_number int
)
RETURNS void AS $$
BEGIN
  -- Insert vote (will fail if already voted due to UNIQUE constraint)
  INSERT INTO story_poll_votes (poll_id, user_id, option_number)
  VALUES (p_poll_id, auth.uid(), p_option_number);

  -- Update poll counts
  IF p_option_number = 1 THEN
    UPDATE story_polls SET option_1_count = option_1_count + 1 WHERE id = p_poll_id;
  ELSE
    UPDATE story_polls SET option_2_count = option_2_count + 1 WHERE id = p_poll_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Respond to a question
CREATE OR REPLACE FUNCTION public.respond_to_question(
  p_question_id uuid,
  p_response text
)
RETURNS void AS $$
BEGIN
  INSERT INTO story_question_responses (question_id, user_id, response)
  VALUES (p_question_id, auth.uid(), p_response);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get poll results
CREATE OR REPLACE FUNCTION public.get_poll_results(p_poll_id uuid)
RETURNS TABLE (
  option_1_count int,
  option_2_count int,
  total_votes bigint,
  user_vote int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.option_1_count,
    p.option_2_count,
    (p.option_1_count + p.option_2_count)::bigint as total_votes,
    pv.option_number as user_vote
  FROM story_polls p
  LEFT JOIN story_poll_votes pv ON pv.poll_id = p.id AND pv.user_id = auth.uid()
  WHERE p.id = p_poll_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
