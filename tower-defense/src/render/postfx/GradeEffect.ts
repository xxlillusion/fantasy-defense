// Cool teal color grade that leaves saturated (character) colors mostly untouched.
// Runs in linear HDR before tone mapping.
import { Color, Uniform, Vector3 } from 'three';
import { Effect } from 'postprocessing';

const frag = /* glsl */ `
uniform float uStrength;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uDesat;
uniform float uContrast;
uniform float uGlow;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = max(inputColor.rgb, 0.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 1e-4);
  // desaturate only already-muted colors (environment); saturated sprites keep their punch
  float d = uDesat * (1.0 - smoothstep(0.3, 0.7, sat));
  c = mix(c, vec3(l), d);
  // split tone: teal lift in the shadows, cool-neutral highlights
  float sh = 1.0 - smoothstep(0.0, 0.3, l);
  c += uShadowTint * sh * uStrength;
  c = mix(c, c * uHighlightTint, smoothstep(0.25, 1.0, l) * uStrength * (1.0 - sat * 0.7));
  // gentle contrast around mid grey (linear)
  c = 0.18 * pow(max(c / 0.18, 0.0), vec3(uContrast));
  // slight overall glow / bloom-ish lift
  c += uGlow * l * l;
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
}
