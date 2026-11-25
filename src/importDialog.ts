import { type Booklet, type Project, newId, savePdfs, saveProject } from './storage';
import { h, icon, iconButton, toast } from './ui';

export const INSTRUCTIONS_URL = 'https://www.lego.com/service/building-instructions';

export const setUrl = (setNumber: string) =>
  /^\d{3,7}(-\d+)?$/.test(setNumber) ? `${INSTRUCTIONS_URL}/${setNumber.replace(/-\d+$/, '')}` : INSTRUCTIONS_URL;

export const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

interface Entry {
  file: File;
  pages: number | null;
}

/** Reads page counts for picked PDFs, dropping files that aren't readable PDFs. */
export async function readBooklets(files: File[]): Promise<{ file: File; pages: number }[]> {
  const { countPages } = await import('./pdfViewer');
  const out: { file: File; pages: number }[] = [];
  for (const file of files) {
    if (!isPdf(file)) {
      toast(`${file.name} is not a PDF`);
      continue;
    }
    try {
      out.push({ file, pages: await countPages(file) });
    } catch {
      toast(`Could not read ${file.name}`);
    }
  }
  return out;
}

const bookletName = (file: File) => file.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Booklet';

/** Opens the "Import instructions" sheet. Resolves with the new project id, or null if cancelled. */
export function openImportDialog(initialFiles: File[] = []): Promise<string | null> {
  return new Promise((resolve) => {
    const entries: Entry[] = [];
    let nameTouched = false;

    const setInput = h('input', {
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      placeholder: 'e.g. 10497',
      maxlength: 10,
      'aria-label': 'Set number',
    }) as HTMLInputElement;
    const lookup = h('a', { class: 'btn', target: '_blank', rel: 'noopener', href: INSTRUCTIONS_URL }, 'Find instructions', icon('link'));
    const nameInput = h('input', { type: 'text', placeholder: 'My set', maxlength: 60, 'aria-label': 'Set name' }) as HTMLInputElement;
    const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, hidden: true }) as HTMLInputElement;
    const list = h('ol', { class: 'booklet-list' });
    const importBtn = h('button', { class: 'primary', type: 'button' }, 'Import') as HTMLButtonElement;
    const drop = h(
      'div',
      { class: 'dropzone' },
      icon('upload'),
      h('span', {}, 'Drop booklet PDFs here or '),
      h('button', { type: 'button', class: 'link-btn', onclick: (() => fileInput.click()) as EventListener }, 'choose files'),
    );

    const syncName = () => {
      if (nameTouched) return;
      const n = setInput.value.trim();
      nameInput.value = n ? `Set ${n}` : entries[0] ? bookletName(entries[0].file) : '';
    };

    setInput.addEventListener('input', () => {
      setInput.value = setInput.value.replace(/[^\d-]/g, '');
      lookup.setAttribute('href', setUrl(setInput.value.trim()));
      syncName();
    });
    nameInput.addEventListener('input', () => (nameTouched = true));

    const render = () => {
      list.replaceChildren(
        ...entries.map((e, i) =>
          h(
            'li',
            {},
            h('span', { class: 'booklet-no' }, String(i + 1)),
            h('div', { class: 'booklet-info' }, h('b', {}, e.file.name), h('small', {}, e.pages === null ? 'Reading…' : `${e.pages} pages`)),
            iconButton('up', 'Move up', () => move(i, -1)),
            iconButton('down', 'Move down', () => move(i, 1)),
            iconButton('x', 'Remove', () => {
              entries.splice(i, 1);
              render();
            }),
          ),
        ),
      );
      list.querySelectorAll<HTMLButtonElement>('li:first-child [aria-label="Move up"], li:last-child [aria-label="Move down"]').forEach((b) => (b.disabled = true));
      importBtn.disabled = !entries.length || entries.some((e) => e.pages === null);
      drop.classList.toggle('compact', entries.length > 0);
      syncName();
    };

    const move = (i: number, dir: number) => {
      const j = i + dir;
      if (j < 0 || j >= entries.length) return;
      [entries[i], entries[j]] = [entries[j], entries[i]];
      render();
    };

    const add = async (files: File[]) => {
      const pdfs = files.filter((f) => {
        if (!isPdf(f)) toast(`${f.name} is not a PDF`);
        return isPdf(f);
      });
      pdfs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const fresh = pdfs.map((file) => ({ file, pages: null as number | null }));
      entries.push(...fresh);
      render();
      const { countPages } = await import('./pdfViewer');
      for (const e of fresh) {
        try {
          e.pages = await countPages(e.file);
        } catch {
          toast(`Could not read ${e.file.name}`);
          entries.splice(entries.indexOf(e), 1);
        }
        render();
      }
    };

    fileInput.addEventListener('change', () => {
      void add([...(fileInput.files ?? [])]);
      fileInput.value = '';
    });
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove('over');
      void add([...(e.dataTransfer?.files ?? [])]);
    });

    const dialog = h(
      'dialog',
      { class: 'sheet import-dialog', 'aria-labelledby': 'import-title' },
      h('header', {}, h('h2', { id: 'import-title' }, 'Import instructions'), iconButton('x', 'Close', () => close(null))),
      h(
        'section',
        {},
        h('h3', {}, h('span', { class: 'step-no' }, '1'), 'Find your set'),
        h('div', { class: 'row' }, setInput, lookup),
        h('p', { class: 'help' }, 'Enter the set number from the box, open the official instructions page, and download the PDFs. Bigger sets have more than one booklet.'),
      ),
      h('section', {}, h('h3', {}, h('span', { class: 'step-no' }, '2'), 'Add the booklet PDFs'), drop, list),
      h('section', {}, h('h3', {}, h('span', { class: 'step-no' }, '3'), 'Name it'), nameInput),
      h('footer', {}, h('button', { type: 'button', class: 'secondary', onclick: (() => close(null)) as EventListener }, 'Cancel'), importBtn),
      fileInput,
    );

    const close = (id: string | null) => {
      dialog.close();
      dialog.remove();
      resolve(id);
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });

    importBtn.addEventListener('click', async () => {
      importBtn.disabled = true;
      importBtn.textContent = 'Importing…';
      const booklets: Booklet[] = entries.map((e) => ({ name: bookletName(e.file), pages: e.pages ?? 0 }));
      const setNumber = setInput.value.trim() || undefined;
      const p: Project = {
        id: newId(),
        name: nameInput.value.trim() || (setNumber ? `Set ${setNumber}` : booklets[0].name),
        mode: 'instructions',
        bricks: [],
        setNumber,
        booklets,
        booklet: 0,
        page: 1,
        pageCount: booklets[0].pages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      try {
        await savePdfs(p.id, entries.map((e) => e.file));
        await saveProject(p);
        close(p.id);
      } catch {
        toast('Not enough storage to import these PDFs');
        importBtn.disabled = false;
        importBtn.textContent = 'Import';
      }
    });

    document.body.append(dialog);
    dialog.showModal();
    render();
    if (initialFiles.length) void add(initialFiles);
    else setInput.focus();
  });
}
