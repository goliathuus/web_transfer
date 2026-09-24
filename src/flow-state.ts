import type { Event, FlowState, TrackerRegistration } from './types';
import { isEventExpired } from './types';

const KEYS = {
  event: 'flow_event_json',
  boatName: 'flow_boat_name',
  athleteId: 'flow_strava_athlete_id',
  stravaConnected: 'flow_strava_connected',
  pendingOAuth: 'flow_pending_oauth',
  tracking: 'flow_tracking_registration',
} as const;

export function saveTrackingRegistration(reg: TrackerRegistration): void {
  sessionStorage.setItem(KEYS.tracking, JSON.stringify(reg));
}

/** Inscription deja faite dans cet onglet pour cet evenement, s'il y en a une. */
export function loadTrackingRegistration(eventId: string): TrackerRegistration | null {
  const raw = sessionStorage.getItem(KEYS.tracking);
  if (!raw) return null;
  const reg = JSON.parse(raw) as TrackerRegistration;
  return reg.eventId === eventId ? reg : null;
}

export function saveFlowState(state: FlowState): void {
  if (state.event) {
    sessionStorage.setItem(KEYS.event, JSON.stringify(state.event));
  }
  if (state.boatName) {
    sessionStorage.setItem(KEYS.boatName, state.boatName);
  }
  if (state.stravaAthleteId != null) {
    sessionStorage.setItem(KEYS.athleteId, String(state.stravaAthleteId));
  }
  sessionStorage.setItem(KEYS.stravaConnected, String(state.stravaConnected));
  sessionStorage.setItem(KEYS.pendingOAuth, String(state.pendingOAuth ?? false));
}

export function loadFlowState(): FlowState {
  const eventJson = sessionStorage.getItem(KEYS.event);
  let event: Event | null = null;

  if (eventJson) {
    event = JSON.parse(eventJson) as Event;
    if (isEventExpired(event)) {
      clearFlowState();
      return emptyFlowState();
    }
  }

  const athleteRaw = sessionStorage.getItem(KEYS.athleteId);

  return {
    event,
    boatName: sessionStorage.getItem(KEYS.boatName),
    stravaAthleteId: athleteRaw ? Number(athleteRaw) : null,
    stravaConnected: sessionStorage.getItem(KEYS.stravaConnected) === 'true',
    pendingOAuth: sessionStorage.getItem(KEYS.pendingOAuth) === 'true',
  };
}

export function clearFlowState(): void {
  Object.values(KEYS).forEach((k) => sessionStorage.removeItem(k));
}

export function emptyFlowState(): FlowState {
  return {
    event: null,
    boatName: null,
    stravaAthleteId: null,
    stravaConnected: false,
    pendingOAuth: false,
  };
}

export function markPendingOAuth(boatName: string): void {
  const state = loadFlowState();
  saveFlowState({ ...state, boatName, pendingOAuth: true });
}
