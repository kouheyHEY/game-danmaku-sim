import { describe, expect, it } from 'vitest';
import { nextDragTarget } from '../../src/input/drag';

describe('ドラッグ感度', () => {
  it('通常操作は指位置とつかみ差分へ追従する', () => {
    expect(nextDragTarget({ x: 10, y: -5 }, { x: 58, y: 47 }))
      .toEqual({ x: 68, y: 42 });
  });
});
