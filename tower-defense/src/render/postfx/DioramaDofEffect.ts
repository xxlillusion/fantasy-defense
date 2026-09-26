// "Miniature diorama" depth of field:
//  - foreground: everything below the playfield's front edge on screen is blurred (screen-space band),
//    so sprites standing on the front row stay sharp while the grass strip in front melts away;
//  - background: softened by view depth beyond the back of the playfield (waterfall, cliffs, forest).
// One half-resolution Kawase blur is shared by both masks.
import { SRGBColorSpace, Uniform, WebGLRenderTarget, type Texture, type TextureDataType, type WebGLRenderer } from 'three';
import { Effect, EffectAttribute, KawaseBlurPass, KernelSize, Resolution } from 'postprocessing';

const frag = /* glsl */ `
uniform sampler2D uBlur;
uniform float uFrontY;
uniform float uFrontFeather;
uniform float uFrontStrength;
uniform float uFarStart;
uniform float uFarEnd;
uniform float uFarStrength;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float dist = -getViewZ(depth);
  float nearMask = (1.0 - smoothstep(uFrontY - uFrontFeather, uFrontY, uv.y)) * uFrontStrength;
  float farMask = smoothstep(uFarStart, uFarEnd, dist) * uFarStrength;
  float m = max(nearMask, farMask);
  vec3 blurred = texture2D(uBlur, uv).rgb;
  outputColor = vec4(mix(inputColor.rgb, blurred, m), inputColor.a);
}
`;

export interface DioramaDofOptions {
  kernelSize?: KernelSize;
  resolutionScale?: number;
}

export class DioramaDofEffect extends Effect {
  readonly blurPass: KawaseBlurPass;
  readonly resolution: Resolution;
  private readonly renderTarget: WebGLRenderTarget;

  constructor({ kernelSize = KernelSize.LARGE, resolutionScale = 0.5 }: DioramaDofOptions = {}) {
    super('DioramaDofEffect', frag, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uBlur', new Uniform(null)],
        ['uFrontY', new Uniform(0.1)],
        ['uFrontFeather', new Uniform(0.06)],
        ['uFrontStrength', new Uniform(1)],
        ['uFarStart', new Uniform(40)],
        ['uFarEnd', new Uniform(55)],
        ['uFarStrength', new Uniform(0.7)],
      ]),
    });
    this.renderTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.renderTarget.texture.name = 'DioramaDof.Blur';
    this.uniforms.get('uBlur')!.value = this.renderTarget.texture as Texture;
    this.blurPass = new KawaseBlurPass({ kernelSize, resolutionScale });
    const resolution = (this.resolution = new Resolution(this, Resolution.AUTO_SIZE, Resolution.AUTO_SIZE, resolutionScale));
    resolution.addEventListener('change', () => this.setSize(resolution.baseWidth, resolution.baseHeight));
  }

  /** Screen UV y of the playfield front edge (0 = bottom) and feather width in UV. */
  setFront(y: number, feather: number, strength: number): void {
    this.uniforms.get('uFrontY')!.value = y;
    this.uniforms.get('uFrontFeather')!.value = feather;
    this.uniforms.get('uFrontStrength')!.value = strength;
  }

  /** View-depth range where the background blur ramps in, and its max mix. */
  setFar(start: number, end: number, strength: number): void {
    this.uniforms.get('uFarStart')!.value = start;
    this.uniforms.get('uFarEnd')!.value = end;
    this.uniforms.get('uFarStrength')!.value = strength;
  }

  override update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget): void {
    this.blurPass.render(renderer, inputBuffer, this.renderTarget);
  }

  override setSize(width: number, height: number): void {
    const resolution = this.resolution;
    resolution.setBaseSize(width, height);
    this.renderTarget.setSize(resolution.width, resolution.height);
    this.blurPass.resolution.copy(resolution);
  }

  override initialize(renderer: WebGLRenderer, alpha: boolean, frameBufferType: number): void {
    this.blurPass.initialize(renderer, alpha, frameBufferType);
    if (frameBufferType !== undefined) {
      this.renderTarget.texture.type = frameBufferType as TextureDataType;
      if (renderer !== null && renderer.outputColorSpace === SRGBColorSpace) this.renderTarget.texture.colorSpace = SRGBColorSpace;
    }
  }

  override dispose(): void {
    this.renderTarget.dispose();
    this.blurPass.dispose();
    super.dispose();
  }
}
