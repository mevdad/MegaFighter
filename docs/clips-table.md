# Клипы Терракса в public/models/warrior3.glb

Сгенерировано по `data/clips/terraks.json` и самому GLB (`npm run build:clips`). Кадры в индексации FBX, trim включительный,
время ключа (кадр - start)/30 с, клип начинается с t = 0 (DECISIONS §12). Длительность = время последнего ключа
(число кадров - 1)/30; у hold-клипов (один кадр) это два одинаковых ключа на t = 0 и 1/30 с. rootLock: мировые оси, factor,
якорь = первый ключ клипа (кадр `start` из trim). Все клипы из FBX несут только rotation у 41 кости и translation у Hips, scale нет.
Проверка FK против FBX по всем клипам из FBX: максимум 0,279 мм (допуск 1 мм), `npm run verify:clips`.
Контактный лист поз в движке: [clips-sheet.png](clips-sheet.png) (`node scripts/clips-audit/clips_sheet.mjs`).

## Клипы в GLB (23)

| id | источник FBX и trim | длительность, с | кадров | loop | placeholder | rootLock | примечание |
|---|---|---:|---:|---|---|---|---|
| idle_hold | база (без FBX) | 0,3333 | 2 | да | да | нет | bind-поза, 2 ключа (база Blender); сейчас играет за run и hitHigh (placeholder) |
| punch_body | база (без FBX) | 0,9000 | 27 | нет | нет | нет | старый Blender-клип из базы (Punching_1), не меняется; в roster не используется |
| fighting_idle | Fighting_Idle 0-101 | 3,3667 | 102 | да | нет | нет | loop: период 101 кадр (101/30 с), дубль кадра 102 отброшен |
| jab | Jab 11-26 | 0,5000 | 16 | нет | нет | нет | пилот; lp, active 16-18, пик 17 |
| martelo_2 | Martelo_2 3-35 | 1,0667 | 33 | нет | нет | Z, 1 | пилот; hk, active 12-20 (FBX), пик по оверлею |
| cross_punch | Cross_Punch 24-45 | 0,7000 | 22 | нет | нет | нет | пилот; hp, active 31-36, пик 34 |
| walk_fwd | Walking 0-29 | 0,9667 | 30 | да | нет | нет | loop, дубль (FBX 30) отброшен; ноги клипа 0,29 м/с против 1,65 в игре (DECISIONS §6) |
| walk_back | Walking_Backwards 0-25 | 0,8333 | 26 | да | нет | нет | loop (шов 1,3 мм); backdash = этот клип (алиас, ниже) |
| dash | Fast_Run 5-11 | 0,2000 | 7 | нет | нет | нет | Fast_Run, опора левой 5-10 (AUDIT §5) |
| crouch_in | Standing_To_Crouched 2-19 | 0,5667 | 18 | нет | нет | нет | crouch_hold = последний кадр (19), отдельного клипа нет |
| jump_up | Jumping 8-16 | 0,2667 | 9 | нет | нет | нет | подгонять под prejump игры |
| jump_air | Jumping 17-32 | 0,5000 | 16 | нет | нет | Y, 1 | rootLock Y с якорем на первом кадре клипа (FBX 17): высоту ведёт симуляция |
| jump_land | Jumping 33-40 | 0,2333 | 8 | нет | нет | нет | затем blend в idle |
| hit_head | Head_Hit 0-24 | 0,8000 | 25 | нет | нет | нет | сжать под hitstun (DECISIONS §7) |
| hit_body | Hit_To_Body 0-28 | 0,9333 | 29 | нет | нет | нет | окно 0-28 это оценка (DECISIONS §7), уточнить оверлеем; не placeholder |
| knockdown | knockdown 0-93 | 3,1000 | 94 | нет | нет | X,Z, 1 | весь клип; кадр 93 = hold-кадр лёжа; растяжка 0-77 и hold это правило roster-этапа |
| getup | Getting_Up 0-54 | 1,8000 | 55 | нет | нет | нет | после knockdown нужен crossfade 6-8 тиков и перенос корня (AUDIT §4) |
| block_hold_18 | Center_Block 18-18 | 0,0333 | 1 (2 ключа) | нет | нет | нет | hold-поза: корпус назад 38 градусов; один кадр = два одинаковых ключа (t 0 и 1/30 с), см. DECISIONS §12 |
| block_hold_43 | Center_Block 43-43 | 0,0333 | 1 (2 ключа) | нет | нет | нет | hold-поза: корпус прямой; один кадр = два одинаковых ключа (t 0 и 1/30 с), см. DECISIONS §12 |
| victory | Victory 5-75 | 2,3333 | 71 | нет | нет | нет | hold около FBX 65 (локальный 60) |
| intro | Intro 10-95 | 2,8333 | 86 | нет | нет | X,Z, 1 | ось Y не трогаем |
| mma_kick | Mma_Kick 9-35 | 0,8667 | 27 | нет | нет | Z, 0,5 | markers: active 17-20, пик 18 (кадры FBX, DECISIONS §3) |
| punching_1 | Punching_1 5-22 | 0,5667 | 18 | нет | нет | нет | мастер-файл с мешем: Hips rest = меш, D = 0 (считается по файлу) |

`placeholder: true` в `terraks.json` стоит только у `idle_hold` (клип-заглушка, играет за `run` и `hitHigh` в roster.ts). Новых
клипов-заглушек в GLB нет. `hit_body` отмечен `estimate: true` (окно 0-28 это оценка, DECISIONS §7), это не заглушка.
Клипы базы `kick_high`, `punch_heavy` в GLB не попадают (заменены `martelo_2`, `cross_punch`). Файлы `*_Mirror`, `Knocked_Out`,
`Male_Crouch_Pose`, `Surprise_Uppercut` и `Center_Block` целиком в GLB не собираются.
Клипы пока не подключены к `roster.ts` (шаг 7), игра по-прежнему играет только пилотные.

## Алиасы и заглушки, клипа в GLB нет

| Роль в игре | Чем закрыта | Источник решения |
|---|---|---|
| backdash | `walk_back` (placeholder) | DECISIONS §6, §10 |
| crouch_hold | последний кадр `crouch_in` (FBX 19), clamp по stateFrame | DECISIONS §5 |
| присед-удары (cr.lp, cr.hp, cr.lk, cr.hk) | заглушка (idle или crouch_hold); эксперимент crouch_jab, резерв cr.lp = `punching_1` | DECISIONS §8, §10 |
| воздушные удары | заглушка | DECISIONS §10 |
| бросок | заглушка | DECISIONS §10 |
| снаряд (fireball, спец-приёмы) | заглушка | DECISIONS §10 |
| реакции в приседе и в воздухе | заглушка | DECISIONS §10 |
| блок сидя | заглушка crouch_hold; эксперимент block_crouch_hold (Hips и ноги из crouch_hold, корпус из блока) | DECISIONS §4, §8, §10 |
| ko (MVP) | `knockdown` + hold (кадр 93) | DECISIONS §7 |
| run | сейчас `idle_hold` (в roster.ts), будет `walk_fwd` | DECISIONS §6, KNOWN_ISSUES |
| hitHigh | сейчас `idle_hold` (в roster.ts), будет `hit_head` | DECISIONS §7, KNOWN_ISSUES |
| special (Surprise_Uppercut) | не в MVP | DECISIONS §3 |
