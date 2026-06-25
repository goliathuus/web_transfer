import { getActivityDetail, listActivities } from '../../api/strava';
import { submitStravaActivity } from '../../api/submissions';
import { loadFlowState } from '../../flow-state';
import type { SubmissionSummary } from '../../types';
import { formatDateTime, formatDistance, formatDuration } from '../../utils/formatters';
import { mapError } from '../../utils/errors';
import { escapeHtml, renderShell, showError } from '../shell';

export async function renderStepActivities(
  root: HTMLElement,
  onBack: () => void,
  onSuccess: (summary: SubmissionSummary) => void,
): Promise<void> {
  const flow = loadFlowState();
  const event = flow.event!;
  const boatName = flow.boatName!;

  renderShell(
    root,
    {
      title: 'Choisir une activité',
      subtitle: event.title,
      showBack: true,
      onBack,
    },
    `
      <p class="hint">Bateau : <strong>${escapeHtml(boatName)}</strong></p>
      <div class="loading-center" id="activities-loading">
        <div class="spinner"></div>
        Chargement des activités...
      </div>
      <ul class="activity-list hidden" id="activity-list"></ul>
      <div class="loading-center hidden" id="activities-empty">
        Aucune activité compatible trouvée pour cet événement.
      </div>
    `,
  );

  let activities: Awaited<ReturnType<typeof listActivities>> = [];

  try {
    activities = await listActivities(event.id);
  } catch (err) {
    root.querySelector('#activities-loading')?.classList.add('hidden');
    showError(root, mapError(err));
    return;
  }

  root.querySelector('#activities-loading')?.classList.add('hidden');

  if (activities.length === 0) {
    root.querySelector('#activities-empty')?.classList.remove('hidden');
    return;
  }

  const list = root.querySelector<HTMLUListElement>('#activity-list')!;
  list.classList.remove('hidden');

  for (const activity of activities) {
    const li = document.createElement('li');
    li.className = 'activity-item';
    li.innerHTML = `
      <div class="activity-item__icon">⛵</div>
      <div>
        <p class="activity-item__name">${escapeHtml(activity.name)}</p>
        <p class="activity-item__meta">${formatDateTime(activity.start_date)} · ${escapeHtml(activity.sport_type ?? activity.type)}</p>
        <p class="activity-item__meta">${formatDistance(activity.distance)} · ${formatDuration(activity.moving_time)}</p>
      </div>
    `;

    li.addEventListener('click', async () => {
      if (li.classList.contains('activity-item--loading')) return;
      li.classList.add('activity-item--loading');

      try {
        const detail = await getActivityDetail(event.id, activity.id);
        const result = await submitStravaActivity(event.id, boatName, detail);

        onSuccess({
          eventTitle: event.title,
          boatName,
          activityName: activity.name,
          distanceMeters: activity.distance,
          movingTimeSeconds: activity.moving_time,
          validationStatus: result.validation_status,
        });
      } catch (err) {
        li.classList.remove('activity-item--loading');
        showError(root, mapError(err));
      }
    });

    list.appendChild(li);
  }
}
