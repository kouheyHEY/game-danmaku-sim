import type { WeaponSpec } from './weapon';

export type SpecialUpgradeKey = 'focus' | 'overdrive' | 'heavy' | 'life';

export const INITIAL_WEAPON: Readonly<WeaponSpec> = {
  kind: 'straight', ways: 1, spread: 0.18, speed: 560, radius: 4, interval: 0.09, damage: 1,
};

/** ランを通して持ち越す自機の状態。強化はこれを書き換える。 */
export interface PlayerLoadout {
  hp: number;
  maxHp: number;
  weapon: WeaponSpec;
  upgradeLevels: Record<SpecialUpgradeKey, number>;
}

export function startingLoadout(): PlayerLoadout {
  return {
    hp: 5,
    maxHp: 5,
    weapon: { ...INITIAL_WEAPON },
    upgradeLevels: { focus: 0, overdrive: 0, heavy: 0, life: 0 },
  };
}
