// Small pixel HP bars floating above enemies (and the hero), with optional shield pips.
import * as THREE from 'three';
import { TEXEL } from './billboard';

const plane = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
const bgMat = new THREE.MeshBasicMaterial({ color: 0x1a1024, depthWrite: false, transparent: true, opacity: 0.85 });
const backMat = new THREE.MeshBasicMaterial({ color: 0x4a1a28, depthWrite: false });
const pipMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff, depthWrite: false });
const pipBgMat = new THREE.MeshBasicMaterial({ color: 0x10283a, depthWrite: false });

const HIGH = new THREE.Color(0x5ef05a);
const MID = new THREE.Color(0xffd23a);
const LOW = new THREE.Color(0xff3a3a);
const BOSS = new THREE.Color(0xff4a8a);

const MAX_PIPS = 4;

export type HpBarStyle = 'enemy' | 'boss' | 'hero';

export class HpBar {
  readonly group = new THREE.Group();
  private readonly back: THREE.Mesh;
  private readonly fill: THREE.Mesh;
  private readonly fillMat = new THREE.MeshBasicMaterial({ color: 0x5ef05a, depthWrite: false });
  private readonly pips: THREE.Mesh[] = [];
  private readonly pipBgs: THREE.Mesh[] = [];
  private widthTexels = 18;
  private style: HpBarStyle = 'enemy';

  constructor() {
    const bg = new THREE.Mesh(plane, bgMat);
    this.back = new THREE.Mesh(plane, backMat);
    this.fill = new THREE.Mesh(plane, this.fillMat);
    bg.renderOrder = 20;
    this.back.renderOrder = 21;
    this.fill.renderOrder = 22;
    this.back.position.z = 0.001;
    this.fill.position.z = 0.002;
    this.group.add(bg, this.back, this.fill);
    for (let i = 0; i < MAX_PIPS; i++) {
      const pb = new THREE.Mesh(plane, pipBgMat);
      const p = new THREE.Mesh(plane, pipMat);
      pb.renderOrder = 20;
      p.renderOrder = 22;
      pb.scale.set(4 * TEXEL, 4 * TEXEL, 1);
      p.scale.set(2 * TEXEL, 2 * TEXEL, 1);
      p.position.z = 0.002;
      pb.visible = p.visible = false;
      this.pips.push(p);
      this.pipBgs.push(pb);
      this.group.add(pb, p);
    }
    this.group.visible = false;
    for (const m of this.group.children) m.frustumCulled = false;
    this.setStyle('enemy', 18);
  }

  setStyle(style: HpBarStyle | boolean, widthTexels: number): void {
    this.style = typeof style === 'boolean' ? (style ? 'boss' : 'enemy') : style;
    this.widthTexels = widthTexels;
    const w = widthTexels * TEXEL;
    const h = (this.style === 'enemy' ? 3 : 4) * TEXEL;
    const inner = h - 2 * TEXEL;
    const bg = this.group.children[0]!;
    bg.scale.set(w + 2 * TEXEL, h, 1);
    bg.position.x = -w / 2 - TEXEL;
    this.back.scale.set(w, inner, 1);
    this.back.position.x = -w / 2;
    this.fill.scale.set(w, inner, 1);
    this.fill.position.x = -w / 2;
  }

  /** Shield hits shown as little cyan pips above the bar (0 hides them). */
  setPips(n: number): void {
    const count = Math.min(MAX_PIPS, Math.max(0, n));
    const step = 4 * TEXEL;
    const x0 = -(count * step) / 2;
    for (let i = 0; i < MAX_PIPS; i++) {
      const on = i < count;
      this.pips[i]!.visible = this.pipBgs[i]!.visible = on;
      if (!on) continue;
      this.pipBgs[i]!.position.set(x0 + i * step, 4 * TEXEL, 0);
      this.pips[i]!.position.set(x0 + i * step + TEXEL, 4 * TEXEL, 0.002);
    }
  }

  /** ratio in 0..1. Position is the bar's center in world space. */
  update(ratio: number, x: number, y: number, z: number, camera: THREE.Camera): void {
    const r = Math.max(0, Math.min(1, ratio));
    const w = this.widthTexels * TEXEL;
    const px = Math.max(r > 0 ? 1 : 0, Math.round(r * this.widthTexels));
    this.fill.scale.x = Math.max(1e-4, px * TEXEL);
    this.fill.visible = px > 0;
    this.fill.position.x = -w / 2;
    if (this.style === 'boss') this.fillMat.color.copy(BOSS);
    else if (this.style === 'hero') this.fillMat.color.copy(LOW).lerp(HIGH, r);
    else if (r > 0.6) this.fillMat.color.copy(HIGH);
    else if (r > 0.3) this.fillMat.color.copy(MID);
    else this.fillMat.color.copy(LOW);
    this.group.position.set(x, y, z);
    this.group.quaternion.copy(camera.quaternion);
  }

  dispose(): void {
    this.fillMat.dispose();
  }
}
