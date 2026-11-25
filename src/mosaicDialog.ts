import { type Mosaic, type MosaicOptions, type MosaicStyle, createMosaic, drawMosaic } from './mosaic';
import { type Project, newId, saveProject } from './storage';
import { h, icon, iconButton, toast } from './ui';

type Img = CanvasImageSource & { width: number; height: number };

async function loadImage(file: File): Promise<Img> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback for formats createImageBitmap can't decode in this browser.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function scaled(img: Img, max: number, type = 'image/jpeg'): string {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}

function segmented<T extends string | number>(
  label: string,
  options: [T, string][],
  value: T,
  onChange: (v: T) => void,
): { el: HTMLElement; set: (v: T) => void; disable: (v: T, off: boolean) => void } {
  const btns = new Map<T, HTMLButtonElement>();
  const el = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const set = (v: T) => {
    for (const [k, b] of btns) b.setAttribute('aria-checked', String(k === v));
  };
  for (const [v, text] of options) {
    const b = h('button', { type: 'button', role: 'radio', onclick: (() => { set(v); onChange(v); }) as EventListener }, text);
    btns.set(v, b);
    el.append(b);
  }
  set(value);
  return { el, set, disable: (v, off) => void (btns.get(v)!.disabled = off) };
}

/** Opens the "Build from a photo" sheet. Resolves with the new project id, or null. */
export function openMosaicDialog(initial?: File): Promise<string | null> {
  return new Promise((resolve) => {
    let img: Img | null = null;
    let mosaic: Mosaic | null = null;
    let sizeMode: number | 'fit' = 32;
    let fileName = '';
    let nameTouched = false;
    const opts: MosaicOptions = { width: 32, height: 32, style: 'round', mixed: true, maxColors: 0, dither: true };

    const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true }) as HTMLInputElement;
    const preview = h('canvas', { class: 'mosaic-preview', width: 480, height: 480, 'aria-label': 'Mosaic preview' }) as HTMLCanvasElement;
    const original = h('img', { class: 'mosaic-original', alt: 'Original picture' }) as HTMLImageElement;
    const stats = h('p', { class: 'mosaic-stats' });
    const nameInput = h('input', { type: 'text', placeholder: 'My mosaic', maxlength: 60, 'aria-label': 'Name' }) as HTMLInputElement;
    const createBtn = h('button', { class: 'primary', type: 'button', disabled: true }, 'Create build') as HTMLButtonElement;
    const drop = h(
      'div',
      { class: 'dropzone' },
      icon('camera'),
      h('span', {}, 'Drop a picture here or '),
      h('button', { type: 'button', class: 'link-btn', onclick: (() => fileInput.click()) as EventListener }, 'choose one'),
    );
    const previewWrap = h('div', { class: 'mosaic-stage', hidden: true }, h('div', { class: 'mosaic-pair' }, original, preview), stats);

    const recompute = () => {
      if (!img) return;
      if (sizeMode === 'fit') {
        const r = img.width / img.height;
        opts.width = r >= 1 ? 48 : Math.max(8, Math.round(48 * r));
        opts.height = r >= 1 ? Math.max(8, Math.round(48 / r)) : 48;
      } else {
        opts.width = opts.height = sizeMode;
      }
      mosaic = createMosaic(img, opts);
      preview.width = preview.height = 480;
      drawMosaic(preview, mosaic, opts.style);
      const parts = mosaic.bricks.length;
      stats.textContent = `${opts.width}×${opts.height} studs · ${parts.toLocaleString()} parts · ${mosaic.colors.length} colours · ${mosaic.steps.length} steps`;
      createBtn.disabled = false;
    };

    const size = segmented<number | 'fit'>('Size', [[16, '16×16'], [32, '32×32'], [48, '48×48'], ['fit', 'Fit picture']], 32, (v) => {
      sizeMode = v;
      recompute();
    });
    const style = segmented<MosaicStyle>('Parts', [['round', 'Round tiles'], ['tile', 'Square tiles'], ['plate', 'Plates']], 'round', (v) => {
      opts.style = v;
      mixedBox.disabled = v === 'round';
      recompute();
    });
    const mixedBox = h('input', { type: 'checkbox', checked: true, disabled: true }) as HTMLInputElement;
    mixedBox.addEventListener('change', () => {
      opts.mixed = mixedBox.checked;
      recompute();
    });
    const ditherBox = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
    ditherBox.addEventListener('change', () => {
      opts.dither = ditherBox.checked;
      recompute();
    });
    const colorSelect = h(
      'select',
      { 'aria-label': 'Number of colours' },
      ...[[0, 'All colours'], [24, '24 colours'], [16, '16 colours'], [12, '12 colours'], [8, '8 colours'], [4, '4 colours'], [2, '2 colours']].map(([v, t]) =>
        h('option', { value: v }, String(t)),
      ),
    ) as HTMLSelectElement;
    colorSelect.addEventListener('change', () => {
      opts.maxColors = Number(colorSelect.value);
      recompute();
    });

    const setFile = async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|heic|avif|bmp)$/i.test(file.name)) {
        toast('Please choose a picture');
        return;
      }
      try {
        img = await loadImage(file);
      } catch {
        toast('This picture format is not supported by your browser');
        return;
      }
      fileName = file.name.replace(/\.[^.]+$/, '');
      if (!nameTouched) nameInput.value = fileName;
      original.src = scaled(img, 480);
      previewWrap.hidden = false;
      drop.classList.add('compact');
      recompute();
    };

    nameInput.addEventListener('input', () => (nameTouched = true));
    fileInput.addEventListener('change', () => {
      void setFile(fileInput.files?.[0]);
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
      void setFile(e.dataTransfer?.files[0]);
    });

    const option = (label: string, control: HTMLElement) => h('div', { class: 'option' }, h('span', { class: 'option-label' }, label), control);

    const dialog = h(
      'dialog',
      { class: 'sheet mosaic-dialog', 'aria-labelledby': 'mosaic-title' },
      h('header', {}, h('h2', { id: 'mosaic-title' }, 'Build from a photo'), iconButton('x', 'Close', () => close(null))),
      h('section', {}, drop, previewWrap),
      h(
        'section',
        { class: 'options' },
        option('Size', size.el),
        option('Parts', style.el),
        option('Colours', colorSelect),
        h(
          'div',
          { class: 'option checks' },
          h('label', {}, mixedBox, ' Use bigger parts for same-coloured areas'),
          h('label', {}, ditherBox, ' Smooth colour blending (dithering)'),
        ),
        option('Name', nameInput),
      ),
      h('footer', {}, h('button', { type: 'button', class: 'secondary', onclick: (() => close(null)) as EventListener }, 'Cancel'), createBtn),
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

    createBtn.addEventListener('click', async () => {
      if (!mosaic || !img) return;
      createBtn.disabled = true;
      const p: Project = {
        id: newId(),
        name: nameInput.value.trim() || fileName || 'Mosaic',
        mode: 'mosaic',
        bricks: [],
        steps: mosaic.steps,
        step: 0,
        mosaicStyle: opts.style,
        source: scaled(img, 320),
        thumbnail: preview.toDataURL('image/png'),
        page: 1,
        pageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      try {
        await saveProject(p);
        close(p.id);
      } catch {
        toast('Could not save this build');
        createBtn.disabled = false;
      }
    });

    document.body.append(dialog);
    dialog.showModal();
    if (initial) void setFile(initial);
  });
}
