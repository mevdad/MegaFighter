/**
 * Разовая проверка: не даёт ли линейная интерполяция Euler-углов между ключевыми
 * кадрами хай-кика резких «скачков» конечности на середине отрезка. Мокап-позы
 * получены через setFromUnitVectors и могут раскладываться на оси иначе, чем
 * рисованные вручную позы — стоит перепроверить прежде, чем доверять клипу в бою.
 */
import { samplePoseClip } from '../game/poses';
import { ROUNDHOUSE } from '../game/attackClips';

function maxDelta(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

let prev: Record<string, [number, number, number]> | null = null;
let worst = 0;
for (let i = 0; i <= 120; i += 1) {
  const t = i / 120;
  const pose = samplePoseClip(ROUNDHOUSE, t) as unknown as Record<string, [number, number, number]>;
  if (prev) {
    for (const key of Object.keys(pose)) {
      if (key === 'offset') continue;
      const d = maxDelta(pose[key], prev[key] ?? [0, 0, 0]);
      worst = Math.max(worst, d);
      // За 1/120 секунды честная анимация не должна двигать кость больше чем на ~0.35 рад —
      // это уже ~20°/кадр при 60 Гц, заметный дёрг.
      if (d > 0.35) {
        console.log(`t=${t.toFixed(3)} bone=${key} скачок=${d.toFixed(3)} рад — подозрительно`);
      }
    }
  }
  prev = pose;
}
console.log(`готово: 120 кадров проверено, максимальный скачок между соседними = ${worst.toFixed(3)} рад`);
