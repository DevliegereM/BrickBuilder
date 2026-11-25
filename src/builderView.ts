import { BRICK_TYPES, CATEGORIES, COLORS, COLOR_BY_ID, type Category, TYPE_BY_ID } from './bricks';
import { Builder, type Tool } from './builder';
import { readBooklets, setUrl } from './importDialog';
import { partIcons } from './partIcons';
import type { PdfViewer } from './pdfViewer';
import { type Project, loadPdfs, savePdfs, saveProject } from './storage';
import { h, icon, iconButton, toast } from './ui';

export async function renderBuilder(app: HTMLElement, project: Project): Promise<() => void> {
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
      toast('Picked part');
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
    const b = h(
      'button',
      { class: 'tool-btn', title: `${t.label} (${t.key})`, 'aria-label': t.label, onclick: (() => setTool(t.id)) as EventListener },
      icon(t.id),
      h('span', {}, t.label),
    );
    toolBtns.set(t.id, b);
    toolbar.append(b);
  }
  toolbar.append(h('div', { class: 'sep' }), iconButton('rotate', 'Rotate part (R)', () => builder.rotateBrush(), 'tool-btn'));

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
  const typeBtns = new Map<string, { btn: HTMLButtonElement; img: HTMLImageElement }>();
  const colorBtns = new Map<string, HTMLButtonElement>();
  const catTabs = new Map<Category, HTMLButtonElement>();
  const partsRow = h('div', { class: 'parts-row' });
  const colorsRow = h('div', { class: 'colors-row' });
  let activeCat: Category = 'brick';

  // Part icons are rendered in the current colour, only for the visible tab.
  const refreshIcons = () => {
    for (const [id, { img }] of typeBtns) {
      const t = TYPE_BY_ID.get(id)!;
      if (t.category === activeCat) img.src = partIcons.get(t, builder.colorId);
    }
  };

  const showCategory = (c: Category) => {
    activeCat = c;
    for (const [id, b] of catTabs) b.setAttribute('aria-selected', String(id === c));
    for (const [id, { btn }] of typeBtns) btn.hidden = TYPE_BY_ID.get(id)!.category !== c;
    refreshIcons();
  };

  function selectType(id: string) {
    builder.setBrush(id, builder.colorId);
    for (const [tid, { btn }] of typeBtns) btn.classList.toggle('active', tid === id);
    const c = TYPE_BY_ID.get(id)!.category;
    if (c !== activeCat) showCategory(c);
    typeBtns.get(id)?.btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function selectColor(id: string) {
    builder.setBrush(builder.typeId, id);
    for (const [cid, b] of colorBtns) b.classList.toggle('active', cid === id);
    refreshIcons();
  }

  const tabs = h('div', { class: 'kind-tabs', role: 'tablist', 'aria-label': 'Part categories' });
  for (const [c, label] of CATEGORIES) {
    const b = h('button', { role: 'tab', onclick: (() => showCategory(c)) as EventListener }, label);
    catTabs.set(c, b);
    tabs.append(b);
  }
  for (const t of BRICK_TYPES) {
    const img = h('img', { alt: '', width: 56, height: 56, draggable: 'false' }) as HTMLImageElement;
    const btn = h('button', { class: 'part-btn', title: t.name, 'aria-label': t.name, onclick: (() => selectType(t.id)) as EventListener }, img, h('span', {}, t.label));
    typeBtns.set(t.id, { btn, img });
    partsRow.append(btn);
  }
  for (const c of COLORS) {
    const b = h('button', { class: 'swatch', title: c.name, 'aria-label': c.name, style: `--c:${c.hex}`, onclick: (() => selectColor(c.id)) as EventListener });
    colorBtns.set(c.id, b);
    colorsRow.append(b);
  }
  const palette = h('footer', { class: 'palette' }, h('div', { class: 'palette-top' }, tabs, colorsRow), partsRow);

  // --- parts list dialog ---
  const partsDialog = h('dialog', { class: 'sheet parts-dialog' });
  const openPartsList = () => {
    const counts = new Map<string, number>();
    for (const b of builder.getBricks()) counts.set(`${b.t}|${b.c}`, (counts.get(`${b.t}|${b.c}`) ?? 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((s, [, n]) => s + n, 0);
    partsDialog.replaceChildren(
      h('header', {}, h('h2', {}, `Parts used · ${total}`), iconButton('x', 'Close', () => partsDialog.close())),
      rows.length
        ? h(
            'ul',
            { class: 'parts-list' },
            ...rows.map(([key, n]) => {
              const [t, c] = key.split('|');
              const type = TYPE_BY_ID.get(t)!;
              const color = COLOR_BY_ID.get(c)!;
              return h('li', {}, h('img', { src: partIcons.get(type, c), alt: '', width: 44, height: 44 }), h('span', {}, `${color.name} ${type.name}`), h('b', {}, `×${n}`));
            }),
          )
        : h('p', { class: 'empty' }, 'No parts placed yet.'),
    );
    partsDialog.showModal();
  };

  const download = (href: string, filename: string) => h('a', { href, download: filename }).click();

  const exportJson = () => {
    const json = JSON.stringify({ app: 'brick-builder', version: 2, name: nameInput.value, bricks: builder.getBricks() });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    download(url, `${nameInput.value || 'build'}.brickbuild.json`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // --- instructions panel ---
  let viewer: PdfViewer | null = null;
  let pdfPanel: HTMLElement | null = null;
  let pdfFiles: Blob[] = [];
  const work = h('div', { class: 'work' }, stage);
  const addBookletInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true }) as HTMLInputElement;
  const bookletSelect = h('select', { class: 'booklet-select', 'aria-label': 'Booklet' }) as HTMLSelectElement;

  const renderBookletSelect = () => {
    const books = project.booklets ?? [];
    bookletSelect.replaceChildren(...books.map((b, i) => h('option', { value: i }, `Book ${i + 1} · ${b.name}`)));
    bookletSelect.value = String(project.booklet ?? 0);
    bookletSelect.hidden = books.length < 2;
  };

  const openBooklet = async (index: number, page = 1) => {
    if (!viewer || !pdfFiles[index]) return;
    if (project.booklet !== index) scheduleSave();
    project.booklet = index;
    bookletSelect.value = String(index);
    await viewer.open(pdfFiles[index], page);
  };

  if (project.mode === 'instructions') {
    const scroller = h('div', { class: 'pdf-scroller' });
    const pageLabel = h('span', { class: 'page-label' }, '…');
    const progress = h('div', { class: 'pdf-progress' }, h('div', {}));
    const books = () => project.booklets ?? [];
    const cur = () => project.booklet ?? 0;
    // Page navigation flows across booklets.
    const next = () => {
      if (!viewer) return;
      if (viewer.page < viewer.total) viewer.go(viewer.page + 1);
      else if (cur() < books().length - 1) void openBooklet(cur() + 1, 1);
    };
    const prev = () => {
      if (!viewer) return;
      if (viewer.page > 1) viewer.go(viewer.page - 1);
      else if (cur() > 0) void openBooklet(cur() - 1, books()[cur() - 1].pages);
    };
    const prevBtn = iconButton('prev', 'Previous page (←)', prev);
    const nextBtn = iconButton('next', 'Next page (→)', next);
    pdfPanel = h(
      'aside',
      { class: 'pdf-panel' },
      h(
        'div',
        { class: 'pdf-bar' },
        prevBtn,
        pageLabel,
        nextBtn,
        bookletSelect,
        h('div', { class: 'spacer' }),
        iconButton('minus', 'Zoom out', () => viewer?.setZoom(0.8)),
        iconButton('plus', 'Zoom in', () => viewer?.setZoom(1.25)),
      ),
      progress,
      scroller,
    );
    work.append(pdfPanel);
    renderBookletSelect();
    bookletSelect.addEventListener('change', () => void openBooklet(Number(bookletSelect.value), 1));

    const { PdfViewer } = await import('./pdfViewer');
    viewer = new PdfViewer(scroller, (page, total) => {
      pageLabel.textContent = `Page ${page} / ${total}`;
      // Overall progress across all booklets.
      const all = books().reduce((s, b) => s + b.pages, 0) || total;
      const before = books().slice(0, cur()).reduce((s, b) => s + b.pages, 0);
      (progress.firstElementChild as HTMLElement).style.width = `${((before + page) / all) * 100}%`;
      prevBtn.disabled = page <= 1 && cur() === 0;
      nextBtn.disabled = page >= total && cur() >= books().length - 1;
      if (project.page !== page || project.pageCount !== total) {
        project.page = page;
        project.pageCount = total;
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
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
    });

    addBookletInput.addEventListener('change', async () => {
      const added = await readBooklets([...(addBookletInput.files ?? [])]);
      addBookletInput.value = '';
      if (!added.length) return;
      pdfFiles = [...pdfFiles, ...added.map((a) => a.file)];
      project.booklets = [...books(), ...added.map((a) => ({ name: a.file.name.replace(/\.pdf$/i, ''), pages: a.pages }))];
      try {
        await savePdfs(project.id, pdfFiles);
      } catch {
        toast('Not enough storage for this booklet');
        return;
      }
      renderBookletSelect();
      scheduleSave();
      toast(added.length === 1 ? 'Booklet added' : `${added.length} booklets added`);
      if (pdfFiles.length === added.length) void openBooklet(0, 1);
    });

    pdfFiles = await loadPdfs(project.id);
    if (pdfFiles.length) await openBooklet(Math.min(cur(), pdfFiles.length - 1), project.page);
    else scroller.append(h('p', { class: 'empty' }, 'No instruction PDF yet. Use ••• › Add booklet.'));
  }

  const togglePdf = () => {
    if (pdfPanel) work.classList.toggle('pdf-hidden');
  };

  const menu = h('details', { class: 'menu' });
  const item = (iconName: string, label: string, fn: () => void, cls = '') =>
    h('button', { class: cls, onclick: (() => { menu.open = false; fn(); }) as EventListener }, icon(iconName), label);
  menu.append(
    h('summary', { class: 'icon-btn', 'aria-label': 'More' }, '•••'),
    h(
      'div',
      { class: 'menu-items' },
      item('list', 'Parts list', openPartsList),
      project.mode === 'instructions' ? item('file', 'Add booklet', () => addBookletInput.click()) : null,
      project.mode === 'instructions' && project.setNumber
        ? item('link', `Set ${project.setNumber} on lego.com`, () => window.open(setUrl(project.setNumber!), '_blank', 'noopener'))
        : null,
      item('camera', 'Save image', () => download(builder.snapshot(1600, 1200), `${nameInput.value || 'build'}.webp`)),
      item('download', 'Export build', exportJson),
      item('trash', 'Clear baseplate', () => confirm('Remove all parts?') && builder.clear(), 'danger'),
    ),
  );

  const topbar = h(
    'header',
    { class: 'topbar' },
    iconButton('back', 'Back to builds', () => (location.hash = '')),
    nameInput,
    h('div', { class: 'spacer' }),
    undoBtn,
    redoBtn,
    project.mode === 'instructions' ? iconButton('book', 'Show/hide instructions (I)', togglePdf) : null,
    iconButton('list', 'Parts list', openPartsList, 'hide-sm'),
    menu,
  );

  app.append(h('div', { class: `builder mode-${project.mode}` }, topbar, work, palette, partsDialog, addBookletInput));

  showCategory('brick');
  selectType(builder.typeId);
  selectColor(builder.colorId);
  setTool('build');

  // --- keyboard ---
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
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
    else if (e.key === 'ArrowRight' && viewer) (pdfPanel?.querySelector('[aria-label^="Next"]') as HTMLButtonElement | null)?.click();
    else if (e.key === 'ArrowLeft' && viewer) (pdfPanel?.querySelector('[aria-label^="Previous"]') as HTMLButtonElement | null)?.click();
    else return;
    e.preventDefault();
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') void save(true);
  };
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);

  return () => {
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    void save(true); // thumbnail is captured synchronously before dispose
    builder.dispose();
    void viewer?.destroy();
  };
}
