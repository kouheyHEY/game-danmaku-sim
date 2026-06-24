import { oddSpread, evenSpread, oneWay, type Pattern } from '../domain/pattern';

/** 自機武器のスペック。強化はこれを書き換え、buildWeapon で Pattern に変換する。 */
export interface WeaponSpec {
  kind: 'straight' | 'odd' | 'even';
  ways: number;
  spread: number;
  speed: number;
  radius: number;
  interval: number; // 連射間隔 [s]
  damage: number; // 1発の威力
}

const UP = -Math.PI / 2; // 上向き

export function buildWeapon(s: WeaponSpec): Pattern {
  const common = { speed: s.speed, radius: s.radius, interval: s.interval, baseAngle: UP };
  if (s.kind === 'odd') return oddSpread({ ...common, ways: s.ways, spread: s.spread });
  if (s.kind === 'even') return evenSpread({ ...common, ways: s.ways, spread: s.spread });
  return oneWay({ speed: s.speed, radius: s.radius, interval: s.interval, angle: UP });
}

export function describeWeapon(s: WeaponSpec): string {
  const label = s.kind === 'straight' ? '直線' : s.kind === 'odd' ? '奇数弾' : '偶数弾';
  const ways = s.kind === 'straight' ? 1 : s.ways;
  return `${label} x${ways} ・威力${s.damage} ・${(1 / s.interval).toFixed(0)}/s`;
}
