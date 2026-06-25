import { validateEventCode } from '../../api/events';
import { saveFlowState } from '../../flow-state';
import { mapError } from '../../utils/errors';
import { clearError, renderShell, setButtonLoading, showError } from '../shell';

export function renderStepCode(
  root: HTMLElement,
  onNext: () => void,
): void {
  renderShell(
    root,
    { title: 'Perf Tracker', subtitle: 'Soumettre une activité Strava' },
    `
      <h2>Code événement</h2>
      <p class="hint">Entrez le code fourni par l'organisateur</p>
      <form id="form-code">
        <div class="field">
          <label for="event-code">Code événement</label>
          <input id="event-code" type="text" placeholder="ABC123" autocomplete="off" required />
        </div>
        <button type="submit" class="btn btn-primary" id="btn-continue">Continuer</button>
      </form>
    `,
  );

  const form = root.querySelector<HTMLFormElement>('#form-code')!;
  const input = root.querySelector<HTMLInputElement>('#event-code')!;
  const btn = root.querySelector<HTMLButtonElement>('#btn-continue')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(root);

    const code = input.value.trim();
    if (!code) return;

    setButtonLoading(btn, true, 'Continuer');

    try {
      const event = await validateEventCode(code);
      saveFlowState({
        event,
        boatName: null,
        stravaAthleteId: null,
        stravaConnected: false,
        pendingOAuth: false,
      });
      onNext();
    } catch (err) {
      showError(root, mapError(err));
    } finally {
      setButtonLoading(btn, false, 'Continuer');
    }
  });
}
