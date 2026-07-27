import { describe, expect, it } from 'vitest';
import { formatMultiplier, formatScore } from '../../src/render/numberFormat';

describe('HUD数値表記', () => {
  it('通常範囲は整数または小数2桁以内で表示する', () => {
    expect(formatScore(123)).toBe('123');
    expect(formatScore(13.31)).toBe('13.31');
    expect(formatMultiplier(1)).toBe('×1.00');
    expect(formatMultiplier(1.1)).toBe('×1.10');
  });

  it('100万以上は指数表記にする', () => {
    expect(formatScore(1_000_000)).toBe('1.00e+6');
    expect(formatMultiplier(1_000_000)).toBe('×1.00e+6');
  });
});
