import type { Pattern } from '../domain/pattern';
import type { Enemy } from '../domain/entities';
import type { Rect } from '../domain/math';

/**
 * 全幅にランダムに降る雨。level が上がるほど 濃く・速く なる。
 * source は無視し、横位置を場の全幅からランダムに取る（画面全体をカバー）。
 */
export function ambientRain(level: number, width: number): Pattern {
  const ways = Math.min(3 + level, 11); // 1発ごとの本数
  const speed = 120 + level * 12;
  const interval = Math.max(0.1, 0.42 - level * 0.03);
  const jitter = 0.28; // 下向きからの角度ゆらぎ
  return {
    emit(t, dt, _source, rng) {
      const spawns = [];
      for (let k = Math.ceil(t / interval - 1e-9); k * interval < t + dt; k++) {
        if (k * interval < t) continue;
        for (let i = 0; i < ways; i++) {
          const x = rng.next() * width;
          const a = Math.PI / 2 + (rng.next() - 0.5) * 2 * jitter;
          spawns.push({ pos: { x, y: 0 }, vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed }, radius: 5 });
        }
      }
      return spawns;
    },
  };
}

/** たまに出る動く標的（ボス）。level で HP と速さが上がる。 */
export function makeBoss(id: number, level: number, bounds: Rect): Enemy {
  const hp = 45 + level * 40;
  return {
    id,
    pos: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.16 },
    vel: { x: 75 + level * 8, y: 0 },
    hitRadius: 22,
    hp,
    maxHp: hp,
  };
}
