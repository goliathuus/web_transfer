import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return client;
}

export async function ensureAnonymousAuth(): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error('not_authenticated');
  }
}
