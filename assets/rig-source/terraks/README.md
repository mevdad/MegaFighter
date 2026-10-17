# Терракс — исходники рига (Mixamo)

Мокап-анимации для боевых клипов Терракса, полученные через auto-rig на mixamo.com.
Итоговый `public/models/warrior3.glb` собирается в две ступени (схема ниже).

## Цепочка сборки

```
Punching_1.fbx + diffuse.png --(Blender: npm run bake:terraks)--> terraks-base.glb
terraks-base.glb + *.fbx + data/clips/terraks.json --(npm run build:clips)--> public/models/warrior3.glb
```

- `terraks-base.glb` (5,65 МБ, в git): вывод Blender, меш, скелет, текстура и старые клипы
  `idle_hold`, `punch_body`, `kick_high`, `punch_heavy` ДО rootLock. Нужен только для пересборки и сравнения.
- `npm run build:clips` = `scripts/build-clips.mjs` (клипы из FBX, без Blender) + `scripts/apply-root-lock.mjs`.
  Идемпотентно: каждый запуск начинает с базы, поэтому GLB получается побайтово тот же.
- `npm run verify:clips`: FK собранных клипов против FBX покадрово (допуск 1 мм) и проверка структуры GLB.
- `npm run bake:terraks` (Blender, пересобирает ТОЛЬКО базу): пишет `terraks-base.glb`, `public/models/warrior3.glb` не трогает.
  Не проверялся в окружении без Blender; после него запустите `npm run build:clips`.

`data/clips/terraks.json`: `clips[]` с полями `id` (имя клипа в GLB), `file` (FBX; нет поля = клип берётся из базы без
изменений), `trim` `{start,end}` (кадры FBX, 30 к/с, кадр 0 = t 0, концы ВКЛЮЧИТЕЛЬНЫЕ; время ключа = (кадр - start)/30),
`loop` (для loop-клипа trim должен исключать кадр-дубль, сборка падает, если последний кадр равен первому),
`placeholder`, `rootLock` `{axes, factor}` (мировые оси, см. `apply-root-lock.mjs`). Клипы базы, которых нет в конфиге
(`kick_high`, `punch_heavy`), в итоговый GLB не попадают. Подробности математики (кривые абсолютные, PreRotation,
перевод Hips в систему узла) в шапке `scripts/build-clips.mjs`.

Пилот (DECISIONS §3): `fighting_idle` (Fighting_Idle 0-101, loop), `jab` (Jab 11-26), `martelo_2` (Martelo_2 3-35, Z lock 1),
`cross_punch` (Cross_Punch 24-45). Остальные 17 клипов (ходьба, dash, присед, прыжок, реакции, knockdown, getup, блок-hold,
victory, intro, mma_kick, punching_1) собраны тем же способом: полный список с trim, loop, rootLock и алиасами-заглушками в
[docs/clips-table.md](../../../docs/clips-table.md), поза в движке в [docs/clips-sheet.png](../../../docs/clips-sheet.png). В GLB 23 клипа,
`roster.ts` пока использует только пилотные. Новые клипы добавляются записью в конфиг.

Особенности конфига: однокадровый клип (trim start == end, `block_hold_18/43`) пишется как два одинаковых ключа на t = 0 и 1/30 с
(DECISIONS §12, `scripts/clips-audit/hold_check.mjs`); D (сдвиг Hips в систему меша) считается по каждому FBX, у `Punching_1.fbx`
он 0; необязательные поля `note`, `estimate`, `markers` сборка не читает (справочные данные для roster-этапа).

## Файлы

- `terraks-base.glb`: см. выше.
- `Punching_1.fbx` — мастер-файл: несёт меш Терракса (перенесённый через Mixamo
  auto-rig из исходной модели Tripo), новый Mixamo-скелет (`mixamorig:*`, 41 кость)
  и анимацию удара рукой в корпус (клип `punch_body`).
- Остальные `*.fbx` — только скелет + анимация, без меша (стандартный Mixamo-экспорт "Without Skin"). Эти файлы
  несут ненулевую позу по умолчанию (Lcl Rotation у 24 костей), поэтому через Blender их переносить нельзя
  (AUDIT_CLIPS §10.1); `build-clips.mjs` читает их напрямую. `Martelo_2.fbx`, `Cross_Punch.fbx` в базе (Blender) ещё
  значатся как `kick_high`, `punch_heavy`. `*_Mirror.fbx`, `Knocked_Out.fbx`, `Male_Crouch_Pose.fbx`, `Surprise_Uppercut.fbx` в GLB не собираются.
- `diffuse.webp` / `diffuse.png` — diffuse/albedo текстура меша (исходный webp +
  конвертированный png, т.к. Blender 4.0 не читает webp напрямую; конвертация:
  `dwebp diffuse.webp -o diffuse.png`).

## Пересборка базы (Blender)

Нужен Blender 4.x с видимым интерпретатору Python модулем `numpy` (иначе
FBX-импортёр падает с `ModuleNotFoundError: No module named 'numpy'`; на Linux
Blender из apt использует системный python3, значит `apt install python3-numpy`).
Подробности и установка Blender — в корневом `README.md`, раздел «Сборка
`public/models/warrior3.glb`».

```
npm run bake:terraks
# то же самое напрямую:
blender --background --python scripts/build-terraks-rig.py
```

## Как добавить ещё анимацию

1. На mixamo.com, с загруженным персонажем, скачай нужный клип: Format — FBX Binary,
   Skin — **Without Skin**, FPS — 30, Keyframe Reduction — none.
2. Положи файл сюда, рядом с остальными.
3. Добавь запись в `data/clips/terraks.json` (`id`, `file`, `trim`, `loop`, `placeholder`, `rootLock`).
4. `npm run build:clips && npm run verify:clips`. Blender не нужен.
5. Укажи `id` в `src/characters/roster.ts`.

## Важные технические грабли (уже учтены в скрипте, но полезно помнить)

- **Масштаб**: каждый FBX с mixamo.com несёт на арматуре object-level scale `0.01`
  (см-vs-м юниты в FBX). Скрипт компенсирует это через `resize(100,100,100)` +
  `Apply Scale` на мешe и арматуре вместе — так же, как это правится руками в
  Blender UI. Раскалиброванная высота после фикса (`~0.9782` м, bind-поза) совпадает
  с калибровкой старого `warrior2.glb` — пересчитывать `TUNING` в
  `src/render/animatedFighter.ts` не пришлось.
- **Текстуры**: Mixamo auto-rig не переносит материалы/текстуры меша — они
  подключаются заново в Blender по существующей UV-развёртке (сохраняется от
  исходной модели, Mixamo её не трогает).
- **idle/run/hit пока не сгенерированы отдельно на новом риге** — скрипт ставит
  плейсхолдер `idle_hold` (bind-поза, 2 кадра) на все три поля. Когда появятся
  настоящие клипы (idle-стойка, бег, реакция на попадание) с mixamo.com — добавить
  их так же через `EXTRA_CLIPS` и переключить `idleClip`/`runClip`/`hitHigh` в
  `src/characters/roster.ts` на них.
- **(Устарело с пилота: теперь `cross_punch` режется trim 24-45 в `data/clips/terraks.json`, окна roster.ts по локальному времени.) `punch_heavy` (Cross_Punch) обрезан по офлайн-замеру, не на глаз** — полный клип
  2с, но полное разгибание руки (по мировой позиции кости `mixamorig:RightHand`)
  происходит к ~1.1–1.2с, дальше идёт только возврат в стойку. `roster.ts` берёт окно
  `start:0, end:1.3`. Реальный hp Терракса на арене — около 0.5с игрового времени
  (startup+active+recovery из `moveFactory.ts`, с поправкой на `speed`-тюнинг), так
  что даже обрезанное окно скрабится быстрее, чем в оригинальном мокапе — это
  ожидаемо (то же самое сделано для `kick_high`). Если в браузере удар всё ещё
  выглядит слишком быстрым/дёрганым — можно сузить окно ещё, посмотрев на позу в
  паузе через `layer.activeStateCurrentTime`.
