# Transfer Web — Soumission Strava

Site web léger (Vite + TypeScript) pour le parcours participant : code événement → nom du bateau → connexion Strava → sélection d'une activité → enregistrement en base.

Réutilise le backend Supabase existant (RPC + Edge Functions Strava) sans modification SQL.

## Prérequis

- Node.js 18+
- Projet Supabase configuré (voir [`../flutter_application/supabase/README.md`](../flutter_application/supabase/README.md))
- Application Strava avec callback web configuré

## Installation

```bash
cd transfer_web
npm install
cp .env.example .env.local
```

Remplissez `.env.local` :

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STRAVA_CLIENT_ID=your-strava-client-id
VITE_STRAVA_REDIRECT_URI=http://localhost:5173/
```

## Développement

```bash
npm run dev
```

Ouvrez [http://localhost:5173](http://localhost:5173).

## Configuration Strava (web)

Dans [Strava API Settings](https://www.strava.com/settings/api) :

| Environnement | Authorization Callback Domain | `redirect_uri` |
|---------------|------------------------------|----------------|
| Dev local | `localhost` | `http://localhost:5173/` |
| Production | `votre-domaine.com` | `https://votre-domaine.com/` |

Le `client_secret` reste uniquement dans les secrets Supabase Edge Functions.

## Parcours utilisateur

1. **Code événement** — RPC `validate_event_code`
2. **Bateau + Strava** — OAuth redirect → callback `?code=` → Edge Function `strava-oauth-exchange`
3. **Activités** — `strava-list-activities` → `strava-get-activity` → RPC `submit_strava_activity`
4. **Succès** — résumé et statut `pending`

L'état du flux est conservé dans `sessionStorage` (équivalent du flow state Flutter).

## Build production

```bash
npm run build
npm run preview   # test local du build
```

Sortie dans `dist/`. Déploiement recommandé : Vercel, Netlify ou Cloudflare Pages.

Checklist prod :

- `VITE_STRAVA_REDIRECT_URI=https://votre-domaine.com/`
- Domaine Strava mis à jour
- Variables d'environnement configurées sur la plateforme d'hébergement

## Structure

```
src/
├── main.ts           # bootstrap, callback OAuth (?code=)
├── config.ts         # variables VITE_*
├── supabase.ts       # client + auth anonyme
├── flow-state.ts     # sessionStorage
├── api/              # events, strava, submissions
├── utils/            # formatters, messages d'erreur FR
└── ui/               # orchestrateur + 4 étapes
```

## Tests manuels

- Code invalide / événement expiré
- OAuth Strava complet en local
- Liste vide / activité sans GPS / doublon bateau
- Soumission OK → visible dans Supabase (`submissions`, `telemetry`)
