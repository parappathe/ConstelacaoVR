// Three.js de verdade, só que o WebGLRenderer não desenha nada (o Node não tem WebGL).
// O resto (cena, matrizes, raycast, projeção) é o Three.js normal.
import * as REAL from '../../vendor/three/three.module.js?real';
export * from '../../vendor/three/three.module.js?real';

class FakeXR extends REAL.EventDispatcher {
  constructor() {
    super();
    this.enabled = false; this.isPresenting = false;
    this.controllers = [0, 1].map(() => new REAL.Group());
    this.grips = [0, 1].map(() => new REAL.Group());
  }
  setReferenceSpaceType() {}
  setFoveation() {}
  getController(i) { return this.controllers[i]; }
  getControllerGrip(i) { return this.grips[i]; }
  getHand() { return new REAL.Group(); }
  getSession() { return null; }
}

export class WebGLRenderer {
  constructor() {
    this.domElement = globalThis.document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.xr = new FakeXR();
    this.loop = null;
    this.renders = 0;
    globalThis.__renderer = this;
  }
  setPixelRatio() {}
  setSize() {}
  setAnimationLoop(fn) { this.loop = fn; }
  render(scene, camera) {
    scene.updateMatrixWorld();
    if (camera.parent === null) camera.updateMatrixWorld();
    this.renders++;
  }
}
