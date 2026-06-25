import { config } from '../config';
import { ensureAnonymousAuth, getSupabase } from '../supabase';
import type { ActivityDetail, StravaActivity } from '../types';

export function buildStravaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.stravaClientId,
    redirect_uri: config.stravaRedirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export function startStravaOAuth(boatName: string): void {
  const state = crypto.randomUUID();
  sessionStorage.setItem('oauth_state', state);
  sessionStorage.setItem('oauth_boat_name', boatName);
  window.location.href = buildStravaAuthUrl(state);
}

export async function completeStravaOAuth(code: string): Promise<number> {
  await ensureAnonymousAuth();
  const supabase = getSupabase();
  const flow = JSON.parse(sessionStorage.getItem('flow_event_json') ?? 'null');
  const boatName = sessionStorage.getItem('oauth_boat_name');

  if (!flow?.id || !boatName) throw new Error('oauth_failed');

  const { data, error } = await supabase.functions.invoke('strava-oauth-exchange', {
    body: {
      code,
      event_id: flow.id,
      boat_name: boatName.trim(),
      redirect_uri: config.stravaRedirectUri,
    },
  });

  if (error) throw new Error('oauth_failed');
  if (data?.error) throw new Error(String(data.error));

  sessionStorage.removeItem('oauth_state');
  sessionStorage.removeItem('oauth_boat_name');

  return Number(data.athlete_id);
}

export async function listActivities(eventId: string): Promise<StravaActivity[]> {
  await ensureAnonymousAuth();
  const supabase = getSupabase();

  const { data, error } = await supabase.functions.invoke('strava-list-activities', {
    body: { event_id: eventId },
  });

  if (error) throw new Error('strava_api_error');
  if (data?.error) throw new Error(String(data.error));

  return (data.activities ?? []) as StravaActivity[];
}

export async function getActivityDetail(
  eventId: string,
  activityId: number,
): Promise<ActivityDetail> {
  await ensureAnonymousAuth();
  const supabase = getSupabase();

  const { data, error } = await supabase.functions.invoke('strava-get-activity', {
    body: { event_id: eventId, activity_id: activityId },
  });

  if (error) throw new Error('strava_api_error');
  if (data?.error) throw new Error(String(data.error));

  return data as ActivityDetail;
}

export async function disconnectStrava(eventId: string): Promise<void> {
  await ensureAnonymousAuth();
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('strava-disconnect', {
    body: { event_id: eventId },
  });
  if (error || data?.error) throw new Error('disconnect_failed');
}
