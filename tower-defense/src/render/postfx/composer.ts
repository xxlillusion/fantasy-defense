// Post-processing stack (Stream B): render -> [diorama DoF, bloom, teal grade, tone map, vignette] in one EffectPass.
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, KernelSize, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { DioramaDofEffect } from './DioramaDofEffect';
import { GradeEffect } from './GradeEffect';

/** Tunables (kept in one place for the lead / polish pass). */
export const POSTFX = {
  bloom: { threshold: 0.78, smoothing: 0.3, intensity: 1.05, radius: 0.72 },
  dof: { frontFeather: 0.07, frontStrength: 1.0, farRamp: 12, farStrength: 0.72, farOffset: 1.2 },
  vignette: { offset: 0.3, darkness: 0.58 },
  grade: { desaturate: 0.14, contrast: 1.05, glow: 0.035 },
  /** MSAA samples on the scene render (geometry edges only; nearest-filtered sprites stay crisp). */
  msaa: 2,
} as const;

export interface PostFx {
  readonly composer: EffectComposer;
  readonly dof: DioramaDofEffect;
  readonly bloom: BloomEffect;
  readonly grade: GradeEffect;
  readonly vignette: VignetteEffect;
  setSize(width: number, height: number): void;
  render(dt: number): void;
  dispose(): void;
}

export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): PostFx {
  const hiDpi = renderer.getPixelRatio() > 1.25;
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: hiDpi ? 0 : POSTFX.msaa,
  });
  composer.addPass(new RenderPass(scene, camera));

  const dof = new DioramaDofEffect({ kernelSize: KernelSize.MEDIUM, resolutionScale: 0.4 });
  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: POSTFX.bloom.threshold,
    luminanceSmoothing: POSTFX.bloom.smoothing,
    intensity: POSTFX.bloom.intensity,
    radius: POSTFX.bloom.radius,
    levels: 6,
  });
  const grade = new GradeEffect(POSTFX.grade);
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  const vignette = new VignetteEffect({ offset: POSTFX.vignette.offset, darkness: POSTFX.vignette.darkness });
  composer.addPass(new EffectPass(camera, dof, bloom, grade, tone, vignette));

  return {
    composer,
    dof,
    bloom,
    grade,
    vignette,
    setSize(w, h) {
      composer.setSize(w, h, false);
    },
    render(dt) {
      composer.render(dt);
    },
    dispose() {
      composer.dispose();
      for (const e of [dof, bloom, grade, tone, vignette]) e.dispose();
    },
  };
}
