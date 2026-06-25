import { ensureAnonymousAuth, getSupabase } from '../supabase';
import type { Event } from '../types';

export async function validateEventCode(code: string): Promise<Event> {
  await ensureAnonymousAuth();
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('validate_event_code', {
    p_code: code.trim().toUpperCase(),
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid_code')) throw new Error('invalid_code');
    if (msg.includes('expired')) throw new Error('expired');
    if (msg.includes('not_authenticated')) throw new Error('not_authenticated');
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('invalid_code');

  return row as Event;
}
