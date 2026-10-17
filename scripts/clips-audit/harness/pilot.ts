// Харнесс для pilot_shoot.mjs (исследовательский, не часть сборки; собирается esbuild в out/harness/pilot.js, см. README).
// Грузит РЕАЛЬНЫЙ AnimatedFighter/Fighter из репозитория и ставит клип на заданный локальный кадр.
//   window.shot(opts) -> { ok, bones } после рендера; opts: { glb, clip, frame, view, old }
//   clip: fighting_idle | jab | cross_punch | martelo_2 (новые) или kick_high | punch_heavy (старые из базы, old: true)
import {
  AppBase, AppOptions, Entity, Color, DEVICETYPE_WEBGL2, createGraphicsDevice,
  RenderComponentSystem, CameraComponentSystem, LightComponentSystem, AnimComponentSystem,
  TextureHandler, ContainerHandler, AnimClipHandler, AnimStateGraphHandler, PROJECTION_ORTHOGRAPHIC, StandardMaterial,
} from 'playcanvas';
import { loadContainer } from '../../../src/render/assets';
import { AnimatedFighter } from '../../../src/render/animatedFighter';
import { Fighter } from '../../../src/game/fighter';
import { getCharacter } from '../../../src/characters/roster';
import { dimensions } from '../../../src/game/dims';

const OW = 600, OH = 840;
const HALF_H = 1.25;

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
  cam.addComponent('camera', { projection: PROJECTION_ORTHOGRAPHIC, orthoHeight: HALF_H, clearColor: new Color(0.1, 0.11, 0.16), nearClip: 0.1, farClip: 60 });
  app.root.addChild(cam);
  const sun = new Entity('sun');
  sun.addComponent('light', { type: 'directional', intensity: 1.6, color: new Color(1, 0.95, 0.9) });
  sun.setEulerAngles(40, 30, 0);
  app.root.addChild(sun);

  // земля: тонкая плита на y = 0 и отметки каждые 0,5 м вдоль X (направление взгляда бойца)
  const ground = new Entity('ground');
  ground.addComponent('render', { type: 'box' });
  ground.setLocalScale(4, 0.02, 4);
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
  for (let i = -3; i <= 3; i++) {
    const m = new Entity('mark' + i);
    m.addComponent('render', { type: 'box' });
    m.setLocalScale(0.02, 0.022, i === 0 ? 0.6 : 0.3);
    m.setPosition(i * 0.5, 0.0, 0);
    (m.render as any).meshInstances[0].material = markMat;
    app.root.addChild(m);
  }

  const spec = getCharacter('terraks');
  const cache = new Map<string, { vis: AnimatedFighter; fighter: Fighter }>();
  const bonesOf = (vis: AnimatedFighter) => {
    const find = (n: string) => vis.root.findByName('mixamorig:' + n) as Entity;
    return ['Hips', 'RightHand', 'LeftHand', 'LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot', 'Head'].map((n) => [n, find(n)] as const);
  };

  async function setup(glb: string, old: boolean) {
    const key = glb + (old ? '|old' : '');
    let e = cache.get(key);
    if (e) return e;
    const loaded = await loadContainer(app, glb);
    const rig = old
      ? { ...spec.animatedRig!, idleClip: 'idle_hold', runClip: 'idle_hold', punch: { clip: 'punch_body', start: 0, end: 0.9 }, punchHeavy: { clip: 'punch_heavy', start: 0, end: 1.3 }, kick: { clip: 'kick_high', start: 0, end: 0.9 } }
      : spec.animatedRig!;
    const vis = new AnimatedFighter(spec, loaded, rig);
    vis.root.enabled = false;
    app.root.addChild(vis.root);
    const fighter = new Fighter(spec, 0);
    fighter.reset(0, 1);
    e = { vis, fighter };
    cache.set(key, e);
    return e;
  }

  (window as any).shot = async (o: { glb: string; clip: string; frame: number; view: 'side' | 'three' | 'front'; old?: boolean; fps?: number; label?: string }) => {
    const { vis, fighter } = await setup(o.glb, !!o.old);
    for (const [k, v] of cache) v.vis.root.enabled = v.vis === vis; // один боец в кадре
    const stateOf: Record<string, string> = { fighting_idle: 'idle', jab: 'lp', cross_punch: 'hp', martelo_2: 'hk', kick_high: 'hk', punch_heavy: 'hp', punch_body: 'lp', idle_hold: 'idle' };
    const mv = stateOf[o.clip];
    fighter.y = 0;
    if (mv === 'idle') { fighter.state = 'idle'; fighter.move = null as any; }
    else { fighter.state = 'attack'; fighter.move = spec.normals[mv]; fighter.moveFrame = 1; }
    vis.place(0, 0, 1);
    vis.sync(fighter); app.update(1 / 60); vis.sync(fighter); app.update(0);
    const layer = (vis as any).visual.anim.baseLayer;
    layer.playing = false;
    layer.activeStateCurrentTime = Math.min(o.frame / 30 + (o.old ? 1 / 30 : 0), layer.activeStateDuration - 1e-4); // старые клипы: первый ключ на 1/30 с
    app.update(0); app.update(0);

    const hips = (vis.root.findByName('mixamorig:Hips') as Entity).getPosition();
    const ang = o.view === 'side' ? 0 : o.view === 'three' ? 40 : 90;
    const a = (ang * Math.PI) / 180;
    const cx = 0.3; // боец смотрит в +X: сдвигаем камеру вперёд, чтобы вынос ноги не обрезался
    cam.setPosition(cx + Math.sin(a) * 10, 1.0, Math.cos(a) * 10);
    cam.lookAt(cx, 1.0, 0);
    app.render();
    const bones: Record<string, number[]> = {};
    for (const [n, e] of bonesOf(vis)) { const p = e.getPosition(); bones[n] = [p.x, p.y, p.z]; }
    const scale = dimensions(spec).height / 0.9782;
    return { bones, hips: [hips.x, hips.y, hips.z], scale, time: layer.activeStateCurrentTime, clipName: (vis as any).debugClip?.clip };
  };
  (window as any).ready = true;
})().catch((e) => { (window as any).err = String((e && e.stack) || e); console.error(e); });
