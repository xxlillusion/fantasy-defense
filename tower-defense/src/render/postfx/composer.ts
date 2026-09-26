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

/** Per-theme post settings (the shrine values equal POSTFX). */
export interface PostSpec {
  readonly bloom: { readonly threshold: number; readonly intensity: number; readonly radius: number };
  readonly grade: {
    readonly shadowTint: readonly [number, number, number];
    readonly highlightTint: readonly [number, number, number];
    readonly desaturate: number;
    readonly contrast: number;
    readonly glow: number;
  };
  readonly vignette: { readonly offset: number; readonly darkness: number };
}

export const SHRINE_POST: PostSpec = {
  bloom: { threshold: POSTFX.bloom.threshold, intensity: POSTFX.bloom.intensity, radius: POSTFX.bloom.radius },
  grade: { shadowTint: [0.0, 0.012, 0.018], highlightTint: [0.96, 1.0, 1.03], desaturate: POSTFX.grade.desaturate, contrast: POSTFX.grade.contrast, glow: POSTFX.grade.glow },
  vignette: { offset: POSTFX.vignette.offset, darkness: POSTFX.vignette.darkness },
};

/** Re-apply a theme's post settings on the existing composer (no reallocation). */
export function applyPostSpec(post: PostFx, spec: PostSpec): void {
  post.bloom.luminanceMaterial.threshold = spec.bloom.threshold;
  post.bloom.intensity = spec.bloom.intensity;
  post.bloom.mipmapBlurPass.radius = spec.bloom.radius;
  post.grade.setShadowTint(...spec.grade.shadowTint);
  post.grade.setHighlightTint(...spec.grade.highlightTint);
  post.grade.desaturate = spec.grade.desaturate;
  post.grade.contrast = spec.grade.contrast;
  post.grade.glow = spec.grade.glow;
  post.vignette.offset = spec.vignette.offset;
  post.vignette.darkness = spec.vignette.darkness;
}

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
