// Solmar Bay lighting: a slow, deterministic Golden Hour -> Neon Night
// cycle that is AMBIENT ONLY — it never touches mission logic, wanted
// levels, or spawn rules. The phase comes from the game clock, so the same
// seed and the same play time always give the same light. Screenshots pin
// one phase each (night for the cover, golden hour for the beach bike),
// so every staged frame is reproducible.
//
// A phase is a small bundle of numbers the renderer consumes: how dark the
// world overlay is, the sky wash, how strong the vignette and the sun/moon
// glare read, and whether headlights and siren halos switch on.
import { clamp, lerp } from './utils.js';

export const CYCLE_SECONDS = 360;

// Keyframes across one loop: golden hour holds, dusk slides in, neon night
// holds long, then the loop rolls back to golden. Colors are [r, g, b].
const KEYS = [
  { at: 0.0, name: 'golden', darkness: 0, wash: [232, 176, 106], vignette: 0.3, glare: 0.22, glareRgb: [255, 205, 125] },
  { at: 0.25, name: 'golden', darkness: 0, wash: [232, 176, 106], vignette: 0.3, glare: 0.22, glareRgb: [255, 205, 125] },
  { at: 0.42, name: 'dusk', darkness: 0.38, wash: [214, 140, 92], vignette: 0.26, glare: 0.12, glareRgb: [255, 158, 108] },
  { at: 0.55, name: 'night', darkness: 1, wash: [35, 44, 74], vignette: 0.2, glare: 0.06, glareRgb: [150, 180, 255] },
  { at: 0.86, name: 'night', darkness: 1, wash: [35, 44, 74], vignette: 0.2, glare: 0.06, glareRgb: [150, 180, 255] },
  { at: 1.0, name: 'golden', darkness: 0, wash: [232, 176, 106], vignette: 0.3, glare: 0.22, glareRgb: [255, 205, 125] },
];

function mix3(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function rgb(c) {
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

function rgba(c, a) {
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
}

export class Lighting {
  constructor() {
    this.pinned = null; // a phase name, or null to follow the clock
  }

  /** Freeze the light at one phase (used by the screenshot stager). */
  pin(name) {
    if (KEYS.some((k) => k.name === name)) this.pinned = name;
  }

  clearPin() {
    this.pinned = null;
  }

  /** The phase at game time `t` (seconds), or the pinned phase. */
  phaseAt(t) {
    if (this.pinned) return this.phaseNamed(this.pinned);
    const f = ((t % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS / CYCLE_SECONDS;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].at <= f) i += 1;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const span = b.at - a.at || 1;
    const u = clamp((f - a.at) / span, 0, 1);
    return this.blend(a, b, u);
  }

  /** The phase for a name: the first keyframe that carries it. */
  phaseNamed(name) {
    const k = KEYS.find((key) => key.name === name) || KEYS[0];
    return this.blend(k, k, 0);
  }

  blend(a, b, u) {
    const wash = mix3(a.wash, b.wash, u);
    const glareRgb = mix3(a.glareRgb, b.glareRgb, u);
    const darkness = lerp(a.darkness, b.darkness, u);
    const name = u < 0.5 ? a.name : b.name;
    return {
      name,
      darkness,
      wash: rgb(wash),
      washRgb: wash,
      vignette: lerp(a.vignette, b.vignette, u),
      glare: lerp(a.glare, b.glare, u),
      glareRgb,
      glareCss: (alpha) => rgba(glareRgb, alpha),
      headlights: darkness > 0.45,
      siren: darkness > 0.3 ? clamp((darkness - 0.3) / 0.7, 0, 1) : 0,
    };
  }
}
