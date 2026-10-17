/**
 * Минимальный читатель бинарного FBX 7.x (только то, что нужно для анимации Mixamo).
 * Ничего не исполняет, зависимостей нет: распаковка массивов через node:zlib (как zlib в
 * scripts/clips-audit/dump.py, который послужил образцом).
 *
 *   parseFbx(buffer)      -> дерево узлов { name, props[], children[] }
 *   loadFbxAnim(file)     -> { bones, order, nkeys, ... } (см. ниже)
 *
 * Модель трансформа (проверена аудитом, AUDIT_CLIPS §0, и здесь утверждениями assert*):
 *   local = T(Lcl Translation) · R(PreRotation) · R(Lcl Rotation),  R = Rz·Ry·Rx  (eEulerXYZ).
 * Пивотов, масштабов и GeometricTransform в этих файлах нет, если встретятся, загрузка падает.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

/** Тики FBX на секунду и на кадр 30 к/с. */
export const KTIME_PER_SEC = 46186158000;
export const KTIME_30 = KTIME_PER_SEC / 30; // 1539538600, делится нацело

// ---------------------------------------------------------------- бинарный разбор
export function parseFbx(buf) {
  if (buf.toString('latin1', 0, 20) !== 'Kaydara FBX Binary  ') throw new Error('Не бинарный FBX');
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500; // с 7.5 поля заголовка узла 64-битные
  const hdr = wide ? 25 : 13;
  const u = (p) => (wide ? Number(buf.readBigUInt64LE(p)) : buf.readUInt32LE(p));
  const arr = (t, n, raw) => {
    // копируем в выровненный буфер: срез Buffer не гарантирует выравнивание
    const a = Buffer.from(raw);
    const read = { f: (i) => a.readFloatLE(i * 4), d: (i) => a.readDoubleLE(i * 8), i: (i) => a.readInt32LE(i * 4), l: (i) => Number(a.readBigInt64LE(i * 8)), b: (i) => a[i] }[t];
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = read(i);
    return out;
  };
  const SZ = { f: 4, d: 8, i: 4, l: 8, b: 1 };
  function parse(pos, limit) {
    const nodes = [];
    while (pos < limit) {
      const end = u(pos), np = u(pos + (wide ? 8 : 4)), pl = u(pos + (wide ? 16 : 8)), nl = buf[pos + (wide ? 24 : 12)];
      if (end === 0) return { nodes, pos: pos + hdr };
      const name = buf.toString('latin1', pos + hdr, pos + hdr + nl);
      let p = pos + hdr + nl;
      const pend = p + pl;
      const props = [];
      for (let k = 0; k < np; k++) {
        const t = String.fromCharCode(buf[p++]);
        if (t === 'Y') { props.push(buf.readInt16LE(p)); p += 2; }
        else if (t === 'C') { props.push(buf[p]); p += 1; }
        else if (t === 'F') { props.push(buf.readFloatLE(p)); p += 4; }
        else if (t === 'D') { props.push(buf.readDoubleLE(p)); p += 8; }
        else if (t === 'I') { props.push(buf.readInt32LE(p)); p += 4; }
        else if (t === 'L') { props.push(Number(buf.readBigInt64LE(p))); p += 8; }
        else if (t === 'S' || t === 'R') {
          const l = buf.readUInt32LE(p); p += 4;
          props.push(t === 'S' ? buf.toString('latin1', p, p + l) : null); p += l;
        } else if (SZ[t]) {
          const n = buf.readUInt32LE(p), enc = buf.readUInt32LE(p + 4), cl = buf.readUInt32LE(p + 8); p += 12;
          let raw = buf.subarray(p, p + cl); p += cl;
          if (enc) raw = zlib.inflateSync(raw);
          props.push(arr(t, n, raw));
        } else throw new Error(`FBX: неизвестный тип свойства «${t}»`);
      }
      let children = [];
      if (pend < end) children = parse(pend, end).nodes;
      nodes.push({ name, props, children });
      pos = end;
    }
    return { nodes, pos };
  }
  return { version, nodes: parse(27, buf.length).nodes };
}

const find = (ns, name) => ns.find((n) => n.name === name);
const nm = (s) => String(s).split('\x00')[0];

// ---------------------------------------------------------------- анимация
/**
 * Читает Model-узлы и анимационные кривые.
 * Возвращает:
 *   bones: Map<имя, { name, parent (имя|null), pre:[x,y,z]°, lclT:[3], lclR:[3]°,
 *                     rot: [X,Y,Z] -> массив значений по кадрам | null, trans: то же | null }>
 *   order: имена костей в порядке родитель-раньше-потомка
 *   nkeys: число кадров (ключи лежат строго на сетке 30 к/с с t=0, проверяется)
 */
export function loadFbxAnim(file) {
  const { version, nodes } = parseFbx(fs.readFileSync(file));
  const objs = find(nodes, 'Objects').children;
  const models = new Map(); // id -> { name, type, props }
  for (const n of objs) {
    if (n.name !== 'Model') continue;
    const props = {};
    const p70 = find(n.children, 'Properties70');
    for (const c of p70?.children ?? []) if (c.name === 'P' && c.props.length >= 5) props[c.props[0]] = c.props.slice(4);
    models.set(n.props[0], { name: nm(n.props[1]), type: n.props[2], props });
  }
  const cnodes = new Set(objs.filter((n) => n.name === 'AnimationCurveNode').map((n) => n.props[0]));
  const curves = new Map();
  for (const n of objs) {
    if (n.name !== 'AnimationCurve') continue;
    curves.set(n.props[0], { t: find(n.children, 'KeyTime').props[0], v: find(n.children, 'KeyValueFloat').props[0] });
  }
  const parent = new Map(), cnModel = new Map(), cvCn = new Map();
  for (const c of find(nodes, 'Connections').children) {
    const [kind, a, b, prop] = c.props;
    if (kind === 'OO' && models.has(a) && models.has(b)) parent.set(a, b);
    if (kind === 'OP' && cnodes.has(a) && models.has(b)) cnModel.set(a, { model: b, channel: prop });
    if (kind === 'OP' && curves.has(a) && cnodes.has(b)) {
      if (!cvCn.has(b)) cvCn.set(b, {});
      cvCn.get(b)[prop] = a;
    }
  }

  const limbs = [...models].filter(([, m]) => m.type === 'LimbNode');
  const bones = new Map();
  const idToName = new Map(limbs.map(([id, m]) => [id, m.name]));
  const ZERO = [0, 0, 0], ONE = [1, 1, 1];
  const vec = (p, key, dflt) => (p[key] ? p[key].slice(0, 3) : dflt);
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  for (const [id, m] of limbs) {
    const p = m.props;
    for (const k of ['RotationOffset', 'RotationPivot', 'ScalingOffset', 'ScalingPivot', 'GeometricTranslation', 'GeometricRotation', 'PostRotation']) {
      if (p[k] && !near(p[k].slice(0, 3), ZERO)) throw new Error(`${file}: ${m.name}: свойство ${k} != 0 не поддерживается`);
    }
    if (p['Lcl Scaling'] && !near(p['Lcl Scaling'].slice(0, 3), ONE)) throw new Error(`${file}: ${m.name}: Lcl Scaling != 1 не поддерживается`);
    if (p.RotationOrder && p.RotationOrder[0] !== 0) throw new Error(`${file}: ${m.name}: RotationOrder ${p.RotationOrder[0]} (поддерживается только XYZ)`);
    bones.set(m.name, {
      name: m.name,
      parent: idToName.get(parent.get(id)) ?? null,
      pre: vec(p, 'PreRotation', ZERO),
      lclT: vec(p, 'Lcl Translation', ZERO),
      lclR: vec(p, 'Lcl Rotation', ZERO),
      rot: null,
      trans: null,
    });
  }
  let nkeys = 1;
  for (const [cid, { model, channel }] of cnModel) {
    const bone = bones.get(idToName.get(model));
    if (!bone) continue;
    const slot = channel === 'Lcl Rotation' ? 'rot' : channel === 'Lcl Translation' ? 'trans' : null;
    if (!slot) throw new Error(`${file}: ${bone.name}: канал «${channel}» не поддерживается`);
    const axes = ['d|X', 'd|Y', 'd|Z'].map((ax) => {
      const c = curves.get(cvCn.get(cid)?.[ax]);
      if (!c) return null;
      c.t.forEach((t, i) => { if (t !== i * KTIME_30) throw new Error(`${file}: ${bone.name}: ключ ${i} не на сетке 30 к/с с t=0`); });
      return c.v;
    });
    bone[slot] = axes;
    for (const a of axes) if (a && a.length > 1) nkeys = Math.max(nkeys, a.length);
  }
  for (const b of bones.values()) {
    for (const slot of ['rot', 'trans']) {
      if (!b[slot]) continue;
      b[slot] = b[slot].map((a, k) => {
        const dflt = (slot === 'rot' ? b.lclR : b.lclT)[k];
        if (!a) return Array(nkeys).fill(dflt);
        if (a.length === 1) return Array(nkeys).fill(a[0]);
        if (a.length !== nkeys) throw new Error(`${file}: ${b.name}: ${a.length} ключей вместо ${nkeys}`);
        return a;
      });
    }
  }
  // топологический порядок
  const order = [], seen = new Set();
  const add = (n) => {
    if (seen.has(n)) return;
    const p = bones.get(n).parent;
    if (p && bones.has(p)) add(p);
    seen.add(n); order.push(n);
  };
  for (const n of bones.keys()) add(n);
  return { version, bones, order, nkeys };
}

// ---------------------------------------------------------------- математика вращений
const D2R = Math.PI / 180;
/** Кватернион [x,y,z,w] эйлера XYZ в градусах: R = Rz·Ry·Rx (порядок FBX eEulerXYZ). */
export function quatEulerXYZ(xd, yd, zd) {
  const h = (a) => [Math.sin(a * D2R / 2), Math.cos(a * D2R / 2)];
  const [sx, cx] = h(xd), [sy, cy] = h(yd), [sz, cz] = h(zd);
  const qx = [sx, 0, 0, cx], qy = [0, sy, 0, cy], qz = [0, 0, sz, cz];
  return qmul(qz, qmul(qy, qx));
}
/** Произведение кватернионов a·b ([x,y,z,w]). */
export function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return q.map((x) => x / l);
}
/** Поворот вектора кватернионом. */
export function qrot(q, v) {
  const [x, y, z, w] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [
    v[0] + w * t[0] + (y * t[2] - z * t[1]),
    v[1] + w * t[1] + (z * t[0] - x * t[2]),
    v[2] + w * t[2] + (x * t[1] - y * t[0]),
  ];
}
