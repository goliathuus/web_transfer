export type StepId = 'code' | 'participant' | 'activities' | 'success';

export interface ShellOptions {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function renderShell(
  container: HTMLElement,
  options: ShellOptions,
  contentHtml: string,
): void {
  const backHtml = options.showBack
    ? `<div class="shell__back">
         <button type="button" class="shell__back-btn" id="btn-back" aria-label="Retour">←</button>
       </div>`
    : '';

  container.innerHTML = `
    <div class="shell">
      ${backHtml}
      <img src="/logo.png" alt="Perf Tracker" class="shell__logo" />
      <h1 class="shell__title">${escapeHtml(options.title)}</h1>
      ${options.subtitle ? `<p class="shell__subtitle">${escapeHtml(options.subtitle)}</p>` : ''}
      <div class="card">${contentHtml}</div>
    </div>
  `;

  if (options.showBack && options.onBack) {
    container.querySelector<HTMLButtonElement>('#btn-back')?.addEventListener('click', options.onBack);
  }
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function showError(container: HTMLElement, message: string): void {
  let el = container.querySelector('.alert-error');
  if (!el) {
    el = document.createElement('div');
    el.className = 'alert alert-error';
    container.querySelector('.card')?.appendChild(el);
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

export function clearError(container: HTMLElement): void {
  container.querySelector('.alert-error')?.remove();
}

export function setButtonLoading(btn: HTMLButtonElement, loading: boolean, label: string): void {
  btn.disabled = loading;
  btn.textContent = loading ? 'Chargement...' : label;
}
