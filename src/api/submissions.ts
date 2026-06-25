import { ensureAnonymousAuth, getSupabase } from '../supabase';
import type { ActivityDetail, SubmissionResult } from '../types';

export async function submitStravaActivity(
  eventId: string,
  boatName: string,
  detail: ActivityDetail,
): Promise<SubmissionResult> {
  await ensureAnonymousAuth();
  const supabase = getSupabase();

  const raw = detail.raw_summary;
  const map = raw.map as Record<string, unknown> | undefined;

  const activityMeta = {
    name: detail.activity.name,
    type: detail.activity.type ?? detail.activity.sport_type,
    distance: detail.activity.distance,
    moving_time: detail.activity.moving_time,
    elapsed_time: detail.activity.elapsed_time,
    start_date: detail.activity.start_date,
    map_summary_polyline: map?.summary_polyline ?? raw.map_summary_polyline,
    ...raw,
  };

  const { data, error } = await supabase.rpc('submit_strava_activity', {
    p_event_id: eventId,
    p_boat_name: boatName.trim(),
    p_strava_activity_id: detail.activity.id,
    p_strava_athlete_id: detail.athlete_id,
    p_activity_meta: activityMeta,
    p_points: detail.points,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('duplicate_boat')) throw new Error('duplicate_boat');
    if (msg.includes('duplicate_activity')) throw new Error('duplicate_activity');
    if (msg.includes('no_gps_data')) throw new Error('no_gps_data');
    if (msg.includes('activity_outside_window')) throw new Error('activity_outside_window');
    if (msg.includes('expired')) throw new Error('expired');
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('empty_response');

  return row as SubmissionResult;
}
