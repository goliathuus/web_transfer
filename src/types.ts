export interface Event {
  id: string;
  title: string;
  code: string;
  starts_at: string | null;
  ends_at: string | null;
}

/**
 * Delai accorde apres la fin d'un evenement pour deposer sa trace.
 *
 * Doit rester aligne sur la fonction SQL event_submission_grace() : sans ca,
 * l'interface refuserait un code que le serveur accepte encore, ou l'inverse.
 */
export const SUBMISSION_GRACE_MS = 24 * 60 * 60 * 1000;

export function isEventExpired(event: Event): boolean {
  if (!event.ends_at) return false;
  return Date.now() > new Date(event.ends_at).getTime() + SUBMISSION_GRACE_MS;
}

/** Vrai quand l'evenement est termine mais encore dans le delai de depot. */
export function isEventInGracePeriod(event: Event): boolean {
  if (!event.ends_at) return false;
  const end = new Date(event.ends_at).getTime();
  return Date.now() > end && !isEventExpired(event);
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

/**
 * Inscription d'un telephone au suivi en direct. Le jeton n'est renvoye
 * qu'une fois par le serveur : on le garde pour la duree de l'onglet afin
 * qu'un rechargement n'en genere pas un nouveau (ce qui deconnecterait un
 * telephone deja configure).
 */
export interface TrackerRegistration {
  eventId: string;
  boatName: string;
  deviceId: string;
  token: string;
}

export interface FlowState {
  event: Event | null;
  boatName: string | null;
  stravaAthleteId: number | null;
  stravaConnected: boolean;
  pendingOAuth?: boolean;
}
