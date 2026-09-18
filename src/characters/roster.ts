import * as MF from './moveFactory';
import type { CharacterSpec } from '../game/types';

/**
 * Восемь бойцов. Каждый — это связка «силуэт + палитра + статы + три спешла + супер»,
 * а не перекрашенная копия: рашдаун реально быстрее, грэпплер реально толще и медленнее.
 */

interface Blueprint {
  id: string;
  name: string;
  title: string;
  bio: string;
  style: string;
  palette: CharacterSpec['palette'];
  build: CharacterSpec['build'];
  stats: CharacterSpec['stats'];
  tuning: MF.Tuning;
  specials: CharacterSpec['specials'];
  finisher: CharacterSpec['finisher'];
  silhouette: CharacterSpec['silhouette'];
}

const BLUEPRINTS: Blueprint[] = [
  {
    id: 'kaira',
    name: 'КАЙРА',
    title: 'Ртутный клинок',
    bio: 'Беглый прототип боевого андроида. Не помнит, кем была до перепрошивки, и не собирается вспоминать.',
    style: 'Рашдаун · давление вплотную',
    palette: { primary: 0x1fb6c9, secondary: 0x123b47, accent: 0x7ef3ff, skin: 0xd7c3a8, trim: 0xe8f7ff, aura: 0x6ff0ff },
    build: { height: 0.97, bulk: 0.86, headScale: 0.98, limbLength: 1.02, shoulderSpread: 0.94 },
    stats: {
      maxHealth: 990,
      walkSpeed: 0.068,
      backSpeed: 0.056,
      dashSpeed: 0.2,
      jumpPower: 0.222,
      weight: 0.9,
      defense: 1.0,
      meterRate: 1.15,
    },
    tuning: { reach: 1.0, power: 1.02, speed: 1.16 },
    specials: [
      MF.makeSpecial(MF.PROJECTILE, 'dart', 'Ртутный дротик', 'Быстрый короткий снаряд. Держит противника на месте.', {
        damage: 62,
        startup: 11,
        recovery: 22,
        projectile: { speed: 0.3, y: 1.16, radius: 0.2, lifetime: 70 },
      }),
      MF.makeSpecial(MF.BLINK, 'phase', 'Фазовый рывок', 'Проскок сквозь дистанцию с ударом на выходе.', {
        damage: 76,
        lunge: { x: 0.86, y: 0.04 },
      }),
      MF.makeSpecial(MF.RISING, 'edge', 'Восходящий срез', 'Антивоздушка. Подбрасывает и открывает комбо.', {
        damage: 104,
      }),
      MF.makeSpecial(MF.SUPER, 'cascade', 'Каскад лезвий', 'Супер за полную шкалу.', { damage: 248 }),
    ],
    finisher: { name: 'НОЛЬ КЕЛЬВИНА', description: 'Мгновенная заморозка арены вокруг противника.' },
    silhouette: 'visor',
  },
  {
    id: 'obsidian',
    name: 'ОБСИДИАН',
    title: 'Ходячий разлом',
    bio: 'Его тело — застывшая лава подземного храма. Каждый шаг оставляет трещину в полу арены.',
    style: 'Грэпплер · тяжёлый размен',
    palette: { primary: 0x52406e, secondary: 0x2a1f3d, accent: 0xb46bff, skin: 0x7a6890, trim: 0xd9b6ff, aura: 0xa15cff },
    build: { height: 1.12, bulk: 1.34, headScale: 0.92, limbLength: 0.98, shoulderSpread: 1.26 },
    stats: {
      maxHealth: 1060,
      walkSpeed: 0.052,
      backSpeed: 0.042,
      dashSpeed: 0.17,
      jumpPower: 0.196,
      weight: 1.35,
      defense: 1.0,
      meterRate: 0.95,
    },
    tuning: { reach: 1.04, power: 1.0, speed: 0.84 },
    specials: [
      MF.makeSpecial(MF.CHARGE, 'quake', 'Разлом', 'Таран через половину экрана. Сбивает с ног.', { damage: 100 }),
      MF.makeSpecial(MF.GRAB, 'vice', 'Тиски бездны', 'Захват. Блок не спасает.', { damage: 124 }),
      MF.makeSpecial(MF.PROJECTILE, 'shard', 'Осколок', 'Медленный тяжёлый снаряд — щит для подхода.', {
        damage: 74,
        startup: 18,
        recovery: 30,
        projectile: { speed: 0.13, y: 0.94, radius: 0.36, lifetime: 120 },
      }),
      MF.makeSpecial(MF.SUPER, 'singularity', 'Сингулярность', 'Супер за полную шкалу.', { damage: 300 }),
    ],
    finisher: { name: 'ПОГРЕБЕНИЕ', description: 'Арена раскрывается и забирает проигравшего.' },
    silhouette: 'pauldrons',
  },
  {
    id: 'volta',
    name: 'ВОЛЬТА',
    title: 'Голос бури',
    bio: 'Метеоролог, попавшая в собственный эксперимент. Теперь гроза ходит за ней по пятам.',
    style: 'Зонер · контроль дистанции',
    palette: { primary: 0x2f6df0, secondary: 0x16224a, accent: 0xffe14d, skin: 0xe0bfa0, trim: 0x9fd0ff, aura: 0xffe14d },
    build: { height: 1.0, bulk: 0.9, headScale: 1.0, limbLength: 1.06, shoulderSpread: 0.96 },
    stats: {
      maxHealth: 980,
      walkSpeed: 0.052,
      backSpeed: 0.05,
      dashSpeed: 0.17,
      jumpPower: 0.216,
      weight: 0.92,
      defense: 1.0,
      meterRate: 1.2,
    },
    tuning: { reach: 1.04, power: 1.06, speed: 1.02 },
    specials: [
      MF.makeSpecial(MF.PROJECTILE, 'arc', 'Дуговой разряд', 'Дальнобойный снаряд. Основа зонинга.', {
        damage: 80,
        projectile: { speed: 0.26, y: 1.2, radius: 0.26, lifetime: 100 },
      }),
      MF.makeSpecial(MF.PROJECTILE, 'orb', 'Сфера помех', 'Медленная сфера: идёт впереди и прикрывает подход.', {
        damage: 58,
        startup: 16,
        recovery: 28,
        input: { motion: [2, 1, 4], button: 'hp' },
        projectile: { speed: 0.1, y: 1.34, radius: 0.32, lifetime: 150 },
      }),
      MF.makeSpecial(MF.RISING, 'pillar', 'Громовой столб', 'Антивоздушка с длинной активной фазой.', {
        damage: 110,
        active: 12,
      }),
      MF.makeSpecial(MF.SUPER, 'tempest', 'Буря', 'Супер за полную шкалу.', { damage: 256 }),
    ],
    finisher: { name: 'НЕБЕСНЫЙ ПРИГОВОР', description: 'Столб света бьёт в арену с орбиты.' },
    silhouette: 'halo',
  },
  {
    id: 'nox',
    name: 'НОКС',
    title: 'Тень между ударами',
    bio: 'Наёмник, подписавший контракт с собственной тенью. Условия контракта он никому не раскрывает.',
    style: 'Ассасин · телепорты и микс-ап',
    palette: { primary: 0x4a3266, secondary: 0x1e1630, accent: 0xd06bff, skin: 0x9b8aa6, trim: 0x8257c0, aura: 0xc63fff },
    build: { height: 1.02, bulk: 0.92, headScale: 0.96, limbLength: 1.08, shoulderSpread: 1.02 },
    stats: {
      maxHealth: 990,
      walkSpeed: 0.062,
      backSpeed: 0.054,
      dashSpeed: 0.21,
      jumpPower: 0.23,
      weight: 0.95,
      defense: 1.0,
      meterRate: 1.12,
    },
    tuning: { reach: 1.02, power: 0.96, speed: 1.1 },
    specials: [
      MF.makeSpecial(MF.BLINK, 'shadowstep', 'Теневой шаг', 'Длинный телепорт-рывок сквозь противника.', {
        damage: 84,
        lunge: { x: 1.02, y: 0.04 },
      }),
      MF.makeSpecial(MF.PROJECTILE, 'scythe', 'Серп теней', 'Снаряд средней скорости.', {
        damage: 72,
        projectile: { speed: 0.22, y: 1.05, radius: 0.3, lifetime: 90 },
      }),
      MF.makeSpecial(MF.SPIN, 'reap', 'Жатва', 'Вертушка сверху. Ловит на подъёме.', { damage: 100 }),
      MF.makeSpecial(MF.SUPER, 'eclipse', 'Затмение', 'Супер за полную шкалу.', { damage: 262 }),
    ],
    finisher: { name: 'БЕЗ СЛЕДА', description: 'Тень просто закрывается за противником.' },
    silhouette: 'cape',
  },
  {
    id: 'zhar',
    name: 'ЖАР',
    title: 'Монах девятого пламени',
    bio: 'Тридцать лет медитации и один вопрос: горит ли огонь, если на него никто не смотрит.',
    style: 'Сбалансированный · огненные спешлы',
    palette: { primary: 0xf0642a, secondary: 0x5c1c0c, accent: 0xffc247, skin: 0xc98c5e, trim: 0xffe7a8, aura: 0xff8a2b },
    build: { height: 1.0, bulk: 1.04, headScale: 0.98, limbLength: 1.0, shoulderSpread: 1.06 },
    stats: {
      maxHealth: 1020,
      walkSpeed: 0.056,
      backSpeed: 0.048,
      dashSpeed: 0.18,
      jumpPower: 0.215,
      weight: 1.0,
      defense: 1.0,
      meterRate: 1.0,
    },
    tuning: { reach: 1.02, power: 1.06, speed: 1.0 },
    specials: [
      MF.makeSpecial(MF.PROJECTILE, 'fireball', 'Огненный шар', 'Классический снаряд. Учебное пособие по зонингу.', {
        damage: 84,
      }),
      MF.makeSpecial(MF.RISING, 'ascend', 'Восходящее пламя', 'Антивоздушка и финиш комбо.', { damage: 118 }),
      MF.makeSpecial(MF.SPIN, 'wheel', 'Огненное колесо', 'Вертушка с продвижением вперёд.', { damage: 96 }),
      MF.makeSpecial(MF.SUPER, 'pyre', 'Костёр', 'Супер за полную шкалу.', { damage: 270 }),
    ],
    finisher: { name: 'ДЕВЯТОЕ ПЛАМЯ', description: 'Столб огня поднимается из-под арены.' },
    silhouette: 'topknot',
  },
  {
    id: 'terraks',
    name: 'ТЕРРАКС',
    title: 'Хребет гор',
    bio: 'Сторож перевала, который однажды устал стоять на месте. Перевал с тех пор никто не переходил.',
    style: 'Брузер · броня и таран',
    palette: { primary: 0x5d7a3a, secondary: 0x2b3a1c, accent: 0xc79a3a, skin: 0x7d6b4e, trim: 0xd9c89a, aura: 0xb4e04a },
    build: { height: 1.1, bulk: 1.28, headScale: 0.94, limbLength: 0.96, shoulderSpread: 1.2 },
    stats: {
      maxHealth: 1050,
      walkSpeed: 0.055,
      backSpeed: 0.045,
      dashSpeed: 0.18,
      jumpPower: 0.2,
      weight: 1.28,
      defense: 1.0,
      meterRate: 0.98,
    },
    tuning: { reach: 1.04, power: 1.02, speed: 0.87 },
    specials: [
      MF.makeSpecial(MF.CHARGE, 'ram', 'Таран', 'Разгон плечом вперёд.', { damage: 98 }),
      MF.makeSpecial(MF.GRAB, 'crush', 'Хватка хребта', 'Захват через блок.', { damage: 116 }),
      MF.makeSpecial(MF.PROJECTILE, 'seism', 'Сейсмоудар', 'Волна по земле — бьёт только в нижний уровень.', {
        damage: 70,
        height: 'low',
        startup: 16,
        recovery: 28,
        projectile: { speed: 0.17, y: 0.34, radius: 0.3, lifetime: 100 },
      }),
      MF.makeSpecial(MF.SUPER, 'avalanche', 'Лавина', 'Супер за полную шкалу.', { damage: 292 }),
    ],
    finisher: { name: 'КАМНЕПАД', description: 'Свод арены обрушивается точно по центру.' },
    silhouette: 'horns',
  },
  {
    id: 'sirena',
    name: 'СИРЕНА',
    title: 'Тихий шторм',
    bio: 'Поёт на частоте, от которой трескается металл. На арену вышла, чтобы её наконец услышали.',
    style: 'Воздушный бой · длинные конечности',
    palette: { primary: 0x1f9e8c, secondary: 0x0d3b38, accent: 0xff7fae, skin: 0xd9b89c, trim: 0xbdfff2, aura: 0x5ff0d0 },
    build: { height: 1.04, bulk: 0.82, headScale: 1.0, limbLength: 1.14, shoulderSpread: 0.9 },
    stats: {
      maxHealth: 975,
      walkSpeed: 0.058,
      backSpeed: 0.054,
      dashSpeed: 0.19,
      jumpPower: 0.248,
      weight: 0.84,
      defense: 1.0,
      meterRate: 1.18,
    },
    tuning: { reach: 1.1, power: 1.08, speed: 1.08 },
    specials: [
      MF.makeSpecial(MF.PROJECTILE, 'wave', 'Звуковая волна', 'Широкий снаряд с большим хитбоксом.', {
        damage: 72,
        projectile: { speed: 0.2, y: 1.26, radius: 0.38, lifetime: 85 },
      }),
      MF.makeSpecial(MF.SPIN, 'gale', 'Вихрь', 'Вертушка с высоким подъёмом.', {
        damage: 92,
        lunge: { x: 0.24, y: 0.26 },
      }),
      MF.makeSpecial(MF.RISING, 'crescendo', 'Крещендо', 'Антивоздушка с максимальным подбросом.', {
        damage: 106,
        knockback: { x: 0.14, y: 0.24 },
      }),
      MF.makeSpecial(MF.SUPER, 'requiem', 'Реквием', 'Супер за полную шкалу.', { damage: 250 }),
    ],
    finisher: { name: 'ПОСЛЕДНЯЯ НОТА', description: 'Одна нота — и арена звенит, как бокал.' },
    silhouette: 'cape',
  },
  {
    id: 'khrom',
    name: 'ХРОМ',
    title: 'Серийный образец',
    bio: 'Спарринг-бот, переживший всех своих инструкторов. Учится быстрее, чем его успевают чинить.',
    style: 'Универсал · полный набор инструментов',
    palette: { primary: 0x9aa4ad, secondary: 0x3c444c, accent: 0xff8f1f, skin: 0x6e7981, trim: 0xe6edf3, aura: 0xffa33d },
    build: { height: 1.03, bulk: 1.1, headScale: 0.96, limbLength: 1.02, shoulderSpread: 1.12 },
    stats: {
      maxHealth: 1020,
      walkSpeed: 0.054,
      backSpeed: 0.046,
      dashSpeed: 0.175,
      jumpPower: 0.212,
      weight: 1.08,
      defense: 1.0,
      meterRate: 1.04,
    },
    tuning: { reach: 1.0, power: 0.98, speed: 1.0 },
    specials: [
      MF.makeSpecial(MF.PROJECTILE, 'bolt', 'Импульс', 'Стандартный снаряд.', { damage: 78 }),
      MF.makeSpecial(MF.CHARGE, 'piston', 'Поршень', 'Таран с рывком.', { damage: 106 }),
      MF.makeSpecial(MF.RISING, 'lift', 'Подъёмник', 'Антивоздушка.', { damage: 112 }),
      MF.makeSpecial(MF.SUPER, 'overdrive', 'Овердрайв', 'Супер за полную шкалу.', { damage: 268 }),
    ],
    finisher: { name: 'ПЕРЕЗАПИСЬ', description: 'Протокол спарринга закрывается принудительно.' },
    silhouette: 'visor',
  },
];

function fromBlueprint(bp: Blueprint): CharacterSpec {
  return {
    id: bp.id,
    name: bp.name,
    title: bp.title,
    bio: bp.bio,
    style: bp.style,
    palette: bp.palette,
    build: bp.build,
    stats: bp.stats,
    normals: MF.buildNormals(bp.tuning),
    specials: bp.specials.map((s) => MF.tune(s, bp.tuning)),
    finisher: bp.finisher,
    silhouette: bp.silhouette,
  };
}

export const ROSTER: CharacterSpec[] = BLUEPRINTS.map(fromBlueprint);

export function getCharacter(id: string): CharacterSpec {
  return ROSTER.find((c) => c.id === id) ?? ROSTER[0];
}
