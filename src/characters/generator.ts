import { Rng } from '../core/rng';
import * as MF from './moveFactory';
import type { CharacterSpec, SpecialMove } from '../game/types';

/**
 * Процедурный генератор бойцов: из сида собирается имя, палитра, телосложение,
 * статы и набор спешлов. Один сид всегда даёт одного и того же персонажа,
 * поэтому сгенерированного бойца можно сохранить и переиграть.
 */

const PREFIX = ['Ка', 'Вор', 'Ниш', 'Раг', 'Тен', 'Зир', 'Мор', 'Ксан', 'Лю', 'Дра', 'Ор', 'Са', 'Фен', 'Эр', 'Юн', 'Ва'];
const MIDDLE = ['ри', 'ло', 'та', 'ше', 'ду', 'ма', 'ки', 'на', 'ве', 'зо', ''];
const SUFFIX = ['кс', 'н', 'ра', 'т', 'ш', 'ль', 'р', 'на', 'з', 'к'];

const TITLES = [
  'Пепел старого мира',
  'Последний из цеха',
  'Голос под маской',
  'Ошибка полигона',
  'Клинок без ножен',
  'Сторож нижних ворот',
  'Дитя разлома',
  'Молчаливый рекорд',
  'Тень с арены',
  'Незакрытый контракт',
];

const BIOS = [
  'Вышел на арену за долгом, о котором никто больше не помнит.',
  'Не проиграл ни одного боя. Не выиграл ни одного разговора.',
  'Собран из трёх неудачных прототипов и одной удачной идеи.',
  'Дрался в ямах нижнего яруса, пока яма не закончилась.',
  'Пришёл проверить, есть ли здесь кто-то настоящий.',
  'Считает арену единственным честным местом в городе.',
  'Помнит только последние двенадцать минут своей жизни.',
  'Обещал вернуться домой победителем. Дома уже нет.',
];

type ArchetypeId = 'rush' | 'zoner' | 'grappler' | 'bruiser' | 'allround';

interface Archetype {
  id: ArchetypeId;
  style: string;
  health: [number, number];
  walk: [number, number];
  jump: [number, number];
  weight: [number, number];
  defense: [number, number];
  reach: [number, number];
  power: [number, number];
  speed: [number, number];
  bulk: [number, number];
  height: [number, number];
  /** Пул шаблонов спешлов, из которого набирается три штуки. */
  pool: Array<{ template: Parameters<typeof MF.makeSpecial>[0]; id: string; name: string; desc: string }>;
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'rush',
    style: 'Рашдаун · давление вплотную',
    health: [900, 990],
    walk: [0.06, 0.072],
    jump: [0.218, 0.238],
    weight: [0.86, 0.98],
    defense: [1.06, 1.16],
    reach: [0.94, 1.02],
    power: [0.86, 0.96],
    speed: [1.12, 1.26],
    bulk: [0.82, 0.96],
    height: [0.94, 1.02],
    pool: [
      { template: MF.BLINK, id: 'dash', name: 'Рывок', desc: 'Сокращает дистанцию одним движением.' },
      { template: MF.RISING, id: 'rise', name: 'Взлёт', desc: 'Антивоздушка и финиш комбо.' },
      { template: MF.SPIN, id: 'spin', name: 'Вертушка', desc: 'Перепрыгивает низкие атаки.' },
      { template: MF.PROJECTILE, id: 'shot', name: 'Выстрел', desc: 'Короткий снаряд для подхода.' },
    ],
  },
  {
    id: 'zoner',
    style: 'Зонер · контроль дистанции',
    health: [880, 960],
    walk: [0.048, 0.058],
    jump: [0.21, 0.226],
    weight: [0.88, 1.0],
    defense: [1.1, 1.2],
    reach: [1.04, 1.14],
    power: [0.9, 1.0],
    speed: [0.96, 1.08],
    bulk: [0.84, 0.96],
    height: [0.98, 1.06],
    pool: [
      { template: MF.PROJECTILE, id: 'shot', name: 'Залп', desc: 'Основной снаряд.' },
      { template: MF.PROJECTILE, id: 'slow', name: 'Заслон', desc: 'Медленный снаряд-прикрытие.' },
      { template: MF.RISING, id: 'rise', name: 'Отсечка', desc: 'Антивоздушка.' },
      { template: MF.SPIN, id: 'spin', name: 'Разворот', desc: 'Выход из угла.' },
    ],
  },
  {
    id: 'grappler',
    style: 'Грэпплер · захваты и размен',
    health: [1120, 1220],
    walk: [0.038, 0.048],
    jump: [0.19, 0.204],
    weight: [1.26, 1.42],
    defense: [0.8, 0.9],
    reach: [1.06, 1.16],
    power: [1.18, 1.32],
    speed: [0.8, 0.9],
    bulk: [1.24, 1.4],
    height: [1.06, 1.14],
    pool: [
      { template: MF.GRAB, id: 'grab', name: 'Захват', desc: 'Пробивает блок.' },
      { template: MF.CHARGE, id: 'charge', name: 'Таран', desc: 'Разгон через экран.' },
      { template: MF.PROJECTILE, id: 'shard', name: 'Осколок', desc: 'Тяжёлый медленный снаряд.' },
      { template: MF.RISING, id: 'rise', name: 'Подъём', desc: 'Антивоздушка.' },
    ],
  },
  {
    id: 'bruiser',
    style: 'Брузер · давление и броня',
    health: [1060, 1160],
    walk: [0.046, 0.056],
    jump: [0.198, 0.214],
    weight: [1.14, 1.3],
    defense: [0.86, 0.96],
    reach: [1.02, 1.12],
    power: [1.1, 1.24],
    speed: [0.86, 0.98],
    bulk: [1.12, 1.3],
    height: [1.02, 1.12],
    pool: [
      { template: MF.CHARGE, id: 'charge', name: 'Натиск', desc: 'Таран плечом.' },
      { template: MF.RISING, id: 'rise', name: 'Вскрытие', desc: 'Антивоздушка с подбросом.' },
      { template: MF.GRAB, id: 'grab', name: 'Тиски', desc: 'Захват через блок.' },
      { template: MF.SPIN, id: 'spin', name: 'Молот', desc: 'Удар сверху.' },
    ],
  },
  {
    id: 'allround',
    style: 'Универсал · полный набор',
    health: [980, 1060],
    walk: [0.052, 0.06],
    jump: [0.206, 0.222],
    weight: [0.98, 1.12],
    defense: [0.94, 1.04],
    reach: [0.98, 1.08],
    power: [0.98, 1.1],
    speed: [0.94, 1.06],
    bulk: [0.96, 1.12],
    height: [0.98, 1.06],
    pool: [
      { template: MF.PROJECTILE, id: 'shot', name: 'Снаряд', desc: 'Универсальный снаряд.' },
      { template: MF.RISING, id: 'rise', name: 'Подъёмник', desc: 'Антивоздушка.' },
      { template: MF.CHARGE, id: 'charge', name: 'Рывок', desc: 'Таран.' },
      { template: MF.SPIN, id: 'spin', name: 'Вертушка', desc: 'Удар сверху.' },
    ],
  },
];

const SILHOUETTES: CharacterSpec['silhouette'][] = ['horns', 'visor', 'cape', 'pauldrons', 'topknot', 'halo'];

const FINISHER_NAMES = ['ТОЧКА', 'ОБНУЛЕНИЕ', 'ЗАНАВЕС', 'ПОСЛЕДНИЙ ЗВОНОК', 'ВЫДОХ', 'ЧИСТЫЙ ЛИСТ', 'КОНЕЦ СВЯЗИ'];

/** Генерирует палитру вокруг случайного тона — так цвета персонажа всегда согласованы. */
function makePalette(rng: Rng): CharacterSpec['palette'] {
  const hue = rng.next();
  const accentHue = (hue + rng.range(0.28, 0.62)) % 1;
  return {
    primary: hsl(hue, rng.range(0.5, 0.8), rng.range(0.38, 0.56)),
    secondary: hsl(hue, rng.range(0.4, 0.7), rng.range(0.12, 0.22)),
    accent: hsl(accentHue, rng.range(0.7, 0.95), rng.range(0.55, 0.7)),
    skin: hsl(rng.range(0.05, 0.1), rng.range(0.18, 0.4), rng.range(0.4, 0.72)),
    trim: hsl(accentHue, rng.range(0.2, 0.45), rng.range(0.78, 0.92)),
    aura: hsl(accentHue, rng.range(0.8, 1), rng.range(0.55, 0.68)),
  };
}

function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const v = l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
    return Math.round(v * 255);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

function makeName(rng: Rng): string {
  return (rng.pick(PREFIX) + rng.pick(MIDDLE) + rng.pick(SUFFIX)).toUpperCase();
}

export function generateCharacter(seed: number | string = Date.now()): CharacterSpec {
  const rng = new Rng(seed);
  const arch = rng.pick(ARCHETYPES);

  const tuning: MF.Tuning = {
    reach: rng.range(...arch.reach),
    power: rng.range(...arch.power),
    speed: rng.range(...arch.speed),
  };

  // Три спешла из пула архетипа — без повторов, порядок тоже случайный.
  const pool = [...arch.pool];
  const picked: SpecialMove[] = [];
  for (let i = 0; i < 3 && pool.length; i += 1) {
    const [entry] = pool.splice(rng.int(0, pool.length - 1), 1);
    const variance = rng.range(0.9, 1.12);
    picked.push(
      MF.makeSpecial(entry.template, entry.id, entry.name, entry.desc, {
        damage: Math.round(entry.template.damage * variance),
        // У второго снаряда обязателен свой мотион, иначе он перекроет первый.
        input:
          entry.id === 'slow'
            ? { motion: [2, 1, 4], button: 'hp' }
            : entry.template.input,
        projectile: entry.template.projectile
          ? {
              ...entry.template.projectile,
              speed: entry.template.projectile.speed * rng.range(0.85, 1.2),
              radius: entry.template.projectile.radius * rng.range(0.9, 1.25),
            }
          : undefined,
      }),
    );
  }
  picked.push(MF.makeSpecial(MF.SUPER, 'super', 'Перегрузка', 'Супер за полную шкалу.', {
    damage: Math.round(MF.SUPER.damage * rng.range(0.94, 1.12)),
  }));

  const name = makeName(rng);
  return {
    id: `gen-${Rng.hash(String(seed)).toString(36)}`,
    name,
    title: rng.pick(TITLES),
    bio: rng.pick(BIOS),
    style: arch.style,
    palette: makePalette(rng),
    build: {
      height: rng.range(...arch.height),
      bulk: rng.range(...arch.bulk),
      headScale: rng.range(0.92, 1.04),
      limbLength: rng.range(0.94, 1.14),
      shoulderSpread: rng.range(0.88, 1.26),
    },
    stats: {
      maxHealth: Math.round(rng.range(...arch.health)),
      walkSpeed: rng.range(...arch.walk),
      backSpeed: rng.range(...arch.walk) * 0.86,
      dashSpeed: rng.range(0.14, 0.21),
      jumpPower: rng.range(...arch.jump),
      weight: rng.range(...arch.weight),
      defense: rng.range(...arch.defense),
      meterRate: rng.range(0.94, 1.2),
    },
    normals: MF.buildNormals(tuning),
    specials: picked.map((s) => MF.tune(s, tuning)),
    finisher: { name: rng.pick(FINISHER_NAMES), description: 'Стилизованное добивание светом.' },
    silhouette: rng.pick(SILHOUETTES),
  };
}
