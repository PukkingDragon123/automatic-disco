// Renderer, post pipeline, resize, and the frame loop. Screens register an update/render pair.
import * as THREE from 'three';
import { Post } from '../gfx/post';

export interface Screen {
  update(dt: number, t: number): void;
  suspend?(): void;
  resume?(): void;
  render(post: Post, t: number): void;
  resize?(w: number, h: number): void;
  dispose?(): void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly post: Post;
  readonly canvas: HTMLCanvasElement;
  screen: Screen | null = null;
  /** internal render scale (1 = CSS pixels) */
  scale = 1;
  w = 1; h = 1;
  time = 0;
  timeScale = 1;
  private last = 0;
  private fpsAcc = 0; private fpsN = 0; fps = 60;
  private ticking = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = true;
    this.post = new Post(this.renderer);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const cw = Math.max(1, innerWidth), ch = Math.max(1, innerHeight);
    this.w = Math.floor(cw * this.scale); this.h = Math.floor(ch * this.scale);
    this.renderer.setSize(this.w, this.h, false);
    this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
    this.post.setSize(this.w, this.h);
    this.screen?.resize?.(this.w, this.h);
  }

  private stack: Screen[] = [];
  setScreen(s: Screen) {
    this.screen?.dispose?.();
    for (const x of this.stack) x.dispose?.();
    this.stack = [];
    this.screen = s;
    s.resize?.(this.w, this.h);
  }
  /** overlay a screen; the one below is suspended, not destroyed */
  push(s: Screen) {
    if (this.screen) { this.screen.suspend?.(); this.stack.push(this.screen); }
    this.screen = s; s.resize?.(this.w, this.h);
  }
  pop() {
    this.screen?.dispose?.();
    this.screen = this.stack.pop() ?? null;
    this.screen?.resize?.(this.w, this.h);
    this.screen?.resume?.();
  }

  start() {
    if (this.ticking) return;
    this.ticking = true;
    this.last = performance.now();
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      let dt = (now - this.last) / 1000; this.last = now;
      if (!(dt > 0)) dt = 1 / 60;
      dt = Math.min(dt, 1 / 15);
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
      this.step(dt);
    };
    requestAnimationFrame(frame);
  }

  /** advance and draw one frame (also used by headless tests to step deterministically) */
  step(dt: number, draw = true) {
    const s = this.screen;
    const sdt = dt * this.timeScale;
    this.time += sdt;
    if (s) {
      try { s.update(sdt, this.time); } catch (e) { console.error('update', e); }
      if (draw) try { s.render(this.post, this.time); } catch (e) { console.error('render', e); }
    }
  }
}
