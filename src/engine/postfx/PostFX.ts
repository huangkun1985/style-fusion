// WebGL2 後期管線：把 2D 場景上傳為紋理，依序跑過特效鏈（乒乓緩衝），最後輸出到自身 canvas。
import { FX } from '../fx';
import { rgb } from '../color';
import type { FxInst } from '../types';
import { FRAG, HEADER, VERT } from './shaders';

interface Prog {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}
interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}
interface Raw {
  P?: number[];
  Q?: number[];
  amt?: number;
  c?: string[];
  pal?: string[];
  aux?: WebGLTexture | null;
}

const UNIFORMS = ['uTex', 'uAux', 'uRes', 'uTime', 'uAmt', 'uP', 'uQ', 'uC0', 'uC1', 'uC2', 'uC3', 'uC4', 'uCN', 'uPal', 'uPalN', 'uBg'];
const GLYPHS = ' .:-=+*o#%@';

export class PostFX {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null = null;
  ok = false;
  private progs = new Map<string, Prog | null>();
  private vao: WebGLVertexArrayObject | null = null;
  private srcTex: WebGLTexture | null = null;
  private full: Target[] = [];
  private half: Target[] = [];
  private glyph: WebGLTexture | null = null;
  private w = 0;
  private h = 0;
  private time = 0;
  private bg: [number, number, number] = [1, 1, 1];
  private palBuf = new Float32Array(48);

  constructor() {
    this.canvas = document.createElement('canvas');
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        depth: false,
        stencil: false,
      });
    } catch {
      gl = null;
    }
    if (!gl) return;
    this.gl = gl;
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = this.mkTex();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ok = false;
    });
    this.ok = !!this.prog('copy');
  }

  private mkTex(): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private mkTarget(w: number, h: number): Target {
    const gl = this.gl!;
    const tex = this.mkTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }
  private freeTarget(t: Target) {
    const gl = this.gl!;
    gl.deleteFramebuffer(t.fb);
    gl.deleteTexture(t.tex);
  }

  private prog(name: string): Prog | null {
    if (this.progs.has(name)) return this.progs.get(name)!;
    const gl = this.gl!;
    const src = FRAG[name];
    if (!src) {
      this.progs.set(name, null);
      return null;
    }
    const mk = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn(`[PostFX] ${name} 編譯失敗`, gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = mk(gl.VERTEX_SHADER, VERT);
    const fs = mk(gl.FRAGMENT_SHADER, HEADER + src);
    if (!vs || !fs) {
      this.progs.set(name, null);
      return null;
    }
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn(`[PostFX] ${name} 連結失敗`, gl.getProgramInfoLog(p));
      this.progs.set(name, null);
      return null;
    }
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const k of UNIFORMS) u[k] = gl.getUniformLocation(p, k);
    const pr = { p, u };
    this.progs.set(name, pr);
    return pr;
  }

  private glyphTex(): WebGLTexture {
    if (this.glyph) return this.glyph;
    const gl = this.gl!;
    const cv = document.createElement('canvas');
    const cs = 32;
    cv.width = cs * GLYPHS.length;
    cv.height = cs;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#000';
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#fff';
    c.font = 'bold 28px "JetBrains Mono", Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < GLYPHS.length; i++) c.fillText(GLYPHS[i], i * cs + cs / 2, cs / 2 + 1);
    const t = this.mkTex();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    this.glyph = t;
    return t;
  }

  private resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of this.full) this.freeTarget(t);
    for (const t of this.half) this.freeTarget(t);
    this.full = [this.mkTarget(w, h), this.mkTarget(w, h)];
    const hw = Math.max(1, Math.round(w / 2));
    const hh = Math.max(1, Math.round(h / 2));
    this.half = [this.mkTarget(hw, hh), this.mkTarget(hw, hh)];
  }

  private raw(name: string, input: WebGLTexture, target: Target | null, r: Raw) {
    const pr = this.prog(name);
    if (!pr) return false;
    const gl = this.gl!;
    const u = pr.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const w = target ? target.w : this.w;
    const h = target ? target.h : this.h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, r.aux ?? (name === 'ascii' ? this.glyphTex() : this.srcTex));
    gl.uniform1i(u.uAux, 1);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uAmt, r.amt ?? 1);
    const P = r.P ?? [0, 0, 0, 0];
    const Q = r.Q ?? [0, 0, 0, 0];
    gl.uniform4f(u.uP, P[0] ?? 0, P[1] ?? 0, P[2] ?? 0, P[3] ?? 0);
    gl.uniform4f(u.uQ, Q[0] ?? 0, Q[1] ?? 0, Q[2] ?? 0, Q[3] ?? 0);
    const cs = r.c ?? [];
    for (let k = 0; k < 5; k++) {
      const v = cs[k] ? rgb(cs[k]) : [0, 0, 0];
      gl.uniform3f(u['uC' + k], v[0], v[1], v[2]);
    }
    gl.uniform1i(u.uCN, cs.length);
    const pal = r.pal ?? [];
    if (u.uPal) {
      this.palBuf.fill(0);
      const n = Math.min(16, pal.length);
      for (let i = 0; i < n; i++) {
        const v = rgb(pal[i]);
        this.palBuf[i * 3] = v[0];
        this.palBuf[i * 3 + 1] = v[1];
        this.palBuf[i * 3 + 2] = v[2];
      }
      gl.uniform3fv(u.uPal, this.palBuf);
      gl.uniform1i(u.uPalN, n);
    }
    gl.uniform3f(u.uBg, this.bg[0], this.bg[1], this.bg[2]);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /** 執行特效鏈並回傳結果 canvas */
  run(src: HTMLCanvasElement, passes: FxInst[], time: number, bg: string): HTMLCanvasElement {
    const gl = this.gl!;
    this.time = time;
    this.bg = rgb(bg);
    this.resize(src.width, src.height);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const list: FxInst[] = passes.length ? passes : [{ fx: 'copy', p: {}, c: [], pal: [] }];
    let input = this.srcTex!;
    let ping = 0;
    for (let i = 0; i < list.length; i++) {
      const pass = list[i];
      const last = i === list.length - 1;
      const target = last ? null : this.full[ping];
      const def = FX[pass.fx];
      if (def?.multi === 'bloom') this.bloom(input, pass, target);
      else if (def?.multi === 'blur') this.blur(input, pass, target);
      else {
        const m = def ? def.map(pass.p) : { P: [0, 0, 0, 0], Q: [0, 0, 0, 0] };
        const ok = this.raw(pass.fx, input, target, { P: m.P, Q: m.Q, amt: pass.p.amt ?? 1, c: pass.c, pal: pass.pal });
        if (!ok) this.raw('copy', input, target, {});
      }
      if (!last) {
        input = this.full[ping].tex;
        ping = 1 - ping;
      }
    }
    return this.canvas;
  }

  private bloom(input: WebGLTexture, pass: FxInst, target: Target | null) {
    const amt = pass.p.amt ?? 1;
    const r = Math.max(1, ((pass.p.radius ?? 1) * Math.min(this.w, this.h)) / 320);
    this.raw('bright', input, this.half[0], { P: [pass.p.thresh ?? 0.55, 0, 0, 0] });
    for (let k = 0; k < 2; k++) {
      this.raw('blurdir', this.half[0].tex, this.half[1], { P: [r * (1 + k * 1.5), 0, 0, 0] });
      this.raw('blurdir', this.half[1].tex, this.half[0], { P: [0, r * (1 + k * 1.5), 0, 0] });
    }
    this.raw('bloommix', input, target, { amt, aux: this.half[0].tex });
  }

  private blur(input: WebGLTexture, pass: FxInst, target: Target | null) {
    const r = Math.max(0.5, ((pass.p.amt ?? 0) * Math.min(this.w, this.h)) / 140);
    this.raw('blurdir', input, this.half[0], { P: [r, 0, 0, 0] });
    this.raw('blurdir', this.half[0].tex, this.half[1], { P: [0, r, 0, 0] });
    this.raw('blurdir', this.half[1].tex, this.half[0], { P: [r * 0.5, r * 0.5, 0, 0] });
    this.raw('copy', this.half[0].tex, target, {});
  }

  dispose() {
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    this.ok = false;
  }
}
