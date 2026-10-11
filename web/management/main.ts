import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { App } from './app.tsx';
import { createServerState } from '../shared/server-state.ts';
import './style.css';
const root = createRoot(document.getElementById('app')!);
const server = createServerState((view) => root.render(createElement(App, { view, server })));
window.addEventListener('pagehide', () => server.suspend());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) server.start();
});
server.start();
