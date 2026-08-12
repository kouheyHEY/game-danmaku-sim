import { INITIAL_WEAPON, type PlayerLoadout, type SpecialUpgradeKey } from './loadout';
import type { Rng } from '../domain/rng';

export interface WeaponUpgrade {
  name: string;
  apply(l: PlayerLoadout): void;
  available?(l: PlayerLoadout): boolean;
}

export interface SpecialUpgrade extends WeaponUpgrade {
  key: SpecialUpgradeKey;
  description: string;
  maxLevel?: number;
  reset?: boolean;
}

const RADIUS_CAP = 10;
const SPREAD_FLOOR = 0.05;
export const LIFE_CORE_HEAL = 2;
export const SPECIAL_UPGRADE_MAX_LEVELS = { focus: 4, overdrive: 4, heavy: 3 } as const;

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
  // 弾数が増えたときも射線が画面外へ散りすぎないよう、角度強化は収束方向だけにする
  { name: '収束UP', apply: (l) => void (l.weapon.spread = Math.max(SPREAD_FLOOR, l.weapon.spread - 0.03)), available: (l) => l.weapon.kind !== 'straight' && l.weapon.spread > SPREAD_FLOOR },
];

/** 大ボスが落とす、通常強化より大きくビルドを変える強化。 */
export const SPECIAL_UPGRADES: SpecialUpgrade[] = [
  {
    key: 'focus',
    name: 'フォーカスバースト',
    description: '弾数+2・拡散角を絞る',
    maxLevel: SPECIAL_UPGRADE_MAX_LEVELS.focus,
    apply(l) {
      if (l.weapon.kind === 'straight') {
        l.weapon.kind = 'odd';
        l.weapon.ways = 3;
      } else {
        l.weapon.ways += 2;
      }
      l.weapon.spread = Math.max(SPREAD_FLOOR, l.weapon.spread - 0.05);
      l.upgradeLevels.focus += 1;
    },
  },
  {
    key: 'overdrive',
    name: 'オーバードライブ',
    description: '連射速度UP・弾速UP',
    maxLevel: SPECIAL_UPGRADE_MAX_LEVELS.overdrive,
    apply(l) {
      l.weapon.interval = Math.max(0.03, l.weapon.interval * 0.78);
      l.weapon.speed += 120;
      l.upgradeLevels.overdrive += 1;
    },
  },
  {
    key: 'heavy',
    name: 'ヘビーバレット',
    description: '弾を大きく・威力+2',
    maxLevel: SPECIAL_UPGRADE_MAX_LEVELS.heavy,
    apply(l) {
      l.weapon.radius = Math.min(14, l.weapon.radius + 4);
      l.weapon.damage += 2;
      l.upgradeLevels.heavy += 1;
    },
  },
  {
    key: 'life',
    name: 'ライフコア',
    description: `最大HP+2・追加でHP+${LIFE_CORE_HEAL}回復`,
    apply(l) {
      l.maxHp += 2;
      l.hp = Math.min(l.maxHp, l.hp + LIFE_CORE_HEAL);
      l.upgradeLevels.life += 1;
    },
  },
];

function resetUpgrade(key: Exclude<SpecialUpgradeKey, 'life'>): SpecialUpgrade {
  if (key === 'focus') return {
    key,
    name: 'フォーカス凝縮',
    description: '弾数と拡散を初期化し、弾数倍率を威力へ変換',
    reset: true,
    apply(l) {
      const ways = l.weapon.kind === 'straight' ? 1 : l.weapon.ways;
      l.weapon.damage *= Math.max(1, ways);
      l.weapon.kind = INITIAL_WEAPON.kind;
      l.weapon.ways = INITIAL_WEAPON.ways;
      l.weapon.spread = INITIAL_WEAPON.spread;
      l.upgradeLevels.focus = 0;
    },
  };
  if (key === 'overdrive') return {
    key,
    name: 'オーバードライブ凝縮',
    description: '弾速と連射を初期化し、強化倍率を威力へ変換',
    reset: true,
    apply(l) {
      const speedRatio = l.weapon.speed / INITIAL_WEAPON.speed;
      const fireRateRatio = INITIAL_WEAPON.interval / l.weapon.interval;
      l.weapon.damage *= Math.max(1, speedRatio * fireRateRatio);
      l.weapon.speed = INITIAL_WEAPON.speed;
      l.weapon.interval = INITIAL_WEAPON.interval;
      l.upgradeLevels.overdrive = 0;
    },
  };
  return {
    key,
    name: 'ヘビーバレット凝縮',
    description: '弾サイズを初期化し、サイズ倍率を威力へ変換',
    reset: true,
    apply(l) {
      l.weapon.damage *= Math.max(1, l.weapon.radius / INITIAL_WEAPON.radius);
      l.weapon.radius = INITIAL_WEAPON.radius;
      l.upgradeLevels.heavy = 0;
    },
  };
}

function rewardChoice(upgrade: SpecialUpgrade, loadout: PlayerLoadout): SpecialUpgrade {
  const current = loadout.upgradeLevels[upgrade.key];
  if (upgrade.maxLevel !== undefined && current >= upgrade.maxLevel) {
    const reset = resetUpgrade(upgrade.key as Exclude<SpecialUpgradeKey, 'life'>);
    return { ...reset, name: `${reset.name} Lv.MAX→0` };
  }
  const next = current + 1;
  const cap = upgrade.maxLevel === undefined ? '' : `/${upgrade.maxLevel}`;
  return {
    ...upgrade,
    name: `${upgrade.name} Lv.${next}${cap}`,
    description: `${upgrade.description}（現在Lv.${current}）`,
  };
}

/** ロードアウトを1段階ランダム強化し、その名前を返す。 */
export function randomWeaponUpgrade(rng: Rng, loadout: PlayerLoadout): string {
  const pool = WEAPON_UPGRADES.filter((u) => !u.available || u.available(loadout));
  const u = pool[Math.floor(rng.next() * pool.length)];
  u.apply(loadout);
  return u.name;
}

/** 現在レベルに応じ、通常強化または上限到達後の凝縮を返す。 */
export function availableSpecialRewards(loadout: PlayerLoadout): SpecialUpgrade[] {
  return SPECIAL_UPGRADES.map((upgrade) => rewardChoice(upgrade, loadout));
}

/** 大ボス報酬。利用可能な候補から重複なしで2つ引く。 */
export function drawSpecialUpgrades(rng: Rng, loadout: PlayerLoadout): SpecialUpgrade[] {
  const pool = availableSpecialRewards(loadout);
  const choices: SpecialUpgrade[] = [];
  while (choices.length < 2 && pool.length > 0) {
    const index = Math.floor(rng.next() * pool.length);
    choices.push(pool.splice(index, 1)[0]);
  }
  return choices;
}
