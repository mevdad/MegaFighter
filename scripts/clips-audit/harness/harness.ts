// Харнесс для shoot.mjs (исследовательский, не часть сборки; собирается esbuild в out/harness/bundle.js, см. README): грузит РЕАЛЬНЫЙ AnimatedFighter/Fighter из репо,
// ставит бойца в hk на заданном moveFrame, рисует хёртбокс/хитбокс/маркеры поверх.
import {
  AppBase, AppOptions, Entity, Color, DEVICETYPE_WEBGL2, createGraphicsDevice, Vec3,
  RenderComponentSystem, CameraComponentSystem, LightComponentSystem, AnimComponentSystem,
  TextureHandler, ContainerHandler, AnimClipHandler, AnimStateGraphHandler, PROJECTION_ORTHOGRAPHIC,
} from 'playcanvas';
import { loadContainer } from '../../../src/render/assets';
import { AnimatedFighter } from '../../../src/render/animatedFighter';
import { Fighter } from '../../../src/game/fighter';
import { getCharacter } from '../../../src/characters/roster';

const q = new URLSearchParams(location.search);
const glbUrl = q.get('glb') ?? 'models/warrior3.glb';
const label = q.get('label') ?? glbUrl;

const OW = 1280, OH = 800;
const VIEW = { cx: 0.55, cy: 1.05, halfH: 1.18 }; // ортокамера, метры
const PPM = OH / (VIEW.halfH * 2);
const sx = (x: number) => OW / 2 + (x - VIEW.cx) * PPM;
const sy = (y: number) => OH / 2 - (y - VIEW.cy) * PPM;

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
  app.scene.ambientLight = new Color(0.45, 0.47, 0.55);
  app.scene.exposure = 1.2;

  const cam = new Entity('cam');
  cam.addComponent('camera', { projection: PROJECTION_ORTHOGRAPHIC, orthoHeight: VIEW.halfH, clearColor: new Color(0.1, 0.11, 0.16), nearClip: 0.1, farClip: 50 });
  cam.setPosition(VIEW.cx, VIEW.cy, 10);
  app.root.addChild(cam);
  const sun = new Entity('sun');
  sun.addComponent('light', { type: 'directional', intensity: 1.6, color: new Color(1, 0.95, 0.9) });
  sun.setEulerAngles(30, 25, 0);
  app.root.addChild(sun);

  const spec = getCharacter('terraks');
  const loaded = await loadContainer(app, glbUrl);
  const vis = new AnimatedFighter(spec, loaded, spec.animatedRig!);
  app.root.addChild(vis.root);
  const fighter = new Fighter(spec, 0);
  fighter.reset(0, 1);
  const hk = spec.normals.hk;

  const ov = (document.getElementById('ov') as HTMLCanvasElement).getContext('2d')!;
  const find = (n: string) => vis.root.findByName('mixamorig:' + n) as Entity | null;
  const bones = { hips: find('Hips')!, lf: find('LeftFoot')!, rf: find('RightFoot')!, lt: find('LeftToe_End') ?? find('LeftToeBase'), rt: find('RightToe_End') ?? find('RightToeBase') };
  const P = (e: Entity | null): [number, number, number] => { const p = e!.getPosition(); return [p.x, p.y, p.z]; };

  const rect = (r: { x: number; y: number; w: number; h: number }) => ({ l: sx(r.x - r.w / 2), t: sy(r.y + r.h / 2), w: r.w * PPM, h: r.h * PPM });

  function setFrame(n: number) {
    fighter.state = 'attack';
    fighter.move = hk;
    fighter.moveFrame = n;
    fighter.y = 0;
    vis.place(fighter.x, fighter.y, 1);
    // два тика для transition + выставление времени, потом анимация обновляется движком
    vis.sync(fighter);
    app.update(1 / 60);
    vis.sync(fighter);
    app.update(0);
    app.update(0);
    const total = hk.startup + hk.active + hk.recovery;
    const clipT = (Math.min(1, n / total)) * 0.9;

    app.render();
    // ---- оверлей
    ov.clearRect(0, 0, OW, OH);
    // земля
    ov.strokeStyle = '#9aa0b0'; ov.lineWidth = 2; ov.beginPath(); ov.moveTo(0, sy(0)); ov.lineTo(OW, sy(0)); ov.stroke();
    ov.fillStyle = '#9aa0b0'; ov.font = '14px monospace'; ov.fillText('ground y=0', 8, sy(0) - 6);
    // 1 м шкала
    ov.strokeStyle = '#555a6e'; ov.lineWidth = 1;
    for (let m = -1; m <= 3; m++) { ov.beginPath(); ov.moveTo(sx(m), sy(0)); ov.lineTo(sx(m), sy(0) + 10); ov.stroke(); ov.fillStyle = '#777'; ov.fillText(m + 'm', sx(m) - 8, sy(0) + 24); }
    // fighter.x
    ov.strokeStyle = '#ffd34d'; ov.setLineDash([8, 6]); ov.lineWidth = 2; ov.beginPath(); ov.moveTo(sx(fighter.x), 0); ov.lineTo(sx(fighter.x), sy(0)); ov.stroke(); ov.setLineDash([]);
    ov.fillStyle = '#ffd34d'; ov.fillText('fighter.x = ' + fighter.x.toFixed(2), sx(fighter.x) + 6, 22);
    // хёртбокс
    const hb = fighter.hurtbox; const r = rect(hb);
    ov.strokeStyle = '#38e0ff'; ov.lineWidth = 3; ov.strokeRect(r.l, r.t, r.w, r.h);
    ov.fillStyle = 'rgba(56,224,255,0.07)'; ov.fillRect(r.l, r.t, r.w, r.h);
    ov.fillStyle = '#38e0ff'; ov.fillText('hurtbox', r.l + 4, r.t + 16);
    // хитбокс hk (из frame data; рисуем всегда, ярко — на активных кадрах)
    const box = hk.hitbox;
    const hit = { x: fighter.x + box.x * fighter.facing, y: fighter.y + box.y, w: box.w, h: box.h };
    // Rect в Fighter: x — центр? hitbox() использует тот же формат, что hurtbox (x центр) — рисуем как есть
    const active = n >= hk.startup && n < hk.startup + hk.active;
    const hr = rect(hit);
    ov.strokeStyle = active ? '#ff3b3b' : '#a85a5a'; ov.lineWidth = active ? 4 : 2; ov.setLineDash(active ? [] : [6, 6]);
    ov.strokeRect(hr.l, hr.t, hr.w, hr.h); ov.setLineDash([]);
    ov.fillStyle = active ? '#ff6060' : '#c08080'; ov.fillText(active ? 'hitbox hk ACTIVE' : 'hitbox hk (inactive, ref)', hr.l + 4, hr.t - 6);
    // маркеры костей
    const hips = P(bones.hips), lf = P(bones.lf), rf = P(bones.rf), lt = P(bones.lt), rt = P(bones.rt);
    const dot = (p: number[], color: string, txt: string, shape: 'c' | 'd' | 's', dy = 0) => {
      const x = sx(p[0]), y = sy(p[1]); ov.fillStyle = color; ov.strokeStyle = '#000'; ov.lineWidth = 2; ov.beginPath();
      if (shape === 'c') ov.arc(x, y, 8, 0, 7); else if (shape === 'd') { ov.moveTo(x, y - 10); ov.lineTo(x + 10, y); ov.lineTo(x, y + 10); ov.lineTo(x - 10, y); ov.closePath(); } else ov.rect(x - 6, y - 6, 12, 12);
      ov.fill(); ov.stroke(); ov.fillStyle = color; ov.font = 'bold 14px monospace'; ov.fillText(txt, x + 12, y + 5 + dy);
    };
    const dx = (p: number[]) => (p[0] - fighter.x).toFixed(2);
    dot(hips, '#ff4fd8', 'hips dx=' + dx(hips), 'd');
    dot(lf, '#5dff7a', 'L ankle dx=' + dx(lf), 'c', -14);
    dot(rf, '#ffa94d', 'R ankle dx=' + dx(rf), 'c', 14);
    dot(lt, '#5dff7a', 'L toe dx=' + dx(lt), 's', -2);
    dot(rt, '#ffa94d', 'R toe dx=' + dx(rt), 's', 26);
    // шапка
    ov.fillStyle = '#fff'; ov.font = 'bold 20px monospace';
    ov.fillText(`${label} | kick_high | moveFrame ${n}/${total} | clipTime ${clipT.toFixed(3)}s`, 12, OH - 14);

    const frontEdge = hb.x + hb.w / 2 - fighter.x;
    return {
      n, clipT, frontEdge, active,
      hips: hips.map((v) => +v.toFixed(4)), lf: lf.map((v) => +v.toFixed(4)), rf: rf.map((v) => +v.toFixed(4)),
      lt: lt.map((v) => +v.toFixed(4)), rt: rt.map((v) => +v.toFixed(4)),
    };
  }
  (window as any).setFrame = setFrame;
  (window as any).meta = { total: hk.startup + hk.active + hk.recovery, startup: hk.startup, active: hk.active, hitbox: hk.hitbox, hurtbox: fighter.hurtbox, clipNames: loaded.clipNames };
  (window as any).ready = true;
})().catch((e) => { (window as any).err = String(e && e.stack || e); console.error(e); });
