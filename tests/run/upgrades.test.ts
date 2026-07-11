import { describe, it, expect } from 'vitest';
import { WEAPON_UPGRADES, randomWeaponUpgrade } from '../../src/run/upgrades';
import { startingLoadout } from '../../src/run/loadout';
import { makeRng } from '../../src/domain/rng';

describe('武器強化プール（弾数+2一強の解消）', () => {
  it('どの抽選でも武器が実際に変化する（死に強化なし・決定論）', () => {
    for (let seed = 0; seed < 40; seed++) {
      const l = startingLoadout();
      const before = JSON.stringify(l.weapon);
      randomWeaponUpgrade(makeRng(seed), l);
      expect(JSON.stringify(l.weapon)).not.toBe(before);
    }
  });

  it('直線単発でも「弾を大きく」でカバー(半径)が上がる＝拡散に頼らず快適化', () => {
    const l = startingLoadout();
    expect(l.weapon.kind).toBe('straight');
    const big = WEAPON_UPGRADES.find((u) => u.name === '弾を大きく')!;
    const r0 = l.weapon.radius;
    big.apply(l);
    expect(l.weapon.radius).toBeGreaterThan(r0);
  });

  it('カバー(横幅)を増やす強化が複数ある（弾数+2 だけに依存しない）', () => {
    // 直線状態で利用可能な「快適さに効く」強化が2つ以上ある
    const l = startingLoadout();
    const coverage = WEAPON_UPGRADES.filter((u) => (!u.available || u.available(l)) && ['弾数+2', '弾を大きく', '強撃'].includes(u.name));
    expect(coverage.length).toBeGreaterThanOrEqual(2);
  });
});
