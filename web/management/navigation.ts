import { get } from '../shared/dom.ts';

export function route(page: string, section?: string) {
  document.body.dataset.view = page;
  get('page-heading').hidden = page === 'activity';
  document
    .querySelectorAll<HTMLElement>('[data-view]')
    .forEach((n) => (n.hidden = n.dataset.view !== page));
  get('heading').textContent =
    page === 'setup' ? 'Setup checklist' : page[0]!.toUpperCase() + page.slice(1);
  document
    .querySelectorAll<HTMLElement>('.navigation [data-page]')
    .forEach((n) => n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false'));
  if (section) get(section).scrollIntoView({ block: 'start' });
}
