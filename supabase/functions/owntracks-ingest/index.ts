import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Point d'entree du mode HTTP d'OwnTracks (apps officielles Android / iOS).
 *
 * OwnTracks ne sait pas porter un JWT Supabase : la fonction est deployee
 * avec verify_jwt = false et s'authentifie en HTTP Basic
 * (username = tracker_devices.id, password = jeton renvoye par
 * register_tracker_device). La verification du jeton et l'ecriture se font
 * en un seul appel a la RPC ingest_owntracks_points.
 *
 * Regle de reponse : tout non-2xx fait garder le message en file par l'app,
 * qui le renverra plus tard. On ne renvoie donc une erreur que lorsqu'un
 * nouvel essai peut reussir (panne base) ou que l'appareil n'est pas
 * reconnu (401). Un message inexploitable est accepte puis ignore, sinon
 * il bloquerait la file du telephone indefiniment.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Au-dela, le point vient d'une localisation reseau/wifi et non du GPS.
const MAX_ACCURACY_M = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Champs OwnTracks recopies dans telemetry.meta.
const META_FIELDS = ["acc", "alt", "batt", "bs", "conn", "vel", "t", "created_at", "tid"] as const;

type OwnTracksMessage = Record<string, unknown>;

interface TelemetryPoint {
  ts: string;
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  meta: Record<string, unknown>;
}

const EMPTY_OK = () => new Response("[]", { headers: { "Content-Type": "application/json" } });

function unauthorized(): Response {
  return new Response("unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="owntracks"' },
  });
}

function parseBasicAuth(req: Request): { user: string; pass: string } | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toPoint(msg: OwnTracksMessage): TelemetryPoint | null {
  if (msg._type !== "location") return null;

  const { lat, lon, tst, acc, vel, cog } = msg;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon) || !isFiniteNumber(tst)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (isFiniteNumber(acc) && acc > MAX_ACCURACY_M) return null;

  const meta: Record<string, unknown> = {};
  for (const field of META_FIELDS) {
    if (msg[field] !== undefined) meta[field] = msg[field];
  }

  return {
    ts: new Date(tst * 1000).toISOString(),
    lat,
    lon,
    // OwnTracks donne vel en km/h entiers : on stocke des m/s.
    speed: isFiniteNumber(vel) && vel >= 0 ? vel / 3.6 : null,
    // cog n'est envoye que par iOS.
    heading: isFiniteNumber(cog) && cog >= 0 ? cog : null,
    meta,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const creds = parseBasicAuth(req);
  if (!creds || !UUID_RE.test(creds.user) || !creds.pass) return unauthorized();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return EMPTY_OK();
  }

  // Un message seul, ou un lot quand l'app vide sa file.
  const messages = (Array.isArray(payload) ? payload : [payload])
    .filter((m): m is OwnTracksMessage => typeof m === "object" && m !== null);
  const points = messages.map(toPoint).filter((p): p is TelemetryPoint => p !== null);

  const { error } = await supabase.rpc("ingest_owntracks_points", {
    p_device_id: creds.user,
    p_token: creds.pass,
    p_points: points,
  });

  if (error) {
    if (error.message.includes("unauthorized")) return unauthorized();
    console.error("owntracks-ingest rpc failed", error.message);
    return new Response("db_error", { status: 500 });
  }

  return EMPTY_OK();
});
