import { disconnectStrava, startStravaOAuth } from '../../api/strava';
import { loadFlowState, saveFlowState } from '../../flow-state';
import { clearError, renderShell, showError } from '../shell';

export function renderStepParticipant(
  root: HTMLElement,
  onBack: () => void,
  onStravaConnected: () => void,
): void {
  const flow = loadFlowState();
  const event = flow.event!;

  renderShell(
    root,
    {
      title: event.title,
      subtitle: 'Participant',
      showBack: true,
      onBack,
    },
    `
      <h2>Informations participant</h2>
      <form id="form-participant">
        <div class="field">
          <label for="boat-name">Nom du bateau *</label>
          <input id="boat-name" type="text" placeholder="Ex: Mini 650 #12" value="${flow.boatName ?? ''}" required />
        </div>
        ${
          flow.stravaConnected
            ? `
          <div class="alert alert-success">Strava connecté (athlète #${flow.stravaAthleteId})</div>
          <button type="button" class="btn btn-outline" id="btn-disconnect">Déconnecter Strava</button>
          <button type="button" class="btn btn-primary" id="btn-activities" style="margin-top:12px">Voir mes activités</button>
        `
            : `
          <button type="submit" class="btn btn-strava" id="btn-strava">Connecter Strava</button>
        `
        }
      </form>
    `,
  );

  const form = root.querySelector<HTMLFormElement>('#form-participant');
  const boatInput = root.querySelector<HTMLInputElement>('#boat-name')!;

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError(root);
    const boatName = boatInput.value.trim();
    if (!boatName) {
      showError(root, 'Le nom du bateau est obligatoire.');
      return;
    }
    saveFlowState({ ...flow, boatName });
    startStravaOAuth(boatName);
  });

  root.querySelector('#btn-disconnect')?.addEventListener('click', async () => {
    try {
      await disconnectStrava(event.id);
      saveFlowState({
        ...loadFlowState(),
        stravaConnected: false,
        stravaAthleteId: null,
      });
      renderStepParticipant(root, onBack, onStravaConnected);
    } catch {
      showError(root, 'Impossible de déconnecter Strava.');
    }
  });

  root.querySelector('#btn-activities')?.addEventListener('click', () => {
    const boatName = boatInput.value.trim();
    if (!boatName) {
      showError(root, 'Le nom du bateau est obligatoire.');
      return;
    }
    saveFlowState({ ...loadFlowState(), boatName });
    onStravaConnected();
  });
}
