import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

export function getServiceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("not_authenticated");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await getServiceClient().auth.getUser(token);
  if (error || !data.user) throw new Error("not_authenticated");
  return data.user.id;
}

export interface StravaConnection {
  id: string;
  user_id: string;
  event_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string;
  strava_athlete_id: number;
}

export async function getConnection(userId: string, eventId: string): Promise<StravaConnection | null> {
  const { data, error } = await getServiceClient()
    .from("strava_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .is("disconnected_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as StravaConnection | null;
}

export async function refreshStravaToken(connection: StravaConnection): Promise<StravaConnection> {
  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("strava_not_configured");
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token_encrypted,
    }),
  });
  if (!response.ok) throw new Error("token_revoked");
  const tokenData = await response.json();
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  const { data, error } = await getServiceClient()
    .from("strava_connections")
    .update({
      access_token_encrypted: tokenData.access_token,
      refresh_token_encrypted: tokenData.refresh_token,
      expires_at: expiresAt,
    })
    .eq("id", connection.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as StravaConnection;
}

export async function getValidAccessToken(userId: string, eventId: string): Promise<{ accessToken: string; athleteId: number }> {
  let connection = await getConnection(userId, eventId);
  if (!connection) throw new Error("not_connected");
  if (new Date(connection.expires_at).getTime() < Date.now() + 60000) {
    connection = await refreshStravaToken(connection);
  }
  return { accessToken: connection.access_token_encrypted, athleteId: connection.strava_athlete_id };
}

export async function stravaFetch(accessToken: string, path: string): Promise<Response> {
  return fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Revoque reellement l'acces de l'application chez Strava.
 *
 * C'est le seul appel qui libere une place dans le quota d'athletes :
 * poser `disconnected_at` en base ne fait rien cote Strava, l'athlete y
 * reste connecte et l'application apparait toujours dans ses reglages.
 *
 * Le jeton est rafraichi au prealable si besoin : deauthorize avec un jeton
 * expire echouerait. Si le rafraichissement echoue parce que l'utilisateur a
 * deja retire l'acces de son cote, l'objectif est atteint malgre tout.
 *
 * Retourne `already` quand l'acces etait deja perdu : pour l'appelant c'est
 * un succes, la place est libre.
 */
export async function revokeStravaAccess(
  connection: StravaConnection,
): Promise<{ revoked: true; already: boolean }> {
  let active = connection;

  if (new Date(active.expires_at).getTime() < Date.now() + 60000) {
    try {
      active = await refreshStravaToken(active);
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      // Jeton deja revoque par l'utilisateur : la place est libre.
      if (message === "token_revoked") return { revoked: true, already: true };
      throw e;
    }
  }

  const token = active.access_token_encrypted;
  const response = await fetch(
    `https://www.strava.com/oauth/deauthorize?access_token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );

  // 401 : Strava ne connait plus ce jeton, l'acces est donc bien perdu.
  if (response.status === 401) return { revoked: true, already: true };
  if (!response.ok) {
    throw new Error(`deauthorize_failed_${response.status}`);
  }
  return { revoked: true, already: false };
}
