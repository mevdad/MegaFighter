/**
 * Константы оверлея отладки (инвариант 10: числа и цвета только в конфиге).
 * Оверлей только читает состояние матча и ничего в нём не меняет.
 */

/** Клавиши (KeyboardEvent.code). Не пересекаются с core/input.ts (там WASD, стрелки, J K L ; U I O P, Space, ShiftLeft) и Escape из main.ts. */
export const DEBUG_KEYS = {
  toggle: 'F1',
  pause: 'F2',
  step: ['F3', 'Period'],
} as const;

/** Подсказка клавиш, всегда видна на экране при открытом оверлее. */
export const HINT_TEXT = 'F1 оверлей вкл/выкл   F2 пауза   F3 или . шаг на 1 тик (при паузе, удержание = повтор)';

/** Частота клипов Mixamo для пересчёта времени в кадры клипа. */
export const CLIP_FPS = 30;

/** Цвета боксов, 0xRRGGBB. */
export const BOX_COLORS = {
  hurtbox: 0x35e06a,
  hitbox: 0xff3b3b,
  /** Хитбокс после контакта (moveHasHit): Fighter.hitbox уже null, но фрейм-дата ещё показывает, где он был. */
  hitboxSpent: 0xff9a2e,
  pushbox: 0x3d8bff,
  /** Хитбокс снаряда: тоже AABB, поэтому тот же цвет, что у обычного хитбокса. */
  projectile: 0xff3b3b,
} as const;

/** Легенда: порядок и подписи. */
export const LEGEND: ReadonlyArray<{ key: keyof typeof BOX_COLORS; label: string }> = [
  { key: 'hurtbox', label: 'Hurtbox' },
  { key: 'hitbox', label: 'Hitbox активный' },
  { key: 'hitboxSpent', label: 'Hitbox после контакта' },
  { key: 'pushbox', label: 'Pushbox' },
];

/** Плоскость отрисовки боксов: Z в симуляции зафиксирована, бойцы стоят в z = 0. */
export const BOX_Z = 0;
/** Линия толщиной 1 px почти не видна: рисуем вложенные контуры со смещением (мировые единицы). */
export const BOX_LINE_LAYERS = 3;
export const BOX_LINE_INSET = 0.007;
/** Маркер центра бойца (крест) в мировых единицах. */
export const CENTER_MARK_HALF = 0.06;

/** Текст. */
export const FONT_SIZE_PX = 12;
export const FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const PANEL_BG = 'rgba(8, 10, 16, 0.78)';
export const PANEL_TEXT = '#e8ecf4';
export const PANEL_MUTED = '#8f9ab0';
export const PANEL_ACCENT = '#ffd34d';
export const PANEL_Z_INDEX = 50;
/** Отступ панелей бойцов сверху, чтобы не закрывать HUD (полосы здоровья). */
export const PANEL_TOP_PX = 120;
export const PANEL_EDGE_PX = 8;
