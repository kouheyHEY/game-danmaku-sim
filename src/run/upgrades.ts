import type { PlayerLoadout } from './loadout';
import type { Rng } from '../domain/rng';

export interface WeaponUpgrade {
  name: string;
  apply(l: PlayerLoadout): void;
  available?(l: PlayerLoadout): boolean;
}

/** ボス撃破時にランダムで1つ適用する弾幕強化（選択UIなし）。 */
export const WEAPON_UPGRADES: WeaponUpgrade[] = [
  {
    name: '弾数+2',
    apply(l) {
      if (l.weapon.kind === 'straight') {
        l.weapon.kind = 'odd';
        l.weapon.ways = 3;
      } else {
        l.weapon.ways += 2;
      }
    },
  },
  { name: '連射UP', apply: (l) => void (l.weapon.interval = Math.max(0.03, l.weapon.interval * 0.85)) },
  { name: '威力UP', apply: (l) => void (l.weapon.damage += 1) },
  { name: '弾速UP', apply: (l) => void (l.weapon.speed += 90) },
  // 拡散は多方向のときだけ意味がある
  { name: '拡散UP', apply: (l) => void (l.weapon.spread += 0.05), available: (l) => l.weapon.kind !== 'straight' },
];

/** ロードアウトを1段階ランダム強化し、その名前を返す。 */
export function randomWeaponUpgrade(rng: Rng, loadout: PlayerLoadout): string {
  const pool = WEAPON_UPGRADES.filter((u) => !u.available || u.available(loadout));
  const u = pool[Math.floor(rng.next() * pool.length)];
  u.apply(loadout);
  return u.name;
}
