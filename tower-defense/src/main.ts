// Lead-owned bootstrap: wires all modules and runs the fixed-timestep loop.
//
// Dev switch: `?stub=sim,env,entities,ui,audio,save` forces the listed modules to use the
// lead's stubs (useful while another stream's module is mid-refactor).
import { createAudio } from './audio';
import { EventBus } from './core/events';
import { SIM_DT } from './core/grid';
import type { UiContext } from './core/interfaces';
import type { GameSnapshot } from './core/types';
import { Renderer } from './render/Renderer';
import { createEntities } from './render/entities';
import { createEnvironment } from './render/scene';
import { createSaveStore } from './save';
import { createSimulation } from './sim';
import { createStubAudio, createStubSaveStore } from './stubs/stubAudioSave';
import { createStubEntities } from './stubs/stubEntities';
import { createStubEnvironment } from './stubs/stubEnvironment';
import { createStubSimulation } from './stubs/stubSimulation';
import { createStubUi } from './stubs/stubUi';
import { createUi } from './ui';

const stubbed = new Set((new URLSearchParams(location.search).get('stub') ?? '').split(',').filter(Boolean));
const pick = <T>(name: string, real: T, stub: T): T => (stubbed.has(name) ? stub : real);

const events = new EventBus();
const save = pick('save', createSaveStore, createStubSaveStore)();
const settings = save.getSettings();
const audio = pick('audio', createAudio, createStubAudio)();
audio.init(events, settings.audio);

const sim = pick('sim', createSimulation, createStubSimulation)(events);
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas, pick('env', createEnvironment, createStubEnvironment)(), pick('entities', createEntities, createStubEntities)(), events);

let snapshot: GameSnapshot = sim.snapshot();
const ui = pick('ui', createUi, createStubUi)();
const ctx: UiContext = {
  root: document.getElementById('ui-root')!,
  commands: sim,
  events,
  view: renderer,
  audio,
  save,
  getSnapshot: () => snapshot,
};
ui.init(ctx);

// Persist results (per map / difficulty / mode). Read the options from the live sim state, because
// the frame snapshot may lag one step behind the event.
events.on('gameOver', ({ result, stars, score, wave }) => {
  const s = sim.snapshot();
  save.recordRun(s.mapId, s.difficulty, s.mode, { stars: result === 'victory' ? stars : 0, score, wave });
});

// Settings that non-UI modules read (e.g. the environment's screen shake). Kept in sync on save.
const settingsHost = window as unknown as { __tdSettings: ReturnType<typeof save.getSettings> };
settingsHost.__tdSettings = save.getSettings();
const saveSettings = save.saveSettings.bind(save);
save.saveSettings = (s) => {
  saveSettings(s);
  settingsHost.__tdSettings = save.getSettings();
};

// Hit-stop: a brief slow-motion beat when a boss dies (real-time, independent of game speed).
const HIT_STOP = { scale: 0.3, duration: 0.35 };
let hitStop = 0;
events.on('enemyKilled', ({ kind }) => {
  if (kind === 'boss' || kind === 'dragon') hitStop = HIT_STOP.duration;
});

// Fixed-timestep loop: sim at SIM_DT, speed multiplier = more steps per real second.
const MAX_STEPS_PER_FRAME = 20;
let acc = 0;
let last = performance.now();

function frame(now: number) {
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  snapshot = sim.snapshot();
  if (!snapshot.paused && (snapshot.phase === 'build' || snapshot.phase === 'wave')) {
    const timeScale = hitStop > 0 ? HIT_STOP.scale : 1;
    hitStop = Math.max(0, hitStop - dtReal);
    acc += dtReal * snapshot.speed * timeScale;
    let steps = 0;
    while (acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      sim.step(SIM_DT);
      acc -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    snapshot = sim.snapshot();
  } else {
    acc = 0;
  }
  renderer.render(snapshot, dtReal);
  ui.update(snapshot, dtReal);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for the console / automated checks.
(window as unknown as { __td: unknown }).__td = { sim, events, renderer, getSnapshot: () => snapshot };
