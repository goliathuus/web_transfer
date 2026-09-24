import { completeStravaOAuth } from '../api/strava';
import { loadFlowState, loadTrackingRegistration, saveFlowState } from '../flow-state';
import type { SubmissionSummary } from '../types';
import type { StepId } from './shell';
import { renderStepActivities } from './steps/step-activities';
import { renderStepCode } from './steps/step-code';
import { renderStepParticipant } from './steps/step-participant';
import { renderStepSuccess } from './steps/step-success';
import { renderStepTracking } from './steps/step-tracking';

export class App {
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async init(): Promise<void> {
    const oauthCode = await this.handleOAuthCallback();
    if (oauthCode) return;

    const flow = loadFlowState();
    if (flow.event && flow.boatName && loadTrackingRegistration(flow.event.id)) {
      this.goTo('tracking');
    } else if (flow.stravaConnected && flow.event && flow.boatName) {
      this.goTo('activities');
    } else if (flow.event) {
      this.goTo('participant');
    } else {
      this.goTo('code');
    }
  }

  private async handleOAuthCallback(): Promise<boolean> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      window.history.replaceState({}, '', window.location.pathname);
      this.goTo('participant');
      return true;
    }

    if (!code) return false;

    const savedState = sessionStorage.getItem('oauth_state');
    const returnedState = params.get('state');
    window.history.replaceState({}, '', window.location.pathname);

    if (savedState && returnedState && savedState !== returnedState) {
      this.goTo('participant');
      return true;
    }

    try {
      const athleteId = await completeStravaOAuth(code);
      const flow = loadFlowState();
      const boatName = sessionStorage.getItem('oauth_boat_name') ?? flow.boatName;

      saveFlowState({
        ...flow,
        boatName,
        stravaAthleteId: athleteId,
        stravaConnected: true,
        pendingOAuth: false,
      });

      this.goTo('activities');
    } catch {
      this.goTo('participant');
    }

    return true;
  }

  goTo(step: StepId, summary?: SubmissionSummary): void {
    switch (step) {
      case 'code':
        renderStepCode(this.root, () => this.goTo('participant'));
        break;
      case 'participant':
        renderStepParticipant(
          this.root,
          () => this.goTo('code'),
          () => this.goTo('activities'),
          () => this.goTo('tracking'),
        );
        break;
      case 'tracking':
        void renderStepTracking(this.root, () => this.goTo('participant'));
        break;
      case 'activities':
        void renderStepActivities(
          this.root,
          () => this.goTo('participant'),
          (s) => this.goTo('success', s),
        );
        break;
      case 'success':
        if (summary) {
          renderStepSuccess(this.root, summary, () => this.goTo('code'));
        }
        break;
    }
  }
}
