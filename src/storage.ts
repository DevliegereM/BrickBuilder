import { createStore, del, get, keys, set } from 'idb-keyval';
import type { PlacedBrick } from './bricks';

export type Mode = 'free' | 'instructions';

export interface Project {
  id: string;
  name: string;
  mode: Mode;
  bricks: PlacedBrick[];
  /** current page in the instruction PDF (1-based) */
  page: number;
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

export const loadProject = (id: string) => get<Project>(id, projects);

export async function saveProject(p: Project): Promise<void> {
  p.updatedAt = Date.now();
  await set(p.id, p, projects);
}

export async function deleteProject(id: string): Promise<void> {
  await Promise.all([del(id, projects), del(id, pdfs)]);
}

export const savePdf = (id: string, data: Blob) => set(id, data, pdfs);
export const loadPdf = (id: string) => get<Blob>(id, pdfs);
