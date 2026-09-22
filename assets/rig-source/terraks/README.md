# Терракс — исходники рига (Mixamo)

Мокап-анимации для боевых клипов Терракса, полученные через auto-rig на mixamo.com.
Собираются в `public/models/warrior3.glb` скриптом `scripts/build-terraks-rig.py`.

## Файлы

- `Punching_1.fbx` — мастер-файл: несёт меш Терракса (перенесённый через Mixamo
  auto-rig из исходной модели Tripo), новый Mixamo-скелет (`mixamorig:*`, 41 кость)
  и анимацию удара рукой в корпус (клип `punch_body`).
- `Martelo_2.fbx` — только скелет + анимация хай-кика (клип `kick_high`), без меша
  (стандартный Mixamo-экспорт "Without Skin").
- `diffuse.webp` / `diffuse.png` — diffuse/albedo текстура меша (исходный webp +
  конвертированный png, т.к. Blender 4.0 не читает webp напрямую; конвертация:
  `dwebp diffuse.webp -o diffuse.png`).

## Пересборка

```
blender --background --python scripts/build-terraks-rig.py
```

## Как добавить ещё анимацию

1. На mixamo.com, с загруженным персонажем, скачай нужный клип: Format — FBX Binary,
   Skin — **Without Skin** (кроме случая, когда качаешь новый мастер-файл заново),
   FPS — 30, Keyframe Reduction — none.
2. Положи файл сюда, рядом с остальными.
3. Добавь `(имя_файла, имя_клипа)` в список `EXTRA_CLIPS` в
   `scripts/build-terraks-rig.py`.
4. Перезапусти скрипт — `warrior3.glb` пересоберётся целиком, со всеми клипами.

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
