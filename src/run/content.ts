import { fan, rotating, type Pattern } from '../domain/pattern';
import type { Enemy } from '../domain/entities';
import type { Rect } from '../domain/math';

/** 雑魚：下向きの小さな扇。level で本数・弾速が増える。 */
function mobPattern(level: number): Pattern {
  const ways = 2 + Math.min(3, Math.floor(level / 2));
  return fan({
    ways,
    spread: 0.22,
    speed: 120 + level * 6,
    radius: 5,
    interval: Math.max(0.5, 1.0 - level * 0.04),
    baseAngle: Math.PI / 2,
    jitter: 0.06,
  });
}

/** 上から降下しながら撃つ雑魚。撃つと倒せる。 */
export function makeMob(id: number, x: number, level: number, bounds: Rect): Enemy {
  const hp = 4 + Math.floor(level / 2);
  return {
    id,
    pos: { x, y: bounds.y + 14 },
    vel: { x: 0, y: 60 + level * 4 }, // 降下
    hitRadius: 12,
    hp,
    maxHp: hp,
    pattern: mobPattern(level),
  };
}

/** 雑魚の湧き間隔。level で短くなる。 */
export function mobInterval(level: number): number {
  return Math.max(0.5, 1.6 - level * 0.14);
}

/** ボス：回転弾幕を撃つ。level で濃く硬くなる。 */
function bossPattern(level: number): Pattern {
  return rotating({
    ways: 8 + Math.min(6, level),
    spread: 0.3,
    rotStep: 0.25,
    speed: 125 + level * 6,
    radius: 6,
    interval: 0.14,
  });
}

/** たまに出る動く標的（ボス）。横に往復しつつ弾幕を撒く。 */
export function makeBoss(id: number, level: number, bounds: Rect): Enemy {
  const hp = 60 + level * 45;
  return {
    id,
    pos: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.16 },
    vel: { x: 70 + level * 8, y: 0 },
    hitRadius: 22,
    hp,
    maxHp: hp,
    pattern: bossPattern(level),
  };
}
