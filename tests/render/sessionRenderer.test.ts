/**
 * 該当モジュールの期待挙動を固定する自動テスト。
 */
import { describe, expect, it } from 'vitest';
import {
  bossTextureDisplaySize, formatHpHeartParts, formatHpHearts, playerTextureDisplaySize,
} from '../../src/render/sessionRenderer';
import { PRIEST_HIT_RADIUS } from '../../src/spec/entityVisuals';

describe('boss texture display sizes', () => {
  it('renders the player at half of the 64px source texture', () => {
    expect(playerTextureDisplaySize()).toBe(32);
  });

  it('renders the priest slightly larger while keeping its hitbox small', () => {
    expect(bossTextureDisplaySize('priest')).toBe(72);
    expect(PRIEST_HIT_RADIUS).toBeLessThan(bossTextureDisplaySize('priest') / 2);
  });

  it('renders shogun and tank slightly larger than the other feature bosses', () => {
    expect(bossTextureDisplaySize('reversa')).toBe(48);
    expect(bossTextureDisplaySize('sniper')).toBe(48);
    expect(bossTextureDisplaySize('shogun')).toBe(56);
    expect(bossTextureDisplaySize('tank')).toBe(56);
  });

  it('folds each 10 HP into one large heart for compact HUD display', () => {
    expect(formatHpHearts(0)).toBe('');
    expect(formatHpHearts(9)).toBe('♥♥♥♥♥♥♥♥♥');
    expect(formatHpHearts(10)).toBe('❤');
    expect(formatHpHearts(23)).toBe('❤❤ ♥♥♥');
    expect(formatHpHeartParts(23)).toEqual({ big: '❤❤', small: '♥♥♥' });
  });
});
