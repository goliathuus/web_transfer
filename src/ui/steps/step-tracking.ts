import QRCode from 'qrcode';
import {
  ingestUrl,
  OWNTRACKS_STORE_LINKS,
  ownTracksConfigUrl,
  registerTrackerDevice,
} from '../../api/tracking';
import {
  loadFlowState,
  loadTrackingRegistration,
  saveTrackingRegistration,
} from '../../flow-state';
import type { TrackerRegistration } from '../../types';
import { mapError } from '../../utils/errors';
import { escapeHtml, renderShell, showError } from '../shell';

/**
 * Inscription du telephone au suivi en direct : on cree l'appareil cote
 * serveur puis on donne au participant un lien qui configure OwnTracks
 * (mode HTTP, identifiants, suivi continu) en une fois.
 */
export async function renderStepTracking(root: HTMLElement, onBack: () => void): Promise<void> {
  const flow = loadFlowState();
  const event = flow.event!;
  const boatName = flow.boatName!;
  const shell = { title: event.title, subtitle: 'Suivi en direct', showBack: true, onBack };

  renderShell(root, shell, `<div class="loading-center"><div class="spinner"></div></div>`);

  // Reutilise l'inscription de l'onglet : en refaire une revoquerait le
  // jeton d'un telephone deja configure.
  let reg = loadTrackingRegistration(event.id);
  if (!reg || reg.boatName !== boatName) {
    try {
      reg = await registerTrackerDevice(event.id, boatName);
      saveTrackingRegistration(reg);
    } catch (err) {
      renderShell(root, shell, `<h2>Suivi en direct</h2>`);
      showError(root, mapError(err));
      return;
    }
  }

  const configUrl = ownTracksConfigUrl(reg);
  const qrDataUrl = await QRCode.toDataURL(configUrl, { margin: 1, width: 240 });

  renderShell(root, shell, trackingHtml(reg, configUrl, qrDataUrl));
}

function trackingHtml(reg: TrackerRegistration, configUrl: string, qrDataUrl: string): string {
  return `
    <h2>Suivi en direct</h2>
    <p class="hint">Bateau : <strong>${escapeHtml(reg.boatName)}</strong></p>

    <ol class="setup-steps">
      <li>
        <strong>Installez OwnTracks</strong> sur le téléphone qui sera à bord.
        <div class="store-links">
          <a class="btn btn-outline" href="${OWNTRACKS_STORE_LINKS.ios}" target="_blank" rel="noopener">App Store</a>
          <a class="btn btn-outline" href="${OWNTRACKS_STORE_LINKS.android}" target="_blank" rel="noopener">Google Play</a>
        </div>
      </li>
      <li>
        <strong>Configurez l'app</strong> depuis ce téléphone :
        <a class="btn btn-primary setup-steps__action" href="${escapeHtml(configUrl)}">Configurer OwnTracks</a>
        <p class="setup-steps__note">Vous êtes sur un ordinateur ? Scannez ce code avec l'appareil photo du téléphone.</p>
        <img class="qr" src="${qrDataUrl}" alt="QR code de configuration OwnTracks" width="240" height="240" />
      </li>
      <li>
        <strong>Autorisez la localisation en permanence.</strong>
        <p class="setup-steps__note">
          iPhone : Réglages › OwnTracks › Position › <em>Toujours</em>, avec <em>Position exacte</em> activée.<br />
          Android : <em>Toujours autoriser</em>, et désactivez l'optimisation de batterie pour OwnTracks.
        </p>
      </li>
      <li>
        <strong>Vérifiez le mode <em>Move</em></strong> dans OwnTracks avant le départ, et gardez le téléphone chargé.
      </li>
    </ol>

    <div class="alert alert-warning">
      Ne partagez pas ce lien ni ce QR code : ils permettent d'envoyer des positions au nom de votre bateau.
    </div>

    <details class="manual-config">
      <summary>Configuration manuelle</summary>
      <p class="setup-steps__note">Dans OwnTracks › Préférences › Connexion : mode <em>HTTP</em>, puis</p>
      <dl>
        <div class="summary-row"><dt>URL</dt><dd><code>${escapeHtml(ingestUrl())}</code></dd></div>
        <div class="summary-row"><dt>Identifiant</dt><dd><code>${escapeHtml(reg.deviceId)}</code></dd></div>
        <div class="summary-row"><dt>Mot de passe</dt><dd><code>${escapeHtml(reg.token)}</code></dd></div>
      </dl>
    </details>
  `;
}
