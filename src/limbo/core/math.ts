export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const sign = (v: number) => (v < 0 ? -1 : 1);
export const dist2 = (ax: number, ay: number, bx: number, by: number) => { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
export const distSq2 = (ax: number, ay: number, bx: number, by: number) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

/** Wrap angle to (-PI, PI] */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function angleDiff(a: number, b: number) { return wrapAngle(b - a); }
export function dampAngle(a: number, b: number, lambda: number, dt: number) {
  return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
}
export function approach(v: number, target: number, step: number) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}

export function fmtTime(hours: number): string {
  const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
export function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
