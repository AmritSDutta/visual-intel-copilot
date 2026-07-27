import { supabase } from './supabaseClient';
import type { SessionTurnRecord, SessionSummary } from './sessionDbService';

export async function saveCloudSessionTurn(userId: string, record: SessionTurnRecord): Promise<void> {
  // 1. Ensure user session parent record exists / updated
  const { error: sessionErr } = await supabase
    .from('user_sessions')
    .upsert(
      {
        session_id: record.session_id,
        user_id: userId,
        first_prompt: record.user_prompt,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'session_id' }
    );

  if (sessionErr) {
    console.error('Failed to save cloud user session:', sessionErr);
    throw sessionErr;
  }

  // 2. Insert or update turn record
  const { error: turnErr } = await supabase
    .from('session_turns')
    .upsert(
      {
        session_id: record.session_id,
        turn_id: record.turn_id,
        user_id: userId,
        user_prompt: record.user_prompt,
        chat_reply: record.chat_reply,
        image_blob: record.image_blob,
        created_at: record.created_at || new Date().toISOString()
      },
      { onConflict: 'session_id,turn_id' }
    );

  if (turnErr) {
    console.error('Failed to save cloud turn:', turnErr);
    throw turnErr;
  }
}

export async function getCloudSessionsSummary(userId: string): Promise<SessionSummary[]> {
  const { data: turns, error } = await supabase
    .from('session_turns')
    .select('session_id, user_prompt, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch cloud sessions summary:', error);
    throw error;
  }

  if (!turns || turns.length === 0) return [];

  const sessionMap: { [sessionId: string]: { first_prompt: string; count: number; created_at: string; latest_created_at: string } } = {};

  for (const turn of turns) {
    const sid = turn.session_id;
    if (!sessionMap[sid]) {
      sessionMap[sid] = {
        first_prompt: turn.user_prompt || 'Untitled Session',
        count: 0,
        created_at: turn.created_at,
        latest_created_at: turn.created_at
      };
    }
    sessionMap[sid].count += 1;
    sessionMap[sid].latest_created_at = turn.created_at;
  }

  const summaries: SessionSummary[] = Object.keys(sessionMap).map((sid) => ({
    session_id: sid,
    first_prompt: sessionMap[sid].first_prompt,
    turn_count: sessionMap[sid].count,
    created_at: sessionMap[sid].created_at,
    latest_created_at: sessionMap[sid].latest_created_at
  }));

  summaries.sort((a, b) => b.latest_created_at.localeCompare(a.latest_created_at));
  return summaries;
}

export async function getCloudSessionTurns(userId: string, sessionId: string): Promise<SessionTurnRecord[]> {
  const { data, error } = await supabase
    .from('session_turns')
    .select('session_id, turn_id, user_prompt, chat_reply, image_blob, created_at')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch cloud session turns:', error);
    throw error;
  }

  return (data || []).map((t) => ({
    session_id: t.session_id,
    turn_id: t.turn_id,
    user_prompt: t.user_prompt,
    chat_reply: t.chat_reply,
    image_blob: t.image_blob || '',
    created_at: t.created_at
  }));
}

export async function deleteCloudSession(userId: string, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('user_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('session_id', sessionId);

  if (error) {
    console.error('Failed to delete cloud session:', error);
    throw error;
  }
}
