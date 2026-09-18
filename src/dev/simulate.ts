/**
 * Офлайн-харнесс для баланса: гоняет матчи «ИИ против ИИ» без браузера и графики.
 * Запуск: npm run sim -- [матчей] [сложность]
 * Помогает ловить то, что глазами не видно: зависшие раунды, перекос ростера,
 * приёмы, которые вообще ни разу не срабатывают.
 */
import { Match } from '../game/match';
import { AiController, type Difficulty } from '../game/ai';
import { ROSTER } from '../characters/roster';
import { FPS } from '../game/constants';
import type { InputState } from '../game/types';

interface Row {
  wins: number;
  matches: number;
  /** Урон, нанесённый этим бойцом. */
  dealt: number;
  /** Урон, полученный этим бойцом. */
  taken: number;
  hitsLanded: number;
  hitsTaken: number;
  blocks: number;
}

function runMatch(aIndex: number, bIndex: number, difficulty: Difficulty, seed: number) {
  const match = new Match(ROSTER[aIndex], ROSTER[bIndex]);
  const ai: [AiController, AiController] = [
    new AiController(difficulty, seed),
    new AiController(difficulty, seed + 991),
  ];
  const stats = {
    frames: 0,
    hits: 0,
    damage: 0,
    specials: 0,
    timeouts: 0,
    /** По индексу бойца: нанесённый урон, число попаданий и заблокированных атак. */
    dealt: [0, 0] as [number, number],
    landed: [0, 0] as [number, number],
    blocked: [0, 0] as [number, number],
  };

  // Потолок в 6 минут: если матч не закончился, значит логика где-то зациклилась.
  const limit = FPS * 360;
  while (match.phase !== 'matchEnd' && stats.frames < limit) {
    const [f0, f1] = match.fighters;
    const fighting = match.phase === 'fight';
    const inputs: [InputState, InputState] = [ai[0].poll(f0, f1, fighting), ai[1].poll(f1, f0, fighting)];
    match.step(inputs);
    for (const e of match.drainEvents()) {
      if (e.type === 'hit') {
        stats.hits += 1;
        stats.damage += e.damage;
        stats.dealt[1 - e.victim] += e.damage;
        stats.landed[1 - e.victim] += 1;
        if (e.power === 'special' || e.power === 'super') stats.specials += 1;
      }
      if (e.type === 'block') stats.blocked[e.victim] += 1;
      if (e.type === 'announce' && e.text === 'ВРЕМЯ') stats.timeouts += 1;
    }
    stats.frames += 1;
  }
  return { match, stats, finished: match.phase === 'matchEnd' };
}

const repeats = Number(process.argv[2] ?? 2);
const difficulty = (process.argv[3] as Difficulty) ?? 'normal';

const table = new Map<string, Row>();
for (const c of ROSTER) {
  table.set(c.id, { wins: 0, matches: 0, dealt: 0, taken: 0, hitsLanded: 0, hitsTaken: 0, blocks: 0 });
}

let unfinished = 0;
let totalFrames = 0;
let totalHits = 0;
let totalSpecials = 0;
let timeouts = 0;
let count = 0;

// Круговой турнир: каждая пара играет с обеих сторон, чтобы сторона экрана не влияла на итог.
for (let r = 0; r < repeats; r += 1) {
  for (let a = 0; a < ROSTER.length; a += 1) {
    for (let b = 0; b < ROSTER.length; b += 1) {
      if (a === b) continue;
      const { match, stats, finished } = runMatch(a, b, difficulty, 1000 + count * 7 + r * 131);
      count += 1;
      if (!finished) unfinished += 1;
      totalFrames += stats.frames;
      totalHits += stats.hits;
      totalSpecials += stats.specials;
      timeouts += stats.timeouts;

      const rowA = table.get(ROSTER[a].id)!;
      const rowB = table.get(ROSTER[b].id)!;
      rowA.matches += 1;
      rowB.matches += 1;
      rowA.dealt += stats.dealt[0];
      rowA.taken += stats.dealt[1];
      rowA.hitsLanded += stats.landed[0];
      rowA.hitsTaken += stats.landed[1];
      rowA.blocks += stats.blocked[0];
      rowB.dealt += stats.dealt[1];
      rowB.taken += stats.dealt[0];
      rowB.hitsLanded += stats.landed[1];
      rowB.hitsTaken += stats.landed[0];
      rowB.blocks += stats.blocked[1];
      if (match.matchWinner === 0) rowA.wins += 1;
      if (match.matchWinner === 1) rowB.wins += 1;
    }
  }
}

console.log(`Матчей: ${count}, сложность: ${difficulty}`);
console.log(`Не завершились: ${unfinished}`);
console.log(`Средняя длина матча: ${(totalFrames / count / FPS).toFixed(1)} c`);
console.log(`Попаданий за матч: ${(totalHits / count).toFixed(1)} (из них спешлов: ${(totalSpecials / count).toFixed(1)})`);
console.log(`Раундов по таймеру: ${timeouts}`);
console.log('');
console.log('Боец         побед  нанёс  получил  попал  пропустил  блоков');
for (const c of ROSTER) {
  const row = table.get(c.id)!;
  const rate = row.matches ? Math.round((row.wins / row.matches) * 100) : 0;
  const per = (v: number) => (row.matches ? (v / row.matches).toFixed(0) : '0');
  console.log(
    `${c.name.padEnd(12)} ${String(rate).padStart(4)}%  ${per(row.dealt).padStart(5)}  ${per(row.taken).padStart(7)}  ` +
      `${per(row.hitsLanded).padStart(5)}  ${per(row.hitsTaken).padStart(9)}  ${per(row.blocks).padStart(6)}`,
  );
}
