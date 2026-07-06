import type { WeaponSpec } from './weapon';

/** ランを通して持ち越す自機の状態。強化はこれを書き換える。 */
export interface PlayerLoadout {
  hp: number;
  maxHp: number;
  weapon: WeaponSpec;
}

export function startingLoadout(): PlayerLoadout {
  return {
    hp: 5,
    maxHp: 5,
    weapon: { kind: 'straight', ways: 1, spread: 0.18, speed: 560, radius: 4, interval: 0.09, damage: 1 },
  };
}
