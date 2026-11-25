import { type PlacedBrick, TYPE_BY_ID, COLOR_BY_ID } from './bricks';
import { INSTRUCTIONS_URL, isPdf, openImportDialog } from './importDialog';
import { type Project, deleteProject, listProjects, newId, saveProject } from './storage';
import { h, icon, iconButton, timeAgo, toast } from './ui';

const go = (id: string) => (location.hash = `#/build/${id}`);

async function createFree(name?: string, bricks: PlacedBrick[] = []) {
  const n = (await listProjects()).filter((p) => p.mode === 'free').length + 1;
  const p: Project = {
    id: newId(),
    name: name || `Free Build ${n}`,
    mode: 'free',
    bricks,
    page: 1,
    pageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveProject(p);
  go(p.id);
}

/** Imports a .brickbuild.json file written by "Export build". */
async function importBuildFile(file: File) {
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'brick-builder' || !Array.isArray(data.bricks)) throw new Error('format');
    const bricks = (data.bricks as PlacedBrick[]).filter(
      (b) => TYPE_BY_ID.has(b.t) && COLOR_BY_ID.has(b.c) && [b.x, b.y, b.z, b.id].every(Number.isInteger),
    );
    await createFree(String(data.name || file.name.replace(/\.brickbuild\.json$|\.json$/i, '')), bricks);
  } catch {
    toast('That is not a Brick Builder file');
  }
}

async function importFiles(files: File[]) {
  const pdfs = files.filter(isPdf);
  const json = files.find((f) => f.name.toLowerCase().endsWith('.json'));
  if (pdfs.length) {
    const id = await openImportDialog(pdfs);
    if (id) go(id);
  } else if (json) await importBuildFile(json);
  else if (files.length) toast('Drop instruction PDFs or a .brickbuild.json file');
}

function progressText(p: Project): string {
  if (p.mode !== 'instructions') return '';
  const books = p.booklets?.length ?? 1;
  const book = books > 1 ? `book ${(p.booklet ?? 0) + 1}/${books}, ` : '';
  return ` · ${book}page ${p.page}/${p.pageCount}`;
}

export async function renderHome(app: HTMLElement): Promise<() => void> {
  const buildInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true }) as HTMLInputElement;
  buildInput.addEventListener('change', () => {
    const f = buildInput.files?.[0];
    if (f) void importBuildFile(f);
    buildInput.value = '';
  });

  const setCard = h(
    'button',
    {
      class: 'mode-card mode-set',
      onclick: (async () => {
        const id = await openImportDialog();
        if (id) go(id);
      }) as EventListener,
    },
    h('div', { class: 'mode-art' }, icon('book')),
    h('h2', {}, 'Build a Set'),
    h('p', {}, 'Import the official instruction PDFs for a set and rebuild it page by page.'),
    h('span', { class: 'mode-cta' }, icon('import'), 'Import instructions'),
  );
  const freeCard = h(
    'button',
    { class: 'mode-card mode-free', onclick: (() => void createFree()) as EventListener },
    h('div', { class: 'mode-art' }, icon('build')),
    h('h2', {}, 'Free Build'),
    h('p', {}, 'An empty 48×48 baseplate and an unlimited supply of every part, in all official sizes.'),
    h('span', { class: 'mode-cta' }, icon('plus'), 'New build'),
  );

  // Drag & drop PDFs or a build file anywhere on the home screen.
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void importFiles([...(e.dataTransfer?.files ?? [])]);
  };
  const onDragOver = (e: DragEvent) => e.preventDefault();
  window.addEventListener('drop', onDrop);
  window.addEventListener('dragover', onDragOver);

  const grid = h('div', { class: 'project-grid' });
  const renderGrid = (list: Project[]) => {
    grid.replaceChildren();
    if (!list.length) {
      grid.append(h('p', { class: 'empty' }, 'Your builds will show up here.'));
      return;
    }
    for (const p of list) {
      const n = p.bricks.length;
      grid.append(
        h(
          'article',
          { class: 'project-card' },
          h(
            'a',
            { href: `#/build/${p.id}`, class: 'project-link' },
            h('div', { class: 'thumb' }, p.thumbnail ? h('img', { src: p.thumbnail, alt: '' }) : h('div', { class: 'thumb-empty' }, icon('build'))),
            h(
              'div',
              { class: 'project-meta' },
              h('span', { class: `badge badge-${p.mode}` }, p.mode === 'free' ? 'Free Build' : p.setNumber ? `Set ${p.setNumber}` : 'Set'),
              h('h3', {}, p.name),
              h('p', {}, `${n} brick${n === 1 ? '' : 's'}${progressText(p)} · ${timeAgo(p.updatedAt)}`),
            ),
          ),
          iconButton(
            'trash',
            `Delete ${p.name}`,
            async () => {
              if (!confirm(`Delete “${p.name}”? This can’t be undone.`)) return;
              await deleteProject(p.id);
              renderGrid(await listProjects());
            },
            'delete-btn',
          ),
        ),
      );
    }
  };
  renderGrid(await listProjects());

  app.append(
    h(
      'main',
      { class: 'home' },
      h('header', { class: 'hero' }, h('img', { src: 'icon.svg', alt: '', class: 'logo' }), h('h1', {}, 'Brick Builder')),
      h('section', { class: 'modes' }, setCard, freeCard),
      h(
        'p',
        { class: 'hint' },
        'Instruction PDFs are free to download from ',
        h('a', { href: INSTRUCTIONS_URL, target: '_blank', rel: 'noopener' }, 'lego.com/service/building-instructions'),
        '. Everything stays on this device. ',
        h('button', { class: 'link-btn', onclick: (() => buildInput.click()) as EventListener }, 'Import a build file'),
      ),
      h('section', { class: 'projects' }, h('h2', {}, 'My Builds'), grid),
      buildInput,
    ),
  );

  return () => {
    window.removeEventListener('drop', onDrop);
    window.removeEventListener('dragover', onDragOver);
  };
}
