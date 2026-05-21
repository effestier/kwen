// Server action converted to client-side for static export

import { createClient } from '@/lib/supabase/client'

// Poll types
export interface Poll {
  id: string
  story_id: string
  question: string
  option_1: string
  option_2: string
  option_1_count: number
  option_2_count: number
}

export interface PollResults {
  option_1_count: number
  option_2_count: number
  total_votes: number
  user_vote: number | null
}

// Question types
export interface StoryQuestion {
  id: string
  story_id: string
  question: string
}

export interface QuestionResponse {
  id: string
  user: {
    username: string
    avatar_url: string | null
  }
  response: string
  created_at: string
}

// Countdown types
export interface Countdown {
  id: string
  story_id: string
  title: string
  end_time: string
}

// =============================================
// POLL FUNCTIONS
// =============================================

export async function createPoll(
  storyId: string,
  question: string,
  option1: string,
  option2: string
): Promise<{ pollId?: string; error?: string }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('story_polls')
    .insert({
      story_id: storyId,
      question,
      option_1: option1,
      option_2: option2,
    })
    .select()
    .single()

  if (error) {
    return { error: 'Failed to create poll' }
  }

  return { pollId: data.id }
}

export async function getPollByStory(storyId: string): Promise<Poll | null> {
  const supabase = createClient()

  const { data } = await supabase
    .from('story_polls')
    .select('*')
    .eq('story_id', storyId)
    .single()

  return data
}

export async function voteOnPoll(
  pollId: string,
  optionNumber: 1 | 2
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .rpc('vote_on_poll', {
      p_poll_id: pollId,
      p_option_number: optionNumber,
    })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Already voted' }
    }
    return { error: 'Failed to vote' }
  }

  return { success: true }
}

export async function getPollResults(pollId: string): Promise<PollResults | null> {
  const supabase = createClient()

  const { data } = await supabase
    .rpc('get_poll_results', { p_poll_id: pollId })

  return data?.[0] || null
}

// =============================================
// QUESTION FUNCTIONS
// =============================================

export async function createQuestion(
  storyId: string,
  question: string
): Promise<{ questionId?: string; error?: string }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('story_questions')
    .insert({
      story_id: storyId,
      question,
    })
    .select()
    .single()

  if (error) {
    return { error: 'Failed to create question' }
  }

  return { questionId: data.id }
}

export async function getQuestionByStory(storyId: string): Promise<StoryQuestion | null> {
  const supabase = createClient()

  const { data } = await supabase
    .from('story_questions')
    .select('*')
    .eq('story_id', storyId)
    .single()

  return data
}

export async function respondToQuestion(
  questionId: string,
  response: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .rpc('respond_to_question', {
      p_question_id: questionId,
      p_response: response,
    })

  if (error) {
    return { error: 'Failed to send response' }
  }

  return { success: true }
}

export async function getQuestionResponses(
  questionId: string
): Promise<QuestionResponse[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('story_question_responses')
    .select(`
      id,
      response,
      created_at,
      user:profiles(username, avatar_url)
    `)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })

  if (error) {
    return []
  }

  return data.map(d => ({
    id: d.id,
    user: d.user as any,
    response: d.response,
    created_at: d.created_at,
  }))
}

// =============================================
// COUNTDOWN FUNCTIONS
// =============================================

export async function createCountdown(
  storyId: string,
  title: string,
  endTime: string
): Promise<{ countdownId?: string; error?: string }> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('story_countdowns')
    .insert({
      story_id: storyId,
      title,
      end_time: endTime,
    })
    .select()
    .single()

  if (error) {
    return { error: 'Failed to create countdown' }
  }

  return { countdownId: data.id }
}

export async function getCountdownByStory(storyId: string): Promise<Countdown | null> {
  const supabase = createClient()

  const { data } = await supabase
    .from('story_countdowns')
    .select('*')
    .eq('story_id', storyId)
    .single()

  return data
}
