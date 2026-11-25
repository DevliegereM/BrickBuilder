import './style.css';
import { renderBuilder } from './builderView';
import { renderHome } from './home';
import { loadProject } from './storage';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let routeId = 0;

async function route() {
  const id = ++routeId;
  cleanup?.();
  cleanup = null;
  const root = document.createElement('div');
  root.className = 'view';
  app.replaceChildren(root);

  const m = location.hash.match(/^#\/build\/([\w-]+)/);
  let dispose: () => void;
  if (m) {
    const project = await loadProject(m[1]);
    if (id !== routeId) return;
    if (!project) {
      location.hash = '';
      return;
    }
    dispose = await renderBuilder(root, project);
  } else {
    dispose = await renderHome(root);
  }

  if (id === routeId) cleanup = dispose;
  else {
    // A newer navigation happened while this view was loading.
    dispose();
    root.remove();
  }
}

window.addEventListener('hashchange', route);
void route();
