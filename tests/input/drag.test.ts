import { describe, expect, it } from 'vitest';
import { nextDragTarget } from '../../src/input/drag';

describe('ドラッグ感度', () => {
  it('通常操作は指位置とつかみ差分へ追従する', () => {
    expect(nextDragTarget({ x: 100, y: 100 }, { x: 10, y: -5 }, { x: 50, y: 50 }, { x: 58, y: 47 }, false))
      .toEqual({ x: 68, y: 42 });
  });

  it('反転操作は指の移動量を増幅せず1:1で逆方向へ動かす', () => {
    const first = nextDragTarget({ x: 200, y: 300 }, { x: 0, y: 0 }, { x: 100, y: 100 }, { x: 106, y: 96 }, true);
    expect(first).toEqual({ x: 194, y: 304 });
    const second = nextDragTarget(first, { x: 0, y: 0 }, { x: 106, y: 96 }, { x: 109, y: 101 }, true);
    expect(second).toEqual({ x: 191, y: 299 });
  });
});
