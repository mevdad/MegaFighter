# scripts/clips-audit: скрипты аудита Mixamo-клипов Терракса

Воспроизводят числа из [AUDIT_CLIPS.md](../../AUDIT_CLIPS.md) (аудит 25 новых FBX) и частично из [AUDIT_STAGE1.md](../../AUDIT_STAGE1.md) (этап 1). Решения по результатам: [DECISIONS.md](../../DECISIONS.md).

**Статус.** Это исследовательские одноразовые скрипты. Они не часть сборки, не вызываются из `package.json`, не покрыты тестами и не относятся к `src/` (в `tsconfig` входит только `src`). Для файтинга они ничего не гарантируют: это отчётный инструмент.

## Зависимости

- Python 3 только со стандартной библиотекой (проверено на 3.13; numpy не нужен).
- Node 22 (проверено), для `*.mjs` без зависимостей: `gltf_fk.mjs`, `table.mjs`, `stage1/*.mjs`.
- `sheet.mjs` и `shoot.mjs`: `playwright` из `devDependencies` репозитория (`npm ci`) и Chromium. Путь берётся из `CHROMIUM_PATH`, иначе `/opt/pw-browsers/chromium`, если он есть, иначе Chromium самого Playwright.
- `shoot.mjs` дополнительно: `esbuild` (есть в `node_modules/.bin`, приходит с vite) и playcanvas из репозитория.

## Пути и каталоги

Все пути считаются от расположения скрипта; переопределяются переменными окружения (общий модуль `paths.py`, в `.mjs` то же самое).

| Переменная | По умолчанию | Что |
|---|---|---|
| `AUDIT_FBX_DIR` | `assets/rig-source/terraks/` | исходные FBX (нужны только `dump.py` через аргументы командной строки и `stage1/fbx.py`) |
| `AUDIT_OUT` | `scripts/clips-audit/out/` | всё, что генерируется (в `.gitignore`) |
| `AUDIT_POSE_DIR` | `scripts/clips-audit/pose/` | откуда `lib.py`, `validate.py`, `sheet.mjs` читают FK-позы |
| `CHROMIUM_PATH` | см. выше | браузер для `sheet.mjs`, `shoot.mjs` |

**Запуск Python без `-I`.** `-I` отключает каталог скрипта в `sys.path`, а `s*.py`, `fk.py`, `validate.py` импортируют соседние модули (`lib`, `fk`, `paths`). Поэтому они запускаются обычным `python3 scripts/clips-audit/sN.py`: это доверенный код репозитория, а в `sys.path` явно добавляется каталог скрипта, не текущий. Только чтение недоверенных FBX остаётся с `-I`: `dump.py` и `stage1/fbx.py` самодостаточны, они только парсят бинарный файл и ничего не исполняют.

## Порядок запуска

Из корня репозитория:

```bash
D=scripts/clips-audit
# 1. FBX -> JSON-дампы (out/dump/*.json, ~4,4 МБ, ~1 с на все 25)
mkdir -p $D/out/dump
for f in assets/rig-source/terraks/*.fbx; do python3 -I $D/dump.py "$f" $D/out/dump/$(basename "$f" .fbx).json; done
# 2. FK: мировые позиции 41 кости по кадрам -> out/pose/*.json (~3 с)
python3 $D/fk.py
# 3. (опционально) свежие позы вместо эталонных
export AUDIT_POSE_DIR=$PWD/$D/out/pose
# 4. FK по нетронутому GLB -> out/gltf_pose.json (нужен для validate.py, hyp.py, restpose.py)
git show b4f6e3f^:public/models/warrior3.glb > $D/out/warrior3_orig.glb
node $D/gltf_fk.mjs $D/out/warrior3_orig.glb $D/out/gltf_pose.json
# 5. проверка FK против GLB
python3 $D/validate.py
# 6. темы аудита
python3 $D/s1.py   # и т.д., см. таблицу ниже
```

`lib.py` по умолчанию читает **эталонные** позы из `pose/` (в git), поэтому шаги 1 и 2 для запуска `s*.py` не нужны. Шаги 1 и 2 нужны, чтобы убедиться, что эталон воспроизводится: на момент добавления `out/dump` и `out/pose` получались побайтово идентичными исходным.

## Скрипты по темам AUDIT_CLIPS.md

Инфраструктура:

| Файл | Назначение |
|---|---|
| `dump.py` | §0. Парсер бинарного FBX 7.7: Model, кривые, стеки, связи -> JSON. `python3 -I dump.py <in.fbx> <out.json>`, печатает по строке на файл |
| `fk.py` | §0. FK `T·Rpre·R` по дампам -> `out/pose/<клип>.json` (позиции 41 кости, мировые вращения шести костей, шов, `rot_step`); печатает кадры, шаг ключей, шов |
| `lib.py` | §0. Общие функции: класс `Clip`, `windows()`, `posedist()`, `bestyaw()`, список `CLIPS`; сам ничего не печатает |
| `paths.py` | пути и переменные окружения (см. выше) |
| `validate.py` | §0 «Проверка FK». Сравнивает FK из FBX с FK по GLB для Punching_1, Martelo_2, Cross_Punch: максимум, Hips на кадрах 0, середина, последний. Ожидание: Punching_1 (мастер) 0,0 м; у Martelo_2 и Cross_Punch есть расхождение, это и есть перекос позы покоя из §10.1 |
| `hyp.py` | §10.1. Проверяет гипотезу `PreRotation·(R_default⁻¹·R_кривой)` против GLB: варианты plain / delta_pre / delta_post; ожидаемо delta_pre даёт 0,0002 м |
| `restpose.py` | §10.1. Статическая поза FBX (Lcl как записано / только PreRotation) против bind-позы GLB, наибольшие расхождения по костям |
| `mk1.py` | §1. Читает `out/s1.json` (после `s1.py`), пишет markdown-таблицы `out/T1A.md`, `out/T1B.md`, это сырьё для двух таблиц раздела 1 |

Темы (каждый скрипт только читает позы и печатает в stdout, если не указано иное):

| Файл | Раздел | Что печатает/пишет |
|---|---|---|
| `s1.py` | §1 | по всем 25 клипам: N, длительность, Hips start/end/min/max/отклонение, горизонтальный размах корня, шов; пишет `out/s1.json` |
| `s2.py` | §2 Center_Block | покадрово: скорость, руки относительно головы, Hips Y, наклон корпуса, шаг вращений |
| `s3.py` | §3 присед | Standing_To_Crouched покадрово против Male_Crouch_Pose, средние высоты Fighting_Idle, ключевые точки crouch-позы |
| `s4.py` | §4 падения | knockdown, Knocked_Out, Getting_Up: каждые 3-4 кадра Hips, Head, макс. Y, скорость, ориентация груди и лица |
| `s4b.py` | §4 падения | момент «лёжа», окна покоя, конечная поза и yaw, стык Getting_Up с концами knockdown/Knocked_Out, конец Getting_Up против idle и блока |
| `s5.py` | §5 движение | Fast_Run, Walking, Walking_Backwards: покадрово Hips, высота и Z лодыжек/носков |
| `s5b.py` | §5 движение | главная ось хода ступней (PCA, азимут) для Walking, Walking_Backwards, Fast_Run |
| `s5c.py` | §5 Jumping | покадрово высота ступней, Hips, голова, скорость, наклон |
| `s5d.py` | §5 движение | окна контакта стопы с землёй, скольжение лодыжки/носка в м/с (опора), плоская стопа; основа расчёта dash из Fast_Run |
| `s6.py` | §6 Victory, Intro | окна покоя, каждые 5 кадров Hips, голова, кисти, макс. Y, скорость, yaw |
| `s7.py` | §7 и §9 (удары) | для 10 ударных клипов (или клипов из аргументов): вынос кистей/стоп по Z от Hips, пик, скорость, высота точки |
| `s8.py` | §8 Fighting_Idle | средняя стойка (ступни, кисти, колени), амплитуда Hips, ближайшие кадры к кадру 0, yaw; расстояние стартовой позы каждого клипа до idle |
| `s9.py` | §9 Surprise_Uppercut | каждый 2-й кадр: Hips, кисти, ступни, скорость, yaw; окна покоя |
| `s10.py` | §9 Hit_To_Body, Head_Hit | покадрово смещение Hips/Head от кадра 0, наклон, скорость, расстояние до кадра 0 |
| `s11.py` | §7 Mirror-пары | ошибка зеркала (X -> -X, L<->R) для четырёх пар, сумма yaw, базовая разница без зеркала |
| `s12.py` | §9 окна ударов | для Jab, Cross_Punch, Punching_1, Mma_Kick, Martelo_2: пик, дальность, startup/active/recovery в кадрах и тиках; окна Surprise_Uppercut |
| `s13.py` | §2, §3, §5 (уточнения) | Center_Block кадры 17-19 и 34-35 (руки у головы), окна медленных кадров, наклон Fast_Run, высоты STC/MCP против idle, Hips Mma_Kick |

## Картинки

- `sheet.mjs <клип> <out.png> f1,f2,...` рисует стик-фигуры (вид сбоку и спереди) по FK в Chromium. Без `/` в имени выхода пишет в `out/img/` (там же временный `_tmp.html`).
- Картинки, на которые ссылается AUDIT_CLIPS.md как на `img/…png`, лежат в [docs/audit-img/](../../docs/audit-img/): `center_block`, `stc`, `mcp`, `knockdown`, `ko`, `getup`, `run`, `uppercut`. Ссылки в самом AUDIT_CLIPS.md не менялись, поэтому относительные `img/…` оттуда не откроются; реальный путь `docs/audit-img/`.
- Рядом лежат пять `kick_*.png` (скриншоты движка этапа rootLock: `peak` кадр 28 и `active15` кадр 15 для factor 0 / 0,6 / 1) и они воспроизводятся `shoot.mjs`.

## Проверка kick_high в движке: shoot.mjs, table.mjs, harness/

Этап rootLock (коммит `b4f6e3f`): реальный `AnimatedFighter` из `src/` ставится в `hk` на заданный кадр, поверх рисуются хёртбокс, хитбокс и кости.

```bash
D=scripts/clips-audit; mkdir -p $D/out/work $D/out/harness
# GLB с тремя значениями factor (apply-root-lock пишет в --out, исходный public/models/warrior3.glb не трогает)
node scripts/apply-root-lock.mjs --set kick_high=0   --out $D/out/work/w_f0.glb
node scripts/apply-root-lock.mjs --set kick_high=0.6 --out $D/out/work/w_f0.6.glb
node scripts/apply-root-lock.mjs --set kick_high=1   --out $D/out/work/w_f1.glb
# бандл харнесса (playcanvas тянет node:worker_threads, его надо оставить внешним)
npx esbuild $D/harness/harness.ts --bundle --format=iife --external:node:worker_threads --outfile=$D/out/harness/bundle.js
node $D/shoot.mjs        # ~20 с, swiftshader; пишет out/shoot/kick_*.png и out/shoot/frames.json (PEAK=28 по умолчанию)
node $D/table.mjs        # таблица по кадрам из frames.json
```

`harness.ts` импортирует `src/render/*`, `src/game/fighter`, `src/characters/roster` относительными путями: если эти модули изменятся (имена, сигнатуры `AnimatedFighter`, `Fighter`), харнесс придётся поправить. `frames.json` в каталоге скрипта это эталонный результат прогона (29 КБ); `table.mjs` берёт `out/shoot/frames.json`, а если его нет, этот эталон. Воспроизведено: `frames.json` и PNG после прогона совпали с исходными побайтово.

**После пилота клипов** (`data/clips/terraks.json` новой схемы, `kick_high` в итоговом GLB больше нет) рецепт выше воспроизводится
только на базе: `node scripts/apply-root-lock.mjs --glb assets/rig-source/terraks/terraks-base.glb --config <json с {id: kick_high, rootLock}> --set kick_high=0.6 --out ...`.
`harness.ts` держит клипы старого рига (`kick_high`) и работает с базовым GLB.

## Пилотные клипы в движке: pilot_shoot.mjs, harness/pilot.ts

```bash
npm run build:clips
npx esbuild scripts/clips-audit/harness/pilot.ts --bundle --format=iife --external:node:worker_threads --outfile=scripts/clips-audit/out/harness/pilot.js
node scripts/clips-audit/pilot_shoot.mjs   # docs/pilot-clips.png, docs/pilot-clips-compare.png, сверка позы движка с FK по GLB
```

## Нетронутый GLB для validate.py

`validate.py`, `hyp.py`, `restpose.py` нужен `out/gltf_pose.json`, то есть FK **нетронутого** `warrior3.glb` (до root lock; текущий `public/models/warrior3.glb` уже со срезанным ходом таза). Бинарник в репозиторий не копировался. Получить:

```bash
git show b4f6e3f^:public/models/warrior3.glb > scripts/clips-audit/out/warrior3_orig.glb
node scripts/clips-audit/gltf_fk.mjs scripts/clips-audit/out/warrior3_orig.glb scripts/clips-audit/out/gltf_pose.json
```

(Проверено: этот файл побайтово равен прежнему `orig/warrior3.glb`, а результат `gltf_fk.mjs` равен исходному `gltf_pose.json`.) Путь к GLB это просто аргумент `gltf_fk.mjs`, любой другой GLB тоже подойдёт.

## pose/*.json

25 файлов, 2,9 МБ: эталонные FK-позы, по одному на FBX. Получены `dump.py` + `fk.py` из `assets/rig-source/terraks/*.fbx` (30 к/с, индекс = номер ключа, `t = i/30`; поля: `names`, `parent`, `pos[кадр][кость] = [x,y,z]`, `wrot` для Hips/Spine/Spine2/Head/LeftFoot/RightFoot, `seam_ang_max_deg`, `rot_step_max_deg`, `stop_s`). `lib.py` читает их по умолчанию. Свежий `fk.py` пишет в `out/pose/`, эталон не перезаписывает.

## Что генерируется в out/

`dump/` (JSON-дампы FBX), `pose/` (свежий FK), `gltf_pose.json`, `warrior3_orig.glb`, `s1.json`, `T1A.md`, `T1B.md`, `img/` (`sheet.mjs`), `work/` (GLB для shoot), `harness/bundle.js`, `shoot/` (`frames.json`, `kick_*.png`). Каталог в `.gitignore`, как и `__pycache__/`.

## stage1/

Скрипты разбора этапа 1 (AUDIT_STAGE1.md, раздел «Ключевые файлы»: «Скрипты разбора в scratchpad: fk.mjs, anim.mjs, fbx.py»), скопированы как есть, пути приходят аргументом:

- `stage1/fk.mjs <glb> [timeline]`: узлы, масштабы, FK по GLB.
- `stage1/anim.mjs <glb>`: дерево узлов, клипы, каналы.
- `stage1/fbx.py <fbx>`: сырой разбор узлов бинарного FBX (читает недоверенные файлы, запускать с `-I`).

## Что намеренно не скопировано

- `verify.mjs`, `loc.mjs`, `insp.mjs` (корень scratchpad): одноразовая проверка этапа rootLock (побайтовое и JSON-сравнение GLB до и после `apply-root-lock.mjs`, FK Hips, локация канала Hips). Ни AUDIT_STAGE1, ни AUDIT_CLIPS на них не ссылаются, воспроизведения аудитов они не требуют.
- `dump/` (генерируется `dump.py`), `__pycache__`, `harness/bundle.js` (2,2 МБ, собирается esbuild), `work/*.glb` (по 5,6 МБ, генерируются `apply-root-lock.mjs`), `orig/warrior3.glb` (достаётся из git), `gltf_pose.json`, `s1.json`, `T1A.md`/`T1B.md` (генерируются `s1.py` + `mk1.py`; промежуточные отчёты), `before_*.log`/`after_*.log`, `*.glb.json` (дампы чужих моделей michelle, soldier, warrior*).
- `w_chain0.glb`, `w_chain06.glb` (`work/`): не используются `shoot.mjs`.

## Известные оговорки

- Последняя строка AUDIT_CLIPS.md указывает прежний путь к scratchpad, он устарел: скрипты теперь здесь.
- Пороги окон (3, 5, 10 мм/кадр, 0,033 м контакта, 0,12 и 0,25 «лёжа») зашиты в скрипты (`windows()` в `lib.py`, константы в `s5d.py`, `s4b.py`); они выбраны вручную, см. AUDIT_CLIPS.md §11.
