/** Все игровые расчёты идут в фиксированных кадрах по 60 Гц — как в классических файтингах. */
export const FPS = 60;
export const FRAME_MS = 1000 / FPS;
/** Сколько кадров максимум догоняем за один тик рендера (защита от «спирали смерти»). */
export const MAX_CATCHUP_FRAMES = 5;

/** Геометрия арены в мировых единицах (1 единица ≈ 1 метр). */
export const STAGE_HALF_WIDTH = 7.2;
export const GROUND_Y = 0;

/** Физика. Значения подобраны под ощущение «тяжёлого» файтинга, а не платформера. */
// Подобрано под рост бойца ~1.8: прыжок ≈ 2.4 единицы в высоту и ≈ 45 кадров в воздухе.
export const GRAVITY = -0.0098;
export const AIR_DRAG = 0.985;
export const GROUND_FRICTION = 0.78;

/** Габариты бойца по умолчанию (масштабируются статами персонажа). */
export const BODY_HALF_WIDTH = 0.34;
export const BODY_HEIGHT = 1.78;
export const CROUCH_HEIGHT = 1.08;

/** Минимальная дистанция между бойцами — они расталкиваются, а не проходят сквозь. */
export const PUSH_RADIUS = 0.62;

/** Матч. */
export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;

/** Ресурсы. */
export const MAX_METER = 100;
export const MAX_COMBO_SCALING_STEPS = 8;

/** Пауза кадров при попадании — «хитстоп», главный источник ощущения удара. */
export const HITSTOP_LIGHT = 5;
export const HITSTOP_HEAVY = 10;
export const HITSTOP_SPECIAL = 13;
