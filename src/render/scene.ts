import {
  AnimClipHandler,
  AnimComponentSystem,
  AnimStateGraphHandler,
  AppBase,
  AppOptions,
  CameraComponentSystem,
  Color,
  ContainerHandler,
  DEVICETYPE_WEBGL2,
  Entity,
  FILLMODE_FILL_WINDOW,
  FOG_LINEAR,
  LightComponentSystem,
  ParticleSystemComponentSystem,
  RESOLUTION_AUTO,
  RenderComponentSystem,
  TextureHandler,
  TONEMAP_ACES,
  createGraphicsDevice,
} from 'playcanvas';

export type Quality = 'low' | 'high';

const FOV = 40;

/** Пакует 0xRRGGBB в pc.Color (0..1 на канал), как ожидает движок. */
export function hexColor(hex: number, a = 1): Color {
  return new Color(((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255, a);
}

/**
 * Обёртка над PlayCanvas-приложением: канвас, камера, свет, ресайз, тряска экрана.
 * Движок не крутит свой rAF — кадр рисует наш GameLoop (см. core/loop.ts), поэтому
 * requestAnimationFrame у app глушится сразу после start(), а update()/render() вызываются
 * вручную из render().
 */
export class SceneView {
  readonly app: AppBase;
  readonly root: Entity;
  readonly camera: Entity;
  readonly quality: Quality;

  private readonly key: Entity;
  private shakeAmount = 0;
  private lastTime = 0;
  private camX = 0;
  private camY = 1.9;
  private camZ = 9;

  private constructor(app: AppBase, quality: Quality) {
    this.app = app;
    this.root = app.root;
    this.quality = quality;

    app.scene.ambientLight = hexColor(0x50597a);
    app.scene.exposure = 1.35;
    app.scene.fog.type = FOG_LINEAR;
    app.scene.fog.color = hexColor(0x11121c);
    app.scene.fog.start = 16;
    app.scene.fog.end = 40;

    this.camera = new Entity('camera');
    this.camera.addComponent('camera', {
      clearColor: hexColor(0x11121c),
      fov: FOV,
      nearClip: 0.1,
      farClip: 90,
      toneMapping: TONEMAP_ACES,
    });
    app.root.addChild(this.camera);
    this.camera.setPosition(this.camX, this.camY, this.camZ);
    this.camera.lookAt(0, 1.2, 0);

    this.key = new Entity('key-light');
    this.key.addComponent('light', {
      type: 'directional',
      color: hexColor(0xfff0d8),
      intensity: 2.6,
      castShadows: quality === 'high',
      shadowResolution: 1024,
      shadowDistance: 30,
      shadowBias: 0.03,
      normalOffsetBias: 0.05,
    });
    app.root.addChild(this.key);
    this.key.setEulerAngles(55, 24, 0);

    // Холодная контровая подсветка — отделяет бойцов от тёмного задника.
    const rim = new Entity('rim-light');
    rim.addComponent('light', { type: 'directional', color: hexColor(0x7fb4ff), intensity: 1.5 });
    app.root.addChild(rim);
    rim.setEulerAngles(35, -125, 0);

    // Заполняющий свет спереди — без него бойцы на тёмном фоне сливаются в силуэты.
    const fill = new Entity('fill-light');
    fill.addComponent('light', { type: 'directional', color: hexColor(0xffd9b0), intensity: 1.0 });
    app.root.addChild(fill);
    fill.setEulerAngles(-14, 0, 0);

    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.resize();
    this.lastTime = performance.now();
  }

  static async create(canvas: HTMLCanvasElement): Promise<SceneView> {
    const quality = detectQuality();

    const device = await createGraphicsDevice(canvas, { deviceTypes: [DEVICETYPE_WEBGL2] });
    device.maxPixelRatio = Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.25);

    const options = new AppOptions();
    options.graphicsDevice = device;
    options.componentSystems = [
      RenderComponentSystem,
      CameraComponentSystem,
      LightComponentSystem,
      AnimComponentSystem,
      ParticleSystemComponentSystem,
    ];
    options.resourceHandlers = [TextureHandler, ContainerHandler, AnimClipHandler, AnimStateGraphHandler];

    const app = new AppBase(canvas);
    app.init(options);
    app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(RESOLUTION_AUTO);

    // Свой цикл кадра нам не нужен — рисует core/loop.ts; глушим внутренний rAF движка.
    app.requestAnimationFrame = () => undefined;
    app.start();

    return new SceneView(app, quality);
  }

  /**
   * Камера держит обоих бойцов в кадре. Дистанция считается из поля зрения:
   * берём большее из «влезает по ширине» и «влезает по высоте», поэтому кадр
   * одинаково корректен и на широком мониторе, и на вертикальном экране телефона.
   */
  follow(midX: number, spread: number, midY: number): void {
    const halfFov = ((FOV * Math.PI) / 180) / 2;
    const neededWidth = Math.min(spread, 13) + 3.4;
    const neededHeight = 3.9 + midY * 0.7;
    const aspect = this.camera.camera?.aspectRatio ?? 16 / 9;
    const distW = neededWidth / 2 / (Math.tan(halfFov) * aspect);
    const distH = neededHeight / 2 / Math.tan(halfFov);
    const targetZ = clamp(Math.max(distW, distH), 6.2, 26);

    const targetX = midX * 0.6;
    const targetY = 1.85 + midY * 0.45;

    this.camX += (targetX - this.camX) * 0.1;
    this.camY += (targetY - this.camY) * 0.07;
    this.camZ += (targetZ - this.camZ) * 0.07;

    if (this.shakeAmount > 0.001) {
      this.camX += (Math.random() - 0.5) * this.shakeAmount * 0.6;
      this.camY += (Math.random() - 0.5) * this.shakeAmount * 0.5;
      this.shakeAmount *= 0.85;
    }
    this.camera.setPosition(this.camX, this.camY, this.camZ);
    this.camera.lookAt(midX * 0.55, 1.5 + midY * 0.45, 0);
  }

  shake(power: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, Math.min(0.9, power));
  }

  render(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.app.update(dt);
    this.app.render();
  }

  private resize = (): void => {
    this.app.resizeCanvas();
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.app.destroy();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 500;
  if (coarse && (cores <= 6 || smallScreen)) return 'low';
  return cores <= 2 ? 'low' : 'high';
}
