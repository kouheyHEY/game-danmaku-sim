import type { PlayerLoadout } from './loadout';
import type { Rng } from '../domain/rng';

export interface WeaponUpgrade {
  name: string;
  apply(l: PlayerLoadout): void;
  available?(l: PlayerLoadout): boolean;
}

const RADIUS_CAP = 10;

/**
 * ボス撃破時にランダムで1つ適用する弾幕強化（選択UIなし）。
 * 「弾数+2」一強にならないよう、カバー（当たり幅）を増やす強化を複数用意する。
 * 特に「弾を大きく」は直線単発のままでも効くので、拡散を引けなくても快適になる。
 */
export const WEAPON_UPGRADES: WeaponUpgrade[] = [
  // 弾数を増やして横に広げる（1本ずつ。直線→2→3→…と奇偶を切り替え）
  {
    name: '弾数+1',
    apply(l) {
      const cur = l.weapon.kind === 'straight' ? 1 : l.weapon.ways;
      const next = cur + 1;
      l.weapon.ways = next;
      l.weapon.kind = next % 2 === 0 ? 'even' : 'odd';
    },
  },
  // 弾を大きく＝当たり幅UP。単発のままでも off-center の雑魚を捉えられる（拡散と同等の快適さ）
  { name: '弾を大きく', apply: (l) => void (l.weapon.radius = Math.min(RADIUS_CAP, l.weapon.radius + 2)), available: (l) => l.weapon.radius < RADIUS_CAP },
  { name: '連射UP', apply: (l) => void (l.weapon.interval = Math.max(0.04, l.weapon.interval * 0.85)), available: (l) => l.weapon.interval > 0.05 },
  { name: '弾速UP', apply: (l) => void (l.weapon.speed += 100), available: (l) => l.weapon.speed < 1200 },
  // 強撃：ボス削りの威力＋わずかに当たり幅。雑魚1確でも「死に強化」にならない
  {
    name: '強撃',
    apply(l) {
      l.weapon.damage += 1;
      l.weapon.radius = Math.min(RADIUS_CAP, l.weapon.radius + 1);
    },
  },
  // 拡散角は多方向のときだけ意味がある
  { name: '拡散UP', apply: (l) => void (l.weapon.spread = Math.min(0.5, l.weapon.spread + 0.06)), available: (l) => l.weapon.kind !== 'straight' && l.weapon.spread < 0.5 },
];

/** ロードアウトを1段階ランダム強化し、その名前を返す。 */
export function randomWeaponUpgrade(rng: Rng, loadout: PlayerLoadout): string {
  const pool = WEAPON_UPGRADES.filter((u) => !u.available || u.available(loadout));
  const u = pool[Math.floor(rng.next() * pool.length)];
  u.apply(loadout);
  return u.name;
}
