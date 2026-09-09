import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getConnection,
  getServiceClient,
  getUserId,
  handleOptions,
  jsonResponse,
  revokeStravaAccess,
} from "../_shared/strava.ts";

/**
 * Deconnexion manuelle demandee par le participant.
 *
 * Avant, cette fonction se contentait de poser `disconnected_at` : l'athlete
 * restait connecte chez Strava et continuait d'occuper une place du quota.
 * Elle revoque desormais l'acces pour de vrai.
 *
 * La ligne est conservee, comme pour le balayage automatique.
 */
Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const userId = await getUserId(req);
    const { event_id } = await req.json();
    if (!event_id) return jsonResponse({ error: "missing_fields" }, 400);

    const supabase = getServiceClient();
    const connection = await getConnection(userId, event_id);

    // Deja deconnecte : rien a faire, on reste idempotent.
    if (!connection) return jsonResponse({ disconnected: true, revoked: false });

    let revoked = false;
    let revokeError: string | null = null;
    try {
      await revokeStravaAccess(connection);
      revoked = true;
    } catch (e) {
      revokeError = e instanceof Error ? e.message : "unknown_error";
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("strava_connections")
      .update({
        disconnected_at: now,
        revoked_at: revoked ? now : null,
        revoke_error: revokeError,
      })
      .eq("id", connection.id);

    if (error) return jsonResponse({ error: "db_error" }, 500);

    // La deconnexion locale reussit meme si Strava a refuse : le balayage
    // reessaiera, et l'utilisateur ne reste pas bloque sur un ecran d'erreur.
    return jsonResponse({ disconnected: true, revoked, revoke_error: revokeError });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return jsonResponse({ error: message }, message === "not_authenticated" ? 401 : 500);
  }
});
