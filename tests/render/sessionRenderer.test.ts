import { describe, expect, it } from 'vitest';
import { bossTextureDisplaySize, playerTextureDisplaySize } from '../../src/render/sessionRenderer';
import { PRIEST_HIT_RADIUS } from '../../src/spec/entityVisuals';

describe('boss texture display sizes', () => {
  it('renders the player at half of the 64px source texture', () => {
    expect(playerTextureDisplaySize()).toBe(32);
  });

  it('renders the priest at the same size as the other feature bosses', () => {
    expect(bossTextureDisplaySize('priest')).toBe(48);
    expect(PRIEST_HIT_RADIUS).toBeLessThan(bossTextureDisplaySize('priest') / 2);
  });

  it('renders the other feature bosses at half of their 96px source size', () => {
    expect(bossTextureDisplaySize('reversa')).toBe(48);
    expect(bossTextureDisplaySize('sniper')).toBe(48);
    expect(bossTextureDisplaySize('shogun')).toBe(48);
    expect(bossTextureDisplaySize('tank')).toBe(48);
  });
});
