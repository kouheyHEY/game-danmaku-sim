import type { PlayerLoadout } from './loadout';
import type { Rng } from '../domain/rng';

export interface WeaponUpgrade {
  name: string;
  apply(l: PlayerLoadout): void;
  available?(l: PlayerLoadout): boolean;
}

export interface SpecialUpgrade extends WeaponUpgrade {
  description: string;
}

const RADIUS_CAP = 10;

/**
 * ボス撃破時にランダムで1つ適用する弾幕強化（選択UIなし）。
 * 「弾数+2」一強にならないよう、カバー（当たり幅）を増やす強化を複数用意する。
 * 特に「弾を大きく」は直線単発のままでも効くので、拡散を引けなくても快適になる。
 */
export const WEAPON_UPGRADES: WeaponUpgrade[] = [
  // 弾数を増やして横に広げる（奇数維持＝常に中央弾あり。直線→3、以降+2）
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

/** 3体ごとの強敵ボスだけが落とす、通常より大きくビルドを変える強化。 */
export const SPECIAL_UPGRADES: SpecialUpgrade[] = [
  {
    name: 'ワイドバースト',
    description: '弾数+4・拡散角UP',
    apply(l) {
      if (l.weapon.kind === 'straight') {
        l.weapon.kind = 'odd';
        l.weapon.ways = 5;
      } else {
        l.weapon.ways += 4;
      }
      l.weapon.spread = Math.min(0.5, l.weapon.spread + 0.08);
    },
  },
  {
    name: 'オーバードライブ',
    description: '連射速度を大幅UP・弾速UP',
    apply(l) {
      l.weapon.interval = Math.max(0.03, l.weapon.interval * 0.68);
      l.weapon.speed += 180;
    },
  },
  {
    name: 'ヘビーバレット',
    description: '弾を大きく・威力+2',
    apply(l) {
      l.weapon.radius = Math.min(14, l.weapon.radius + 4);
      l.weapon.damage += 2;
    },
  },
  {
    name: 'ライフコア',
    description: '最大HP+2・HPを2回復',
    apply(l) {
      l.maxHp += 2;
      l.hp = Math.min(l.maxHp, l.hp + 2);
    },
    available: (l) => l.maxHp < 15,
  },
];

/** ロードアウトを1段階ランダム強化し、その名前を返す。 */
export function randomWeaponUpgrade(rng: Rng, loadout: PlayerLoadout): string {
  const pool = WEAPON_UPGRADES.filter((u) => !u.available || u.available(loadout));
  const u = pool[Math.floor(rng.next() * pool.length)];
  u.apply(loadout);
  return u.name;
}

/** 強敵ボス報酬。利用可能な候補から重複なしで2つ引く。 */
export function drawSpecialUpgrades(rng: Rng, loadout: PlayerLoadout): SpecialUpgrade[] {
  const pool = SPECIAL_UPGRADES.filter((u) => !u.available || u.available(loadout));
  const choices: SpecialUpgrade[] = [];
  while (choices.length < 2 && pool.length > 0) {
    const index = Math.floor(rng.next() * pool.length);
    choices.push(pool.splice(index, 1)[0]);
  }
  return choices;
}
