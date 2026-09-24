-- =====================================================================
-- Tracking temps reel via OwnTracks (mode HTTP)
-- =====================================================================
-- Les apps OwnTracks officielles (Android / iOS) postent leurs positions
-- a l'Edge Function owntracks-ingest. OwnTracks ne sait pas porter un JWT
-- Supabase : chaque telephone recoit un identifiant d'appareil et un jeton
-- (HTTP Basic), crees par register_tracker_device depuis la page
-- d'inscription (utilisateur anonyme, comme le parcours Strava).
--
--   tracker_devices          appareil -> utilisateur / evenement / bateau / session
--   register_tracker_device  appelee par le participant, renvoie le jeton en clair UNE fois
--   ingest_owntracks_points  appelee par owntracks-ingest (service_role uniquement)
--
-- A executer dans le SQL Editor (projet yucxpbxrtruwtdqbsxeh).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tracker_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  event_id     uuid NOT NULL REFERENCES public.events(id),
  boat_id      uuid NOT NULL REFERENCES public.boats(id),
  session_id   uuid NOT NULL REFERENCES public.sessions(id),
  token_hash   text NOT NULL,              -- sha256 hex du jeton
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS tracker_devices_user_event
  ON public.tracker_devices (user_id, event_id) WHERE revoked_at IS NULL;

-- Aucun acces direct : tout passe par les deux fonctions ci-dessous.
ALTER TABLE public.tracker_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tracker_devices FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Inscription d'un telephone
-- ---------------------------------------------------------------------
-- Une seule inscription active par participant et par evenement. Se
-- reinscrire (changement de telephone, reinstallation) revoque l'ancien
-- jeton mais garde le meme bateau et la meme session : la trace continue.
CREATE OR REPLACE FUNCTION public.register_tracker_device(
  p_event_id  uuid,
  p_boat_name text
)
RETURNS TABLE(device_id uuid, token text, session_id uuid, boat_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid := auth.uid();
  v_event      events%ROWTYPE;
  v_boat_name  text := TRIM(COALESCE(p_boat_name, ''));
  v_previous   tracker_devices%ROWTYPE;
  v_boat_id    uuid;
  v_session_id uuid;
  v_device_id  uuid;
  v_token      text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_boat_name = '' THEN
    RAISE EXCEPTION 'missing_boat_name';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;

  IF v_event.ends_at IS NOT NULL
     AND v_event.ends_at + event_submission_grace() < NOW() THEN
    RAISE EXCEPTION 'expired';
  END IF;

  -- Le nom de bateau ne doit pas etre pris par un autre participant,
  -- ni en tracking ni via une soumission Strava.
  IF EXISTS (
    SELECT 1 FROM boats b
    WHERE b.event_id = p_event_id
      AND LOWER(b.display_name) = LOWER(v_boat_name)
      AND b.owner_user_id <> v_user_id
  ) OR EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.event_id = p_event_id
      AND LOWER(s.boat_name) = LOWER(v_boat_name)
      AND s.user_id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'duplicate_boat';
  END IF;

  SELECT * INTO v_previous
  FROM tracker_devices d
  WHERE d.user_id = v_user_id AND d.event_id = p_event_id AND d.revoked_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_boat_id := v_previous.boat_id;
    v_session_id := v_previous.session_id;

    UPDATE tracker_devices SET revoked_at = NOW()
    WHERE user_id = v_user_id AND event_id = p_event_id AND revoked_at IS NULL;

    UPDATE boats SET display_name = v_boat_name WHERE id = v_boat_id;
    UPDATE sessions SET name = v_boat_name WHERE id = v_session_id;
  ELSE
    INSERT INTO event_members (event_id, user_id)
    VALUES (p_event_id, v_user_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO boats (event_id, owner_user_id, display_name)
    VALUES (p_event_id, v_user_id, v_boat_name)
    RETURNING id INTO v_boat_id;

    -- started_at est recale sur le premier point recu (voir ingest).
    INSERT INTO sessions (user_id, event_id, boat_id, name, started_at)
    VALUES (v_user_id, p_event_id, v_boat_id, v_boat_name, NOW())
    RETURNING id INTO v_session_id;
  END IF;

  -- 256 bits aleatoires, sans dependre de pgcrypto.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO tracker_devices (user_id, event_id, boat_id, session_id, token_hash)
  VALUES (v_user_id, p_event_id, v_boat_id, v_session_id,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  RETURNING id INTO v_device_id;

  RETURN QUERY SELECT v_device_id, v_token, v_session_id, v_boat_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_tracker_device(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_tracker_device(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- Ecriture des points (appelee par owntracks-ingest)
-- ---------------------------------------------------------------------
-- Verifie d'abord le couple appareil / jeton (HTTP Basic cote OwnTracks).
-- p_points : tableau deja filtre par l'Edge Function, chaque element
--   { ts (ISO), lat, lon, speed (m/s ou null), heading (deg ou null), meta (jsonb) }
-- Idempotent : OwnTracks renvoie sa file apres une coupure, les doublons
-- (meme ts) sont ignores.
CREATE OR REPLACE FUNCTION public.ingest_owntracks_points(
  p_device_id uuid,
  p_token     text,
  p_points    jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_device   tracker_devices%ROWTYPE;
  v_event    events%ROWTYPE;
  v_boat     text;
  v_min_ts   timestamptz;
  v_max_ts   timestamptz;
  v_first    boolean;
  v_inserted integer;
BEGIN
  SELECT * INTO v_device FROM tracker_devices
  WHERE id = p_device_id
    AND revoked_at IS NULL
    AND token_hash = encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE tracker_devices SET last_seen_at = NOW() WHERE id = p_device_id;

  SELECT * INTO v_event FROM events WHERE id = v_device.event_id;

  -- Evenement clos (delai de grace compris) : on accepte la requete pour
  -- vider la file du telephone, mais on n'ecrit plus rien.
  IF v_event.ends_at IS NOT NULL
     AND v_event.ends_at + event_submission_grace() < NOW() THEN
    RETURN 0;
  END IF;

  SELECT display_name INTO v_boat FROM boats WHERE id = v_device.boat_id;

  v_first := NOT EXISTS (SELECT 1 FROM telemetry t WHERE t.session_id = v_device.session_id);

  WITH pts AS (
    SELECT (p->>'ts')::timestamptz        AS ts,
           (p->>'lat')::double precision  AS lat,
           (p->>'lon')::double precision  AS lon,
           (p->>'speed')::double precision   AS speed,
           (p->>'heading')::double precision AS heading,
           COALESCE(p->'meta', '{}'::jsonb)  AS meta
    FROM jsonb_array_elements(p_points) p
  ),
  ins AS (
    INSERT INTO telemetry (user_id, session_id, ts, lat, lon, speed, heading, meta)
    SELECT DISTINCT ON (ts)
           v_device.user_id, v_device.session_id, ts, lat, lon, speed, heading,
           meta || jsonb_build_object(
             'source', 'owntracks',
             'boat_id', v_device.boat_id,
             'boat_name', v_boat,
             'device_id', v_device.id
           )
    FROM pts
    WHERE ts IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
    ORDER BY ts
    ON CONFLICT (user_id, session_id, ts) DO NOTHING
    RETURNING ts
  )
  SELECT count(*), min(ts), max(ts) INTO v_inserted, v_min_ts, v_max_ts FROM ins;

  IF v_inserted > 0 THEN
    UPDATE sessions s
    SET started_at = CASE WHEN v_first THEN v_min_ts ELSE LEAST(s.started_at, v_min_ts) END,
        ended_at   = GREATEST(COALESCE(s.ended_at, v_max_ts), v_max_ts)
    WHERE s.id = v_device.session_id;
  END IF;

  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.ingest_owntracks_points(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_owntracks_points(uuid, text, jsonb) TO service_role;

COMMIT;
