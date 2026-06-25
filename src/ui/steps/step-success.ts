import { clearFlowState } from '../../flow-state';
import type { SubmissionSummary } from '../../types';
import {
  formatDistance,
  formatDuration,
  validationStatusLabel,
} from '../../utils/formatters';
import { escapeHtml, renderShell } from '../shell';

export function renderStepSuccess(
  root: HTMLElement,
  summary: SubmissionSummary,
  onRestart: () => void,
): void {
  const statusClass =
    summary.validationStatus === 'accepted'
      ? 'status-badge--accepted'
      : 'status-badge--pending';

  renderShell(
    root,
    { title: 'Activité soumise', subtitle: 'Merci pour votre participation' },
    `
      <div class="success-icon">✓</div>
      <h2 style="text-align:center">Activité soumise avec succès !</h2>
      <dl style="margin:24px 0 0">
        <div class="summary-row"><dt>Événement</dt><dd>${escapeHtml(summary.eventTitle)}</dd></div>
        <div class="summary-row"><dt>Bateau</dt><dd>${escapeHtml(summary.boatName)}</dd></div>
        <div class="summary-row"><dt>Activité</dt><dd>${escapeHtml(summary.activityName)}</dd></div>
        <div class="summary-row"><dt>Distance</dt><dd>${formatDistance(summary.distanceMeters)}</dd></div>
        <div class="summary-row"><dt>Temps</dt><dd>${formatDuration(summary.movingTimeSeconds)}</dd></div>
      </dl>
      <div class="status-badge ${statusClass}">
        Statut : ${validationStatusLabel(summary.validationStatus)}
      </div>
      <button type="button" class="btn btn-primary" id="btn-restart">Nouvelle soumission</button>
    `,
  );

  root.querySelector('#btn-restart')?.addEventListener('click', () => {
    clearFlowState();
    onRestart();
  });
}
