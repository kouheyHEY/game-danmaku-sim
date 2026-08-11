import { describe, expect, it } from 'vitest';
import { arrowKeyInput } from '../../src/input/keyboard';

describe('arrow key input', () => {
  it('converts held arrow keys into movement axes', () => {
    expect(arrowKeyInput(new Set(['ArrowLeft', 'ArrowUp']))).toEqual({ moveX: -1, moveY: -1 });
    expect(arrowKeyInput(new Set(['ArrowRight', 'ArrowDown']))).toEqual({ moveX: 1, moveY: 1 });
  });

  it('cancels opposing directions', () => {
    expect(arrowKeyInput(new Set(['ArrowLeft', 'ArrowRight']))).toEqual({ moveX: 0, moveY: 0 });
  });
});
