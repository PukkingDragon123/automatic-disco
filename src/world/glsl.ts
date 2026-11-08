// Shared GLSL snippets for the world shaders: hashing / value noise / bayer dither, fog of war, and the wind field.

export const SHADER_NOISE = /* glsl */`
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float bayer4(vec2 p) { vec2 q = mod(floor(p), 4.0); float i = q.x + q.y * 4.0;
  return (i == 0.0 ? 0.0 : i == 1.0 ? 8.0 : i == 2.0 ? 2.0 : i == 3.0 ? 10.0 : i == 4.0 ? 12.0 : i == 5.0 ? 4.0 : i == 6.0 ? 14.0 : i == 7.0 ? 6.0 :
          i == 8.0 ? 3.0 : i == 9.0 ? 11.0 : i == 10.0 ? 1.0 : i == 11.0 ? 9.0 : i == 12.0 ? 15.0 : i == 13.0 ? 7.0 : i == 14.0 ? 13.0 : 5.0) / 16.0 + 1.0 / 32.0; }
`;

/** fog-of-war application shared by world shaders: needs uVis, uN, uDark */
export const FOW_FN = /* glsl */`
vec3 applyFow(vec3 c, vec3 wp) {
  vec2 px = floor(wp.xz * 8.0);
  vec2 v = texture2D(uVis, (px + 0.5) / 8.0 / uN).rg;
  float d = bayer4(px) * 0.5 + 0.25;
  if (v.g < d) return uDark;
  if (v.r < d) { float l = dot(c, vec3(0.3, 0.59, 0.11)); return mix(vec3(l), c, 0.5) * 0.42 + uDark * 0.4; }
  return c;
}
`;

/**
 * The wind field shared by grass, plants and trees (needs SHADER_NOISE, uTime, uWindDir, uWind). Gusts are patches
 * of noise drifting downwind, so a gust is seen to roll across a meadow; a slower swell runs through them and a
 * little cross-flow keeps the field from moving in lockstep. Returns the push (m per m of height) in xy and the
 * local gust strength in z.
 */
export const WIND_FN = /* glsl */`
uniform vec2 uWindDir; uniform float uWind;
vec3 windAt(vec2 p, float t) {
  vec2 d = uWindDir;
  vec2 q = p * 0.05 - d * t * 0.3;
  float g = vn(q) * 0.62 + vn(q * 2.3 + 7.3) * 0.38;
  float gust = smoothstep(0.34, 0.8, g);
  float swell = 0.5 + 0.5 * sin(dot(p, d) * 0.42 - t * 2.2 + vn(p * 0.11) * 4.0);
  float s = uWind * (0.16 + gust * (0.62 + 0.38 * swell));
  vec2 side = vec2(-d.y, d.x) * (vn(p * 0.27 + t * 0.55) - 0.5) * 0.5 * gust;
  return vec3(d * s + side * uWind, gust);
}
`;
