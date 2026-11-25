import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  PLATE_H,
  type PlacedBrick,
  type Rotation,
  TYPE_BY_ID,
  brickGeometry,
  brickMaterial,
  footprint,
} from './bricks';

export type Tool = 'build' | 'paint' | 'erase' | 'pick';

export const PLATE_SIZE = 48;
const HALF = PLATE_SIZE / 2;
const MAX_LAYER = 300;
const ISO_POLAR = Math.acos(1 / Math.sqrt(3)); // true isometric elevation (~54.7° from vertical)

interface BuilderEvents {
  onChange: () => void;
  onPick: (typeId: string, colorId: string, rotation: Rotation) => void;
  onHistory: (canUndo: boolean, canRedo: boolean) => void;
}

export class Builder {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private baseplate: THREE.Mesh;
  private ghost: THREE.Mesh;
  private ghostMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
  private meshes = new Map<number, THREE.Mesh>();
  private occupancy = new Map<string, number>();
  private bricks = new Map<number, PlacedBrick>();
  private nextId = 1;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private resizeObs: ResizeObserver;
  private frame = 0;
  private needsRender = true;
  private down: { x: number; y: number; id: number } | null = null;
  private activePointers = new Set<number>();
  private viewSize = 30;

  tool: Tool = 'build';
  typeId = 'brick-2x4';
  colorId = 'red';
  rotated: Rotation = 0;

  constructor(private host: HTMLElement, private events: BuilderEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--stage').trim() || '#20232b');

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.setFromSphericalCoords(120, ISO_POLAR, Math.PI / 4);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minZoom = 0.3;
    this.controls.maxZoom = 6;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = {
      LEFT: -1 as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: -1 as unknown as THREE.TOUCH,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener('change', () => (this.needsRender = true));

    this.setupLights();
    this.baseplate = this.createBaseplate();

    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 10;
    this.scene.add(this.ghost);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('pointerleave', () => this.hideGhost());
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.loop();
  }

  // ---------- setup ----------

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = s.bottom = -HALF - 4;
    s.right = s.top = HALF + 4;
    s.near = 1;
    s.far = 200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
  }

  private createBaseplate(): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({ color: '#2f8a4a', roughness: 0.55 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE_SIZE, 0.2, PLATE_SIZE), mat);
    plate.position.y = -0.1;
    plate.receiveShadow = true;
    this.scene.add(plate);

    const stud = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14);
    stud.translate(0, 0.06, 0);
    const studs = new THREE.InstancedMesh(stud, mat, PLATE_SIZE * PLATE_SIZE);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let x = 0; x < PLATE_SIZE; x++) {
      for (let z = 0; z < PLATE_SIZE; z++) {
        m.makeTranslation(x - HALF + 0.5, 0, z - HALF + 0.5);
        studs.setMatrixAt(i++, m);
      }
    }
    studs.receiveShadow = true;
    studs.raycast = () => {}; // clicks resolve against the plate box
    this.scene.add(studs);
    return plate;
  }

  // ---------- render loop ----------

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const moved = this.controls.update();
    if (moved || this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const v = aspect < 1 ? this.viewSize / aspect : this.viewSize;
    this.camera.left = (-v * aspect) / 2;
    this.camera.right = (v * aspect) / 2;
    this.camera.top = v / 2;
    this.camera.bottom = -v / 2;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- view ----------

  rotateView(steps: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), (steps * Math.PI) / 4);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.needsRender = true;
  }

  resetView() {
    this.controls.target.set(0, 0, 0);
    this.camera.position.setFromSphericalCoords(120, ISO_POLAR, Math.PI / 4);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    this.needsRender = true;
  }

  zoom(factor: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, this.controls.minZoom, this.controls.maxZoom);
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  snapshot(width = 480, height = 360): string {
    const prev = this.renderer.getSize(new THREE.Vector2());
    const prevGhost = this.ghost.visible;
    this.ghost.visible = false;
    this.renderer.setSize(width, height, false);
    const cam = this.camera.clone();
    const aspect = width / height;
    // Frame the build: project its bounds into camera space.
    const box = new THREE.Box3();
    for (const m of this.meshes.values()) box.expandByObject(m);
    let size = this.viewSize;
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const offset = this.camera.position.clone().sub(this.controls.target);
      cam.position.copy(center).add(offset);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      const inv = cam.matrixWorldInverse;
      let w = 0;
      let hgt = 0;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
        w = Math.max(w, Math.abs(c.x));
        hgt = Math.max(hgt, Math.abs(c.y));
      }
      size = Math.max(6, Math.max(hgt * 2, (w * 2) / aspect) * 1.35);
    }
    cam.zoom = 1;
    cam.left = (-size * aspect) / 2;
    cam.right = (size * aspect) / 2;
    cam.top = size / 2;
    cam.bottom = -size / 2;
    cam.updateProjectionMatrix();
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL('image/webp', 0.8);
    this.renderer.setSize(prev.x, prev.y, false);
    this.ghost.visible = prevGhost;
    this.needsRender = true;
    return url;
  }

  // ---------- data ----------

  load(bricks: PlacedBrick[]) {
    this.clearAll();
    for (const b of bricks) this.addBrick({ ...b });
    this.nextId = Math.max(0, ...bricks.map((b) => b.id)) + 1;
    this.undoStack = [];
    this.redoStack = [];
    this.emitHistory();
    this.needsRender = true;
  }

  getBricks(): PlacedBrick[] {
    return [...this.bricks.values()];
  }

  get count() {
    return this.bricks.size;
  }

  private clearAll() {
    for (const mesh of this.meshes.values()) this.scene.remove(mesh);
    this.meshes.clear();
    this.bricks.clear();
    this.occupancy.clear();
  }

  private cellKey(x: number, y: number, z: number) {
    return `${x},${y},${z}`;
  }

  private forEachCell(b: Pick<PlacedBrick, 't' | 'r' | 'x' | 'y' | 'z'>, fn: (k: string) => boolean | void): boolean {
    const f = footprint(b);
    for (let i = 0; i < f.w; i++)
      for (let j = 0; j < f.d; j++)
        for (let l = 0; l < f.layers; l++) if (fn(this.cellKey(b.x + i, b.y + l, b.z + j)) === false) return false;
    return true;
  }

  private fits(b: Pick<PlacedBrick, 't' | 'r' | 'x' | 'y' | 'z'>): boolean {
    const f = footprint(b);
    if (b.x < 0 || b.z < 0 || b.x + f.w > PLATE_SIZE || b.z + f.d > PLATE_SIZE || b.y < 0 || b.y > MAX_LAYER) return false;
    return this.forEachCell(b, (k) => !this.occupancy.has(k));
  }

  private addBrick(b: PlacedBrick) {
    const t = TYPE_BY_ID.get(b.t);
    if (!t) return;
    const mesh = new THREE.Mesh(brickGeometry(t), brickMaterial(b.c));
    this.placeMesh(mesh, b);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.brickId = b.id;
    this.scene.add(mesh);
    this.meshes.set(b.id, mesh);
    this.bricks.set(b.id, b);
    this.forEachCell(b, (k) => void this.occupancy.set(k, b.id));
  }

  /** Geometry is centered on x/z, so rotate in place and offset to the footprint center. */
  private placeMesh(mesh: THREE.Object3D, b: Pick<PlacedBrick, 't' | 'r' | 'x' | 'y' | 'z'>) {
    const f = footprint(b);
    mesh.position.set(b.x - HALF + f.w / 2, b.y * PLATE_H, b.z - HALF + f.d / 2);
    mesh.rotation.y = (-b.r * Math.PI) / 2;
  }

  private removeBrick(id: number) {
    const b = this.bricks.get(id);
    if (!b) return;
    this.forEachCell(b, (k) => void this.occupancy.delete(k));
    const mesh = this.meshes.get(id)!;
    this.scene.remove(mesh);
    this.meshes.delete(id);
    this.bricks.delete(id);
  }

  // ---------- history ----------

  private commit() {
    this.undoStack.push(JSON.stringify(this.getBricks()));
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private restore(json: string) {
    const list = JSON.parse(json) as PlacedBrick[];
    this.clearAll();
    for (const b of list) this.addBrick(b);
    this.needsRender = true;
    this.events.onChange();
    this.emitHistory();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.redoStack.push(JSON.stringify(this.getBricks()));
    this.restore(prev);
  }

  redo() {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(JSON.stringify(this.getBricks()));
    this.restore(next);
  }

  clear() {
    if (!this.bricks.size) return;
    this.commit();
    this.clearAll();
    this.changed();
  }

  private emitHistory() {
    this.events.onHistory(this.undoStack.length > 0, this.redoStack.length > 0);
  }

  private changed() {
    this.needsRender = true;
    this.events.onChange();
    this.emitHistory();
  }

  // ---------- selection ----------

  setBrush(typeId: string, colorId: string) {
    this.typeId = typeId;
    this.colorId = colorId;
    this.refreshGhost();
  }

  rotateBrush() {
    this.rotated = ((this.rotated + 1) % 4) as Rotation;
    this.refreshGhost();
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.refreshGhost();
  }

  private lastHover: { x: number; y: number } | null = null;

  private refreshGhost() {
    if (this.lastHover) this.updateGhost(this.lastHover.x, this.lastHover.y);
  }

  // ---------- interaction ----------

  private setPointer(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private hit(clientX: number, clientY: number) {
    this.setPointer(clientX, clientY);
    const targets = [this.baseplate, ...this.meshes.values()];
    return this.raycaster.intersectObjects(targets, false)[0];
  }

  /** Where a brick of the current brush would go for a pointer position. */
  private placement(clientX: number, clientY: number): PlacedBrick | null {
    const h = this.hit(clientX, clientY);
    if (!h || !h.face) return null;
    const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    const p = h.point.clone().addScaledVector(normal, 0.05);
    const f = footprint({ t: this.typeId, r: this.rotated });

    let x = Math.round(p.x + HALF - f.w / 2);
    let z = Math.round(p.z + HALF - f.d / 2);
    x = THREE.MathUtils.clamp(x, 0, PLATE_SIZE - f.w);
    z = THREE.MathUtils.clamp(z, 0, PLATE_SIZE - f.d);

    let y = 0;
    const hitId = h.object.userData.brickId as number | undefined;
    if (hitId !== undefined) {
      const hb = this.bricks.get(hitId)!;
      y = normal.y > 0.5 ? hb.y + footprint(hb).layers : normal.y < -0.5 ? Math.max(0, hb.y - f.layers) : hb.y;
    }

    const candidate: PlacedBrick = { id: 0, t: this.typeId, c: this.colorId, x, y, z, r: this.rotated };
    // Fall back to the lowest free spot above if blocked.
    while (!this.fits(candidate) && candidate.y <= MAX_LAYER) candidate.y++;
    return candidate.y > MAX_LAYER ? null : candidate;
  }

  private brickAt(clientX: number, clientY: number): PlacedBrick | null {
    const h = this.hit(clientX, clientY);
    const id = h?.object.userData.brickId as number | undefined;
    return id !== undefined ? this.bricks.get(id) ?? null : null;
  }

  private updateGhost(clientX: number, clientY: number) {
    this.lastHover = { x: clientX, y: clientY };
    if (this.tool !== 'build') {
      this.ghost.visible = false;
      const target = this.brickAt(clientX, clientY);
      this.highlight(target?.id ?? null);
      this.needsRender = true;
      return;
    }
    this.highlight(null);
    const p = this.placement(clientX, clientY);
    if (!p) {
      this.hideGhost();
      return;
    }
    this.ghost.geometry = brickGeometry(TYPE_BY_ID.get(p.t)!);
    this.ghostMat.color.set(brickMaterial(p.c).color);
    this.placeMesh(this.ghost, p);
    this.ghost.visible = true;
    this.needsRender = true;
  }

  private highlighted: number | null = null;

  private highlight(id: number | null) {
    if (this.highlighted === id) return;
    if (this.highlighted !== null) {
      const m = this.meshes.get(this.highlighted);
      const b = this.bricks.get(this.highlighted);
      if (m && b) m.material = brickMaterial(b.c);
    }
    this.highlighted = id;
    if (id !== null) {
      const m = this.meshes.get(id)!;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.emissive.set(this.tool === 'erase' ? '#ff3b30' : '#ffffff');
      mat.emissiveIntensity = this.tool === 'erase' ? 0.6 : 0.25;
      m.material = mat;
    }
  }

  private hideGhost() {
    this.lastHover = null;
    this.ghost.visible = false;
    this.highlight(null);
    this.needsRender = true;
  }

  private act(clientX: number, clientY: number) {
    if (this.tool === 'build') {
      const p = this.placement(clientX, clientY);
      if (!p) return;
      this.commit();
      p.id = this.nextId++;
      this.addBrick(p);
      this.changed();
    } else {
      const b = this.brickAt(clientX, clientY);
      if (!b) return;
      if (this.tool === 'pick') {
        this.typeId = b.t;
        this.colorId = b.c;
        this.rotated = b.r;
        this.events.onPick(b.t, b.c, b.r);
        return;
      }
      this.highlight(null);
      this.commit();
      this.removeBrick(b.id);
      if (this.tool === 'paint') this.addBrick({ ...b, c: this.colorId });
      this.changed();
    }
    this.updateGhost(clientX, clientY);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.activePointers.add(e.pointerId);
    if (e.button === 0 && this.activePointers.size === 1) this.down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    else {
      this.down = null; // multi-touch gesture = camera
      this.hideGhost();
    }
    if (this.down && e.pointerType !== 'mouse') this.updateGhost(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent) => {
    // Mouse: hover preview. Touch/pen: drag one finger to aim, lift to place.
    if (e.pointerType === 'mouse' || (this.down && this.down.id === e.pointerId)) this.updateGhost(e.clientX, e.clientY);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    const d = this.down;
    this.down = null;
    if (!d || d.id !== e.pointerId) return;
    if (e.pointerType === 'mouse' && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    this.act(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') this.hideGhost();
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    this.down = null;
    this.hideGhost();
  };
}
