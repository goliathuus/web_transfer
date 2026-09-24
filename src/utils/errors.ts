export function mapError(error: unknown): string {
  const msg = String(error).toLowerCase();

  if (msg.includes('invalid_code')) return 'Code événement invalide.';
  if (msg.includes('expired')) return 'Cet événement a expiré.';
  if (msg.includes('not_authenticated')) return 'Erreur d\'authentification. Réessayez.';
  if (msg.includes('oauth_cancelled') || msg.includes('oauth_failed')) {
    return 'Échec de la connexion Strava.';
  }
  if (msg.includes('not_connected')) return 'Connectez d\'abord votre compte Strava.';
  if (msg.includes('token_revoked')) return 'Session Strava expirée. Reconnectez-vous.';
  if (msg.includes('no_gps_data')) return 'Cette activité ne contient pas de données GPS.';
  if (msg.includes('duplicate_boat')) {
    return 'Ce nom de bateau est déjà utilisé sur cet événement.';
  }
  if (msg.includes('missing_boat_name')) return 'Le nom du bateau est obligatoire.';
  if (msg.includes('invalid_event')) return 'Événement introuvable.';
  if (msg.includes('duplicate_activity')) {
    return 'Cette activité Strava a déjà été soumise pour cet événement.';
  }
  if (msg.includes('activity_outside_window')) {
    return 'Cette activité est hors de la fenêtre de l\'événement.';
  }
  if (msg.includes('strava_api_error')) return 'Impossible de récupérer les activités Strava.';
  if (msg.includes('strava_not_configured')) return 'Strava n\'est pas configuré côté serveur.';

  return 'Une erreur est survenue. Veuillez réessayer.';
}
