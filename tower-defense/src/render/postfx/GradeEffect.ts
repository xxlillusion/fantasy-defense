// Cool color grade that leaves saturated (character) colors mostly untouched. Runs in linear HDR
// before tone mapping. v2: per-theme split-tone setters, a global tint (Frost Nova), an edge tint
// (Gold Rush) and a fade-to-dark used for map transitions.
import { Color, Uniform, Vector3 } from 'three';
import { Effect } from 'postprocessing';

const frag = /* glsl */ `
uniform float uStrength;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uDesat;
uniform float uContrast;
uniform float uGlow;
uniform vec3 uTint;
uniform vec3 uEdgeTint;
uniform float uFade;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 1e-4);
  // desaturate only already-muted colors (environment); saturated sprites keep their punch
  float d = uDesat * (1.0 - smoothstep(0.3, 0.7, sat));
  c = mix(c, vec3(l), d);
  // split tone: tinted lift in the shadows, tinted highlights
  float sh = 1.0 - smoothstep(0.0, 0.3, l);
  c += uShadowTint * sh * uStrength;
  c = mix(c, c * uHighlightTint, smoothstep(0.25, 1.0, l) * uStrength * (1.0 - sat * 0.7));
  // gentle contrast around mid grey (linear)
  c = 0.18 * pow(max(c / 0.18, 0.0), vec3(uContrast));
  // slight overall glow / bloom-ish lift
  c += uGlow * l * l;
  // ability ambience: global tint and a soft edge glow
  c *= uTint;
  vec2 e = (uv - 0.5) * vec2(1.25, 1.0);
  float edge = smoothstep(0.28, 0.72, length(e));
  c += uEdgeTint * edge * (0.35 + l);
  // transition fade
  c *= 1.0 - uFade;
  outputColor = vec4(c, inputColor.a);
}
`;

export interface GradeOptions {
  strength?: number;
  shadowTint?: Color;
  highlightTint?: Color;
  desaturate?: number;
  contrast?: number;
  glow?: number;
}

export class GradeEffect extends Effect {
  constructor(o: GradeOptions = {}) {
    const hl = o.highlightTint ?? new Color(0.96, 1.0, 1.03);
    super('GradeEffect', frag, {
      uniforms: new Map<string, Uniform>([
        ['uStrength', new Uniform(o.strength ?? 1)],
        ['uShadowTint', new Uniform((o.shadowTint ? new Vector3(o.shadowTint.r, o.shadowTint.g, o.shadowTint.b) : new Vector3(0.0, 0.012, 0.018)))],
        ['uHighlightTint', new Uniform(new Vector3(hl.r, hl.g, hl.b))],
        ['uDesat', new Uniform(o.desaturate ?? 0.12)],
        ['uContrast', new Uniform(o.contrast ?? 1.06)],
        ['uGlow', new Uniform(o.glow ?? 0.04)],
        ['uTint', new Uniform(new Vector3(1, 1, 1))],
        ['uEdgeTint', new Uniform(new Vector3(0, 0, 0))],
        ['uFade', new Uniform(0)],
      ]),
    });
  }

  set strength(v: number) {
    this.uniforms.get('uStrength')!.value = v;
  }
  set desaturate(v: number) {
    this.uniforms.get('uDesat')!.value = v;
  }
  set contrast(v: number) {
    this.uniforms.get('uContrast')!.value = v;
  }
  set glow(v: number) {
    this.uniforms.get('uGlow')!.value = v;
  }
  /** Additive lift in the shadows (linear RGB, small values ~0.01). */
  setShadowTint(r: number, g: number, b: number): void {
    (this.uniforms.get('uShadowTint')!.value as Vector3).set(r, g, b);
  }
  /** Multiplier on highlights (linear RGB, ~1). */
  setHighlightTint(r: number, g: number, b: number): void {
    (this.uniforms.get('uHighlightTint')!.value as Vector3).set(r, g, b);
  }
  /** Global multiplier on the whole image (1,1,1 = none). */
  setTint(r: number, g: number, b: number): void {
    (this.uniforms.get('uTint')!.value as Vector3).set(r, g, b);
  }
  /** Additive color toward the screen edges (0,0,0 = none). */
  setEdgeTint(r: number, g: number, b: number): void {
    (this.uniforms.get('uEdgeTint')!.value as Vector3).set(r, g, b);
  }
  /** 0 = normal, 1 = black. */
  set fade(v: number) {
    this.uniforms.get('uFade')!.value = v;
  }
}
