/** Восемь игровых кнопок. Раскладка одинакова для клавиатуры, тача и геймпада. */
export type Button = 'lp' | 'hp' | 'lk' | 'hk' | 'block';
export type Direction = 'left' | 'right' | 'up' | 'down';
export type InputKey = Button | Direction;

export type InputState = Record<InputKey, boolean>;

export const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  lp: false,
  hp: false,
  lk: false,
  hk: false,
  block: false,
};

export function cloneInput(src: InputState): InputState {
  return { ...src };
}

/** 1 — боец смотрит вправо, -1 — влево. */
export type Facing = 1 | -1;

export type AttackHeight = 'high' | 'mid' | 'low' | 'overhead';

export interface Box {
  /** Смещение от центра бойца по направлению взгляда. */
  x: number;
  /** Высота центра бокса над землёй. */
  y: number;
  w: number;
  h: number;
}

export interface ProjectileSpec {
  speed: number;
  /** Высота вылета над землёй. */
  y: number;
  radius: number;
  lifetime: number;
  /** Снаряд исчезает после попадания или летит насквозь. */
  piercing?: boolean;
}

/** Имена костей процедурного скелета — по ним же задаются позы. */
export type BoneName =
  | 'root'
  | 'hips'
  | 'torso'
  | 'head'
  | 'shoulderL'
  | 'elbowL'
  | 'shoulderR'
  | 'elbowR'
  | 'hipL'
  | 'kneeL'
  | 'hipR'
  | 'kneeR';

/** Поворот кости в радианах: [x, y, z]. Не указанные кости остаются в базовой позе. */
export type Pose = Partial<Record<BoneName, [number, number, number]>> & {
  /** Смещение корня — приседания, выпады, наклоны. */
  offset?: [number, number, number];
};

export interface PoseKey {
  /** Момент внутри клипа, 0..1. */
  t: number;
  pose: Pose;
}

export type PoseClip = PoseKey[];

export interface Move {
  id: string;
  name: string;
  /** Кадры до появления хитбокса. */
  startup: number;
  /** Кадры, когда хитбокс активен. */
  active: number;
  /** Кадры восстановления после активной фазы. */
  recovery: number;
  damage: number;
  /** Урон по блоку. */
  chip: number;
  hitstun: number;
  blockstun: number;
  height: AttackHeight;
  hitbox: Box;
  knockback: { x: number; y: number };
  /** Рывок самого бойца в момент старта. */
  lunge?: { x: number; y: number };
  meterGain: number;
  meterCost?: number;
  /** Подбрасывает противника — открывает воздушное комбо. */
  launcher?: boolean;
  /** Сбивает с ног, комбо обрывается. */
  knockdown?: boolean;
  /** Можно отменить в спешл во время активных кадров и первых кадров восстановления. */
  cancelable?: boolean;
  projectile?: ProjectileSpec;
  /** Выполняется только в воздухе. */
  airOnly?: boolean;
  /** Можно выполнять и в воздухе. */
  airOk?: boolean;
  /** Блок не помогает — так работают захваты. */
  unblockable?: boolean;
  /** Бросок: противник может вырваться, нажав ту же комбинацию в окно техники. */
  throwable?: boolean;
  clip: PoseClip;
  sfx: 'light' | 'heavy' | 'kick' | 'special' | 'super';
  /** Цвет эффекта попадания; по умолчанию берётся из ауры персонажа. */
  fx?: number;
}

/** Мотион-инпут в нотации нампада: 236P = ↓ ↘ → + удар. */
export interface SpecialInput {
  /** Последовательность направлений в нотации нампада, например [2, 3, 6]. */
  motion: number[];
  button: Button;
  /** Максимум кадров на ввод всей последовательности. */
  window?: number;
}

export interface SpecialMove extends Move {
  input: SpecialInput;
  description: string;
}

export interface CharacterBuild {
  /** Множитель роста, 0.9..1.12. */
  height: number;
  /** Массивность торса и конечностей. */
  bulk: number;
  headScale: number;
  limbLength: number;
  /** Плечи шире бёдер — визуальный силуэт архетипа. */
  shoulderSpread: number;
}

export interface CharacterStats {
  maxHealth: number;
  walkSpeed: number;
  backSpeed: number;
  dashSpeed: number;
  jumpPower: number;
  weight: number;
  /** Множитель входящего урона: <1 — «танк», >1 — «стекло». */
  defense: number;
  meterRate: number;
}

export interface CharacterPalette {
  primary: number;
  secondary: number;
  accent: number;
  skin: number;
  trim: number;
  aura: number;
}

export interface CharacterSpec {
  id: string;
  name: string;
  title: string;
  bio: string;
  style: string;
  palette: CharacterPalette;
  build: CharacterBuild;
  stats: CharacterStats;
  /** Нормали: lp / hp / lk / hk, приседая и в воздухе. */
  normals: Record<string, Move>;
  specials: SpecialMove[];
  /** Добивание — стилизованный энергетический финиш, без расчленёнки. */
  finisher: { name: string; description: string };
  /** Особая деталь силуэта: рога, маска, плащ, наплечники. Для анимированной модели не используется. */
  silhouette: 'horns' | 'visor' | 'cape' | 'pauldrons' | 'topknot' | 'halo';
  /**
   * Внешняя модель со своими боевыми анимациями — клипы проигрываются напрямую,
   * без ретаргета на чужой скелет (тот подход давал анатомически неестественные позы
   * и был убран, см. src/render/animatedFighter.ts). Заводится только для моделей,
   * у которых есть подходящие боевые клипы; у остальных бойцов это поле не задаётся,
   * и они остаются процедурной «бумажной куклой» (src/render/proceduralFighter.ts).
   */
  animatedRig?: AnimatedRig;
}

/** Участок клипа в секундах, который скрабится по прогрессу игрового действия. */
export interface ClipWindow {
  /** Имя анимации в GLB — как в его clips[].name. */
  clip: string;
  /** Начало полезного участка, секунды. */
  start: number;
  /** Конец полезного участка, секунды. */
  end: number;
}

export interface AnimatedRig {
  url: string;
  /** Калибровочный поворот вокруг Y в градусах — подтверждается в браузере, не угадывается. */
  yaw: number;
  /** Зациклённая стойка по умолчанию — не скрабится, играет по настенному времени. */
  idleClip: string;
  /** Бег/шаг — зациклён, как idle, но проигрывается на walkF/walkB/dash. */
  runClip: string;
  /** Удар рукой (lp/hp и их присед/воздух варианты). */
  punch: ClipWindow;
  /** Удар ногой (lk/hk и их присед/воздух варианты). */
  kick: ClipWindow;
  /** Реакция на попадание. Второй реакции (например, для приседа) в этом ассете нет. */
  hitHigh: ClipWindow;
}
