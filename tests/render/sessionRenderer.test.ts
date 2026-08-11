import { describe, expect, it } from 'vitest';
import { bossTextureDisplaySize, playerTextureDisplaySize } from '../../src/render/sessionRenderer';

describe('boss texture display sizes', () => {
  it('renders the player at half of the 64px source texture', () => {
    expect(playerTextureDisplaySize()).toBe(32);
  });

  it('renders the priest at one third of the 96px source texture', () => {
    expect(bossTextureDisplaySize('priest')).toBe(32);
  });

  it('renders the other feature bosses at half of their 96px source size', () => {
    expect(bossTextureDisplaySize('reversa')).toBe(48);
    expect(bossTextureDisplaySize('sniper')).toBe(48);
    expect(bossTextureDisplaySize('shogun')).toBe(48);
    expect(bossTextureDisplaySize('tank')).toBe(48);
  });
});
