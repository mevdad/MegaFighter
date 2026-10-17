// Универсальный харнесс клипов (исследовательский, не часть сборки; собирается esbuild в out/harness/clip.js, см. clips_sheet.mjs).
// В отличие от pilot.ts не использует AnimatedFighter и roster: грузит GLB реальным loadContainer из репозитория, вешает anim-компонент
// на копию модели (поворот и масштаб как у AnimatedFighter при facing 1) и ставит ЛЮБОЙ клип GLB на заданное время или играет его.
//   window.shot({ glb, clip, time, view, cx, halfH, loop })  -> { bones, hips, duration, time } после рендера (клип стоит, playing = false)
//   window.play({ glb, clip, loop, ticks, sampleAt })        -> позы, пока anim-компонент реально идёт (app.update(1/60) на каждый тик)
//   window.info(glb)                                         -> [{ name, duration }] по всем клипам контейнера (длительность из AnimTrack движка)
import {
  AppBase, AppOptions, Entity, Color, DEVICETYPE_WEBGL2, createGraphicsDevice,
  RenderComponentSystem, CameraComponentSystem, LightComponentSystem, AnimComponentSystem,
  TextureHandler, ContainerHandler, AnimClipHandler, AnimStateGraphHandler, PROJECTION_ORTHOGRAPHIC, StandardMaterial,
  type AnimTrack,
} from 'playcanvas';
import { loadContainer } from '../../../src/render/assets';

const MEASURED_HEIGHT = 0.9782;

(async () => {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const device = await createGraphicsDevice(canvas, { deviceTypes: [DEVICETYPE_WEBGL2] });
  const options = new AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem, AnimComponentSystem];
  options.resourceHandlers = [TextureHandler, ContainerHandler, AnimClipHandler, AnimStateGraphHandler];
  const app = new AppBase(canvas);
  app.init(options);
  app.requestAnimationFrame = () => undefined;
  app.start();
  app.scene.ambientLight = new Color(0.5, 0.52, 0.6);
  app.scene.exposure = 1.2;

  const cam = new Entity('cam');
  cam.addComponent('camera', { projection: PROJECTION_ORTHOGRAPHIC, orthoHeight: 0.75, clearColor: new Color(0.1, 0.11, 0.16), nearClip: 0.1, farClip: 60 });
  app.root.addChild(cam);
  const sun = new Entity('sun');
  sun.addComponent('light', { type: 'directional', intensity: 1.6, color: new Color(1, 0.95, 0.9) });
  sun.setEulerAngles(40, 30, 0);
  app.root.addChild(sun);

  const ground = new Entity('ground');
  ground.addComponent('render', { type: 'box' });
  ground.setLocalScale(8, 0.02, 4);
  ground.setPosition(0, -0.01, 0);
  const gm = new StandardMaterial();
  gm.diffuse = new Color(0.32, 0.34, 0.4);
  gm.update();
  (ground.render as any).meshInstances[0].material = gm;
  app.root.addChild(ground);
  const markMat = new StandardMaterial();
  markMat.diffuse = new Color(1, 0.8, 0.2);
  markMat.emissive = new Color(1, 0.8, 0.2);
  markMat.update();
  for (let i = -6; i <= 6; i++) {
    const m = new Entity('mark' + i);
    m.addComponent('render', { type: 'box' });
    m.setLocalScale(0.02, 0.022, i === 0 ? 0.6 : 0.3);
    m.setPosition(i * 0.25, 0.0, 0);
    (m.render as any).meshInstances[0].material = markMat;
    app.root.addChild(m);
  }

  type Entry = { root: Entity; visual: Entity; names: string[]; assigned: Set<string>; loaded: Awaited<ReturnType<typeof loadContainer>> };
  const cache = new Map<string, Entry>();
  async function setup(glb: string): Promise<Entry> {
    let e = cache.get(glb);
    if (e) return e;
    const loaded = await loadContainer(app, glb);
    const root = new Entity('root');
    const yaw = new Entity('yaw');
    const visual = loaded.instantiate();
    // как AnimatedFighter при facing = 1: rig.yaw 270 + 180 = 90 градусов; масштаб 1 (метры рига)
    yaw.setLocalEulerAngles(0, 90, 0);
    yaw.addChild(visual);
    root.addChild(yaw);
    root.enabled = false;
    app.root.addChild(root);
    visual.addComponent('anim', { activate: true, speed: 1 });
    e = { root, visual, names: [], assigned: new Set(), loaded };
    cache.set(glb, e);
    return e;
  }
  /** Клип -> состояние anim-слоя. Как в AnimatedFighter: assignAnimation(имя, трек, слой, speed, loop). */
  function assign(e: Entry, clip: string, loop: boolean) {
    const key = `${clip}|${loop}`;
    if (e.assigned.has(key)) return key;
    const track = e.loaded.clip(clip).resource as AnimTrack;
    e.visual.anim!.assignAnimation(key, track, undefined, 1, loop);
    e.assigned.add(key);
    return key;
  }
  const BONES = ['Hips', 'Spine', 'Head', 'RightHand', 'LeftHand', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End', 'HeadTop_End'];
  const readBones = (e: Entry) => {
    const out: Record<string, number[]> = {};
    for (const n of BONES) {
      const b = e.visual.findByName('mixamorig:' + n) as Entity | null;
      if (!b) continue;
      const p = b.getPosition();
      out[n] = [p.x, p.y, p.z];
    }
    return out;
  };
  const use = (glb: string, e: Entry) => { for (const [k, v] of cache) v.root.enabled = k === glb; void e; };

  (window as any).info = async (glb: string) => {
    const e = await setup(glb);
    return e.loaded.clipNames.map((n) => ({ name: n, duration: (e.loaded.clip(n).resource as AnimTrack).duration }));
  };

  (window as any).shot = async (o: { glb: string; clip: string; time: number; view?: 'side' | 'three'; cx?: number; halfH?: number; loop?: boolean }) => {
    const e = await setup(o.glb);
    use(o.glb, e);
    const key = assign(e, o.clip, !!o.loop);
    const layer = e.visual.anim!.baseLayer!;
    layer.playing = true;
    layer.transition(key, 0);
    app.update(1 / 60); // переход в состояние (это и есть первое время кадра, поэтому ниже время выставляется заново)
    layer.playing = false;
    layer.activeStateCurrentTime = o.time;
    app.update(0); app.update(0);
    const view = o.view ?? 'side';
    const a = ((view === 'side' ? 0 : 40) * Math.PI) / 180;
    const cx = o.cx ?? 0, halfH = o.halfH ?? 0.75;
    cam.camera!.orthoHeight = halfH;
    cam.setPosition(cx + Math.sin(a) * 10, halfH - 0.1, Math.cos(a) * 10);
    cam.lookAt(cx, halfH - 0.1, 0);
    app.render();
    return { bones: readBones(e), duration: layer.activeStateDuration, time: layer.activeStateCurrentTime, state: layer.activeState };
  };

  (window as any).play = async (o: { glb: string; clip: string; loop: boolean; ticks: number; sampleAt: number[]; dt?: number }) => {
    const e = await setup(o.glb);
    use(o.glb, e);
    const key = assign(e, o.clip, o.loop);
    const layer = e.visual.anim!.baseLayer!;
    layer.playing = true;
    layer.transition(key, 0);
    const samples: { tick: number; time: number; progress: number; bones: Record<string, number[]> }[] = [];
    for (let t = 0; t <= o.ticks; t++) {
      app.update(o.dt ?? 1 / 60);
      if (o.sampleAt.includes(t)) samples.push({ tick: t, time: layer.activeStateCurrentTime, progress: layer.activeStateProgress, bones: readBones(e) });
    }
    return { samples, duration: layer.activeStateDuration, playing: layer.playing };
  };
  (window as any).ready = true;
})().catch((e) => { (window as any).err = String((e && e.stack) || e); console.error(e); });
