import { createStore, del, get, keys, set } from 'idb-keyval';
import type { PlacedBrick } from './bricks';

export type Mode = 'free' | 'instructions';

export interface Booklet {
  name: string;
  pages: number;
}

export interface Project {
  id: string;
  name: string;
  mode: Mode;
  bricks: PlacedBrick[];
  /** official set number, e.g. "10497" */
  setNumber?: string;
  /** instruction booklets, in build order */
  booklets?: Booklet[];
  /** current booklet index */
  booklet?: number;
  /** current page in the current booklet (1-based) */
  page: number;
  /** page count of the current booklet */
  pageCount: number;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

const projects = createStore('brick-builder', 'projects');
const pdfs = createStore('brick-builder-pdfs', 'pdfs');

export const newId = () => crypto.randomUUID();

export async function listProjects(): Promise<Project[]> {
  const ids = (await keys(projects)) as string[];
  const all = await Promise.all(ids.map((id) => get<Project>(id, projects)));
  return all.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const p = await get<Project>(id, projects);
  // Projects from v0.1 had a single PDF and no booklet list.
  if (p && p.mode === 'instructions' && !p.booklets) {
    p.booklets = [{ name: 'Instructions', pages: p.pageCount }];
    p.booklet = 0;
  }
  return p;
}

export async function saveProject(p: Project): Promise<void> {
  p.updatedAt = Date.now();
  await set(p.id, p, projects);
}

export async function deleteProject(id: string): Promise<void> {
  await Promise.all([del(id, projects), del(id, pdfs)]);
}

/** Instruction PDFs are stored as one array of blobs per project, in booklet order. */
export const savePdfs = (id: string, files: Blob[]) => set(id, files, pdfs);

export async function loadPdfs(id: string): Promise<Blob[]> {
  const v = await get<Blob | Blob[]>(id, pdfs);
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
