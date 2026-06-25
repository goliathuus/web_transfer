export interface Event {
  id: string;
  title: string;
  code: string;
  starts_at: string | null;
  ends_at: string | null;
}

export function isEventExpired(event: Event): boolean {
  if (!event.ends_at) return false;
  return new Date() > new Date(event.ends_at);
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_date: string;
  has_map?: boolean;
}

export interface ActivityPoint {
  lat: number;
  lng: number;
  altitude: number | null;
  timestamp: string;
  sequence_index: number;
}

export interface ActivityDetail {
  activity: StravaActivity;
  points: ActivityPoint[];
  athlete_id: number;
  raw_summary: Record<string, unknown>;
}

export type ValidationStatus = 'pending' | 'accepted' | 'rejected' | 'needs_review';

export interface SubmissionResult {
  submission_id: string;
  session_id: string;
  validation_status: ValidationStatus;
}

export interface SubmissionSummary {
  eventTitle: string;
  boatName: string;
  activityName: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  validationStatus: ValidationStatus;
}

export interface FlowState {
  event: Event | null;
  boatName: string | null;
  stravaAthleteId: number | null;
  stravaConnected: boolean;
  pendingOAuth?: boolean;
}
