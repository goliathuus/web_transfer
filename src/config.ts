export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  stravaClientId: string;
  stravaRedirectUri: string;
}

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || typeof value !== 'string') {
    throw new Error(`Variable manquante: ${key}`);
  }
  return value;
}

export const config: AppConfig = {
  supabaseUrl: requireEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('VITE_SUPABASE_ANON_KEY'),
  stravaClientId: requireEnv('VITE_STRAVA_CLIENT_ID'),
  stravaRedirectUri:
    import.meta.env.VITE_STRAVA_REDIRECT_URI ?? `${window.location.origin}/`,
};
