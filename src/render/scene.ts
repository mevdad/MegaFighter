import * as THREE from 'three';

export type Quality = 'low' | 'high';

const FOV = 40;

/**
 * Обёртка над рендером: камера, свет, ресайз и тряска экрана.
 * Качество определяется один раз на старте — на слабых устройствах отключаются тени
 * и режется pixelRatio, всё остальное остаётся тем же.
 */
export class SceneView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly quality: Quality;

  private readonly key: THREE.DirectionalLight;
  private shakeAmount = 0;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.quality = detectQuality();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality === 'high',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.25));
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene.background = new THREE.Color(0x11121c);
    this.scene.fog = new THREE.Fog(0x11121c, 16, 40);

    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 90);
    this.camera.position.set(0, 1.9, 9);
    this.camera.lookAt(0, 1.2, 0);

    this.scene.add(new THREE.HemisphereLight(0x8fa6cc, 0x3a2f28, 1.5));
    this.scene.add(new THREE.AmbientLight(0x6b7590, 0.9));

    this.key = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.key.position.set(4, 9, 6);
    this.key.castShadow = this.quality === 'high';
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -10;
    this.key.shadow.camera.right = 10;
    this.key.shadow.camera.top = 10;
    this.key.shadow.camera.bottom = -2;
    this.key.shadow.camera.far = 30;
    this.key.shadow.bias = -0.0012;
    this.scene.add(this.key);

    // Холодная контровая подсветка — отделяет бойцов от тёмного задника.
    const rim = new THREE.DirectionalLight(0x7fb4ff, 1.5);
    rim.position.set(-6, 5, -4);
    this.scene.add(rim);

    // Заполняющий свет спереди — без него бойцы на тёмном фоне сливаются в силуэты.
    const fill = new THREE.DirectionalLight(0xffd9b0, 1.0);
    fill.position.set(0, 3, 12);
    this.scene.add(fill);

    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.resize();
  }

  /**
   * Камера держит обоих бойцов в кадре. Дистанция считается из поля зрения:
   * берём большее из «влезает по ширине» и «влезает по высоте», поэтому кадр
   * одинаково корректен и на широком мониторе, и на вертикальном экране телефона.
   */
  follow(midX: number, spread: number, midY: number): void {
    const halfFov = THREE.MathUtils.degToRad(FOV) / 2;
    const neededWidth = Math.min(spread, 13) + 3.4;
    const neededHeight = 3.9 + midY * 0.7;
    const distW = neededWidth / 2 / (Math.tan(halfFov) * this.camera.aspect);
    const distH = neededHeight / 2 / Math.tan(halfFov);
    const targetZ = THREE.MathUtils.clamp(Math.max(distW, distH), 6.2, 26);

    const targetX = midX * 0.6;
    const targetY = 1.85 + midY * 0.45;

    this.camera.position.x += (targetX - this.camera.position.x) * 0.1;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.07;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.07;

    if (this.shakeAmount > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount * 0.5;
      this.shakeAmount *= 0.85;
    }
    this.camera.lookAt(midX * 0.55, 1.5 + midY * 0.45, 0);
  }

  shake(power: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, Math.min(0.9, power));
  }

  render(): void {
    this.time += 1;
    this.renderer.render(this.scene, this.camera);
  }

  private resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.renderer.dispose();
  }
}

function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 500;
  if (coarse && (cores <= 6 || smallScreen)) return 'low';
  return cores <= 2 ? 'low' : 'high';
}
