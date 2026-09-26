// Lead-owned STUB. Flat colored tile grid, basic light, plain render. Stream B replaces with src/render/scene/.
import * as THREE from 'three';
import { fromWorld, GRID_COLS, GRID_ROWS, inBounds, tileAt, tileCenter, toWorld } from '../core/grid';
import type { IEnvironment, PlacementGhost, RendererHost, Selection } from '../core/interfaces';
import type { GameSnapshot } from '../core/types';
import { getMap, tileType, type TileType } from '../data';

const COLORS: Record<TileType, number> = {
  grass: 0x4f7a5a,
  path: 0x8d9aa0,
  portal: 0x5fe6ff,
  statue: 0x5a6878,
  tree: 0x2d4a36,
  rock: 0x6b6f73,
  lava: 0xd0501a,
};

export function createStubEnvironment(): IEnvironment {
  let host: RendererHost;
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let ghostMesh: THREE.Mesh;
  let ringMesh: THREE.Mesh;
  let selRing: THREE.Mesh;

  function makeRing(color: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    m.visible = false;
    return m;
  }

  return {
    init(h, _events) {
      host = h;
      const { camera, scene, layers } = h;
      camera.fov = 30;
      camera.position.set(0, 17, 21);
      camera.lookAt(0, 0, 0.8);
      camera.updateProjectionMatrix();
      scene.background = new THREE.Color(0x1d2b30);
      scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x203020, 1.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(-5, 10, 5);
      scene.add(sun);

      const map = getMap();
      const geo = new THREE.BoxGeometry(0.96, 0.1, 0.96);
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const type = tileType(map, { col, row }) ?? 'grass';
          const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: COLORS[type] }));
          const w = toWorld(tileCenter({ col, row }), -0.05);
          mesh.position.set(w.x, w.y, w.z);
          layers.environment.add(mesh);
        }
      }
      ghostMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, depthWrite: false }));
      ghostMesh.visible = false;
      ringMesh = makeRing(0xffffff);
      selRing = makeRing(0xffd966);
      layers.overlay.add(ghostMesh, ringMesh, selRing);
    },
    update(_s: GameSnapshot, _dt: number) {},
    render() {
      host.renderer.render(host.scene, host.camera);
    },
    resize() {},
    pickTile(clientX, clientY) {
      const rect = host.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, host.camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
      const t = tileAt(fromWorld(hit.x, hit.z));
      return inBounds(t) ? t : null;
    },
    pickPoint(clientX, clientY) {
      const rect = host.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, host.camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
      return fromWorld(hit.x, hit.z);
    },
    setMapPreview() {},
    setTitleMode() {},
    setPlacementGhost(g: PlacementGhost | null) {
      ghostMesh.visible = ringMesh.visible = !!g;
      if (!g) return;
      if (g.type !== 'tower') {
        const center = g.point;
        const w = toWorld(center, 0.02);
        ghostMesh.position.set(w.x, w.y, w.z);
        (ghostMesh.material as THREE.MeshBasicMaterial).color.set(g.valid ? 0x66ccff : 0xff3344);
        ringMesh.position.set(w.x, 0.03, w.z);
        ringMesh.scale.setScalar(g.type === 'ability' ? Math.max(0.3, g.radius) : 0.4);
        return;
      }
      const w = toWorld(tileCenter(g.tile), 0.02);
      ghostMesh.position.set(w.x, w.y, w.z);
      (ghostMesh.material as THREE.MeshBasicMaterial).color.set(g.valid ? 0x00ff66 : 0xff3344);
      ringMesh.position.set(w.x, 0.03, w.z);
      ringMesh.scale.setScalar(g.range);
    },
    setSelection(s: Selection | null) {
      selRing.visible = !!s;
      if (!s) return;
      const w = toWorld(tileCenter(s.tile), 0.03);
      selRing.position.set(w.x, w.y, w.z);
      selRing.scale.setScalar(s.range);
    },
    dispose() {},
  };
}
