import { describe, expect, it } from 'vitest';
import { bossTextureDisplaySize, playerTextureDisplaySize } from '../../src/render/sessionRenderer';
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
});
