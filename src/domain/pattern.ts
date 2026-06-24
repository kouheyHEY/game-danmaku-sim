import type { Vec2 } from './math';
import type { Rng } from './rng';

export interface BulletSpawn {
  pos: Vec2;
  vel: Vec2;
  radius: number;
}

/**
 * 弾幕パターン＝「時間とソース位置から弾を生む」純粋関数。
 * AI も見た目も持たない。emit は窓 [t, t+dt) に発生する弾だけを返すため、
 * 内部状態を持たず決定論的（ランダム弾はシード付き rng のみ使用）。
 */
export interface Pattern {
  emit(t: number, dt: number, source: Vec2, rng: Rng): BulletSpawn[];
}

/** 窓 [t, t+dt) に入る発射タイミング k を列挙する。 */
function* fireTimes(t: number, dt: number, interval: number): Generator<number> {
  for (let k = Math.ceil(t / interval - 1e-9); k * interval < t + dt; k++) {
    if (k * interval >= t) yield k;
  }
}

export interface FanParams {
  ways: number; // 一度に撒く弾数
  spread: number; // 隣り合う弾の角度差 [rad]
  speed: number; // px/s
  radius: number;
  interval: number; // 発射間隔 [s]
  baseAngle?: number; // 中心方向 [rad]。既定は下向き(+π/2)
  rotStep?: number; // 発射ごとの回転量 [rad]（回転弾幕）
  jitter?: number; // 角度のランダム揺らぎ [rad]（ランダム弾）
}

/**
 * 全弾幕の共通コア。ways の偶奇・rotStep・jitter の組合せで
 * 奇数弾 / 偶数弾 / 回転弾幕 / ランダム弾 をすべて表現する。
 */
export function fan(p: FanParams): Pattern {
  const base = p.baseAngle ?? Math.PI / 2;
  const rot = p.rotStep ?? 0;
  const jit = p.jitter ?? 0;
  return {
    emit(t, dt, source, rng) {
      const spawns: BulletSpawn[] = [];
      for (const k of fireTimes(t, dt, p.interval)) {
        const center = base + k * rot;
        for (let i = 0; i < p.ways; i++) {
          const off = (i - (p.ways - 1) / 2) * p.spread;
          const noise = jit ? (rng.next() - 0.5) * 2 * jit : 0;
          const a = center + off + noise;
          spawns.push({
            pos: { x: source.x, y: source.y },
            vel: { x: Math.cos(a) * p.speed, y: Math.sin(a) * p.speed },
            radius: p.radius,
          });
        }
      }
      return spawns;
    },
  };
}

export interface SpreadParams {
  ways: number;
  spread: number;
  speed: number;
  radius: number;
  interval: number;
  baseAngle?: number;
}

/** 奇数弾：中心に1発を含む左右対称ばらまき（正面を撃つ）。 */
export function oddSpread(p: SpreadParams): Pattern {
  return fan({ ...p, ways: p.ways % 2 === 0 ? p.ways + 1 : p.ways });
}

/** 偶数弾：中心を空ける左右対称ばらまき（正面に隙間ができる）。 */
export function evenSpread(p: SpreadParams): Pattern {
  return fan({ ...p, ways: p.ways % 2 === 1 ? p.ways + 1 : p.ways });
}

/** 回転弾幕：撃つたびに少しずつ回す。 */
export function rotating(p: SpreadParams & { rotStep: number }): Pattern {
  return fan(p);
}

/** ランダム弾：角度にランダムな揺らぎを乗せる。 */
export function randomSpread(p: SpreadParams & { jitter: number }): Pattern {
  return fan(p);
}

export interface OneWayParams {
  speed: number;
  radius: number;
  interval: number; // 発射間隔 [s]
  angle?: number; // 方向 [rad]。既定は下向き(+π/2)
}

/** 通常の一方向発射。決まった向きへ等間隔に撃つだけ（②③の敵・自機の直線ショット）。 */
export function oneWay(p: OneWayParams): Pattern {
  const angle = p.angle ?? Math.PI / 2;
  const vx = Math.cos(angle) * p.speed;
  const vy = Math.sin(angle) * p.speed;
  return {
    emit(t, dt, source) {
      const spawns: BulletSpawn[] = [];
      for (const k of fireTimes(t, dt, p.interval)) {
        void k;
        spawns.push({ pos: { x: source.x, y: source.y }, vel: { x: vx, y: vy }, radius: p.radius });
      }
      return spawns;
    },
  };
}
