import QRCode from 'qrcode';
import { validateEventCode } from '../../api/events';
import { OWNTRACKS_STORE_LINKS, ownTracksConfigUrl, registerTrackerDevice } from '../../api/tracking';
import type { Event, TrackerRegistration } from '../../types';
import { mapError } from '../../utils/errors';
import { clearError, escapeHtml, renderShell, setButtonLoading, showError } from '../shell';

/**
 * Parcours « lien d'activite » : l'organisateur envoie un seul lien
 * (?suivi=CODE) a toute la flotte. Chacun tape le nom de son bateau et
 * configure OwnTracks en un geste, sans passer par le code evenement ni le
 * choix Strava / suivi du parcours complet.
 *
 * L'inscription est gardee dans le localStorage du telephone (et non de
 * l'onglet) : un lien rouvert depuis un SMS ouvre un nouvel onglet, et se
 * reinscrire revoquerait le jeton d'un telephone deja configure.
 */

const STORAGE_PREFIX = 'quick_tracking_';

function loadSaved(eventId: string): TrackerRegistration | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + eventId);
    return raw ? (JSON.parse(raw) as TrackerRegistration) : null;
  } catch {
    return null;
  }
}

function save(reg: TrackerRegistration): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + reg.eventId, JSON.stringify(reg));
  } catch {
    /* navigation privee : l'inscription vaut pour cette page seulement */
  }
}

function forget(eventId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + eventId);
  } catch {
    /* rien a oublier */
  }
}

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS se presente comme un Mac : on le reconnait a l'ecran tactile.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export async function renderQuickTracking(root: HTMLElement, code: string): Promise<void> {
  renderShell(root, { title: 'Suivi en direct', subtitle: 'Chargement de l’activité…' }, `<div class="loading-center"><div class="spinner"></div></div>`);

  let event: Event;
  try {
    event = await validateEventCode(code);
  } catch (err) {
    renderShell(root, { title: 'Suivi en direct' }, `<h2>Lien indisponible</h2>`);
    showError(root, `${mapError(err)} Vérifiez le lien auprès de l’organisateur.`);
    return;
  }

  const saved = loadSaved(event.id);
  if (saved) {
    renderReady(root, event, saved);
  } else {
    renderForm(root, event);
  }
}

function renderForm(root: HTMLElement, event: Event): void {
  renderShell(
    root,
    { title: event.title, subtitle: 'Suivi en direct' },
    `
      <h2>Votre bateau</h2>
      <p class="hint">Son nom apparaîtra sur la carte du suivi.</p>
      <form id="form-quick">
        <div class="field">
          <label for="boat-name">Nom du bateau</label>
          <input id="boat-name" type="text" placeholder="Ex : Mini 650 #12" autocomplete="off" required />
        </div>
        <button type="submit" class="btn btn-primary" id="btn-register">Activer le suivi</button>
      </form>
    `,
  );

  const form = root.querySelector<HTMLFormElement>('#form-quick')!;
  const input = root.querySelector<HTMLInputElement>('#boat-name')!;
  const btn = root.querySelector<HTMLButtonElement>('#btn-register')!;
  input.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(root);
    const boatName = input.value.trim();
    if (!boatName) {
      showError(root, 'Le nom du bateau est obligatoire.');
      return;
    }
    setButtonLoading(btn, true, 'Activer le suivi');
    try {
      const reg = await registerTrackerDevice(event.id, boatName);
      save(reg);
      renderReady(root, event, reg);
    } catch (err) {
      setButtonLoading(btn, false, 'Activer le suivi');
      const msg = mapError(err);
      showError(root, String(err).includes('duplicate_boat') ? `${msg} Ajoutez par exemple votre prénom.` : msg);
    }
  });
}

function renderReady(root: HTMLElement, event: Event, reg: TrackerRegistration): void {
  const platform = detectPlatform();
  const configUrl = ownTracksConfigUrl(reg);
  const store = platform === 'android' ? OWNTRACKS_STORE_LINKS.android : OWNTRACKS_STORE_LINKS.ios;
  const storeName = platform === 'android' ? 'Google Play' : 'l’App Store';

  const iosSetting = `
      <li>
        <strong>Autorisez la configuration par lien</strong>
        <p class="setup-steps__note">
          Dans OwnTracks, touchez <strong>ⓘ</strong> en haut à gauche, puis <em>Settings</em>,
          descendez tout en bas jusqu’à <em>Remote Control</em> et activez
          <em>Allow external configuration</em>. Revenez ensuite ici.
        </p>
      </li>`;

  const locationNote =
    platform === 'android'
      ? 'Autorisez la localisation <em>Toujours</em> et désactivez l’optimisation de batterie pour OwnTracks.'
      : 'Réglages iPhone › OwnTracks › Position : <em>Toujours</em>, avec <em>Position exacte</em>.';

  renderShell(
    root,
    { title: event.title, subtitle: 'Suivi en direct' },
    `
      <h2>${escapeHtml(reg.boatName)}</h2>
      <p class="hint">Plus que ${platform === 'android' ? 'deux' : 'trois'} étapes sur ce téléphone.</p>

      <ol class="setup-steps">
        <li>
          <strong>Installez OwnTracks</strong>
          <a class="btn btn-outline setup-steps__action" href="${store}" target="_blank" rel="noopener">
            Ouvrir ${storeName}
          </a>
          <p class="setup-steps__note">Déjà installée ? Passez à la suite.</p>
        </li>
        ${platform === 'ios' || platform === 'desktop' ? iosSetting : ''}
        <li>
          <strong>Configurez OwnTracks</strong>
          <a class="btn btn-primary setup-steps__action" href="${escapeHtml(configUrl)}">Configurer OwnTracks</a>
          <p class="setup-steps__note">OwnTracks s’ouvre et demande d’appliquer la configuration : acceptez.</p>
          <div id="qr-slot"></div>
        </li>
      </ol>

      <div class="alert alert-success">
        C’est tout. ${locationNote} Laissez ensuite OwnTracks ouvert en navigation, en mode <em>Move</em>.
      </div>
      <div class="alert alert-warning">
        Ne transférez pas cette page : elle permet d’envoyer des positions au nom de votre bateau.
      </div>

      <button type="button" class="btn btn-outline" id="btn-other-boat">Ce n’est pas mon bateau</button>
    `,
  );

  // Sur ordinateur, le lien de configuration ne mene nulle part : QR code a scanner.
  if (platform === 'desktop') {
    void QRCode.toDataURL(configUrl, { margin: 1, width: 240 }).then((dataUrl) => {
      const slot = root.querySelector('#qr-slot');
      if (slot) {
        slot.innerHTML = `
          <p class="setup-steps__note">Sur ordinateur ? Scannez ce code avec l’appareil photo du téléphone.</p>
          <img class="qr" src="${dataUrl}" alt="QR code de configuration OwnTracks" width="240" height="240" />`;
      }
    });
  }

  root.querySelector('#btn-other-boat')?.addEventListener('click', () => {
    forget(event.id);
    renderForm(root, event);
  });
}
