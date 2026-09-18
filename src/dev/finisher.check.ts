/** Проверка окна добивания без браузера: запуск `npm run check:finisher`. */
import { Match } from '../game/match';
import { ROSTER } from '../characters/roster';
import { EMPTY_INPUT, type InputState } from '../game/types';

const idle: InputState = { ...EMPTY_INPUT };
const finisherInput: InputState = { ...EMPTY_INPUT, down: true, hp: true };

function run(perform: boolean): { reachedFinish: boolean; finisher: string | null; ended: boolean } {
  const match = new Match(ROSTER[0], ROSTER[7]);
  // Ставим матчбол: победа в этом раунде заканчивает бой.
  match.wins = [1, 0];
  let reachedFinish = false;
  let finisher: string | null = null;
  let toggle = false;
  let koForced = false;

  for (let frame = 0; frame < 60 * 60; frame += 1) {
    // Доводим раунд до нокаута напрямую: нас интересует не бой, а то, что за ним следует.
    if (match.phase === 'fight' && !koForced) {
      match.fighters[1].health = 0;
      koForced = true;
    }

    let inputs: [InputState, InputState] = [idle, idle];
    if (match.phase === 'finish') {
      reachedFinish = true;
      // Кнопку надо именно нажать, а не держать: чередуем кадры.
      if (perform) {
        inputs = [toggle ? { ...EMPTY_INPUT, down: true } : finisherInput, idle];
        toggle = !toggle;
      }
    }

    match.step(inputs);
    for (const e of match.drainEvents()) {
      if (e.type === 'finisher') finisher = e.name;
    }
    if (match.phase === 'matchEnd') return { reachedFinish, finisher, ended: true };
  }
  return { reachedFinish, finisher, ended: false };
}

const withFinisher = run(true);
const without = run(false);

console.log('с добиванием :', JSON.stringify(withFinisher));
console.log('без добивания:', JSON.stringify(without));

const ok =
  withFinisher.reachedFinish &&
  withFinisher.finisher !== null &&
  withFinisher.ended &&
  without.reachedFinish &&
  without.finisher === null &&
  without.ended;
console.log(ok ? '✓ окно добивания работает и не блокирует конец матча' : '✗ проверка не прошла');
if (!ok) process.exitCode = 1;
