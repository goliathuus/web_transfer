import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getServiceClient,
  handleOptions,
  jsonResponse,
  revokeStravaAccess,
  type StravaConnection,
} from "../_shared/strava.ts";

/**
 * Balayage des connexions Strava arrivees a echeance.
 *
 * submit_strava_activity pose `revoke_after` apres une soumission reussie.
 * Passe ce delai de grace, cette fonction revoque l'acces chez Strava pour
 * liberer une place dans le quota d'athletes de l'application.
 *
 * La ligne strava_connections est CONSERVEE : on garde qui s'est connecte,
 * quand, pour quel evenement et avec quel athlete. Seul l'acces disparait.
 *
 * Appel reserve au service role : cette fonction agit sur toutes les
 * connexions, pas seulement celles de l'appelant.
 */
interface SweepBody {
  dry_run?: boolean;
  limit?: number;
}

function assertServiceRole(req: Request): void {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace("Bearer ", "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || token !== serviceKey) throw new Error("forbidden");
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    assertServiceRole(req);

    let body: SweepBody = {};
    try {
      body = await req.json();
    } catch {
      // Corps vide : les valeurs par defaut suffisent.
    }

    const dryRun = body.dry_run === true;
    const limit = Math.min(Math.max(body.limit ?? 25, 1), 200);
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("strava_connections")
      .select("*")
      .is("revoked_at", null)
      .not("revoke_after", "is", null)
      .lte("revoke_after", new Date().toISOString())
      .order("revoke_after", { ascending: true })
      .limit(limit);

    if (error) return jsonResponse({ error: "db_error", detail: error.message }, 500);

    const due = (data ?? []) as StravaConnection[];

    if (dryRun) {
      return jsonResponse({
        dry_run: true,
        due: due.length,
        connections: due.map((c) => ({
          id: c.id,
          event_id: c.event_id,
          strava_athlete_id: c.strava_athlete_id,
        })),
      });
    }

    let revoked = 0;
    let already = 0;
    const failures: { id: string; error: string }[] = [];

    for (const connection of due) {
      try {
        const result = await revokeStravaAccess(connection);
        if (result.already) already += 1;
        else revoked += 1;

        const now = new Date().toISOString();
        await supabase
          .from("strava_connections")
          .update({
            revoked_at: now,
            // La deconnexion locale suit la revocation reelle, pour que les
            // fonctions existantes cessent de considerer l'acces comme actif.
            disconnected_at: now,
            revoke_error: null,
          })
          .eq("id", connection.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown_error";
        failures.push({ id: connection.id, error: message });
        // L'echec est trace mais ne bloque pas les suivantes : la connexion
        // restera candidate au prochain passage.
        await supabase.rpc("increment_strava_revoke_attempt", {
          p_connection_id: connection.id,
          p_error: message,
        });
      }
    }

    return jsonResponse({ due: due.length, revoked, already_revoked: already, failures });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return jsonResponse({ error: message }, message === "forbidden" ? 403 : 500);
  }
});
