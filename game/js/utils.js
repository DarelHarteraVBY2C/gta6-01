// Small math and random helpers shared by every Solmar Bay module.
// No dependencies, no network, pure deterministic functions.
export const TAU = Math.PI * 2;

/** Mulberry32: a tiny seeded PRNG so the city and staged scenes are deterministic. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max) from the given rng function. */
export function rand(rng, min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max] from the given rng function. */
export function randi(rng, min, max) {
  return Math.floor(rand(rng, min, max + 1));
}

/** Pick one element of an array with the given rng function. */
export function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angle difference from `from` to `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Turn `angle` toward `target` by at most `maxStep` radians. */
export function angleLerp(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** True when circle (x, y, r) overlaps axis-aligned rect. */
export function circleHitsRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  return dist2(x, y, cx, cy) < r * r;
}

/** Push a circle out of a rect; returns the corrected {x, y} or null when clear. */
export function pushCircleOutOfRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
  }
  // Centre is inside the rect: push out along the smallest penetration axis.
  const left = x - rect.x;
  const right = rect.x + rect.w - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.h - y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: rect.x - r, y };
  if (min === right) return { x: rect.x + rect.w + r, y };
  if (min === top) return { x, y: rect.y - r };
  return { x, y: rect.y + rect.h + r };
}

/** Format a cash amount as "$1,250". */
export function money(amount) {
  return '$' + Math.floor(amount).toLocaleString('en-US');
}

/** Format seconds as "M:SS". */
export function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/** Darken (f < 1) or lighten (f > 1) a #rrggbb hex color. */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
