# Аудит Mixamo-ассетов и архитектуры MegaFighter (этап 1)

Аудит делал агент Gamer. В проекте ничего не менялось и не создавалось. Рендер не запускали: нет `node_modules`, `typecheck`, `build` и dev-скрипты не гоняли. Blender тоже не запускали.

**Главный вывод:** боевой набор Терракса (`warrior3.glb`) и симуляция в `src/game/` расходятся с инвариантами CLAUDE.md. Каталога `sim/` нет, тестов нет, ввод не битовыми масками, состояние не plain-объект, есть отрицательный scale.

---

## 1. Ассеты

| Файл | Размер | Роль |
|---|---|---|
| `public/models/warrior3.glb` | 5,6 МБ | боевой риг Терракса, 4 клипа, используется (`src/characters/roster.ts:235`) |
| `public/models/warrior2.glb` | 11,3 МБ | старый риг (8 клипов, 24 fps), не загружается; остался комментарий в `animatedFighter.ts:10` |
| `public/models/warrior.glb` | 11,2 МБ | ещё старее (6 клипов), не загружается; из него запечены позы `src/game/mocapPoses.ts` |
| `public/models/michelle.glb` | 3,3 МБ | пример three.js, не используется (README:152 устарел) |
| `public/models/soldier.glb` | 2,2 МБ | пример three.js, не используется |
| `assets/rig-source/terraks/Punching_1.fbx` | 0,8 МБ | мастер: меш + скелет + анимация (`scripts/build-terraks-rig.py:25`) |
| `assets/rig-source/terraks/Martelo_2.fbx` | 0,27 МБ | скелет + кик, без меша (`build-terraks-rig.py:29`) |
| `assets/rig-source/terraks/Cross_Punch.fbx` | 0,3 МБ | скелет + сильный удар, без меша (`build-terraks-rig.py:30`) |
| `assets/rig-source/terraks/diffuse.png`, `.webp` | 4,0 / 0,4 МБ | текстура Терракса |

- Около 27,9 МБ GLB (`warrior`, `warrior2`, `michelle`, `soldier`) не использует ни один код.
- Других форматов (`.gltf`, `.bin`, `.dds`, `.ktx`) нет.
- Пайплайн: `npm run bake:terraks` запускает Blender, он собирает `warrior3.glb` из трёх FBX (`scripts/build-terraks-rig.py`). Blender не проверялся.
- `warrior3.glb`: Blender glTF I/O v4.0.44, без расширений, одна PNG-текстура, один скин на 41 joint, один меш (26 294 вершины).

## 2. Клипы

### warrior3.glb (боевой набор)

У всех клипов 123 канала (по 41 T/R/S на кость), интерполяция LINEAR, у `idle_hold` STEP.

| Клип | Длительность, с | Ключей | fps | Первый ключ, с | Где используется |
|---|---|---|---|---|---|
| `idle_hold` | 0,333 | 2 (STEP) | — | 0 | idle, run, hitHigh (`roster.ts:237-238,251`) |
| `punch_body` | 0,900 | 27 | 30 | 0,0333 | lp, окно 0..0,9 (`roster.ts:239`) |
| `kick_high` | 1,333 | 40 | 30 | 0,0333 | lk/hk, окно 0..0,9 (`roster.ts:250`) |
| `punch_heavy` | 2,033 | 61 | 30 | 0,0333 | hp, окно 0..1,3 (`roster.ts:245`) |

- **Сдвиг на кадр:** длина по FBX 0,867 / 1,3 / 2,0 с, в GLB везде на кадр больше. Для скраба `activeStateCurrentTime` этот сдвиг надо учитывать.
- **Зацикленность:** флага loop в glTF нет. В движке `assignAnimation` по умолчанию зациклен. Первый и последний кадр у всех клипов совпадают (расхождение кватернионов не выше 1e-6), но в коде клипы играются как одиночные и скрабятся.
- **`idle_hold`:** это не bind-поза, как написано в README терракса и `build-terraks-rig.py:97-99`. Это замороженный первый кадр `punch_body` (hips y = 0,4778 против 0,5606 в bind).
- **Чего нет:** настоящих idle, run, hit, block, crouch, jump, knockdown на новом риге нет. Везде заглушка `idle_hold`.

### Данные FBX (парсер бинарного FBX 7.7)

| FBX | Длительность, с | Ключей | fps | Единицы и оси |
|---|---|---|---|---|
| `Punching_1.fbx` | 0,8667 | 27 | 30 | UnitScaleFactor=1, Up=Y, Front=Z |
| `Martelo_2.fbx` | 1,3 | 40 | 30 | то же |
| `Cross_Punch.fbx` | 2,0 | 61 | 30 | то же |

Во всех трёх по 41 кости `mixamorig:*`, стек `mixamo.com`.

### Остальные GLB (справка, в игре не используются)

| Файл | Клипы |
|---|---|
| `warrior2.glb` | `box_02` 2,79; `Боевая стойка` 3,96; `front_kick_02` 1,375; `front_kick_01` 2,5; `run` 1,25; `hit_to_side` 1,25; `hit_to_head` 1,83; `hit_to_body_01` 1,29 с, 24 fps |
| `warrior.glb` | как `warrior2`, но без `Боевая стойка` и `hit_to_head` (6 клипов), 24 fps |
| `michelle.glb` | `SambaDance` 18,23 с (547 ключей, 30 fps), `TPose` |
| `soldier.glb` | `Idle` 1,97; `Run` 0,70; `Walk` 1,03; `TPose`, 30 fps |

## 3. Root motion

Корень: `mixamorig:Hips`, прямой ребёнок узла `Armature`. Translation-канал на Hips есть во всех клипах. На остальных костях translation-каналы есть, но постоянные (Blender запёк все кости).

Смещения Hips в мировых осях (м, до масштаба; +Z вперёд лицом модели, Y вверх):

| Клип | start | end | delta | Диапазон за клип |
|---|---|---|---|---|
| `idle_hold` | (0,004; 0,478; −0,010) | то же | 0 | нет |
| `punch_body` | (0,004; 0,478; −0,010) | то же | 0 | X −0,009..0,006; Y 0,465..0,481; Z −0,012..0,008 |
| `punch_heavy` | (0,007; 0,480; 0,026) | то же | 0 | X −0,003..0,036; Y 0,441..0,507; Z 0,018..0,095 |
| `kick_high` | (−0,005; 0,406; 0,024) | то же | 0 | X −0,005..0,119; Y 0,406..0,591; Z 0,024..**0,456** |

- Дрейфа (start ≠ end) нет, но `kick_high` не In Place: таз уезжает вперёд до +0,456 м (47% роста 0,978 м). Пик на 0,733 с, возврат к 1,333 с. Тот же размах в сыром `Martelo_2` (Z −0,006 → 0,426 → −0,006).
- Масштаб в игре: `scale = dimensions(spec).height / 0.9782` (`animatedFighter.ts:45-46`), для Терракса (build.height 1,1) ≈ 2,0. Визуальный наклон вперёд в кике ≈ 0,9 м, а `fighter.x` в симуляции не меняется (lunge у hk 0,05, `moveFactory.ts:~96`). Тело выезжает за хёртбокс.
- Признака In Place нет ни в FBX, ни в GLB. README терракса указывает Format, Skin, FPS, Keyframe Reduction, но не In Place. Вывод сделан только по цифрам смещения таза.
- Стартовый Z таза в GLB смещён на ≈0,03 м относительно сырых FBX (GLB 0,0244 против FBX −0,006): action перенесён на мастер-арматуру без ретаргета, клипы лежат в слегка разных базовых позах.
- Справка: у `warrior2` клип `run` держит таз на Z=0,549 константой; у `michelle` `SambaDance` таз гуляет на ±0,4 м (start = end).

## 4. Масштаб, габариты, ориентация, кости

### warrior3.glb

| Параметр | Значение |
|---|---|
| Корень сцены | узел `Armature`, rotation (0,7071; 0; 0; 0,7071) = +90° по X, scale 1 |
| Scale узлов | нигде нет scale ≠ 1 (все 43 узла) |
| Иерархия верха | `Armature` → [`mixamorig:Hips`, mesh-узел `tripo_node_...` со skin] |
| Hips | rotation −90° по X, T = (0; 0,0305; −0,5606) в локали `Armature` |
| Кости | 41 joint, префикс `mixamorig:`; пальцы только Thumb1-4 и Index1-4 на каждой руке |
| Bounds (bind) | min (−0,2383; 0; −0,1407), max (0,2383; 0,9782; 0,1407), dims 0,4766 × 0,9782 × 0,2814, center (0; 0,4891; 0), groundOffset 0 |
| Ориентация | лицом +Z (glTF-конвенция): носок `LeftToeBase` на z=+0,081 относительно стопы. В PlayCanvas Entity лицом −Z, нужен доворот |

- `requiresRuntimeCheck: true` (skinned). Максимальный анимированный размах (кик: стопа до Z=0,81, рука 0,58) в приложении не проверялся.
- README терракса утверждает, что FBX несут object-scale 0,01, а скрипт делает `resize(100)` (`build-terraks-rig.py:36-48`). В FBX из репозитория такого нет: `UnitScaleFactor=1,0`, объекта арматуры нет, корни — сам `mixamorig:Hips` и меш. Что Blender делает при импорте, не проверялось. Итоговый GLB (0,978 м) с таким масштабом согласован.

### Остальные GLB

| Файл | Корень | Scale | Рост | Лицом | Кости |
|---|---|---|---|---|---|
| `warrior2`, `warrior` | `Armature`, без rot | 1 | bounds 0,978 | +Z | 65 |
| `michelle` | `Character`, rot +90° X | **0,01** | bounds 1,664 | +Z | 65 |
| `soldier` | `Character`, rot −90° X | **0,01** | ≈1,825 по FK | **−Z** | 49 + 2 (два скина) |

У `soldier` инспектор вернул dims 184,8 × 44,4 × 183,2 (сырые единицы, без Character scale 0,01), поэтому bounds ненадёжны.

## 5. Текущее устройство

### Сцена (PlayCanvas)
- Создание: `src/render/scene.ts:107-134`. WebGL2, `AppBase`, регистрация систем render/camera/light/anim/particle (`:115-122`). Внутренний `requestAnimationFrame` движка обнулён (`:130`), кадр вызывает `GameLoop`.
- Свет: `scene.ts:75-99` (key directional с тенями в `high`, rim, fill). Туман и ambient `:56-61`, тонмап ACES `:69`.
- Земля и арена: `src/render/stage.ts:22-24` (box 14,4+40 × 0,4 × 60, y=−0,2), колонны, жаровни, баннеры.
- Бойцы: `src/render/view.ts:15-21` (`makeVisual`: `AnimatedFighter` для `spec.animatedRig`, иначе `ProceduralFighter`), `:38-46` (`setMatch`).
- Загрузка GLB: `src/render/assets.ts:18-51` (`AssetListLoader`, клипы по `AnimTrack.resource.name`), `:62-76` (`preload`).
- Логика в 2D: `root.setPosition(x, y, 0)` — `animatedFighter.ts:100`, `view.ts:161`.

### Камера
- Perspective, FOV 40° (`scene.ts:25`), near 0,1, far 90 (`:66-68`). Старт: позиция (0; 1,9; 9), `lookAt(0; 1,2; 0)` (`:72-73`).
- Слежение: `follow(midX, spread, midY)` (`scene.ts:141-164`, вызов `view.ts:131`). Дистанция по Z из FOV, ширины и высоты, зажим 6,2..26 (`:148`), сглаживание 0,07–0,1 (`:153-155`).
- Тряска через `Math.random` в рендере (`:158-159`), для рендера допустимо.

### Ввод
- Клавиатура: `src/core/input.ts:7-26` (карта), `:28-69` (`KeyboardSource`), `:45-49` (`poll`).
- Геймпад: `input.ts:89-111` (крестовина или стик, 4 лицевые кнопки, триггеры = block).
- Касание: `src/ui/touch.ts`, `VirtualSource` (`input.ts:72-86`).
- Объединение: `CompositeSource` (`input.ts:114-127`), `main.ts:49`.
- Формат: `InputState = Record<InputKey, boolean>` (9 полей), `src/game/types.ts:6-18`. Битовых масок нет.
- Опрос раз в тик: `main.ts:238`. Второй игрок — ИИ (`ai[1].poll`).

### Игровой цикл
- `src/core/loop.ts:8-51`: аккумулятор, `FRAME_MS = 1000/60` (`constants.ts:2-3`), максимум 5 шагов догона (`constants.ts:5`, `loop.ts:41`), `draw(alpha)` каждый rAF (`:49`). Время из `performance.now()` (`:22`).
- Подключение: `main.ts:131-135`; тик — `App.step` (`main.ts:229-271`), отрисовка — `App.draw` (`main.ts:273-276`).
- Шаг матча: `Match.step(inputs)` (`src/game/match.ts:~97-125`). Хитстоп замораживает весь шаг (`match.ts:101-103`).
- `alpha` не используется (интерполяции между тиками нет). Idle/run играют по настенному времени (`animatedFighter.ts:28,159`), а не по кадру симуляции.

### Остальное
- Каталога `sim/` нет. Логика в `src/game/` (`match.ts` 479 строк, `fighter.ts` 676, `combat.ts`, `ai.ts`, `inputBuffer.ts`, `poses.ts`, `attackClips.ts`, `constants.ts`, `dims.ts`, `types.ts`, `mocapPoses.ts`). Генерация и ростер в `src/characters/`.
- Конфиг: только `src/game/constants.ts`. Статы бойцов — `src/characters/roster.ts`.
- Frame data: TS-код с функциями, `src/characters/moveFactory.ts:~37-100` (`BASE_NORMALS`, функция `tune`, `MF.makeSpecial`). Не JSON и не чистые данные.
- Хитбоксы AABB: `fighter.ts:203-224`, `combat.ts:18` (`rectsOverlap`). Физического движка нет.
- Сборка: `package.json` (vite 5, typescript 5.6, playcanvas ^2.22.2, playwright), `vite.config.ts`, `tsconfig.json` (strict, `include: ["src"]`), `.github/workflows/deploy.yml`.
- Тесты: нет ни vitest, ни jest. Есть dev-скрипты `src/dev/simulate.ts`, `finisher.check.ts`, `checkKickLerp.ts`, `scripts/smoke.mjs` (Playwright).
- Оверлея отладки (хитбоксы, кадр, состояние) нет.

### Ориентация и разворот
- Игровая ось X, `facing` 1/−1 (`types.ts:25`). При facing=1 боец смотрит вправо (`fighter.ts:77`, старт ±2,6 в `match.ts:83-84`).
- `AnimatedFighter`: `yawNode` с углом `rig.yaw + 180` (`animatedFighter.ts:60`), `rig.yaw = 270` (`roster.ts:236`). Итог 450° ≡ 90°. Лишние «+180» и «270» — наслоение прежних правок (комментарии `animatedFighter.ts:53-59`).
- Разворот: `facingNode` на 0° или 180° по Y (`:101-112`), но плавно (`facingAngle += diff * 0.35`) и привязан к кадру рендера, а не к тику.

## 6. Соответствие инвариантам CLAUDE.md

| # | Инвариант | Статус | Где |
|---|---|---|---|
| 1 | `sim/` без движка и DOM | `sim/` нет; `src/game/` движок и DOM не импортирует (grep), но `ai.ts:1` тянет `../core/rng` | нарушение структуры |
| 2 | Шаг 60 Гц | выполнено | `loop.ts:41`, `constants.ts:2-5` |
| 3 | Нет Math.random/Date.now/performance.now в `sim/` | нарушено: `ai.ts:48` (`seed = Date.now()`). `Math.random` в `game/` не найден. ИИ на `Rng` (mulberry32), при явном seed детерминирован | 1 место |
| 4 | Состояние = один plain-объект | нарушено: `Fighter` и `Match` — классы (`fighter.ts:68`, `match.ts:58`), `InputBuffer` отдельно, `projectiles` по ссылкам (`view.ts:28,145`), `Fighter.spec` ссылается на CharacterSpec | |
| 5 | Вход = битовые маски | нарушено | `types.ts:6-18` |
| 6 | Frame data данными | частично: функции `tune`/`makeSpecial`, ветвление по `move.id` (`fighter.ts:60-66`, `animatedFighter.ts:131-137`), часть тайминга литералами | риск |
| 7 | Только AABB | выполнено | `combat.ts:18` |
| 8 | Анимации In Place, поза по игровому кадру | частично: attack/hitstun по `moveFrame/stateFrame` (`animatedFighter.ts:162`), idle/run по реальному времени (`:28,159`), `kick_high` не In Place, клипов hit/run/idle нет | |
| 9 | Разворот 180°, без отрицательного scale | **нарушено:** `animatedFighter.ts:155-156` — `setLocalScale(mirror * visualScale, ...)`, mirror = −1 для `punch` и `punchHeavy`. Инвертируется порядок вершин (culling, нормали), зеркалятся свет и тени | |
| 10 | Константы только в конфиге | **нарушено:** `fighter.ts:40-57` (DASH_FRAMES, WAKEUP_FRAMES, KNOCKDOWN_FRAMES, BUFFER_FRAMES, WAKEUP_INVULN, BACKDASH_INVULN, MAX_JUGGLE, THROW_RANGE, THROW_TECH_WINDOW); `match.ts:216,259,311,322` (hitstop 18/16/8/4); `match.ts:83-84` (±2,6); `combat.ts:81-82` (COUNTER_*); `animatedFighter.ts:20-24` (TUNING), `:88-91`, `:109-110` (0,35; 540) | |

### Дополнительные риски по ассетам и анимации

Расчёты агента по `tune` и `moveFactory` (speed Терракса 0,87), в браузере не сверялись.

1. **Тайминги окна клипа против frame data:**

| Приём | Тиков | Секунд | Окно клипа | Ускорение клипа |
|---|---|---|---|---|
| lp | 16 (5+3+8) | 0,27 | 0,9 с | ≈3,4× |
| lk | 21 | 0,35 | 0,9 с | ≈2,6× |
| hp | 32 (10+4+18) | 0,53 | 1,3 с | ≈2,4× |
| hk | 42 (14+4+24) | 0,70 | 0,9 с | ≈1,3× |

2. **Пик клипа не совпадает с активными кадрами:**
   - `kick_high`: пик стопы Z=0,81 на 0,6 с (≈67% окна). Активные кадры hk 14..18 из 42 (33–43%). Удар засчитывается раньше, чем нога вытянута (≈10 тиков).
   - `punch_heavy`: пик кисти на 1,167 с (≈90% окна). Активные кадры hp 10..14 из 32 (31–44%).
   - `punch_body`: пик на 0,4 с (≈44%) попадает в активные кадры lp (31–50%). Сходится.
3. Один клип `kick_high` обслуживает и lk, и hk (`animatedFighter.ts:137`). Для приседа, прыжка, блока, нокдауна, победы и разворота клипов нет (остаётся заглушка `idle_hold`).
4. Hitstun, blockstun, knockdown используют один hitHigh = `idle_hold`.
5. `layer.transition(next, 0)` без blend даёт мгновенные перескоки. В хитстопе поза удара замирает корректно, но idle-цикл в это время продолжает играть.
6. Dev-харнесс `npm run sim` передаёт seed, но `AiController` по умолчанию берёт `Date.now()`; без явного seed реплей не воспроизводим.
7. README упоминает `npm run bake:mocap` (`README.md:183,261`), такого скрипта в `package.json` нет. README:152-154 про Michelle/Soldier устарел.
8. `Math.random` в рендере (`stage.ts:70,91,95`, `scene.ts:158-159`, `audio.ts:62`, `main.ts:59,164`, `screens.ts:106,128`) допустим, но при выносе `sim/` этот код должен остаться снаружи.

## 7. Предложение: структура файлов и этапы

### Структура

```
src/
  sim/                      # чистый TS, без DOM/PlayCanvas/Math.random/Date.now
    config.ts               # константы (или re-export из config/)
    types.ts                # SimState (plain), Input (битовые маски), Move-данные
    input.ts                # биты: LEFT=1, RIGHT=2, UP=4, DOWN=8, LP, HP, LK, HK, BLOCK
    state.ts                # createState(), serialize/deserialize (один plain-объект)
    step.ts                 # step(state, [mask0, mask1]) -> state (без классов)
    fighter.ts, combat.ts, hitbox.ts, hitstop.ts, rng.ts
    moves.ts                # разбор frame data -> таблицы
    *.test.ts               # юнит-тесты (vitest)
  config/
    sim.json или sim.ts     # скорости, гравитация, размеры, окна буфера
    characters/*.ts
  data/
    frames/terraks.json     # startup/active/recovery, хитбоксы AABB, hitstun, blockstun, knockback
    clips/terraks.json      # имя клипа, fps, offset первого ключа, окно, привязка к move id, placeholder
  input/                    # DOM-слой: клавиатура, геймпад, тач -> маска на тик
  render/                   # PlayCanvas: scene, stage, view, fighter (читает SimState)
    debug/overlay.ts        # хитбоксы/хёртбоксы/кадр/состояние (клавиша F1)
  core/loop.ts              # фиксированный шаг (без изменений)
  app/                      # main.ts, ui/
assets/rig-source/mixamo/   # исходные FBX
public/models/              # только используемые GLB
```

### Варианты

- **A.** Ничего не двигать, добавить тесты поверх `src/game/`. Минимум работы, но не закрывает инварианты 1, 4, 5, 6, а тесты придётся переписывать при переезде.
- **B (рекомендуется).** Новый `src/sim/` рядом, перенос по частям с тестами на каждый шаг, старый `src/game/` работает до переключения. Риск: временное дублирование.
- **C.** Полная переписка симуляции за один шаг. Быстро, но рискованно, проект между шагами не запускается.

### Порядок этапов (вариант B)

1. **Этап 2. Стабилизация ассетов (до кода).**
   - Докачать с Mixamo для Терракса (FBX Binary, Skin Without Skin, 30 fps, Keyframe Reduction none, **In Place включить**): idle, walk/run вперёд и назад, hit reaction (голова и корпус), block, crouch (idle и блок), jump (взлёт, воздух, посадка), knockdown, get up, win, intro.
   - `Martelo_2` перескачать с In Place (иначе таз уезжает на 0,45 м).
   - Пока клипов нет, `idle_hold` помечается `placeholder: true` в `data/clips`.
   - Неиспользуемые GLB удалять отдельным коммитом, после согласования.
2. **Этап 3. Каркас `src/sim/`.** Типы, маски ввода, plain `SimState`, `step()`, сериализация, тест детерминизма (два прогона с одной последовательностью масок дают одинаковый JSON). Добавить vitest (новая зависимость, согласовать).
3. **Этап 4. Конфиг и frame data.** Перенос констант из `fighter.ts:40-57`, `match.ts`, `combat.ts` в `config/`. `data/frames/terraks.json` вместо `tune`. Тесты: попадание, блок, hitstun, hitstop, границы арены.
4. **Этап 5. Рендер читает `SimState`.** `AnimatedFighter` получает плоский snapshot, а не `Fighter`. Убрать `mirror * scale` (отдельный левый клип или зеркальная анимация, подготовленная в Blender; решение за владельцем проекта). Разворот только 180° по Y, мгновенный или по кадрам симуляции.
5. **Этап 6. Поза по игровому кадру.** Idle, run и остальные клипы по `clipFrame = f(state, stateFrame)`, `clipTime = offset + frame / fps`. Таблица `data/clips`: кадр приёма → кадр клипа с учётом сдвига 0,0333 с, активные кадры совпадают с пиком клипа. Root motion убрать или учесть в `lunge` симуляции.
6. **Этап 7. Оверлей отладки.** Хитбоксы, хёртбоксы, номер кадра, состояние, frame advantage. Переключатель по клавише.
7. **Этап 8. Ввод.** `input/` собирает маски (клавиатура, геймпад, тач), буфер ввода живёт в симуляции.
8. **Этап 9. Остальной ростер.** Семь процедурных бойцов оставить как есть до решения по моделям.

## Вопросы к владельцу проекта

- Чем заменить `mirror = −1` для левой руки: отдельный клип или зеркальная анимация из Blender.
- Кто докачивает недостающие клипы Mixamo с In Place.

## Неизвестно / не удалось проверить

- Рендер не запускался (нет `node_modules`). Не проверены: фактический вид поз в браузере, `npm run typecheck`, `npm run sim`, `npm run smoke`.
- Blender не запускался, `npm run bake:terraks` не проверялся. Что Blender делает с масштабом при импорте FBX (README: 0,01, FBX: `UnitScaleFactor=1`), не выяснено.
- Скачивались ли FBX с галочкой «In Place», неизвестно (в файлах признака нет).
- Анимированные bounds в позе кика не измерялись, только bind-bounds и позиции костей.
- Точные bounds `soldier.glb` (рост 1,83 м оценён по FK). Игра им не пользуется.
- Направление взгляда `warrior3.glb` проверено только по FK, не визуально.
- Соответствие пиков клипов и активных кадров посчитано по формулам и FK. Для `hp` и `hk` стоит проверить глазами с оверлеем (этап 7).
- UI-экраны, звук, `effects.ts`, `proceduralFighter.ts` и остальные 7 бойцов не разбирались.

## Ключевые файлы

- `CLAUDE.md`
- `public/models/warrior3.glb`
- `assets/rig-source/terraks/` (3 FBX, README.md, текстуры)
- `scripts/build-terraks-rig.py`
- `src/render/animatedFighter.ts`, `scene.ts`, `assets.ts`
- `src/core/loop.ts`, `src/core/input.ts`
- `src/game/` (`match.ts`, `fighter.ts`, `combat.ts`, `constants.ts`, `types.ts`, `ai.ts`)
- `src/characters/roster.ts`, `moveFactory.ts`
- Скрипты разбора в scratchpad: `fk.mjs`, `anim.mjs`, `fbx.py`
