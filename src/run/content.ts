import { fan, oddSpread, evenSpread, rotating, randomSpread, oneWay, type Pattern } from '../domain/pattern';
import type { Enemy } from '../domain/entities';
import type { Rect } from '../domain/math';
import type { Rng } from '../domain/rng';

const DOWN = Math.PI / 2;

/** 雑魚の弾パターン集（下向き中心）。level で少し強くなる。ランダムに1つ選ぶ。 */
const MOB_PATTERNS: Array<(level: number) => Pattern> = [
  // まっすぐ連射
  (l) => oneWay({ speed: 150 + l * 6, radius: 5, interval: Math.max(0.4, 0.85 - l * 0.03), angle: DOWN }),
  // 3-way 扇（奇数弾）
  (l) => oddSpread({ ways: 3, spread: 0.26, speed: 130 + l * 6, radius: 5, interval: Math.max(0.6, 1.0 - l * 0.03), baseAngle: DOWN }),
  // 偶数弾（正面に隙間）
  (l) => evenSpread({ ways: 4, spread: 0.22, speed: 130 + l * 6, radius: 5, interval: Math.max(0.6, 1.0 - l * 0.03), baseAngle: DOWN }),
  // ランダム散弾
  (l) => randomSpread({ ways: 3 + Math.min(2, Math.floor(l / 3)), spread: 0.2, jitter: 0.5, speed: 140 + l * 6, radius: 5, interval: Math.max(0.45, 0.85 - l * 0.03), baseAngle: DOWN }),
  // 小さな回転
  (l) => rotating({ ways: 2, spread: 0.55, rotStep: 0.6, speed: 120 + l * 6, radius: 5, interval: Math.max(0.32, 0.6 - l * 0.02), baseAngle: DOWN }),
];

function pickMobPattern(level: number, rng: Rng): Pattern {
  return MOB_PATTERNS[Math.floor(rng.next() * MOB_PATTERNS.length)](level);
}

/** 上から降下しながら撃つ雑魚。HP1＝一撃で倒せる。弾は複数パターンからランダム。 */
export function makeMob(id: number, x: number, level: number, bounds: Rect, rng: Rng): Enemy {
  return {
    id,
    pos: { x, y: bounds.y + 14 },
    vel: { x: 0, y: 60 + level * 4 },
    hitRadius: 12,
    hp: 1,
    maxHp: 1,
    pattern: pickMobPattern(level, rng),
  };
}

/** 雑魚の湧き間隔。level で短くなる。 */
export function mobInterval(level: number): number {
  return Math.max(0.5, 1.6 - level * 0.14);
}

/** ボスの弾幕集。回転・逆回転・全方位リング・ばらまき。ランダムに1つ。 */
const BOSS_PATTERNS: Array<(level: number) => Pattern> = [
  (l) => rotating({ ways: 8 + Math.min(6, l), spread: 0.3, rotStep: 0.25, speed: 125 + l * 6, radius: 6, interval: 0.14 }),
  (l) => rotating({ ways: 4, spread: 0.9, rotStep: -0.36, speed: 120 + l * 6, radius: 6, interval: 0.1 }), // 逆回転の腕
  (l) => {
    const ways = 14 + Math.min(8, l);
    return fan({ ways, spread: (Math.PI * 2) / ways, speed: 105 + l * 5, radius: 6, interval: 0.5 }); // 全方位リング
  },
  (l) => randomSpread({ ways: 8 + l, spread: 0.3, jitter: 0.6, speed: 130 + l * 5, radius: 6, interval: 0.12, baseAngle: DOWN }), // 下向きばらまき
];

function pickBossPattern(level: number, rng: Rng): Pattern {
  return BOSS_PATTERNS[Math.floor(rng.next() * BOSS_PATTERNS.length)](level);
}

/** たまに出る動く標的（ボス）。横に往復しつつ弾幕を撒く。 */
export function makeBoss(id: number, level: number, bounds: Rect, rng: Rng): Enemy {
  const hp = 60 + level * 45;
  return {
    id,
    pos: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h * 0.16 },
    vel: { x: 70 + level * 8, y: 0 },
    hitRadius: 22,
    hp,
    maxHp: hp,
    pattern: pickBossPattern(level, rng),
  };
}
