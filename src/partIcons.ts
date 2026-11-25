import * as THREE from 'three';
import { type BrickType, PLATE_H, brickGeometry, brickMaterial } from './bricks';

const SIZE = 112;

/** Renders small isometric part thumbnails with a single shared WebGL context. */
class PartIconRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private mesh = new THREE.Mesh();
  private cache = new Map<string, string>();

  private init() {
    if (this.renderer) return this.renderer;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(1);
    r.setSize(SIZE, SIZE, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-4, 8, 3);
    this.scene.add(sun, this.mesh);
    this.camera.position.setFromSphericalCoords(20, Math.acos(1 / Math.sqrt(3)), Math.PI / 4);
    this.camera.lookAt(0, 0, 0);
    this.renderer = r;
    return r;
  }

  get(t: BrickType, colorId: string): string {
    const key = `${t.id}|${colorId}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = this.init();
    this.mesh.geometry = brickGeometry(t);
    this.mesh.material = brickMaterial(colorId);
    // Fit the part: largest horizontal span projected isometrically, plus height.
    const span = Math.max(t.w, t.d) * 1.15 + t.layers * PLATE_H * 0.6 + 0.4;
    this.mesh.position.set(0, (-t.layers * PLATE_H) / 2, 0);
    this.camera.left = this.camera.bottom = -span / 2;
    this.camera.right = this.camera.top = span / 2;
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }
}

export const partIcons = new PartIconRenderer();
