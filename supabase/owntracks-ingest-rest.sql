-- =====================================================================
-- Reception OwnTracks directement par PostgREST (sans Edge Function)
-- =====================================================================
-- L'offre gratuite Supabase plafonne les Edge Functions a 500 000 appels
-- par mois, et OwnTracks poste un point par seconde et par bateau : une
-- regate de 30 bateaux sur 3 h en consommerait ~320 000. L'API REST n'est
-- pas facturee a la requete, on y branche donc OwnTracks directement :
--
--   POST https://<ref>.supabase.co/rest/v1/rpc/owntracks_ingest?apikey=<cle anon>
--   Authorization: Basic <tracker_devices.id>:<jeton>
--
-- PostgREST passe le corps JSON tel quel a une fonction dont l'unique
-- parametre jsonb n'est pas nomme. L'en-tete Basic arrive jusqu'a Postgres
-- (request.headers) : c'est lui qui porte l'authentification de l'appareil.
--
-- Codes de reponse et file d'attente d'OwnTracks : tout non-2xx fait garder
-- le message et le renvoyer plus tard. On ne repond donc 401 que pour un
-- appareil inconnu ; un message inexploitable est accepte puis ignore.
--
-- Remplace l'Edge Function owntracks-ingest (meme logique de tri).
-- A executer dans le SQL Editor (projet yucxpbxrtruwtdqbsxeh).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.owntracks_ingest(jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Au-dela, le point vient d'une localisation reseau/wifi et non du GPS.
  c_max_accuracy_m CONSTANT numeric := 100;
  -- Champs OwnTracks recopies dans telemetry.meta.
  c_meta_fields CONSTANT text[] := ARRAY['acc', 'alt', 'batt', 'bs', 'conn', 'vel', 't', 'created_at', 'tid'];

  v_auth      text := current_setting('request.headers', true)::json->>'authorization';
  v_decoded   text;
  v_sep       int;
  v_device_id uuid;
  v_token     text;
  v_messages  jsonb;
  v_points    jsonb;
BEGIN
  IF v_auth IS NULL OR v_auth !~* '^basic ' THEN
    RAISE SQLSTATE 'PT401' USING MESSAGE = 'unauthorized';
  END IF;

  BEGIN
    v_decoded := convert_from(decode(substr(v_auth, 7), 'base64'), 'UTF8');
    v_sep := strpos(v_decoded, ':');
    v_device_id := substr(v_decoded, 1, v_sep - 1)::uuid;
    v_token := substr(v_decoded, v_sep + 1);
  EXCEPTION WHEN others THEN
    RAISE SQLSTATE 'PT401' USING MESSAGE = 'unauthorized';
  END;

  IF v_sep = 0 OR v_token = '' THEN
    RAISE SQLSTATE 'PT401' USING MESSAGE = 'unauthorized';
  END IF;

  -- Un message seul, ou un lot.
  v_messages := CASE jsonb_typeof($1) WHEN 'array' THEN $1 ELSE jsonb_build_array($1) END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ts', to_timestamp((m->>'tst')::double precision),
           'lat', (m->>'lat')::double precision,
           'lon', (m->>'lon')::double precision,
           -- OwnTracks donne vel en km/h entiers : on stocke des m/s.
           'speed', CASE WHEN jsonb_typeof(m->'vel') = 'number' AND (m->>'vel')::numeric >= 0
                         THEN (m->>'vel')::double precision / 3.6 END,
           -- cog n'est envoye que par iOS.
           'heading', CASE WHEN jsonb_typeof(m->'cog') = 'number' AND (m->>'cog')::numeric >= 0
                           THEN (m->>'cog')::double precision END,
           'meta', (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
                    FROM jsonb_each(m) AS e(k, v)
                    WHERE k = ANY (c_meta_fields))
         )), '[]'::jsonb)
  INTO v_points
  FROM jsonb_array_elements(v_messages) AS m
  -- CASE plutot que AND : Postgres ne garantit pas l'ordre d'evaluation, un
  -- cast sur une valeur non numerique pourrait sinon lever une erreur. Un
  -- point sans `acc` est garde.
  WHERE CASE
          WHEN jsonb_typeof(m) <> 'object' OR m->>'_type' IS DISTINCT FROM 'location' THEN false
          WHEN jsonb_typeof(m->'lat') <> 'number' OR jsonb_typeof(m->'lon') <> 'number'
               OR jsonb_typeof(m->'tst') <> 'number' THEN false
          WHEN jsonb_typeof(m->'lat') IS NULL OR jsonb_typeof(m->'lon') IS NULL
               OR jsonb_typeof(m->'tst') IS NULL THEN false
          WHEN abs((m->>'lat')::numeric) > 90 OR abs((m->>'lon')::numeric) > 180 THEN false
          WHEN jsonb_typeof(m->'acc') = 'number' THEN (m->>'acc')::numeric <= c_max_accuracy_m
          ELSE true
        END;

  BEGIN
    PERFORM ingest_owntracks_points(v_device_id, v_token, v_points);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'unauthorized' THEN
      RAISE SQLSTATE 'PT401' USING MESSAGE = 'unauthorized';
    END IF;
    RAISE;
  END;

  RETURN '[]'::jsonb;
END;
$function$;

REVOKE ALL ON FUNCTION public.owntracks_ingest(jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.owntracks_ingest(jsonb) TO anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
