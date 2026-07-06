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
  // aim（自機位置）を渡すと、狙い撃ち系パターンがそちらを向く。他は無視。
  emit(t: number, dt: number, source: Vec2, rng: Rng, aim?: Vec2): BulletSpawn[];
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

export interface AimedParams {
  speed: number;
  radius: number;
  interval: number; // 次のトリガー(発射のまとまり)までの間隔 [s]
  ways?: number; // 同時に撃つ扇の本数（既定1）
  spread?: number; // 扇の角度差 [rad]（既定0）
  speedStep?: number; // ways 間の速度差（同時多段の"段"）
  burst?: number; // 1トリガーで連射する回数（既定1）→ 三連弾など
  burstGap?: number; // 連射の間隔 [s]（既定0.08）
  jitter?: number; // 狙いのゆらぎ [rad]
}

/**
 * 自機(aim)を狙って撃つ。aim が無ければ下向き。
 * ways=同時の扇、burst=連射回数、speedStep=同方向に速度差の弾列（同時多段）。
 * これ1つで 単発/連続/三連弾/同時多段/遅い弾/でかい弾 を表現する。
 */
export function aimed(p: AimedParams): Pattern {
  const ways = p.ways ?? 1;
  const spread = p.spread ?? 0;
  const burst = p.burst ?? 1;
  const burstGap = p.burstGap ?? 0.08;
  const speedStep = p.speedStep ?? 0;
  return {
    emit(t, dt, source, rng, aim) {
      const spawns: BulletSpawn[] = [];
      const base = aim ? Math.atan2(aim.y - source.y, aim.x - source.x) : Math.PI / 2;
      const from = Math.max(0, Math.floor((t - burst * burstGap) / p.interval) - 1);
      const to = Math.floor((t + dt) / p.interval) + 1;
      for (let k = from; k <= to; k++) {
        for (let b = 0; b < burst; b++) {
          const shotT = k * p.interval + b * burstGap;
          if (shotT < t || shotT >= t + dt) continue;
          const jit = p.jitter ? (rng.next() - 0.5) * 2 * p.jitter : 0;
          for (let i = 0; i < ways; i++) {
            const a = base + (i - (ways - 1) / 2) * spread + jit;
            const sp = p.speed + i * speedStep;
            spawns.push({ pos: { x: source.x, y: source.y }, vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp }, radius: p.radius });
          }
        }
      }
      return spawns;
    },
  };
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
