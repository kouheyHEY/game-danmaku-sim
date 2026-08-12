/**
 * 該当モジュールの期待挙動を固定する自動テスト。
 */
import { describe, expect, it } from 'vitest';
import { MAX_RENDER_RESOLUTION, renderResolutionForViewport } from '../../src/render/displayResolution';

describe('fullscreen render resolution', () => {
  it('raises backing resolution when the canvas is enlarged', () => {
    expect(renderResolutionForViewport(2, 1)).toBe(2);
    expect(renderResolutionForViewport(1.5, 2)).toBe(3);
  });

  it('caps very large fullscreen buffers and safely handles invalid values', () => {
    expect(renderResolutionForViewport(4, 2)).toBe(MAX_RENDER_RESOLUTION);
    expect(renderResolutionForViewport(0, 0)).toBe(1);
  });
});
