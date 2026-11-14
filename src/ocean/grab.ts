// A copy of what has been drawn so far, taken in the middle of the main pass. The sea is drawn after every other
// opaque thing (renderOrder), and just before it draws, the colour and depth of the main target are blitted into
// textures it can read: so the sea refracts the real sea floor, the reef, the kelp and the fish under it, and knows how
// much water lies along every view ray. The underwater pass grabs again after the sea, for its fog and light shafts.
// When there is no render target (a pass straight to the canvas) or the blit is not possible, `ok` stays false and the
// sea falls back to painting its own bed.
import * as THREE from 'three';

export class SceneGrab {
  readonly rt: THREE.WebGLRenderTarget;
  readonly U = {
    uGrab: { value: null as THREE.Texture | null },
    uGrabD: { value: null as THREE.Texture | null },
    uGrabOn: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.5 }, uFar: { value: 900 },
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
  };
  private failed = false;
  constructor() {
    const depth = new THREE.DepthTexture(4, 4, THREE.FloatType);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth, generateMipmaps: false });
    this.U.uGrab.value = this.rt.texture; this.U.uGrabD.value = depth;
  }
  /** copy the bound target's colour attachment 0 and depth; returns whether the copy is good this frame */
  grab(renderer: THREE.WebGLRenderer, camera: THREE.Camera): boolean {
    const U = this.U, cam = camera as THREE.PerspectiveCamera;
    U.uNear.value = cam.near ?? 0.5; U.uFar.value = cam.far ?? 900;
    U.uInvProj.value.copy(camera.projectionMatrixInverse); U.uCamWorld.value.copy(camera.matrixWorld);
    const src = renderer.getRenderTarget();
    if (!src || this.failed || !(src as THREE.WebGLRenderTarget).depthTexture) { U.uGrabOn.value = 0; return false; }
    const w = src.width, h = src.height;
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    U.uRes.value.set(w, h);
    try {
      const gl = renderer.getContext() as WebGL2RenderingContext, props = renderer.properties as unknown as { get(o: unknown): { __webglFramebuffer?: WebGLFramebuffer } };
      if (!props.get(this.rt).__webglFramebuffer) { renderer.initRenderTarget(this.rt); }
      const sfb = props.get(src).__webglFramebuffer, dfb = props.get(this.rt).__webglFramebuffer;
      if (!sfb || !dfb) { U.uGrabOn.value = 0; return false; }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sfb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dfb);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sfb);
      U.uGrabOn.value = 1;
      return true;
    } catch (e) {
      console.warn('ocean: scene grab failed, the sea paints its own bed', e);
      this.failed = true; U.uGrabOn.value = 0;
      return false;
    }
  }
  dispose() { this.rt.dispose(); }
}
