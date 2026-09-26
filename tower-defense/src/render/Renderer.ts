// Lead-owned. Creates the shared Three.js host and composes Environment (B) + Entities (C).
import * as THREE from 'three';
import type { EventBus } from '../core/events';
import { toWorld } from '../core/grid';
import type { IEntities, IEnvironment, IRendererView, PlacementGhost, RendererHost, Selection } from '../core/interfaces';
import type { GameSnapshot, TileCoord, Vec2 } from '../core/types';

export class Renderer implements IRendererView {
  readonly host: RendererHost;
  private readonly tmp = new THREE.Vector3();

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly env: IEnvironment,
    private readonly entities: IEntities,
    events: EventBus,
  ) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 500);
    const layers = {
      environment: new THREE.Group(),
      entities: new THREE.Group(),
      vfx: new THREE.Group(),
      overlay: new THREE.Group(),
    };
    for (const [name, g] of Object.entries(layers)) {
      g.name = name;
      scene.add(g);
    }
    this.host = { renderer, scene, camera, layers };

    env.init(this.host);
    entities.init(this.host, events);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return; // hidden pane/tab: keep the last good size
    this.host.renderer.setSize(w, h, false);
    this.host.camera.aspect = w / h;
    this.host.camera.updateProjectionMatrix();
    this.env.resize(w, h);
  }

  render(snapshot: GameSnapshot, dtReal: number): void {
    this.env.update(snapshot, dtReal);
    this.entities.update(snapshot, dtReal);
    this.env.render(dtReal);
  }

  pickTile(clientX: number, clientY: number): TileCoord | null {
    return this.env.pickTile(clientX, clientY);
  }

  setPlacementGhost(ghost: PlacementGhost | null): void {
    this.env.setPlacementGhost(ghost);
  }

  setSelection(selection: Selection | null): void {
    this.env.setSelection(selection);
  }

  worldToScreen(pos: Vec2, height = 0): { x: number; y: number; visible: boolean } {
    const w = toWorld(pos, height);
    const v = this.tmp.set(w.x, w.y, w.z).project(this.host.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      visible: v.z > -1 && v.z < 1,
    };
  }
}
