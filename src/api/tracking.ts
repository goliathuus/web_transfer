import { config } from '../config';
import { ensureAnonymousAuth, getSupabase } from '../supabase';
import type { TrackerRegistration } from '../types';

const INGEST_URL = `${config.supabaseUrl}/functions/v1/owntracks-ingest`;

// Intervalle d'envoi en mode "move" (secondes). A ajuster apres l'essai en
// mer : plus court = trace plus fine, mais batterie et data plus sollicitees.
const MOVE_INTERVAL_S = 5;

export const OWNTRACKS_STORE_LINKS = {
  ios: 'https://apps.apple.com/app/owntracks/id692424691',
  android: 'https://play.google.com/store/apps/details?id=org.owntracks.android',
} as const;

export async function registerTrackerDevice(
  eventId: string,
  boatName: string,
): Promise<TrackerRegistration> {
  await ensureAnonymousAuth();
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('register_tracker_device', {
    p_event_id: eventId,
    p_boat_name: boatName.trim(),
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('duplicate_boat')) throw new Error('duplicate_boat');
    if (msg.includes('missing_boat_name')) throw new Error('missing_boat_name');
    if (msg.includes('invalid_event')) throw new Error('invalid_event');
    if (msg.includes('expired')) throw new Error('expired');
    if (msg.includes('not_authenticated')) throw new Error('not_authenticated');
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('empty_response');

  return {
    eventId,
    boatName: boatName.trim(),
    deviceId: row.device_id,
    token: row.token,
  };
}

/** Deux caracteres affiches par OwnTracks a la place d'un avatar. */
function trackerId(boatName: string): string {
  const letters = boatName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return letters.slice(0, 2) || 'BT';
}

export function ownTracksConfig(reg: TrackerRegistration): Record<string, unknown> {
  return {
    _type: 'configuration',
    mode: 3, // HTTP
    url: INGEST_URL,
    auth: true,
    username: reg.deviceId,
    password: reg.token,
    deviceId: 'boat',
    tid: trackerId(reg.boatName),
    monitoring: 2, // move : suivi continu
    locatorInterval: MOVE_INTERVAL_S,
    moveModeLocatorInterval: MOVE_INTERVAL_S,
    locatorDisplacement: 0,
    pubExtendedData: true,
    cmd: false,
    remoteConfiguration: false,
  };
}

/** Lien qui ouvre OwnTracks et lui applique la configuration d'un coup. */
export function ownTracksConfigUrl(reg: TrackerRegistration): string {
  const json = JSON.stringify(ownTracksConfig(reg));
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `owntracks:///config?inline=${encodeURIComponent(base64)}`;
}

export function ingestUrl(): string {
  return INGEST_URL;
}
