import { oddSpread, evenSpread, rotating, randomSpread, type Pattern } from '../domain/pattern';

export interface EnemySpec {
  name: string;
  hp: number;
  hitRadius: number;
  speed: number; // 横移動の速さ（壁で反射して往復）
  pattern: Pattern; // 敵弾
}

/**
 * 段階的に強くなる固定列（まずは手堅く）。
 * 弾幕の種類（奇数/偶数/回転/ランダム）を順に見せる構成。
 * 生成関数を差し替えればランダム/半固定にもできる。
 */
export function enemyQueue(): EnemySpec[] {
  return [
    { name: '斥候', hp: 40, hitRadius: 16, speed: 70, pattern: oddSpread({ ways: 3, spread: 0.35, speed: 120, radius: 5, interval: 0.5 }) },
    { name: '散弾兵', hp: 70, hitRadius: 16, speed: 105, pattern: evenSpread({ ways: 4, spread: 0.26, speed: 130, radius: 5, interval: 0.45 }) },
    { name: '回転砲台', hp: 110, hitRadius: 18, speed: 80, pattern: rotating({ ways: 6, spread: 0.5, rotStep: 0.35, speed: 120, radius: 5, interval: 0.18 }) },
    { name: '乱射手', hp: 150, hitRadius: 18, speed: 130, pattern: randomSpread({ ways: 7, spread: 0.25, jitter: 0.5, speed: 140, radius: 5, interval: 0.16 }) },
    { name: '親玉', hp: 230, hitRadius: 22, speed: 95, pattern: rotating({ ways: 10, spread: 0.32, rotStep: 0.2, speed: 130, radius: 6, interval: 0.14 }) },
  ];
}
