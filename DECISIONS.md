# DECISIONS (по AUDIT_CLIPS.md)

Кадры в индексации FBX (кадр 0 = t 0, 30 к/с). В новом пайплайне сдвига +1/30 с (как в Blender-сборке) нет.
Отступления от этого файла агент записывает сюда, а не прячет в коде.

## 1. Пайплайн
- Клипы собираются в warrior3.glb скриптом прямо из FBX, без Blender (AUDIT_CLIPS §10.1: перекос позы покоя у Without Skin).
- Проверка: ошибка FK против FBX ≤ 1 мм. Пилот: fighting_idle, jab, martelo_2, cross_punch. Остальное после моего ОК.
- Blender-копии kick_high и punch_heavy заменяются пересобранными.
- У loop-клипов последний кадр-дубль отбрасывается.
- Всё в data/clips/terraks.json: id, файл, trim, loop, placeholder, rootLock. Цепочка npm-скриптов идемпотентна (сборка + rootLock).

## 2. Стойка и зеркало
- idle = Fighting_Idle, loop 0-101. Лидер левая рука и нога.
- *_Mirror не используем. Отрицательный scale убираем. Файлы остаются в assets.

## 3. Удары
| Приём | Клип | Движение | Active | Пик |
|---|---|---|---|---|
| lp | Jab | 11-26 | 16-18 | 17 |
| hp | Cross_Punch | 24-45 (медленный замах 8-23 не играем) | 31-36 | 34 |
| lk | Mma_Kick | 9-35 | 17-20 | 18 |
| hk | Martelo_2 | 3-35 | 12-20 | найти по оверлею |
| cr.lp / резерв | Punching_1 | 5-22 | 9-15 | 11 |
| special | Surprise_Uppercut | НЕ в MVP (оборот корпуса 190°, ход корня 1 м) | | |

- Ремап по кадру приёма: startup идёт от начала окна до active, active держит пик, recovery идёт от пика до конца. Равномерно не ускорять.
- Сжатие клипа не больше 2,5×. Если нужно больше, меняем frame data (данные), а не ускоряем клип.
- Blend: вход в атаку 3-4 тика (внутри startup), выход в idle 6-8 тиков.

## 4. Блок
- Center_Block без статики. Кандидаты hold: кадр 18 (корпус назад 38°) и кадр 43 (корпус прямой). Выбираю я по скриншотам из движка.
- Вход в блок: blend 4-6 тиков в hold-кадр, фазу входа клипа не играть. Hold = clamp по stateFrame. Blockstun держит ту же позу.
- Блок сидя: эксперимент (раздел 8), не блокирует MVP. Запасной вариант: crouch_hold с пометкой placeholder.

## 5. Присед
- crouch_in = Standing_To_Crouched, кадры 2-19. crouch_hold = кадр 19. rootLock нет.
- Male_Crouch_Pose не используем.

## 6. Движение
- walk_fwd = Walking 0-29 (loop), walk_back = Walking_Backwards 0-25 (loop).
- Ноги клипа 0,29-0,39 м/с против 1,35-1,65 в игре. Для MVP: проигрывать клип до 2×, остаток скольжения в KNOWN_ISSUES. Скорости игры не менять до оверлея.
- dash = Fast_Run, кадры 5-11, не loop. backdash = walk_back (placeholder).
- jump: jump_up = кадры 8-16 (подгонять под игровой prejump), jump_air = 17-32 (растягивать на реальное время в воздухе), jump_land = 33-40, затем blend в idle. Y таза в jump_air лочить по кадру 17, потому что высоту ведёт симуляция.

## 7. Реакции и падения
- hit_head = Head_Hit, кадры 0-24. hit_body = Hit_To_Body, кадры 0-28 (оценка, уточнить оверлеем). Сжать под hitstun, в последние 4 тика blend в idle.
- knockdown: кадры 0-77 растянуть на KNOCKDOWN_TICKS, затем hold кадр 93. rootLock X, Z factor 1, откат тела ведёт симуляция (данные, дистанция по текущему knockback).
- getup = Getting_Up, кадры 0-54, затем blend 8 тиков в idle. Без лока. Стык с knockdown через crossfade 6-8 тиков.
- Предложение по тикам: KNOCKDOWN ≈ 70, WAKEUP ≈ 54 (сейчас 26 и 22). Это правка баланса, согласовать со мной.
- ko (MVP) = knockdown + hold. Knocked_Out: эксперимент после MVP (лок X, Z factor 1).

## 8. Победа, интро, составные клипы
- victory = Victory 5-75, hold около кадра 65. Без лока. intro = Intro 10-95 с пропуском по кнопке, lock X, Z factor 1, ось Y не трогать, blend 8 тиков в idle.
- Эксперимент: block_crouch_hold = ноги и Hips из crouch_hold + корпус и руки из block hold. Два варианта: (A) Spine*, Neck, Head, руки; (B) только руки. Выбор по скриншотам.
- Эксперимент: crouch_jab = ноги из crouch_hold + верх из Jab. Если не читается, cr.lp = placeholder.

## 9. rootLock (мировые оси)
| Клип | Оси | factor |
|---|---|---|
| Martelo_2 | Z | 1 |
| Mma_Kick | Z | 0,5 (подобрать 0,5-1) |
| Intro, knockdown | X, Z | 1 |
| jump_air | Y (якорь кадр 17) | 1 |
| Knocked_Out (эксперимент) | X, Z | 1 |
| Остальные | - | 0 |

## 10. Заглушки (idle или crouch_hold, пометка placeholder)
backdash, присед-удары, воздушные удары, бросок, снаряд, блок сидя (если эксперимент не удался), реакции в приседе и в воздухе.

## 11. Оптимизация (после пилота)
Каналы S убрать, T оставить только у Hips. Измерить размер GLB.

## 12. Уточнения пилота (отступления и допущения, 2026-10)
- Trim включительный с обоих концов; время ключа (кадр - start)/30, клип с t = 0. У loop-клипа дубль отбрасывается trim'ом, сборка падает при дубле.
- Hips FBX переводится в систему меша сдвигом D = Hips_rest(меш) - Hips_rest(FBX) = (0; -0,00441; +0,03048) м (одинаков у всех пилотных файлов), см. шапку `scripts/build-clips.mjs`.
- Базовый GLB (Blender-вывод) лежит в `assets/rig-source/terraks/terraks-base.glb`; клипы без `file` в `data/clips/terraks.json` берутся из базы побайтово, остальные клипы базы (старые kick_high, punch_heavy) в итог не попадают.
- Зеркало по X в `animatedFighter.ts` убрано (инвариант 9, §2). Окна roster: конец на 1e-4 с раньше длительности клипа (завёртка float32).
- Остальные клипы (17) собраны тем же способом (2026-10, `docs/clips-table.md`): walk_fwd, walk_back, dash, crouch_in, jump_up/air/land, hit_head, hit_body, knockdown, getup, block_hold_18/43, victory, intro, mma_kick, punching_1. В `roster.ts` не подключены (шаг 7). Каналы те же: rotation у 41 кости и translation у Hips, scale нет, ничего не срезано. FK против FBX: максимум 0,279 мм по всем 21 клипу из FBX. GLB 6 365 684 байт (было 5 727 436, цель 8 МБ).
- D считается по КАЖДОМУ FBX из его Hips rest относительно меша, константы нет. У «Without Skin» файлов D = (0; -0,00441; +0,03048). У `Punching_1.fbx` (мастер с мешем) Hips rest = меш, D = (0,00001; 0; 0) м, то есть 0; нулевая поза по умолчанию (Lcl Rotation = 0 у всех костей) формулу не ломает: кривые абсолютные, кость без кривой берёт свой Lcl Rotation (0). Ошибка FK у него 0,002 мм (нет округления длин костей, как у Without Skin).
- Однокадровые клипы (`block_hold_18`, `block_hold_43`: Center_Block, trim {18,18} и {43,43}) пишутся как ДВА одинаковых ключа на t = 0 и t = 1/30 с. Проверено в реальном движке PlayCanvas 2.22 (`scripts/clips-audit/hold_check.mjs`): один ключ грузится и держит позу, но `AnimTrack.duration` = 0, поэтому `activeStateProgress` = NaN (loop false) или Infinity (loop true), а окна `end = длительность - EPS` уходят в минус. Два ключа дают длительность 1/30 с, progress конечный (1, при loop растёт), поза равна кадру trim при любом времени (в том числе 600 тиков игры), ошибка 0,001 мм. Hold по stateFrame делает roster-этап: время клипа любое, поза не меняется.
- rootLock X и Y в `apply-root-lock.mjs` уже поддерживались (мировые оси через родителя Hips), код не менялся. Якорь = первый ключ Hips-канала клипа, то есть кадр `start` из trim: у `jump_air` (trim 17-32) это кадр 17 (Hips Y = 0,6509 м мира, FBX 0,6553 минус D_y 0,00441). Z у пилота побайтово не изменился (BIN пилотных клипов равен прежнему, хеши accessor'ов те же).
- `hit_body` помечен `estimate: true` в `terraks.json` (окно 0-28 это оценка), `mma_kick` несёт `markers` (active 17-20, пик 18, кадры FBX) как справочные данные, сборка их не читает. Заглушек-клипов в GLB нет (`placeholder: true` только у `idle_hold`), алиасы перечислены в `docs/clips-table.md`.
