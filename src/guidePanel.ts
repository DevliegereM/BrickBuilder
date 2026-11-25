import { COLOR_BY_ID, type PlacedBrick, type Rotation, TYPE_BY_ID, footprint } from './bricks';
import type { Builder } from './builder';
import { drawMosaic } from './mosaic';
import { partIcons } from './partIcons';
import type { Project } from './storage';
import { h, icon, iconButton, toast } from './ui';

const key = (b: PlacedBrick) => {
  const f = footprint(b);
  return `${b.t}|${b.c}|${b.x}|${b.y}|${b.z}|${f.w}x${f.d}`;
};

interface GuideHooks {
  save: () => void;
  selectPart: (typeId: string, colorId: string, r: Rotation) => void;
}

/** Step-by-step instructions for builds generated from a picture. */
export function createGuidePanel(project: Project, builder: Builder, hooks: GuideHooks) {
  const steps = project.steps ?? [];
  const total = steps.reduce((s, st) => s + st.length, 0);
  let step = Math.min(project.step ?? 0, Math.max(0, steps.length - 1));
  let wasComplete = false;
  let advanceTimer = 0;

  const label = h('span', { class: 'page-label' });
  const progress = h('div', { class: 'pdf-progress' }, h('div', {}));
  const prevBtn = iconButton('prev', 'Previous step (←)', () => go(step - 1));
  const nextBtn = iconButton('next', 'Next step (→)', () => go(step + 1));
  const autoBtn = h('button', { type: 'button', class: 'btn small', title: 'Place every part of this step' }, icon('build'), 'Place for me') as HTMLButtonElement;
  const map = h('canvas', { class: 'step-map', width: 320, height: 320, 'aria-label': 'Where this step goes' }) as HTMLCanvasElement;
  const status = h('div', { class: 'step-status' });
  const list = h('ul', { class: 'step-parts' });
  const overall = h('p', { class: 'step-overall' });

  const el = h(
    'aside',
    { class: 'pdf-panel guide-panel' },
    h('div', { class: 'pdf-bar' }, prevBtn, label, nextBtn, h('div', { class: 'spacer' }), autoBtn),
    progress,
    h(
      'div',
      { class: 'guide-body' },
      h(
        'div',
        { class: 'guide-maps' },
        h('figure', {}, map, h('figcaption', {}, 'This step')),
        project.source ? h('figure', {}, h('img', { src: project.source, alt: 'Original picture' }), h('figcaption', {}, 'Picture')) : null,
      ),
      status,
      h('h3', {}, 'Parts for this step'),
      list,
      overall,
    ),
  );

  const placedKeys = () => new Set(builder.getBricks().map(key));

  /** Moves the camera to where the current step goes. */
  const focus = () => {
    const target = steps[step];
    if (!target?.length) return;
    let minX = Infinity, minZ = Infinity, maxX = 0, maxZ = 0;
    for (const b of target) {
      const f = footprint(b);
      minX = Math.min(minX, b.x);
      minZ = Math.min(minZ, b.z);
      maxX = Math.max(maxX, b.x + f.w);
      maxZ = Math.max(maxZ, b.z + f.d);
    }
    builder.focusArea(minX, minZ, maxX, maxZ);
  };

  function go(i: number) {
    clearTimeout(advanceTimer);
    if (i < 0 || i >= steps.length) return;
    step = i;
    project.step = i;
    focus();
    wasComplete = true; // don't auto-advance when revisiting a finished step
    hooks.save();
    refresh();
    wasComplete = isComplete();
  }

  const isComplete = () => {
    const placed = placedKeys();
    return (steps[step] ?? []).every((b) => placed.has(key(b)));
  };

  function refresh() {
    const placed = placedKeys();
    const target = steps[step] ?? [];
    const remaining = target.filter((b) => !placed.has(key(b)));
    builder.setGuide(remaining);

    label.textContent = steps.length ? `Step ${step + 1} / ${steps.length}` : 'No steps';
    prevBtn.disabled = step <= 0;
    nextBtn.disabled = step >= steps.length - 1;
    autoBtn.disabled = !remaining.length;

    const done = steps.flat().filter((b) => placed.has(key(b))).length;
    (progress.firstElementChild as HTMLElement).style.width = `${total ? (done / total) * 100 : 0}%`;
    overall.textContent = `${done.toLocaleString()} of ${total.toLocaleString()} parts placed in total`;

    map.width = map.height = 320;
    drawMosaic(map, { steps, ...dims() }, project.mosaicStyle ?? 'tile', { step, done: (b) => placed.has(key(b)) });

    // Parts needed for this step, grouped by type and colour.
    const groups = new Map<string, { t: string; c: string; need: number; have: number; next?: PlacedBrick }>();
    for (const b of target) {
      const g = groups.get(`${b.t}|${b.c}`) ?? { t: b.t, c: b.c, need: 0, have: 0 };
      g.need++;
      if (placed.has(key(b))) g.have++;
      else g.next ??= b;
      groups.set(`${b.t}|${b.c}`, g);
    }
    list.replaceChildren(
      ...[...groups.values()]
        .sort((a, b) => Number(a.have === a.need) - Number(b.have === b.need) || b.need - a.need)
        .map((g) => {
          const type = TYPE_BY_ID.get(g.t)!;
          const complete = g.have === g.need;
          return h(
            'li',
            { class: complete ? 'done' : '' },
            h(
              'button',
              {
                type: 'button',
                title: 'Select this part',
                disabled: complete,
                onclick: (() => g.next && hooks.selectPart(g.t, g.c, g.next.r)) as EventListener,
              },
              h('img', { src: partIcons.get(type, g.c), alt: '', width: 40, height: 40 }),
              h('span', {}, `${COLOR_BY_ID.get(g.c)!.name} ${type.name}`),
              h('b', {}, complete ? '✓' : `${g.have}/${g.need}`),
            ),
          );
        }),
    );

    const complete = target.length > 0 && !remaining.length;
    const finished = done === total && total > 0;
    status.replaceChildren(
      finished
        ? h('p', { class: 'banner success' }, 'Finished! Every part is in place.')
        : complete
          ? h('p', { class: 'banner success' }, 'Step complete', step < steps.length - 1 ? h('button', { type: 'button', class: 'btn small', onclick: (() => go(step + 1)) as EventListener }, 'Next step') : null)
          : h('p', { class: 'banner' }, `Place the outlined parts: ${remaining.length} to go. Tap a part below to pick it.`),
    );

    // Move on by itself when the last part of a step goes in.
    if (complete && !wasComplete && step < steps.length - 1) {
      toast(`Step ${step + 1} done`);
      advanceTimer = window.setTimeout(() => go(step + 1), 900);
    }
    wasComplete = complete;
  }

  function dims() {
    // Recover the picture size from the parts so the map keeps its aspect ratio.
    let minX = Infinity, minZ = Infinity, maxX = 0, maxZ = 0;
    for (const b of steps.flat()) {
      const f = footprint(b);
      minX = Math.min(minX, b.x);
      minZ = Math.min(minZ, b.z);
      maxX = Math.max(maxX, b.x + f.w);
      maxZ = Math.max(maxZ, b.z + f.d);
    }
    return { width: Math.max(1, maxX - minX), height: Math.max(1, maxZ - minZ) };
  }

  autoBtn.addEventListener('click', () => {
    const placed = placedKeys();
    const n = builder.placeMany((steps[step] ?? []).filter((b) => !placed.has(key(b))));
    if (!n) toast('Something is in the way: clear the outlined area first');
  });

  refresh();
  wasComplete = isComplete();

  return {
    focus,
    el,
    refresh,
    next: () => go(step + 1),
    prev: () => go(step - 1),
  };
}
