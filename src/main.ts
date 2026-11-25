import './style.css';
import { BRICK_TYPES, COLORS, COLOR_BY_ID, type BrickType, type Kind, TYPE_BY_ID, typeLabel } from './bricks';
import { Builder, type Tool } from './builder';
import type { PdfViewer } from './pdfViewer';
import {
  type Project,
  deleteProject,
  listProjects,
  loadPdf,
  loadProject,
  newId,
  savePdf,
  saveProject,
} from './storage';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

// ---------- helpers ----------

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener> = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (typeof v === 'boolean') v && el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const ICONS: Record<string, string> = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12h-2" transform="translate(0 -6)"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12h2" transform="translate(0 -6)"/>',
  rotL: '<path d="M4 4v6h6"/><path d="M5 15a8 8 0 103-9.5L4 10"/>',
  rotR: '<path d="M20 4v6h-6"/><path d="M19 15a8 8 0 11-3-9.5L20 10"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  build: '<rect x="4" y="10" width="16" height="9" rx="1.5"/><rect x="6.5" y="6" width="4" height="4" rx="1"/><rect x="13.5" y="6" width="4" height="4" rx="1"/>',
  paint: '<path d="M4 20c3 0 4-1.5 4-3.5S9.5 13 11 13l7-7a2.1 2.1 0 00-3-3l-7 7c0 1.5-1.5 3-3.5 3S4 17 4 20z"/>',
  erase: '<path d="M8 20h12"/><path d="M5 15l9-9a2 2 0 013 0l2 2a2 2 0 010 3l-8 8H9l-4-4z"/>',
  pick: '<path d="M14 4l6 6"/><path d="M17 7l-9.5 9.5L5 19l-1-1 2.5-2.5L16 6"/>',
  rotate: '<path d="M20 12a8 8 0 11-2.3-5.6"/><path d="M20 4v5h-5"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
};

function icon(name: string): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

function iconButton(name: string, label: string, onClick: () => void, extra = ''): HTMLButtonElement {
  const b = h('button', { class: `icon-btn ${extra}`, title: label, 'aria-label': label, onclick: onClick as EventListener });
  b.append(icon(name));
  return b;
}

function brickIcon(t: BrickType): SVGSVGElement {
  const s = 8;
  const pad = 2;
  const cols = Math.max(t.w, t.d);
  const rows = Math.min(t.w, t.d);
  const W = cols * s + pad * 2;
  const H = rows * s + pad * 2;
  let studs = '';
  if (t.kind !== 'tile')
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) studs += `<circle cx="${pad + i * s + s / 2}" cy="${pad + j * s + s / 2}" r="2.5"/>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="brick-icon kind-${t.kind}" aria-hidden="true"><rect x="${pad / 2}" y="${pad / 2}" width="${W - pad}" height="${H - pad}" rx="2"/>${studs}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

function toast(msg: string) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

const timeAgo = (ts: number) => {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
};

// ---------- routing ----------

async function route() {
  cleanup?.();
  cleanup = null;
  app.replaceChildren();
  const m = location.hash.match(/^#\/build\/([\w-]+)/);
  if (m) {
    const project = await loadProject(m[1]);
    if (project) return renderBuilder(project);
    location.hash = '';
    return;
  }
  await renderHome();
}

window.addEventListener('hashchange', route);
void route();

// ---------- home ----------

async function createFree() {
  const n = (await listProjects()).filter((p) => p.mode === 'free').length + 1;
  const p: Project = {
    id: newId(),
    name: `Free Build ${n}`,
    mode: 'free',
    bricks: [],
    page: 1,
    pageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveProject(p);
  location.hash = `#/build/${p.id}`;
}

async function createFromPdf(file: File) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast('Please choose a PDF file');
    return;
  }
  let pageCount = 0;
  try {
    const { countPages } = await import('./pdfViewer');
    pageCount = await countPages(file);
  } catch {
    toast('Could not read that PDF');
    return;
  }
  const p: Project = {
    id: newId(),
    name: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Instruction Set',
    mode: 'instructions',
    bricks: [],
    page: 1,
    pageCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await savePdf(p.id, file);
  await saveProject(p);
  location.hash = `#/build/${p.id}`;
}

async function renderHome() {
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) void createFromPdf(f);
  });

  const setCard = h(
    'button',
    { class: 'mode-card mode-set', onclick: (() => fileInput.click()) as EventListener },
    h('div', { class: 'mode-art' }, icon('book')),
    h('h2', {}, 'Build a Set'),
    h('p', {}, 'Upload an official instruction PDF and build it brick by brick, page by page.'),
    h('span', { class: 'mode-cta' }, icon('upload'), 'Upload PDF'),
  );
  const freeCard = h(
    'button',
    { class: 'mode-card mode-free', onclick: (() => void createFree()) as EventListener },
    h('div', { class: 'mode-art' }, icon('build')),
    h('h2', {}, 'Free Build'),
    h('p', {}, 'An empty 48×48 baseplate and every brick you need. Build anything.'),
    h('span', { class: 'mode-cta' }, icon('plus'), 'New build'),
  );

  // Drag & drop a PDF anywhere on the home screen.
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f) void createFromPdf(f);
  };
  const onDragOver = (e: DragEvent) => e.preventDefault();
  window.addEventListener('drop', onDrop);
  window.addEventListener('dragover', onDragOver);
  cleanup = () => {
    window.removeEventListener('drop', onDrop);
    window.removeEventListener('dragover', onDragOver);
  };

  const grid = h('div', { class: 'project-grid' });
  const projects = await listProjects();

  const renderGrid = (list: Project[]) => {
    grid.replaceChildren();
    if (!list.length) {
      grid.append(h('p', { class: 'empty' }, 'Your builds will show up here.'));
      return;
    }
    for (const p of list) {
      const card = h(
        'article',
        { class: 'project-card' },
        h(
          'a',
          { href: `#/build/${p.id}`, class: 'project-link' },
          h(
            'div',
            { class: 'thumb' },
            p.thumbnail ? h('img', { src: p.thumbnail, alt: '' }) : h('div', { class: 'thumb-empty' }, icon('build')),
          ),
          h(
            'div',
            { class: 'project-meta' },
            h('span', { class: `badge badge-${p.mode}` }, p.mode === 'free' ? 'Free Build' : 'Set'),
            h('h3', {}, p.name),
            h(
              'p',
              {},
              `${p.bricks.length} brick${p.bricks.length === 1 ? "" : "s"}`,
              p.mode === 'instructions' ? ` · page ${p.page}/${p.pageCount}` : '',
              ` · ${timeAgo(p.updatedAt)}`,
            ),
          ),
        ),
        iconButton(
          'trash',
          `Delete ${p.name}`,
          async () => {
            if (!confirm(`Delete “${p.name}”? This can’t be undone.`)) return;
            await deleteProject(p.id);
            renderGrid((await listProjects()));
          },
          'delete-btn',
        ),
      );
      grid.append(card);
    }
  };
  renderGrid(projects);

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
        h('a', { href: 'https://www.lego.com/service/building-instructions', target: '_blank', rel: 'noopener' }, 'lego.com/service/building-instructions'),
        '. Everything stays on this device.',
      ),
      h('section', { class: 'projects' }, h('h2', {}, 'My Builds'), grid),
      fileInput,
    ),
  );
}

// ---------- builder ----------

async function renderBuilder(project: Project) {
  let saveTimer = 0;
  let dirty = false;

  const stage = h('div', { class: 'stage' });
  const countEl = h('span', { class: 'brick-count' });
  const nameInput = h('input', { class: 'name-input', value: project.name, 'aria-label': 'Build name', maxlength: 60 }) as HTMLInputElement;
  const undoBtn = iconButton('undo', 'Undo (⌘Z)', () => builder.undo());
  const redoBtn = iconButton('redo', 'Redo (⇧⌘Z)', () => builder.redo());

  const scheduleSave = () => {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 600);
  };

  const save = async (withThumb = false) => {
    clearTimeout(saveTimer);
    if (!dirty && !withThumb) return;
    project.bricks = builder.getBricks();
    project.name = nameInput.value.trim() || project.name;
    if (withThumb) project.thumbnail = builder.snapshot();
    dirty = false;
    await saveProject(project);
  };

  const updateCount = () => (countEl.textContent = `${builder.count} brick${builder.count === 1 ? '' : 's'}`);

  const builder = new Builder(stage, {
    onChange: () => {
      updateCount();
      scheduleSave();
    },
    onPick: (t, c) => {
      selectType(t);
      selectColor(c);
      setTool('build');
      toast('Picked brick');
    },
    onHistory: (u, r) => {
      undoBtn.disabled = !u;
      redoBtn.disabled = !r;
    },
  });
  builder.load(project.bricks);
  updateCount();
  nameInput.addEventListener('input', scheduleSave);

  // --- tools ---
  const tools: { id: Tool; label: string; key: string }[] = [
    { id: 'build', label: 'Build', key: '1' },
    { id: 'paint', label: 'Paint', key: '2' },
    { id: 'erase', label: 'Erase', key: '3' },
    { id: 'pick', label: 'Pick', key: '4' },
  ];
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Tools' });
  for (const t of tools) {
    const b = h('button', { class: 'tool-btn', title: `${t.label} (${t.key})`, 'aria-label': t.label, onclick: (() => setTool(t.id)) as EventListener }, icon(t.id), h('span', {}, t.label));
    toolBtns.set(t.id, b);
    toolbar.append(b);
  }
  toolbar.append(h('div', { class: 'sep' }), iconButton('rotate', 'Rotate brick (R)', () => builder.rotateBrush(), 'tool-btn'));

  function setTool(t: Tool) {
    builder.setTool(t);
    for (const [id, b] of toolBtns) b.classList.toggle('active', id === t);
    stage.dataset.tool = t;
  }

  const viewControls = h(
    'div',
    { class: 'view-controls' },
    iconButton('rotL', 'Rotate view left (Q)', () => builder.rotateView(-1)),
    iconButton('rotR', 'Rotate view right (E)', () => builder.rotateView(1)),
    iconButton('plus', 'Zoom in', () => builder.zoom(1.25)),
    iconButton('minus', 'Zoom out', () => builder.zoom(0.8)),
    iconButton('home', 'Reset view', () => builder.resetView()),
  );
  stage.append(toolbar, viewControls, countEl);

  // --- palette ---
  const typeBtns = new Map<string, HTMLButtonElement>();
  const colorBtns = new Map<string, HTMLButtonElement>();
  const kindTabs = new Map<Kind, HTMLButtonElement>();
  const partsRow = h('div', { class: 'parts-row' });
  const colorsRow = h('div', { class: 'colors-row' });
  let activeKind: Kind = 'brick';

  const showKind = (k: Kind) => {
    activeKind = k;
    for (const [id, b] of kindTabs) b.classList.toggle('active', id === k);
    for (const [id, b] of typeBtns) b.hidden = TYPE_BY_ID.get(id)!.kind !== k;
  };

  function selectType(id: string) {
    builder.setBrush(id, builder.colorId);
    for (const [tid, b] of typeBtns) b.classList.toggle('active', tid === id);
    const k = TYPE_BY_ID.get(id)!.kind;
    if (k !== activeKind) showKind(k);
    typeBtns.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function selectColor(id: string) {
    builder.setBrush(builder.typeId, id);
    for (const [cid, b] of colorBtns) b.classList.toggle('active', cid === id);
    document.documentElement.style.setProperty('--brush', COLOR_BY_ID.get(id)!.hex);
  }

  const kinds: [Kind, string][] = [['brick', 'Bricks'], ['plate', 'Plates'], ['tile', 'Tiles']];
  const tabs = h('div', { class: 'kind-tabs', role: 'tablist' });
  for (const [k, label] of kinds) {
    const b = h('button', { role: 'tab', onclick: (() => showKind(k)) as EventListener }, label);
    kindTabs.set(k, b);
    tabs.append(b);
  }
  for (const t of BRICK_TYPES) {
    const b = h('button', { class: 'part-btn', title: `${t.kind} ${typeLabel(t)}`, onclick: (() => selectType(t.id)) as EventListener }, brickIcon(t), h('span', {}, typeLabel(t)));
    typeBtns.set(t.id, b);
    partsRow.append(b);
  }
  for (const c of COLORS) {
    const b = h('button', { class: 'swatch', title: c.name, 'aria-label': c.name, style: `--c:${c.hex}`, onclick: (() => selectColor(c.id)) as EventListener });
    colorBtns.set(c.id, b);
    colorsRow.append(b);
  }
  const palette = h('footer', { class: 'palette' }, h('div', { class: 'palette-top' }, tabs, colorsRow), partsRow);

  // --- parts list dialog ---
  const partsDialog = h('dialog', { class: 'parts-dialog' });
  const openPartsList = () => {
    const counts = new Map<string, number>();
    for (const b of builder.getBricks()) counts.set(`${b.t}|${b.c}`, (counts.get(`${b.t}|${b.c}`) ?? 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    partsDialog.replaceChildren(
      h('h2', {}, 'Parts used'),
      rows.length
        ? h(
            'ul',
            { class: 'parts-list' },
            ...rows.map(([key, n]) => {
              const [t, c] = key.split('|');
              const type = TYPE_BY_ID.get(t)!;
              const color = COLOR_BY_ID.get(c)!;
              const li = h('li', { style: `--c:${color.hex}` }, brickIcon(type), h('span', {}, `${color.name} ${type.kind} ${typeLabel(type)}`), h('b', {}, `×${n}`));
              return li;
            }),
          )
        : h('p', { class: 'empty' }, 'No bricks placed yet.'),
      h('form', { method: 'dialog' }, h('button', { class: 'primary' }, 'Done')),
    );
    partsDialog.showModal();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'brick-builder', version: 1, name: nameInput.value, bricks: builder.getBricks() })], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${nameInput.value || 'build'}.brickbuild.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const saveImage = () => {
    const a = h('a', { href: builder.snapshot(1600, 1200), download: `${nameInput.value || 'build'}.webp` });
    a.click();
  };

  // --- instructions panel ---
  let viewer: PdfViewer | null = null;
  let pdfPanel: HTMLElement | null = null;
  const work = h('div', { class: 'work' }, stage);

  if (project.mode === 'instructions') {
    const scroller = h('div', { class: 'pdf-scroller' });
    const pageLabel = h('span', { class: 'page-label' }, '…');
    const progress = h('div', { class: 'pdf-progress' }, h('div', {}));
    const prevBtn = iconButton('prev', 'Previous page (←)', () => viewer?.go(viewer.page - 1));
    const nextBtn = iconButton('next', 'Next page (→)', () => viewer?.go(viewer.page + 1));
    pdfPanel = h(
      'aside',
      { class: 'pdf-panel' },
      h(
        'div',
        { class: 'pdf-bar' },
        prevBtn,
        pageLabel,
        nextBtn,
        h('div', { class: 'spacer' }),
        iconButton('minus', 'Zoom out', () => viewer?.setZoom(0.8)),
        iconButton('plus', 'Zoom in', () => viewer?.setZoom(1.25)),
      ),
      progress,
      scroller,
    );
    work.append(pdfPanel);

    const { PdfViewer } = await import('./pdfViewer');
    viewer = new PdfViewer(scroller, (page, total) => {
      pageLabel.textContent = `Page ${page} / ${total}`;
      (progress.firstElementChild as HTMLElement).style.width = `${(page / total) * 100}%`;
      prevBtn.disabled = page <= 1;
      nextBtn.disabled = page >= total;
      if (project.page !== page || project.pageCount !== total) {
        project.page = page;
        project.pageCount = total;
        dirty = true;
        scheduleSave();
      }
    });

    // Swipe the instruction page on touch devices.
    let sx = 0;
    let sy = 0;
    scroller.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    scroller.addEventListener('touchend', (e) => {
      if (e.touches.length || scroller.scrollWidth > scroller.clientWidth + 2) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) viewer?.go(viewer.page + (dx < 0 ? 1 : -1));
    });

    const pdf = await loadPdf(project.id);
    if (pdf) await viewer.open(pdf, project.page);
    else scroller.append(h('p', { class: 'empty' }, 'Instruction PDF is missing.'));
  }

  const togglePdf = () => {
    if (!pdfPanel) return;
    work.classList.toggle('pdf-hidden');
  };

  const leave = () => {
    location.hash = '';
  };

  const menu = h('details', { class: 'menu' });
  menu.append(
    h('summary', { class: 'icon-btn', 'aria-label': 'More' }, '•••'),
    h(
      'div',
      { class: 'menu-items' },
      h('button', { onclick: (() => { menu.open = false; openPartsList(); }) as EventListener }, icon('list'), 'Parts list'),
      h('button', { onclick: (() => { menu.open = false; saveImage(); }) as EventListener }, icon('camera'), 'Save image'),
      h('button', { onclick: (() => { menu.open = false; exportJson(); }) as EventListener }, icon('download'), 'Export build'),
      h('button', { class: 'danger', onclick: (() => { menu.open = false; if (confirm('Remove all bricks?')) builder.clear(); }) as EventListener }, icon('trash'), 'Clear baseplate'),
    ),
  );

  const topbar = h(
    'header',
    { class: 'topbar' },
    iconButton('back', 'Back to builds', leave),
    nameInput,
    h('div', { class: 'spacer' }),
    undoBtn,
    redoBtn,
    project.mode === 'instructions' ? iconButton('book', 'Show/hide instructions (I)', togglePdf) : null,
    iconButton('list', 'Parts list', openPartsList, 'hide-sm'),
    menu,
  );

  app.append(h('div', { class: `builder mode-${project.mode}` }, topbar, work, palette, partsDialog));

  showKind('brick');
  selectType(builder.typeId);
  selectColor(builder.colorId);
  setTool('build');

  // --- keyboard ---
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? builder.redo() : builder.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      builder.redo();
      return;
    }
    if (mod) return;
    const k = e.key.toLowerCase();
    const tool = tools.find((t) => t.key === k);
    if (tool) setTool(tool.id);
    else if (k === 'r') builder.rotateBrush();
    else if (k === 'q') builder.rotateView(-1);
    else if (k === 'e') builder.rotateView(1);
    else if (k === 'i') togglePdf();
    else if (e.key === 'ArrowRight' && viewer) viewer.go(viewer.page + 1);
    else if (e.key === 'ArrowLeft' && viewer) viewer.go(viewer.page - 1);
    else return;
    e.preventDefault();
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') void save(true);
  };
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);

  cleanup = () => {
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    void save(true); // thumbnail is captured synchronously before dispose
    builder.dispose();
    void viewer?.destroy();
  };
}
