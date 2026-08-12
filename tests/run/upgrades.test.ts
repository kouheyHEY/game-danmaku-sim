/**
 * 該当モジュールの期待挙動を固定する自動テスト。
 */
import { describe, it, expect } from 'vitest';
import {
  LIFE_CORE_HEAL, SPECIAL_UPGRADES, SPECIAL_UPGRADE_MAX_LEVELS, WEAPON_UPGRADES,
  availableSpecialRewards, drawSpecialUpgrades, randomWeaponUpgrade,
} from '../../src/run/upgrades';
import { INITIAL_WEAPON, startingLoadout } from '../../src/run/loadout';
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
    expect(l.weapon.ways).toBe(ways0 + 2);
    expect(l.weapon.spread).toBeLessThan(spread0);
  });

  it('直線弾からフォーカスバーストを取っても3方向までに抑える', () => {
    const l = startingLoadout();
    const focusBurst = SPECIAL_UPGRADES.find((u) => u.name === 'フォーカスバースト')!;
    focusBurst.apply(l);
    expect(l.weapon.kind).toBe('odd');
    expect(l.weapon.ways).toBe(3);
  });

  it('オーバードライブは連射と弾速を控えめに強化する', () => {
    const l = startingLoadout();
    const overdrive = SPECIAL_UPGRADES.find((u) => u.name === 'オーバードライブ')!;
    const interval0 = l.weapon.interval;
    const speed0 = l.weapon.speed;
    overdrive.apply(l);
    expect(l.weapon.interval).toBeCloseTo(interval0 * 0.88);
    expect(l.weapon.speed).toBe(speed0 + 60);
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

  it('ライフコアはボス撃破時の自動回復とは別にHPを追加回復する', () => {
    const l = startingLoadout();
    l.hp = 2;
    const lifeCore = SPECIAL_UPGRADES.find((u) => u.name === 'ライフコア')!;

    lifeCore.apply(l);

    expect(l.maxHp).toBe(7);
    expect(l.hp).toBe(2 + LIFE_CORE_HEAL);
    expect(lifeCore.description).toContain(`追加でHP+${LIFE_CORE_HEAL}回復`);
  });

  it('強化選択肢に現在のレベルと上限を表示する', () => {
    const l = startingLoadout();
    const rewards = availableSpecialRewards(l);
    expect(rewards.find((u) => u.key === 'focus')?.name).toContain('Lv.1/5');
    expect(rewards.find((u) => u.key === 'overdrive')?.name).toContain('Lv.1/5');
    expect(rewards.find((u) => u.key === 'heavy')?.name).toContain('Lv.1/5');
    expect(rewards.find((u) => u.key === 'life')?.name).toContain('Lv.1');
  });

  it('弾数強化が上限に達すると、フォーカス圧縮転生へ置き換わる', () => {
    const l = startingLoadout();
    const focus = SPECIAL_UPGRADES.find((u) => u.key === 'focus')!;
    for (let i = 0; i < SPECIAL_UPGRADE_MAX_LEVELS.focus; i++) focus.apply(l);
    expect(l.weapon.ways).toBe(11);

    const focusReward = availableSpecialRewards(l).find((u) => u.key === 'focus');
    expect(focusReward?.reset).toBe(true);
    expect(focusReward?.name).toContain('フォーカス圧縮転生');
    const damage = l.weapon.damage;
    focusReward!.apply(l);

    expect(l.weapon.kind).toBe(INITIAL_WEAPON.kind);
    expect(l.weapon.ways).toBe(INITIAL_WEAPON.ways);
    expect(l.weapon.damage).toBeCloseTo(damage * 11);
    expect(l.upgradeLevels.focus).toBe(0);
  });

  it('速度・連射強化も上限後に圧縮転生で初期値へ戻し、蓄積倍率を威力へ変換する', () => {
    const l = startingLoadout();
    const overdrive = SPECIAL_UPGRADES.find((u) => u.key === 'overdrive')!;
    for (let i = 0; i < SPECIAL_UPGRADE_MAX_LEVELS.overdrive; i++) overdrive.apply(l);
    const expectedMultiplier = (l.weapon.speed / INITIAL_WEAPON.speed)
      * (INITIAL_WEAPON.interval / l.weapon.interval);
    const damage = l.weapon.damage;
    const compression = availableSpecialRewards(l).find((u) => u.key === 'overdrive')!;

    expect(compression.name).toContain('オーバードライブ圧縮転生');
    compression.apply(l);

    expect(l.weapon.speed).toBe(INITIAL_WEAPON.speed);
    expect(l.weapon.interval).toBe(INITIAL_WEAPON.interval);
    expect(l.weapon.damage).toBeCloseTo(damage * expectedMultiplier);
    expect(l.upgradeLevels.overdrive).toBe(0);
  });

  it('HP強化は上限なしで、武器強化は系統別圧縮を挟んで何周でも成長できる', () => {
    const l = startingLoadout();
    const life = SPECIAL_UPGRADES.find((u) => u.key === 'life')!;
    const focus = SPECIAL_UPGRADES.find((u) => u.key === 'focus')!;
    for (let i = 0; i < 20; i++) life.apply(l);
    expect(l.maxHp).toBe(45);
    expect(l.upgradeLevels.life).toBe(20);
    expect(availableSpecialRewards(l).find((u) => u.key === 'life')?.reset).not.toBe(true);

    for (let cycle = 0; cycle < 8; cycle++) {
      for (let i = 0; i < SPECIAL_UPGRADE_MAX_LEVELS.focus; i++) focus.apply(l);
      availableSpecialRewards(l).find((u) => u.key === 'focus')!.apply(l);
    }
    expect(l.upgradeLevels.focus).toBe(0);
    expect(l.weapon.damage).toBeGreaterThan(1);
  });
});
