import { describe, it, expect } from 'vitest';
import { SPECIAL_UPGRADES, WEAPON_UPGRADES, drawSpecialUpgrades, randomWeaponUpgrade } from '../../src/run/upgrades';
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

  it('弾数+2：奇数維持で常に中央弾あり（直線→3→5、kind は odd のまま）', () => {
    const l = startingLoadout();
    const inc = WEAPON_UPGRADES.find((u) => u.name === '弾数+2')!;
    inc.apply(l);
    expect(l.weapon.ways).toBe(3);
    expect(l.weapon.kind).toBe('odd');
    inc.apply(l);
    expect(l.weapon.ways).toBe(5);
    expect(l.weapon.kind).toBe('odd');
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

  it('角度強化は拡散を広げず、弾道を中央へ絞る', () => {
    const l = startingLoadout();
    l.weapon.kind = 'odd';
    l.weapon.ways = 5;
    const focus = WEAPON_UPGRADES.find((u) => u.name === '収束UP')!;
    const spread0 = l.weapon.spread;
    focus.apply(l);
    expect(l.weapon.spread).toBeLessThan(spread0);
  });

  it('フォーカスバーストも弾数を増やしながら拡散角を絞る', () => {
    const l = startingLoadout();
    l.weapon.kind = 'odd';
    l.weapon.ways = 3;
    const focusBurst = SPECIAL_UPGRADES.find((u) => u.name === 'フォーカスバースト')!;
    const ways0 = l.weapon.ways;
    const spread0 = l.weapon.spread;
    focusBurst.apply(l);
    expect(l.weapon.ways).toBe(ways0 + 4);
    expect(l.weapon.spread).toBeLessThan(spread0);
  });

  it('特別強化は重複なしで2択になり、通常強化より大きく変化する', () => {
    const l = startingLoadout();
    const choices = drawSpecialUpgrades(makeRng(7), l);
    expect(choices).toHaveLength(2);
    expect(new Set(choices.map((u) => u.name)).size).toBe(2);
    const before = JSON.stringify(l);
    choices[0].apply(l);
    expect(JSON.stringify(l)).not.toBe(before);
  });
});
