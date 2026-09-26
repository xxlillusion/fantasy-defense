// The spirit girl floating in the portal: idle bob, flinch on leaks, cheer on wave clear /
// victory, fades on defeat. Hidden on the title screen (the lineup has its own spirit).
import * as THREE from 'three';
import { tileCenter, toWorld } from '../../core/grid';
import type { GameSnapshot } from '../../core/types';
import { getMap } from '../../data';
import { getSpiritSheet, SPIRIT_FRAMES } from '../../art/sprites/spirit';
import { Billboard, sheetTexture, TEXEL, type BillboardFrame } from './billboard';
import { createGlow } from './glow';

const FLINCH = 0.6;
const CHEER = 1.6;

export class SpiritView {
  readonly root = new THREE.Group();
  private readonly billboard = new Billboard();
  private readonly glow = createGlow(0x9ff0ff, 0.5, false);
  private flinchT = 0;
  private cheerT = 0;
  private alpha = 0.9;

  constructor() {
    this.billboard.setSheet(sheetTexture(getSpiritSheet()));
    this.glow.renderOrder = 4;
    this.root.add(this.glow, this.billboard.mesh);
    this.root.visible = false;
  }

  flinch(): void {
    this.flinchT = FLINCH;
  }

  cheer(): void {
    this.cheerT = CHEER;
  }

  reset(): void {
    this.flinchT = this.cheerT = 0;
    this.alpha = 0.9;
  }

  update(s: GameSnapshot, dtReal: number, clock: number, f: BillboardFrame): void {
    let map;
    try {
      map = getMap(s.mapId);
    } catch {
      map = null;
    }
    this.root.visible = s.phase !== 'title' && !!map;
    if (!map || !this.root.visible) return;
    this.flinchT = Math.max(0, this.flinchT - dtReal);
    this.cheerT = Math.max(0, this.cheerT - dtReal);
    const target = s.phase === 'defeat' ? 0 : 0.9;
    this.alpha += (target - this.alpha) * Math.min(1, dtReal * (s.phase === 'defeat' ? 1.2 : 4));

    const p = toWorld(tileCenter(map.portal));
    const shake = this.flinchT > 0 ? (Math.floor(clock * 30) % 2 ? 1 : -1) * TEXEL * (this.flinchT / FLINCH) : 0;
    const cheering = s.phase === 'victory' || this.cheerT > 0;
    const bob = Math.sin(clock * 2.1) * 0.06 + (cheering ? Math.abs(Math.sin(clock * 7)) * 0.08 : 0);
    const y = 0.72 + bob;
    let frame: number;
    if (this.flinchT > 0) frame = SPIRIT_FRAMES.flinch;
    else if (cheering) frame = SPIRIT_FRAMES.cheer;
    else frame = Math.floor(clock * 1.5) % 2 === 0 ? SPIRIT_FRAMES.idle0 : SPIRIT_FRAMES.idle1;
    this.billboard.setFrame(frame, false);
    this.billboard.setAlpha(this.alpha);
    this.billboard.setSaturation(s.phase === 'defeat' ? 0.3 : 1);
    this.billboard.setAdd(0.08, 0.12, 0.16);
    // slightly in front of the portal plane so she never clips into it
    this.root.position.set(p.x + shake, 0, p.z + 0.35);
    this.billboard.place(0, y, 0, f);
    const pulse = 0.5 + 0.5 * Math.sin(clock * 2.6);
    this.glow.position.set(0, y + this.billboard.worldHeight(f) * 0.5, 0);
    this.glow.rotation.set(0, f.yaw, 0);
    this.glow.position.x -= Math.sin(f.yaw) * 0.05;
    this.glow.position.z -= Math.cos(f.yaw) * 0.05;
    const s2 = 1.3 + pulse * 0.15 + (cheering ? 0.3 : 0);
    this.glow.scale.set(s2, s2, 1);
    this.glow.material.opacity = (0.35 + pulse * 0.15 + (this.flinchT > 0 ? 0.3 : 0)) * (this.alpha / 0.9);
  }

  dispose(): void {
    this.billboard.dispose();
    this.glow.material.dispose();
  }
}
