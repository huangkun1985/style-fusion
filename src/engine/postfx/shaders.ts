// 片段著色器庫（WebGL2 / GLSL ES 3.00）。每個特效是一個 main()，共用 HEADER 內的 uniform 與工具函數。

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const HEADER = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uAux;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmt;
uniform vec4 uP;
uniform vec4 uQ;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform int uCN;
uniform vec3 uPal[16];
uniform int uPalN;
uniform vec3 uBg;
in vec2 vUv;
out vec4 o;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h12(i), h12(i+vec2(1.,0.)), f.x), mix(h12(i+vec2(0.,1.)), h12(i+vec2(1.,1.)), f.x), f.y); }
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2. + a.y * a.y * .75); }
float bayer4(vec2 a){ return bayer2(.5*a)*.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(.5*a)*.25 + bayer2(a); }
float md(){ return min(uRes.x, uRes.y); }
vec3 S(vec2 uv){ return texture(uTex, uv).rgb; }
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0., -1./3., 2./3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y); float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1., 2./3., 1./3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
`;

export const FRAG: Record<string, string> = {
  copy: `void main(){ o = vec4(S(vUv), 1.); }`,

  pixelate: `void main(){
  float cell = max(1., uP.x * md());
  vec2 px = vUv * uRes;
  vec2 c = (floor(px / cell) + .5) * cell;
  o = vec4(S(c / uRes), 1.); }`,

  quantize: `void main(){
  vec3 s = S(vUv);
  float cell = max(1., uP.y * md());
  vec2 g = floor(vUv * uRes / cell);
  vec3 c = s + (bayer4(g) - .47) * uP.x * .34;
  float best = 1e9; vec3 bc = s;
  for (int i = 0; i < 16; i++) {
    if (i >= uPalN) break;
    vec3 q = uPal[i];
    float rm = (c.r + q.r) * .5;
    vec3 d = c - q;
    float e = (2. + rm) * d.r * d.r + 4. * d.g * d.g + (3. - rm) * d.b * d.b;
    if (e < best) { best = e; bc = q; }
  }
  o = vec4(mix(s, bc, uAmt), 1.); }`,

  posterize: `void main(){
  vec3 s = S(vUv); float L = max(2., uP.x);
  vec2 g = floor(vUv * uRes);
  float d = (bayer4(g) - .5) * uP.y / L;
  vec3 c = floor((s + d) * (L - 1.) + .5) / (L - 1.);
  o = vec4(mix(s, c, uAmt), 1.); }`,

  grayscale: `void main(){
  vec3 s = S(vUv); float l = luma(s); l = (l - .5) * uP.x + .5 + uP.y;
  o = vec4(mix(s, vec3(clamp(l, 0., 1.)), uAmt), 1.); }`,

  threshold: `void main(){
  float cell = max(1., uP.z * md());
  vec2 g = floor(vUv * uRes / cell);
  vec3 s0 = S(vUv);
  float l = luma(S((g + .5) * cell / uRes));
  float th = uP.x + (bayer8(g) - .5) * uP.y + (h12(g + floor(uTime * 10.) * 7.1) - .5) * uP.w;
  vec3 c = l > th ? uC1 : uC0;
  o = vec4(mix(s0, c, uAmt), 1.); }`,

  gradmap: `void main(){
  vec3 s = S(vUv);
  float l = clamp((luma(s) - .5) * uP.y + .5, 0., 1.);
  int n = max(2, uCN);
  float x = l * float(n - 1);
  int i = min(int(floor(x)), n - 1);
  int j = min(i + 1, n - 1);
  float f = fract(x);
  vec3 cols[5] = vec3[5](uC0, uC1, uC2, uC3, uC4);
  vec3 c = mix(cols[i], cols[j], f);
  o = vec4(mix(s, c, uAmt), 1.); }`,

  grade: `void main(){
  vec3 s = S(vUv);
  vec3 h = rgb2hsv(s);
  h.x = fract(h.x + uP.x + uQ.z * uTime);
  h.y = clamp(h.y * uP.y, 0., 1.);
  vec3 c = hsv2rgb(h);
  c = (c - .5) * uP.z + .5 + uP.w;
  c += vec3(.07, .02, -.07) * uQ.x;
  c = mix(c, c * .8 + .13, uQ.y);
  o = vec4(clamp(c, 0., 1.), 1.); }`,

  halftone: `
float dotm(vec2 px, float ang, float cell, float v){
  float cs = cos(ang); float sn = sin(ang);
  mat2 R = mat2(cs, -sn, sn, cs);
  vec2 p = R * px;
  vec2 cp = (floor(p / cell) + .5) * cell;
  float r = sqrt(clamp(v, 0., 1.)) * cell * .64;
  return 1. - smoothstep(r - .8, r + .8, length(p - cp));
}
vec3 cellCol(vec2 px, float ang, float cell){
  float cs = cos(ang); float sn = sin(ang);
  mat2 R = mat2(cs, -sn, sn, cs);
  vec2 p = R * px;
  vec2 cp = (floor(p / cell) + .5) * cell;
  return S((transpose(R) * cp) / uRes);
}
void main(){
  vec3 s = S(vUv);
  vec2 px = vUv * uRes;
  float cell = max(2.5, uP.x * md());
  vec3 c;
  if (uP.z < .5) {
    float v = 1. - luma(cellCol(px, uP.y, cell));
    c = mix(uC1, uC0, dotm(px, uP.y, cell, v));
  } else if (uP.z < 1.5) {
    vec3 sc = cellCol(px, uP.y, cell);
    float v = .45 + .55 * (1. - luma(sc));
    c = mix(uC1, sc, dotm(px, uP.y, cell, max(v, .5)));
  } else {
    vec3 sC = cellCol(px, .26, cell); float kC = 1. - max(max(sC.r, sC.g), sC.b);
    vec3 sM = cellCol(px, 1.31, cell); float kM = 1. - max(max(sM.r, sM.g), sM.b);
    vec3 sY = cellCol(px, 0., cell); float kY = 1. - max(max(sY.r, sY.g), sY.b);
    vec3 sK = cellCol(px, .785, cell); float K = 1. - max(max(sK.r, sK.g), sK.b);
    float C = (1. - sC.r - kC) / (1. - kC + 1e-3);
    float M = (1. - sM.g - kM) / (1. - kM + 1e-3);
    float Y = (1. - sY.b - kY) / (1. - kY + 1e-3);
    c = uC1;
    c.r *= 1. - dotm(px, .26, cell, C) * .92;
    c.g *= 1. - dotm(px, 1.31, cell, M) * .92;
    c.b *= 1. - dotm(px, 0., cell, Y) * .92;
    c *= 1. - dotm(px, .785, cell, K * .9) * .92;
  }
  o = vec4(mix(s, c, uAmt), 1.); }`,

  hatching: `void main(){
  vec3 s = S(vUv);
  vec2 p = vUv * uRes;
  float sp = max(3., uP.x * md());
  vec2 jp = p + (vec2(vn(p * .04), vn(p * .04 + 9.)) - .5) * sp * .5;
  float l = luma(s);
  float w = uP.y * max(1., sp * .14);
  float ink = 0.;
  float d1 = abs(fract((jp.x + jp.y) / sp) - .5) * sp;
  float d2 = abs(fract((jp.x - jp.y) / sp) - .5) * sp;
  float d3 = abs(fract(jp.y / sp + .25) - .5) * sp;
  float d4 = abs(fract(jp.x / sp + .25) - .5) * sp;
  if (l < .84) ink = max(ink, 1. - smoothstep(w * .5, w * .5 + 1., d1));
  if (l < .6) ink = max(ink, 1. - smoothstep(w * .5, w * .5 + 1., d2));
  if (l < .38) ink = max(ink, 1. - smoothstep(w * .5, w * .5 + 1., d3));
  if (l < .2) ink = max(ink, 1. - smoothstep(w * .5, w * .5 + 1., d4));
  o = vec4(mix(s, mix(uC1, uC0, ink), uAmt), 1.); }`,

  engrave: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float sp = max(3., uP.x * md());
  float l = luma(s);
  float y = p.y + sin(p.x * 6.2831 / (sp * 18.) + l * 2.5) * sp * .6;
  float d = abs(fract(y / sp) - .5) * 2.;
  float th = clamp((1. - l) * 1.05, 0., 1.);
  float ink = 1. - smoothstep(th - .15, th + .05, d);
  if (l < .3) {
    float y2 = (p.x + p.y) * .7071;
    float d2 = abs(fract(y2 / sp) - .5) * 2.;
    float t2 = (.3 - l) * 2.6;
    ink = max(ink, 1. - smoothstep(t2 - .1, t2 + .1, d2));
  }
  o = vec4(mix(s, mix(uC1, uC0, ink), uAmt), 1.); }`,

  ascii: `void main(){
  vec3 s = S(vUv);
  float cell = max(7., uP.x * md());
  vec2 cs = vec2(cell * .62, cell);
  vec2 p = vUv * uRes;
  vec2 g = floor(p / cs);
  vec2 f = fract(p / cs);
  vec3 sc = S((g + .5) * cs / uRes);
  float l = luma(sc);
  float n = 11.;
  float gi = floor(clamp(l * 1.05, 0., .999) * n);
  float m = texture(uAux, vec2((gi + f.x) / n, f.y)).r;
  vec3 fg = uP.y > .5 ? sc * 1.3 + .05 : uC0 * (.35 + .9 * l);
  o = vec4(mix(s, mix(uC1, fg, m), uAmt), 1.); }`,

  dots: `void main(){
  vec3 s = S(vUv);
  vec2 p = vUv * uRes;
  float cell = max(3., uP.x * md());
  vec2 g = floor(p / cell);
  vec3 col = uC0;
  float best = 2.;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = g + vec2(i, j);
      vec2 cp = (c + vec2(h12(c), h12(c + 17.3))) * cell;
      float r = cell * (.62 + .3 * h12(c + 3.1));
      float pr = h12(c + 9.7);
      if (length(p - cp) < r && pr < best) {
        best = pr;
        col = S(cp / uRes) + (vec3(h12(c + 1.), h12(c + 2.), h12(c + 4.)) - .5) * .22;
      }
    }
  }
  o = vec4(mix(s, col, uAmt), 1.); }`,

  led: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float cell = max(3., uP.x * md());
  vec2 g = floor(p / cell); vec2 f = fract(p / cell) - .5;
  vec3 sc = S((g + .5) * cell / uRes);
  sc = floor(sc * 4. + .5) / 4.;
  float d = length(f);
  float m = smoothstep(.44, .3, d);
  float glow = exp(-d * d * 9.) * .45;
  o = vec4(mix(s, uC0 + sc * (m * 1.15 + glow), uAmt), 1.); }`,

  bevel: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float cell = max(3., uP.x * md());
  vec2 g = floor(p / cell); vec2 f = fract(p / cell);
  vec3 sc = S((g + .5) * cell / uRes);
  vec2 sub = floor(f * 4.);
  float n = (h12(g) - .5) * uP.z + (h12(g * 3.7 + sub) - .5) * uP.z * .9;
  float bw = .11; float e = 0.;
  if (f.y > 1. - bw || f.x < bw) e = .22;
  if (f.y < bw || f.x > 1. - bw) e = -.28;
  o = vec4(mix(s, sc * (1. + n + e * uP.y), uAmt), 1.); }`,

  studs: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float cell = max(4., uP.x * md());
  vec2 g = floor(p / cell); vec2 f = fract(p / cell) - .5;
  vec3 c = S((g + .5) * cell / uRes);
  float d = length(f);
  float stud = smoothstep(.31, .28, d);
  float ring = smoothstep(.37, .31, d) * (1. - stud);
  float hl = dot(normalize(f + 1e-4), normalize(vec2(-1., 1.)));
  c *= 1. - ring * .3;
  c *= 1. + stud * hl * .25 * smoothstep(.08, .28, d);
  c += stud * smoothstep(.16, .03, length(f - vec2(-.1, .1))) * .22;
  float edge = max(abs(f.x), abs(f.y));
  c *= 1. - smoothstep(.45, .5, edge) * .35;
  o = vec4(mix(s, c, uAmt), 1.); }`,

  knit: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float cell = max(5., uP.x * md());
  vec2 cs = vec2(cell, cell * .8);
  vec2 g = floor(p / cs); vec2 f = fract(p / cs);
  vec3 sc = S((g + .5) * cs / uRes);
  vec2 q = f; q.x = q.x < .5 ? q.x : 1. - q.x;
  q -= vec2(.28, .5);
  float a = .55; q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
  float e = length(q / vec2(.2, .46));
  float m = smoothstep(1.05, .85, e);
  float yarn = .86 + .14 * sin(q.y * 42. + q.x * 12.);
  vec3 c = mix(sc * .42, sc * (.78 + .42 * (1. - e * .6)) * yarn, m);
  o = vec4(mix(s, c, uAmt), 1.); }`,

  stitch: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float cell = max(4., uP.x * md());
  vec2 g = floor(p / cell); vec2 f = fract(p / cell) - .5;
  vec3 sc = S((g + .5) * cell / uRes);
  float isBg = step(length(sc - uBg), .1);
  float d1 = abs(f.x - f.y); float d2 = abs(f.x + f.y);
  float w = .13;
  float x = max(1. - smoothstep(w, w + .07, d1), 1. - smoothstep(w, w + .07, d2)) * step(max(abs(f.x), abs(f.y)), .43);
  float shade = .82 + .3 * (1. - min(d1, d2) / w);
  vec3 fab = uC0 * (.93 + .07 * step(.42, max(abs(f.x), abs(f.y)))) * (.97 + .03 * h12(g));
  o = vec4(mix(s, mix(fab, sc * shade, x * (1. - isBg)), uAmt), 1.); }`,

  tri: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float cell = max(6., uP.x * md());
  vec2 q = p / cell; vec2 g = floor(q); vec2 f = fract(q);
  bool flip = h12(g) > .5;
  bool up = flip ? (f.x + f.y > 1.) : (f.y > f.x);
  vec2 cen;
  if (!flip) cen = up ? vec2(1./3., 2./3.) : vec2(2./3., 1./3.);
  else cen = up ? vec2(2./3., 2./3.) : vec2(1./3., 1./3.);
  vec3 sc = S((g + cen) * cell / uRes);
  float sh = (h12(g + (up ? .37 : 0.)) - .5) * uP.y;
  o = vec4(mix(s, sc * (1. + sh), uAmt), 1.); }`,

  voronoi: `void main(){
  vec3 s = S(vUv); vec2 p = vUv * uRes; float cell = max(6., uP.x * md());
  vec2 q = p / cell; vec2 g = floor(q);
  float d1 = 9.; float d2 = 9.; vec2 best = g;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = g + vec2(i, j);
      vec2 pt = c + .5 + (vec2(h12(c), h12(c + 31.7)) - .5) * uP.w;
      float d = length(q - pt);
      if (d < d1) { d2 = d1; d1 = d; best = pt; } else if (d < d2) { d2 = d; }
    }
  }
  vec2 bc = floor(best);
  vec3 col;
  if (uP.z < .5) {
    col = S(best * cell / uRes);
    col *= 1. + uQ.x * (.3 - .6 * d1);
  } else {
    vec2 off = (vec2(h12(bc + 5.), h12(bc + 9.)) - .5) * cell * 1.1;
    float rot = (h12(bc + 2.) - .5) * .5;
    vec2 rel = p - best * cell;
    rel = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * rel;
    col = S((best * cell + rel + off) / uRes) * (.82 + .32 * h12(bc + 7.));
  }
  float b = 1. - smoothstep(uP.y, uP.y + .04, d2 - d1);
  o = vec4(mix(s, mix(col, uC0, b), uAmt), 1.); }`,

  kuwahara: `void main(){
  vec2 px = 1. / uRes;
  int r = int(clamp(uP.x * md(), 1., 5.));
  vec3 m0 = vec3(0.); vec3 m1 = vec3(0.); vec3 m2 = vec3(0.); vec3 m3 = vec3(0.);
  vec3 q0 = vec3(0.); vec3 q1 = vec3(0.); vec3 q2 = vec3(0.); vec3 q3 = vec3(0.);
  float n = float((r + 1) * (r + 1));
  for (int j = 0; j <= 5; j++) {
    if (j > r) break;
    for (int i = 0; i <= 5; i++) {
      if (i > r) break;
      vec3 a = S(vUv + vec2(-i, -j) * px); m0 += a; q0 += a * a;
      vec3 b = S(vUv + vec2(i, -j) * px); m1 += b; q1 += b * b;
      vec3 c = S(vUv + vec2(i, j) * px); m2 += c; q2 += c * c;
      vec3 d = S(vUv + vec2(-i, j) * px); m3 += d; q3 += d * d;
    }
  }
  m0 /= n; m1 /= n; m2 /= n; m3 /= n;
  vec3 v0 = abs(q0 / n - m0 * m0); vec3 v1 = abs(q1 / n - m1 * m1);
  vec3 v2 = abs(q2 / n - m2 * m2); vec3 v3 = abs(q3 / n - m3 * m3);
  float s0 = v0.r + v0.g + v0.b; float s1 = v1.r + v1.g + v1.b;
  float s2 = v2.r + v2.g + v2.b; float s3 = v3.r + v3.g + v3.b;
  vec3 res = m0; float mn = s0;
  if (s1 < mn) { mn = s1; res = m1; }
  if (s2 < mn) { mn = s2; res = m2; }
  if (s3 < mn) { mn = s3; res = m3; }
  o = vec4(mix(S(vUv), res, uAmt), 1.); }`,

  watercolor: `void main(){
  vec2 p = vUv * uRes * (600. / md());
  vec2 n = vec2(vn(p * .018 + 3.1), vn(p * .018 + 7.7)) - .5;
  vec2 n2 = vec2(vn(p * .07 + 1.3), vn(p * .07 + 5.9)) - .5;
  vec2 duv = vUv + (n * .022 + n2 * .006) * uP.x;
  vec3 c = S(duv);
  vec2 e = 1.8 / uRes;
  float lx = luma(S(duv + vec2(e.x, 0.))) - luma(S(duv - vec2(e.x, 0.)));
  float ly = luma(S(duv + vec2(0., e.y))) - luma(S(duv - vec2(0., e.y)));
  float edge = clamp(length(vec2(lx, ly)) * 3., 0., 1.);
  c *= 1. - edge * uP.y * .35;
  float gr = vn(p * .45) * vn(p * .11 + 3.);
  c *= 1. - uP.z * (gr - .25) * .35;
  c = mix(c, uC0, .1);
  c *= .95 + .05 * vn(p * .9);
  o = vec4(mix(S(vUv), c, uAmt), 1.); }`,

  edges: `void main(){
  vec3 s = S(vUv);
  vec2 p = vUv * uRes;
  float jt = floor(uTime * 8.);
  vec2 jit = (vec2(vn(p * .04 + jt * uQ.x), vn(p * .04 + 5. + jt * uQ.x)) - .5) * uQ.x * 3.;
  vec2 e = max(1., uP.y * md() / 520.) / uRes;
  vec2 uv = vUv + jit / uRes;
  float tl = luma(S(uv + e * vec2(-1., 1.))); float tc = luma(S(uv + e * vec2(0., 1.))); float tr = luma(S(uv + e * vec2(1., 1.)));
  float ml = luma(S(uv + e * vec2(-1., 0.))); float mr = luma(S(uv + e * vec2(1., 0.)));
  float bl = luma(S(uv + e * vec2(-1., -1.))); float bc = luma(S(uv + e * vec2(0., -1.))); float br = luma(S(uv + e * vec2(1., -1.)));
  float gx = -tl - 2. * ml - bl + tr + 2. * mr + br;
  float gy = -bl - 2. * bc - br + tl + 2. * tc + tr;
  float g = length(vec2(gx, gy));
  vec3 cx = S(uv + e * vec2(1., 0.)) - S(uv - e * vec2(1., 0.));
  vec3 cy = S(uv + e * vec2(0., 1.)) - S(uv - e * vec2(0., 1.));
  g = max(g, (length(cx) + length(cy)) * .9);
  float line = smoothstep(uP.x, uP.x * 1.9 + .02, g);
  line *= .78 + .22 * vn(p * .35);
  vec3 base = uP.z < .5 ? s : uC1;
  if (uP.z > .5 && uP.w > 0.) {
    float l = luma(s);
    float sp = max(4., md() / 110.);
    float d = abs(fract((p.x + p.y) / sp) - .5) * sp;
    float h = (1. - smoothstep(.45, 1.4, d)) * smoothstep(.78, .25, l);
    float d2 = abs(fract((p.x - p.y) / sp) - .5) * sp;
    h = max(h, (1. - smoothstep(.45, 1.4, d2)) * smoothstep(.45, .12, l));
    base = mix(base, uC0, h * .55 * uP.w);
  }
  o = vec4(mix(s, mix(base, uC0, line), uAmt), 1.); }`,

  bright: `void main(){ vec3 c = S(vUv); float l = max(c.r, max(c.g, c.b)); float k = smoothstep(uP.x, uP.x + .25, l); o = vec4(c * k, 1.); }`,

  blurdir: `void main(){
  vec2 d = uP.xy / uRes;
  vec3 c = S(vUv) * .2270270270;
  c += S(vUv + d * 1.3846153846) * .3162162162; c += S(vUv - d * 1.3846153846) * .3162162162;
  c += S(vUv + d * 3.2307692308) * .0702702703; c += S(vUv - d * 3.2307692308) * .0702702703;
  o = vec4(c, 1.); }`,

  bloommix: `void main(){ vec3 c = clamp(S(vUv), 0., 1.); vec3 b = texture(uAux, vUv).rgb * uAmt * 1.35; o = vec4(1. - (1. - c) * (1. - clamp(b, 0., 1.)), 1.); }`,

  tiltshift: `void main(){
  float d = abs(vUv.y - .46);
  float r = smoothstep(uP.x, uP.x + .3, d) * uP.y * md() * .014;
  vec3 acc = vec3(0.);
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 2.39996; float rr = sqrt(float(i) / 16.) * r;
    acc += S(vUv + vec2(cos(a), sin(a)) * rr / uRes);
  }
  vec3 c = acc / 16.;
  vec3 h = rgb2hsv(c); h.y = clamp(h.y * uP.z, 0., 1.);
  o = vec4(hsv2rgb(h), 1.); }`,

  mblur: `void main(){
  vec2 dir = vec2(cos(uP.y), sin(uP.y)) * uP.x * md() * .09 / uRes;
  vec3 acc = vec3(0.);
  for (int i = 0; i < 12; i++) { float t = float(i) / 11. - .5; acc += S(vUv + dir * t); }
  o = vec4(acc / 12., 1.); }`,

  chroma: `void main(){ vec2 d = (vUv - .5) * uP.x * .02; o = vec4(S(vUv + d).r, S(vUv).g, S(vUv - d).b, 1.); }`,

  glitch: `void main(){
  float a = uP.x; float t = floor(uTime * 12.);
  vec2 uv = vUv;
  float band = floor(uv.y * 28.);
  if (h12(vec2(band, t)) < a * .4) uv.x += (h12(vec2(band, t + 1.)) - .5) * .16 * a;
  vec2 blk = floor(vUv * vec2(10., 18.));
  float br = h12(blk + t * 1.7);
  if (br < a * .08) uv += (vec2(h12(blk + t + 3.), h12(blk + t + 5.)) - .5) * .06;
  float sh = .007 * a;
  vec3 c = vec3(S(uv + vec2(sh, 0.)).r, S(uv).g, S(uv - vec2(sh, 0.)).b);
  if (br > 1. - a * .025) c = 1. - c;
  float line = step(.985 - a * .03, h12(vec2(floor(vUv.y * uRes.y * .5), t)));
  c = mix(c, vec3(h12(vUv * 99. + t)), line * .5);
  o = vec4(c, 1.); }`,

  vhs: `void main(){
  float a = uP.x; float t = uTime;
  float y = vUv.y;
  float wob = (vn(vec2(y * 30., t * 6.)) - .5) * .004 * a;
  float bandY = fract(-t * .12);
  float band = smoothstep(.035, 0., abs(y - bandY));
  wob += band * (h12(vec2(y * 400., floor(t * 30.))) - .5) * .03 * a;
  vec2 uv = vec2(vUv.x + wob, y);
  vec3 c = S(uv);
  vec3 bl = (S(uv - vec2(.004, 0.)) + S(uv - vec2(.009, 0.)) + S(uv - vec2(.014, 0.))) / 3.;
  float Y = luma(c);
  vec3 r = mix(c, Y + (bl - luma(bl)) * 1.1, a);
  r += (h12(vUv * uRes + floor(t * 30.) * 13.) - .5) * .09 * a;
  r += band * h12(vec2(vUv.x * 500., floor(t * 30.))) * .35 * a;
  r = mix(r, r * vec3(1.04, 1., .93), a * .6);
  float strip = smoothstep(.035, 0., y) * a;
  r = mix(r, vec3(h12(vec2(vUv.x * 300., floor(t * 30.)))), strip * .6);
  o = vec4(r, 1.); }`,

  holo: `void main(){
  vec3 s = S(vUv);
  float t = uTime;
  vec2 uv = vUv;
  uv.x += step(.97, h12(vec2(floor(uv.y * 40.), floor(t * 8.)))) * .012;
  vec3 c = S(uv);
  float l = luma(c);
  vec3 tint = uC0 * (.25 + l * 1.25);
  vec3 irid = .5 + .5 * cos(6.2831 * (l * 1.4 + vUv.y * .6 + t * .15 + vec3(0., .33, .67)));
  float scan = .78 + .22 * sin(vUv.y * uRes.y * .9 - t * 10.);
  float flick = .9 + .1 * h12(vec2(floor(t * 18.), 3.));
  vec3 h = (tint + irid * .18 * l) * scan * flick + uC0 * .08;
  o = vec4(mix(s, h, uAmt), 1.); }`,

  wave: `void main(){
  vec2 uv = vUv; float t = uTime * uP.z;
  uv.x += sin(uv.y * uP.y * 6.28 + t * 2.) * uP.x * .02;
  uv.y += cos(uv.x * uP.y * 4.7 + t * 1.6) * uP.x * .015;
  o = vec4(S(uv), 1.); }`,

  kaleido: `void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  vec2 p = (vUv - .5) * asp;
  float r = length(p); float a = atan(p.y, p.x);
  float seg = 6.28318 / max(2., uP.x);
  a = mod(a, seg); a = abs(a - seg * .5);
  vec2 uv = vec2(cos(a), sin(a)) * r / asp + .5;
  o = vec4(mix(S(vUv), S(uv), uAmt), 1.); }`,

  crt: `void main(){
  float k = uAmt;
  vec2 uv = vUv * 2. - 1.;
  uv *= 1. + dot(uv, uv) * uP.x * k * .085;
  vec2 cuv = uv * .5 + .5;
  if (cuv.x < 0. || cuv.x > 1. || cuv.y < 0. || cuv.y > 1.) { o = vec4(0., 0., 0., 1.); return; }
  vec3 c = S(cuv);
  float per = max(2., md() / 180.);
  float sl = .5 + .5 * cos(cuv.y * uRes.y / per * 6.28318);
  c *= 1. - uP.y * k * .45 * (1. - sl);
  float mx = mod(floor(gl_FragCoord.x / max(1., per * .5)), 3.);
  vec3 mask = vec3(mx < .5 ? 1. : .72, (mx > .5 && mx < 1.5) ? 1. : .72, mx > 1.5 ? 1. : .72);
  c *= mix(vec3(1.), mask, uP.z * k);
  c *= mix(1., smoothstep(1.45, .55, length(uv)), uP.w * k);
  c *= 1. + .12 * k;
  o = vec4(c, 1.); }`,

  scanlines: `void main(){ vec3 c = S(vUv); float per = max(2., uP.x * md()); float sl = .5 + .5 * cos(vUv.y * uRes.y / per * 6.28318); c *= 1. - uAmt * .42 * (1. - sl); o = vec4(c, 1.); }`,

  vignette: `void main(){
  vec3 c = S(vUv); vec2 p = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  float v = smoothstep(.9 - uP.y * .35, .22, length(p));
  o = vec4(mix(uC0, c, mix(1., v, clamp(uP.x, 0., 1.))), 1.); }`,

  grain: `void main(){
  vec3 c = S(vUv); float sz = max(1., uP.y * md() / 520.);
  vec2 g = floor(vUv * uRes / sz);
  float n = h12(g + floor(uTime * 24.) * 17.13) - .5;
  o = vec4(c + n * uP.x * .6, 1.); }`,

  paper: `void main(){
  vec3 c = S(vUv); vec2 p = vUv * uRes * (520. / md());
  float f = vn(p * .55) * .45 + vn(p * .09) * .35 + vn(p * 2.2) * .2;
  float fib = smoothstep(.45, .55, vn(vec2(p.x * .02, p.y * .6))) * .5;
  float t = (f - .5) * .12 + (fib - .25) * .04 * uP.y;
  c *= 1. + t * uP.x * 1.5;
  if (length(uC0) > .01) c = mix(c, c * uC0, uP.x * .2);
  o = vec4(c, 1.); }`,

  film: `void main(){
  float t = floor(uTime * 24.);
  vec2 uv = vUv; uv.y += (h12(vec2(t, 1.)) - .5) * .004 * uP.z;
  vec3 c = S(uv);
  c *= 1. + (h12(vec2(t, 9.)) - .5) * .2 * uP.z;
  for (int i = 0; i < 3; i++) {
    float x = h12(vec2(t, float(i) + 3.));
    float on = step(.45, h12(vec2(t, float(i) + 7.)));
    float d = abs(vUv.x - x) * uRes.x;
    c = mix(c, c * .5, on * uP.x * (1. - smoothstep(.4, 1.4, d)) * smoothstep(.1, .5, h12(vec2(floor(vUv.y * 20.), t))));
  }
  float dust = step(.9985 - .0012 * uP.y, h12(floor(vUv * uRes / 2.) + t * 3.1));
  c = mix(c, vec3(.06), dust * min(1., uP.y));
  o = vec4(c, 1.); }`,

  riso: `void main(){
  vec2 off = vec2(.0035, -.0025) * uP.x;
  vec3 c1 = S(vUv); vec3 c2 = S(vUv + off);
  vec2 p = vUv * uRes;
  vec2 gp = floor(p / max(1., md() / 450.));
  float g1 = mix(vn(p * .35), h12(gp), .45); float g2 = mix(vn(p * .35 + 31.), h12(gp + 17.), .45);
  float d1 = clamp((1. - luma(c1)) * 1.25 - .05, 0., 1.);
  vec3 hs = rgb2hsv(c2);
  float d2 = clamp(hs.y * 1.1 * (.35 + .65 * hs.z) + (1. - hs.z) * .2, 0., 1.);
  float gr = .55 * uP.y;
  float th1 = g1 * gr + (1. - gr) * .5; float th2 = g2 * gr + (1. - gr) * .5;
  float m1 = smoothstep(th1 - .05, th1 + .05, d1);
  float m2 = smoothstep(th2 - .05, th2 + .05, d2);
  vec3 c = uC2;
  c *= mix(vec3(1.), uC0, m1 * .92);
  c *= mix(vec3(1.), uC1, m2 * .88);
  o = vec4(mix(S(vUv), c, uAmt), 1.); }`,

  invert: `void main(){ vec3 c = S(vUv); o = vec4(mix(c, 1. - c, uAmt), 1.); }`,
};
